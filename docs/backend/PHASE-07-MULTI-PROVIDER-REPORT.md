# Phase 07 — Multi-Provider Expansion: Deriv WS Connector + Universal Broker Layer — Final Report

**Date:** 2026-10-14 · **Branch:** `main` · **Commit:** `6570a4e` · **Status: COMPLETE (as scoped), with the standing live-verification caveat (U4) honestly disclosed throughout**

---

## 1. Executive Summary

Phase 07 adds the **second real provider connector** to the Accounts & Trading Connectivity module — **Deriv, via the official Deriv WebSocket API v3** (`wss://ws.derivws.com/websockets/v3`) — implemented entirely inside the existing provider architecture (6-method port, capability model V2, Phase 03 lifecycle, Phase 05 sync pipeline). The first provider (OANDA v20) is untouched and still green.

On top of the master prompt, the owner explicitly required that **Euforia be able to welcome ANY broker** and **identify which broker is being connected at connection time**. Phase 07 therefore also ships the **universal broker layer**:

- a versioned **broker catalog** (17 brokers/platforms) carrying identity metadata and documented identification patterns only — never invented capabilities;
- **connect-time broker identification** with an honest confidence ladder (`PROVIDER_REPORTED` → `PATTERN_MATCH` → `PLATFORM_KNOWN` → `UNKNOWN`), persisted per account (additive migration);
- two new read-only endpoints: `GET /trading-accounts/brokers` (catalog with truthful connector status) and `POST /trading-accounts/brokers/identify` (rule-based, **no secrets accepted, no outbound call**);
- Accounts UI: every known broker visible in the connect dialog with honest "Recognized — connector not yet available" states, and **live broker detection while the user types the account number**.

**Verification level:** everything in this report is proven by automated tests executed in this phase (1212/1212 API tests, +53 new), including a full fixture-server e2e lifecycle for Deriv and cross-provider regression. **No live Deriv account was ever connected** — no Deriv API token exists in this environment. That gap is the standing caveat **U4** (the Deriv equivalent of OANDA's U2), with the exact runbook in §22.

The verdict for the phase definition-of-done is **COMPLETE**; the honest limitation ("implemented, not live-verified") applies to every provider-facing claim, exactly as disclosed for OANDA in Phases 03–05.

---

## 2. Git State and Baseline

- Start of phase: branch `main`, HEAD `8f085c1` (tree clean; the only post-audit commit was the previously-untracked `scripts/migration-seeds.sql` committed by the system sweep — its content, including Deriv synthetic instruments BOOM500/CRASH500/VOL75, was already compatible with this phase).
- **Baseline recorded** (§4.4 of the master prompt): full API suite executed at HEAD before any change — **1159/1159 tests green, 83 files** (`scripts/baseline-api-test.log`). No baseline failures existed.
- End of phase: HEAD `6570a4e` ("accounts: Phase 07 — second real adapter (Deriv WS v3) + universal broker catalog & connect-time broker identification"), tree clean after commit.
- No reverts, no resets, no history rewrites; user work preserved (§3.3).

## 3. Phase 00–06 Audit Findings (compact internal audit)

- **Phase 00** (feasibility, commit `3d25c29`): documented; Deriv anticipated as "roadmap Phase 07 (official WS API; first WS dependency would be a documented install)". Re-verified: the Phase 00 report's provider inventory is consistent with today's code.
- **Phase 01** (contracts): provider port `TradingProviderAdapter` = exactly 6 read methods (`provider.types.ts:186–215`); capability model V2 (13 keys, `SUPPORTED|UNSUPPORTED|UNKNOWN`) frozen in `packages/shared/src/schemas/trading-account.ts:126–232`.
- **Phase 02** (UI): connect wizard driven by the registry + a hardcoded `PLANNED_PROVIDERS` list (now replaced by the data-driven catalog — see §17).
- **Phase 03** (lifecycle/security): validate-before-persist, AES-256-GCM vault, ownership funnel (`loadOwned`/`findAccountForUser`), rate limiter vectors — all reused verbatim; one new `identify` vector added (30/15 min).
- **Phase 04** (OANDA connector): transport GET-only + abort backstop — untouched; its `restUrlOverride` pattern was replicated for the Deriv WS override.
- **Phase 05** (sync/reconciliation/freshness): segment orchestrator, PARTIAL semantics, checkpoint discipline, scheduler — **the Deriv adapter plugs into all of it with zero orchestrator changes** (the strongest cross-provider consistency proof in this report).
- **Phase 06** (positions/orders/deals/history): external-state models reused; deal `positionId` linkage available and populated by Deriv (`contract_id`).
- Prior-phase gaps that remain open and are NOT part of Phase 07: **U2** (OANDA live practice token), **U3** (account discovery product decision), **U1** (MT5 path decision), cTrader owner approval.

## 4. Selected Provider and Platform

**Deriv** — platform **Deriv**, protocol **Deriv WebSocket API v3** (legacy v3 namespace, still documented and supported by Deriv alongside their newer REST/OTP surface). `providerId: "deriv-ws"`, `platform: "DERIV"` (already present in the shared broker vocabulary). The concrete provider/platform combination is: a **Deriv user account** (real `CR…` or virtual `VRTC…` loginid) accessed with a **user-created API token of scope Read** through the registering application's **app_id**.

## 5. Provider Selection Rationale

Candidates evaluated against the §5.1 criteria (official API, auth, read-only model, account discovery, metrics, positions, orders, deals, history, sync, rate limits, revocation, deployment, operational cost, data semantics, verifiability):

| Candidate | Verdict | Reason (evidence-based) |
|---|---|---|
| **Deriv WS v3** | **SELECTED** | Official documented API; self-service PAT-type app + user tokens with an explicit **Read** scope; balance/portfolio/profit_table cover the account-data surface; pure JSON-over-WebSocket — no terminal, no gateway, no persistent process; free virtual accounts; verifiable via local fixture + future live token (U4). |
| MT5 | rejected for this phase | Requires a terminal/bridge or a third-party cloud gateway — deployment requirement not satisfiable/verifiable here; explicitly gated on owner decision **U1** (Phase 00). |
| cTrader | rejected for this phase | Open API needs OAuth app registration (+ partner considerations) and protobuf-over-WS; stopped pending explicit owner approval (standing roadmap state). |
| IC Markets | rejected | It is a broker, not a platform: retail access paths are MT4/MT5/cTrader — the platform integrations above are the real candidates; no dedicated retail REST API documented. |
| TradingView | rejected | Documented verdict (doc D): no account-data interface exists — chart embedding is not account access. |

No provider was chosen because it was popular or easy to mock (§5) — Deriv was selected because it is the only candidate whose full chain (official path → auth → read-only scope → resources → verification plan) closes without external approvals.

## 6. Official Documentation and Evidence

All provider claims below are anchored to official documentation fetched **2026-10-14** (snapshots committed under `docs/providers/deriv-docs-2026-10-14/`):

- `https://doc-deriv.readme.io/llms.txt` — AI-agent doc index (the .md versions of every page).
- **WebSockets** (`docs/websockets.md`): endpoint `wss://ws.derivws.com/websockets/v3?app_id={app_id}`; session times out after **2 minutes of inactivity** (ping keeps alive) — the adapter's per-call session model sidesteps this by design.
- **Account APIs** (`docs/account-apis.md`): `authorize` (session authorization), `balance` (**scope: Read**), `get_account_status`, `logout`.
- **Reports APIs** (`docs/reports-apis.md`): `statement` (Read + Trading Information), `transaction` (stream-only — deliberately NOT used).
- **Trading APIs** (`docs/trading-apis.md`): `portfolio` — "information about your current portfolio of outstanding options"; `profit_table` — settled-contract summary.
- **developers.deriv.com — Profit table**: "Use `limit` and `offset` together to paginate… default limit is 50 with a **maximum of 500 records per call**."
- **developers.deriv.com — Portfolio**: "Get a list of all open positions for the authorized account… returns only open (active) contracts."
- **Account setup** (`docs/account-setup.md`): dashboard app registration → App ID; **token scopes** include **Read — "View market data and account information"** (plus Payments/Trade/Admin — the dangerous ones are never requested).
- **Error codes** (`docs/error-codes.md`): `InvalidToken`, `AuthorizationRequired`, `RateLimitExceeded`, `PermissionDenied`, `InvalidAppID` — the five codes mapped in the adapter.
- Access-date discipline: every capability declaration's `evidence` string in the descriptor cites its page + "Docs accessed 2026-10-14".

## 7. Authentication and Access Requirements

- **Method:** Deriv **API token (PAT)** pasted by the user at connect time → fits the existing `API_KEY` credential method — **no schema change, no new credential pathway** (mirrors OANDA).
- **App identity:** every WS connection carries `app_id`; deployments set `ACCOUNTS_DERIV_APP_ID` (their registered application). The unset default is Deriv's public **example** app id `1089`, documented in `env.schema.ts` as development/verification-only.
- **Token scope (least privilege):** users are instructed to create a **Read**-scope token. The adapter's `supportedPermissions` deliberately omit `READ_ORDERS` (capability honestly UNSUPPORTED — see §9) and no scope beyond Read is needed by any whitelisted request.
- **Lifecycle reuse:** connect = validate-before-persist (`authorize` → `balance` → `portfolio` probe through the Phase 03 flow), credentials encrypted (AES-256-GCM, dedicated key), disconnect wipes ciphertext, revocation detected as `INVALID_CREDENTIALS` on the next call. No parallel lifecycle was created (§8 of the prompt).

## 8. Read-Only Security Assessment

1. **Request whitelist (red line):** the adapter can emit ONLY names in `DERIV_READ_REQUEST_NAMES` = `{ authorize, balance, portfolio, profit_table, statement, ping, website_status, logout }`. Deriv's execution verbs (`buy`, `sell`, `cancel`, `proposal`, `contract_update`, `transfer_*`, `paymentagent_*`, `topup_virtual`, `api_token`, …) are structurally absent — `call()` refuses anything outside the set. Unit test "whitelist contains ONLY documented read request names" pins the set; the e2e asserts the FIXTURE recorded **zero** non-read names across the whole suite (protocol spy).
2. **Six-method surface:** `TradingProviderAdapter` unchanged; the adapter implements exactly the 6 read methods; structural test asserts no execution-named method exists.
3. **Endpoint posture:** the only outbound destination is the resolved WS URL — the official endpoint or the env override (`ACCOUNTS_DERIV_WS_URL`, tests/edge). No client-supplied URL is ever dialed anywhere in the accounts surface; the identify endpoint explicitly does NOT dial its `endpoint` hint (match-only, documented).
4. **Secret handling:** token encrypted at rest, only `••••last4` hint displayed, never returned by any endpoint, never logged; provider error texts are canned (`mapDerivError` — messages never include provider payloads); the fixture deliberately embeds "internal fixture detail never surfaced" strings and the tests assert they never leak.
5. **Application-level read-only guarantee** stands regardless of token scope (same argument as OANDA): even a Trade-scoped token cannot be used for execution through Euforia because no code path can emit a write verb.

## 9. Capability Matrix (V2, verbatim from the adapter descriptor)

| Capability | Support | Retrieval | Evidence / limitation |
|---|---|---|---|
| accountDiscovery | **UNKNOWN** | — | A Deriv token authorizes exactly the account that created it; multi-account discovery is the deferred product decision (U3 parity with OANDA). |
| accountMetadata | **SUPPORTED** | POLL | `authorize`: loginid, currency, is_virtual, landing company. |
| balanceEquity | **SUPPORTED** | POLL | `balance` (scope Read). Limitation: ONE number — equity/margin arrive null, never approximated. |
| marginInfo | **UNSUPPORTED** | — | Not reported by v3 balance/authorize. |
| openPositions | **SUPPORTED** | POLL | `portfolio` — documented "list of all open positions… only open (active) contracts". |
| orders | **UNSUPPORTED** | — | No resting-order read exists in the v3 API; never an empty-success fabrication. Sync segment skipped as a capability FACT. |
| deals | **SUPPORTED** | POLL | `profit_table` — pagination limit+offset, default 50, **max 500/call**; incremental = newest observed `sell_time` checkpoint. |
| historyDepth | **UNKNOWN** | — | Retention window not documented; bounded caps make incompleteness explicit (`complete:false`), never presented as a lifetime record. |
| streamingAccountUpdates / streamingPositions / streamingOrderDealUpdates | **UNSUPPORTED** | — | The provider offers WS subscriptions; this connector is polling-only in Phase 07 (OANDA precedent) — nothing claims real-time. |
| connectionValidation | **SUPPORTED** | ON_CONNECT | `authorize` probe; invalid token → `InvalidToken`. |
| credentialRevocation | **SUPPORTED** | POLL | Dashboard revocation detected as `INVALID_CREDENTIALS` on the next call (pull-based, documented). |

The backend enforces every boundary: the orchestrator gates segments on capability BEFORE calling the adapter (orders never called), and the adapter re-guards its own methods (defense in depth).

## 10. Architecture Changes

**Provider registry (§13.3):** `accounts.module.ts` gains the third conditional registration slot — `deriv-ws` behind `config.accounts.derivEnabled` (§57 posture: never default-enabled; `ACCOUNTS_MOCK_PROVIDER`/`ACCOUNTS_OANDA_PROVIDER`/`ACCOUNTS_DERIV_PROVIDER` each gate their own adapter). Unknown ids still answer 422 `UNSUPPORTED_PROVIDER`; mocks cannot serve production (unchanged policy).

**Universal broker layer (owner requirement — beyond the strict one-provider scope, delivered as shared-contract extensions per §7.2):**
- `broker-catalog.ts` — 17 entries (Deriv, OANDA, IC Markets, Pepperstone, Exness, XM, FXTM, FP Markets, AvaTrade, Vantage, Eightcap, IBKR, Binance, MetaTrader platform, cTrader platform, TradingView, Plus500, eToro) with **identity-only** metadata: display names, platform families, documented identification patterns (OANDA v20 id format; Deriv `CR|VRTC|MRT|MVT` loginid shapes; OANDA/Deriv/IBKR/Binance endpoint hosts; MT4/MT5 server-name prefixes) and honest notes (e.g. TradingView: "no account-data interface exists").
- `broker-identification.service.ts` — confidence ladder + catalog serving; connector status resolved **against the live registry** at call time (a catalog entry never claims availability the registry doesn't have).
- `NormalizedAccountInfo.brokerIdentity?` (additive optional) — adapters MAY report the provider's own broker identity (Deriv: `landing_company_full_name` + `is_virtual` class). OANDA unchanged (omits it → rules fallback).
- Adding broker N+1 = add a catalog entry (identity) and, when ready, an adapter implementing the 6-method port + one registry line — documented extension recipe, matching the module's own header comment (§60).

**No `if provider === …` leakage:** controllers, repositories, sync, scheduler, and monitoring remain provider-blind; all Deriv-specific code lives under `providers/deriv/` + the identification service.

## 11. Adapter and Registry Implementation

`providers/deriv/deriv-ws.provider.ts` + `deriv-mapping.ts`:

- **Session model:** one short-lived WebSocket per adapter call (authorize → work → close, hard transport timer `providerTimeoutMs + 2s` that DESTROYS the socket). Deliberately stateless — mirrors the OANDA per-request posture and sidesteps the documented 2-minute inactivity timeout entirely; polling (Phase 05) never holds a socket.
- **Wire format:** `{ <call>: 1, ...params, req_id }`; responses routed by `req_id`; every payload zod-validated (`safeParse` → `INVALID_PROVIDER_RESPONSE`).
- **Account binding:** session-bound echo checks — `authorize.loginid` and `balance.loginid` MUST equal the stored `externalAccountId`; `is_virtual` MUST match the declared environment (DEMO↔virtual, LIVE↔real); `PROP_FIRM` rejected before any socket opens. Divergence = honest `UNSUPPORTED_ACCOUNT`, never a cross-account read.
- **Error mapping:** `InvalidToken|AuthorizationRequired → INVALID_CREDENTIALS`; `PermissionDenied → UNAUTHORIZED_PROVIDER_ACCESS`; `RateLimitExceeded → RATE_LIMITED`; `InvalidAppID → INVALID_PROVIDER_RESPONSE` (deployment config problem); handshake failure → `PROVIDER_UNAVAILABLE`; hard timer → `CONNECTION_TIMEOUT` (socket destroyed).
- **Registry test:** deriv-ws resolves, isMock false, V2 shape flows through `GET …/providers` (e2e-verified); unknown ids rejected (existing suite).

## 12. Connection Lifecycle and Account Discovery

- Connect flow unchanged (rate-limit → registry.require → test → accountInfo → snapshot → duplicate check → atomic persist → security event → initial sync). The only addition: `identifyAtConnect(...)` produces the identification snapshot persisted with the account (§18) and surfaces in the audit event context ("Broker identified: Deriv (SVG) Corp (PROVIDER_REPORTED)").
- **Account discovery (§9 of the prompt):** a Deriv token authorizes exactly one account; the user supplies its loginid (same model as OANDA; U3 records the multi-account product question). `identifyAtConnect` marks `accountClass` from `is_virtual` — a DEMO/LIVE mismatch is refused at connect AND at every subsequent call.
- Stale async results cannot overwrite newer lifecycle states: unchanged Phase 03 guarantee (validate-before-persist is fully synchronous within the connect request).

## 13. Account Metadata and Financial Normalization

- **Precision (§10.1):** Deriv transports money as JSON binary doubles; `toDecimalString` re-serializes the exact received value via Decimal.js with **no arithmetic** — the unavoidable transport conversion is documented at the mapping header. Balance `10500.55` → `"10500.55"` (asserted).
- **Timestamps (§10.2):** `purchase_time`/`sell_time` are epoch **seconds** → UTC ISO (guarded against ms-shaped values); provider event time ≠ retrieval time is preserved by the existing domain model.
- **Honest nulls:** equity, margin, freeMargin, marginLevel, leverage, SL/TP, swap, commission → null when Deriv does not report them. Nothing is derived from balance, nothing invented from shortcodes (a shortcode parse would fabricate instrument data — refused; the row fails loud instead).
- **Volume semantics:** contract-count ("1") with the documented rationale — Deriv does not report lot volumes for options/multipliers; one portfolio/profit_table row = one contract.
- **Direction mapping:** documented contract families only (`CALL/PUT/MULTUP/MULTDOWN/BUY/SELL/HIGHER/LOWER/ACCU/TURBO*/VANILLALONG*` → BUY/SELL); an unknown family raises `INVALID_PROVIDER_RESPONSE` (fail loud) rather than silently mis-typing direction. profit_table rows are recorded side "BUY" (every row IS a purchased contract; the market direction is deliberately NOT re-projected).

## 14. Positions, Orders, Deals, and History Support

- **Positions:** `portfolio` → `NormalizedPosition` (contract_id, verbatim `underlying_symbol`, mapped side, buy_price entry, current_spot when present, profit when present). Completeness fact: the documented response IS the full open set → `complete: true` (row-cap truncation → honest `complete:false`). Reconciliation (Phase 05) works unchanged: a vanished contract closes only when `completeExternalIds` says the snapshot was complete.
- **Orders:** capability UNSUPPORTED — the segment is SKIPPED as a capability fact (run `ordersAt` null, `ordersUpserted` 0, run COMPLETED). e2e asserts exactly this; no empty-success fabrication exists.
- **Deals:** `profit_table` (DESC, 500/page, ≤10 pages = 5000 rows/run) → `NormalizedDeal` (transaction_id identity, contract_id → positionId linkage, sell_time execution). **Checkpoint semantics:** the cursor is a FLOOR; once rows ≥ cursor are observed, `observedThrough` advances to the NEWEST observed epoch (the DESC scan covered the whole gap); a page-cap hit falls back to the OLDEST observed epoch with `complete:false`; nothing observed keeps the existing checkpoint. Boundary ties (`sell_time == cursor`) re-upsert idempotently — no loss, no duplicates (e2e proves both).
- **History depth:** honestly UNKNOWN (provider does not document retention); caps make truncation visible (`complete:false`), never a fabricated lifetime record.
- **Journal independence (§12.5):** untouched — external rows never become canonical trades; the Phase 06 import workflow is out of scope for Phase 07.

## 15. Synchronization and Reconciliation

**Zero orchestrator changes.** The Deriv adapter satisfies the exact Phase 05 contract: `fetchSnapshot/fetchPositions/fetchDeals` shapes + completeness flags + stable error codes; the segment plan gates on the descriptor; transient failures retry via the existing `withSegmentRetries` (RATE_LIMITED is transient); PARTIAL semantics apply verbatim (e2e: deals rate-limited → run PARTIAL `RATE_LIMITED`, snapshot/positions persisted, last-known-good data preserved, checkpoint not advanced; recovery run COMPLETED). The scheduler picks up deriv-ws connections automatically (eligibility = CONNECTED + credentials + registered adapter + environment match). Initial-sync failure never invalidates the registration (unchanged).

## 16. API Contract Changes (all additive)

| Route | Change |
|---|---|
| `GET /trading-accounts/brokers` | NEW — versioned catalog, honest connector status (auth required; static data). |
| `POST /trading-accounts/brokers/identify` | NEW — rule-based identification from hints (`providerId?/externalAccountId?/endpoint?/environment?`); NO secrets accepted; per-user rate limit **30/15 min** (new `identify` vector). |
| `GET /trading-accounts` (details) / `POST connect` / `POST reconnect` responses | `brokerIdentification?` (nullable, schema-validated) added to `tradingAccountDetailsSchema` — wire-compatible (optional). |
| Shared schemas | NEW: `brokerIdentificationSchema`, `brokerIdentificationConfidenceSchema`, `brokerConnectorStatusSchema`, `brokerCatalogEntrySchema`, `brokerCatalogResponseSchema`, `brokerIdentifyInputSchema` (refine: ≥1 hint), `brokerIdentifyResponseSchema`. |

No existing route changed shape; the execution red line (no write/execute route) still holds — the two new routes are GET + a secret-free POST probe.

## 17. Frontend and Accounts UI Changes

- **Connect dialog:** the hardcoded `PLANNED_PROVIDERS` list is GONE. The provider step now renders (a) the registry radio cards (mock stamped "Simulated provider"; deriv-ws "Connectable" when the backend registers it) and (b) the **catalog's recognized brokers** in a scroll-compact honest section ("Recognized — connector not yet available" + the catalog note per broker, e.g. TradingView's "no account-data interface exists"). Every known broker stays visible — the owner's "welcome ANY broker" requirement, with zero fake setup paths.
- **Live identification:** while the user types the account number (identity step), a 600 ms-debounced probe calls the identify endpoint (no secret sent) and renders "Detected broker: OANDA · matched a documented account format" (or the honest UNKNOWN wording). Stale results are filtered by a derived key (provider + id pair) — no cascading setState (react-compiler clean).
- **Account card / detail drawer:** detected broker surfaced (`account-card-broker-detected`, `account-detail-broker-detected`) with the confidence level ("provider-reported / pattern match / platform known / unknown").
- **MSW mirror:** deriv-ws descriptor (V2 caps, orders skipped as capability fact), catalog + identify handlers route-for-route, PROVIDER_REPORTED "Deriv (SVG) Corp" on deriv connects; engine honesty probes extended (82/82).
- **Dict:** new EN strings (`providerRecognized*`, `detectedBroker`, `detectedConfidence.*`, `detail.detectedBroker`).

## 18. Database and Migration Changes

- **Migration `20261014014149_accounts_broker_identity`** (single statement): `ALTER TABLE "TradingAccount" ADD COLUMN "brokerIdentity" JSONB;` — additive, nullable, non-destructive; rollback = `DROP COLUMN` (no data loss beyond the snapshot). No table rewrite, no unique-constraint change, no plaintext secrets (the JSON holds the sanitized identification only).
- Deployed to BOTH databases (`cosmoz` + `cosmoz_test`); `prisma migrate status` = "Database schema is up to date!" ×2.
- Schema: `TradingAccount.brokerIdentity Json?` documented at the field level; repository persists it during `createAccountWithConnection` (same atomic transaction as account+connection); the read boundary re-validates stored JSON against `brokerIdentificationSchema` (schema evolution degrades to null, never a broken wire shape).

## 19. Security and Privacy Review (§15 of the prompt)

- **IDOR:** ownership funnel untouched (`findAccountForUser`); e2e proves user B receives **404** on every surface of user A's deriv account (details/positions/deals/sync/test/disconnect). The identify/catalog routes involve no account ownership (static rules + catalog).
- **Secrets:** token encrypted at rest (existing AES-256-GCM service); redaction suite green (`credential secret never appears in any response surface`); Deriv error messages canned; identify accepts NO secrets by schema (no field exists for one).
- **External HTTP/WS security (§15.3):** single fixed endpoint (or deployment-owned override); no client-supplied URLs anywhere; identify hints are matched, never dialed; timeouts + bounded response budgets (page caps); schema-validated responses.
- **Audit/monitoring:** connection events reuse the SecurityEventService (context now includes the identified broker — name + confidence only, no secrets); bounded-cardinality labels unchanged; the scheduler's per-connection try/catch isolates one provider's outage from the others (existing tests).
- **Rate limits:** connect/reconnect/sync vectors unchanged; NEW `identify` vector (30/15 min) — e2e proves 429 after exhaustion.

## 20. Automated Tests and Exact Results

**Baseline (pre-phase):** `pnpm test` → **1159/1159, 83 files** ✓.
**Final:** `pnpm test` → **1212/1212, 86 files** ✓ (+53 tests, 0 regressions). New suites:

- `test/unit/deriv-ws-provider.spec.ts` (25 tests, REAL ws client ⇄ ws fixture server): red line (6-method surface, whitelist contents, zero fixture violations), credential handling (valid/InvalidToken/RateLimitExceeded/dead endpoint), account binding (echo, foreign id, environment-class mismatch, PROP_FIRM no-session, LIVE+CR match), normalization (balance exactness, honest nulls, verbatim symbols, unknown contract family fail-loud, malformed answers), capability honesty (orders throws, never dials), pagination/checkpoints (initial, incremental + boundary ties, 5500-row cap → complete:false + oldest-observed checkpoint, empty incremental keeps checkpoint, corrupted cursor fails loud).
- `test/unit/broker-identification.spec.ts` (14 tests): catalog integrity (unique ids, valid regexes, connector refs real), confidence ladder (PATTERN_MATCH OANDA/Deriv shapes, endpoint matching, honest UNKNOWN, PLATFORM_KNOWN fallback, pattern-beats-platform), connect-time capture (PROVIDER_REPORTED wins, rules fallback), catalogForClient (schema-valid, registry-resolved status).
- `test/e2e/deriv-fixture.e2e.spec.ts` (14 tests): registry listing (deriv-ws real, mock+deriv co-existence), catalog endpoint, identify endpoint (auth/validation/rate-limit 429), connect + initial sync COMPLETED with **PROVIDER_REPORTED identification persisted**, positions/deals wire shapes + orders capability FACT (ordersAt null), idempotent re-sync (tie re-upsert, no duplicates), incremental checkpoint pickup + advance, PARTIAL (rate-limited deals → PARTIAL, data preserved, recovery), credential rejection (422 + connection ERROR + sanitized lastError + history preserved), reconnect, IDOR 404×6, disconnect wipes credentials/keeps history, red-line (zero non-read request names).

## 21. Type Checking, Linting, and Build Results

| Command | Result |
|---|---|
| `pnpm --filter @cosmoz/shared exec tsc --noEmit` | 0 errors |
| `pnpm typecheck` (api) | 0 errors |
| `pnpm exec tsc --noEmit` (web) | 0 errors |
| `pnpm lint` (api) | 0 errors, 0 warnings |
| `pnpm lint` (web) | **0 errors**, 90 warnings (all pre-existing baseline warnings; none on touched files) |
| `pnpm build` (api, tsc build) | success |
| `pnpm build` (web, next build) | success (all routes prerendered/dynamic as before) |

## 22. Sandbox or Live Verification Evidence

**NOT PERFORMED — no live Deriv connectivity claim exists anywhere in this phase.** Verification levels used (honest labels):

1. **Unit + local fixture WS server** (real WebSocket protocol, realistic documented payload shapes): everything in §20.
2. **Real HTTP + real DB + real vault e2e** over the fixture transport: the full lifecycle.
3. **Live-hop (U4) — pending, USER ACTION REQUIRED:** create a free Deriv account → register a PAT-type app on developers.deriv.com (own app_id) → create a **Read-scope** API token → set `ACCOUNTS_DERIV_PROVIDER=enabled` + `ACCOUNTS_DERIV_APP_ID=<registered id>` at deploy → connect a **virtual (VRTC)** account through the UI → initial sync → observe balances/positions/deals → force a 429 path → revoke the token and observe INVALID_CREDENTIALS. Record results in a Phase 08 report. **A passing fixture test is NOT evidence of live connectivity** (§3.4) — exactly like U2 for OANDA.

## 23. Known Limitations and Unsupported Capabilities

1. Orders: no resting-order read in the v3 API — capability UNSUPPORTED (structural, not a roadmap choice).
2. Streaming: provider offers subscriptions; connector is polling-only (nothing claims real-time).
3. Equity/margin/leverage: not reported by the used endpoints → null (never approximated).
4. History depth: retention undocumented → bounded pulls with honest `complete:false`.
5. `is_virtual`/environment binding: a LIVE declaration on a virtual account (or vice versa) is refused — by design.
6. `app_id` default `1089` is Deriv's public example id — development/verification only (documented; production must register).
7. Symbols: reported verbatim (`underlying_symbol`); no normalization to common tickers (no invented mapping).
8. Catalog: identity metadata only — patterns are factual, and entries never imply connectivity.

## 24. Files Created, Modified, and Deleted

**Created (backend):** `src/modules/accounts/providers/deriv/deriv-ws.provider.ts`, `…/deriv/deriv-mapping.ts`, `src/modules/accounts/broker-catalog.ts`, `src/modules/accounts/broker-identification.service.ts`, `prisma/migrations/20261014014149_accounts_broker_identity/migration.sql`, `test/helpers/deriv-fixture-server.ts`, `test/unit/deriv-ws-provider.spec.ts`, `test/unit/broker-identification.spec.ts`, `test/e2e/deriv-fixture.e2e.spec.ts`, `docs/providers/deriv-docs-2026-10-14/*`, `docs/backend/PHASE-07-MULTI-PROVIDER-REPORT.md`.
**Created (frontend):** none (all changes additive to existing files).
**Modified (backend):** `env.schema.ts`, `app-config.ts`, `accounts.module.ts`, `accounts-rate-limiter.service.ts` (+identify vector), `trading-account.service.ts` (identify + persist + new service methods), `trading-accounts.controller.ts` (2 routes), `accounts.repository.ts`, `mappers.ts`, `normalization.ts`, `provider.types.ts`, `prisma/schema.prisma`, `.env.example`, `package.json` (+ws).
**Modified (shared):** `packages/shared/src/schemas/trading-account.ts` (additive blocks only).
**Modified (frontend):** `connect-account-dialog.tsx`, `accounts-view.tsx`, `account-card.tsx`, `account-detail-drawer.tsx`, `en/accounts.ts`, `endpoints.ts`, `keys.ts`, `queries/trading-accounts.ts`, `queries/index.ts`, `mocks/trading-accounts-engine.ts`, `mocks/handlers/trading-accounts.ts`, `scripts/accounts-tests.ts`, `scripts/verify-accounts.js`.
**Deleted:** none.

## 25. Commands Executed and Results

| Command | Result |
|---|---|
| `git status/diff/log` (Step-Zero audit) | tree clean at `8f085c1`; staged empty |
| baseline `pnpm test` (api) | 1159/1159 ✓ |
| `corepack pnpm add ws@^8.18.0` / `-D @types/ws` | ws 8.21.3 installed (documented install) |
| `prisma generate` / `migrate deploy` ×2 DBs | success; "up to date!" ×2 |
| `vitest run` (3 Deriv suites, iterative) | 39/39 → 53/53 ✓ |
| full `pnpm test` (api) | **1212/1212 (86 files)** ✓ |
| `tsc --noEmit` (shared/api/web) | 0 errors ×3 |
| `pnpm lint` (api/web) | 0 errors (web: 90 pre-existing warnings) |
| `pnpm build` (api/web) | success ×2 |
| `npx tsx scripts/accounts-tests.ts` | **82/82** ✓ |
| `node scripts/verify-accounts.js` (prod server, MSW) | **25/25** ✓ |
| `git commit` | `6570a4e` |
| web prod server restart by exact PID (worklog trap honored) | old Oct-13 server killed, fresh build served |

## 26. Definition-of-Done Checklist (§21)

- **Selection/feasibility:** justified by Phase 00 + official docs ✓ · provider/platform combination identified (§4) ✓ · auth/access documented (§7) ✓ · read-only model acceptable (§8) ✓ · capabilities explicit (§9) ✓ · verification limitations disclosed (U4, §22) ✓
- **Architecture:** exactly one additional provider ✓ · existing architecture reused (zero orchestrator/lifecycle changes) ✓ · provider logic isolated (`providers/deriv/` + catalog/service) ✓ · registered correctly ✓ · lifecycle rules consistent ✓ · discovery idempotent (echo + duplicate constraint) ✓ · sync reuses Phase 05 ✓ · resources reuse Phase 06 ✓ · unsupported capabilities fail explicitly ✓ · first provider compatible (OANDA suite green) ✓
- **Data correctness:** external ids mapped safely (scoped uniques unchanged) ✓ · financial precision (Decimal, no arithmetic) ✓ · timestamps preserve semantics ✓ · repeated sync without duplicates ✓ · checkpoints advance only after durable processing ✓ · partial/failed responses never close positions or delete data ✓ · history limits communicated ✓ · canonical trades untouched ✓
- **Security:** auth+ownership on every endpoint ✓ · cross-user denial tested ✓ · secrets never in responses/logs ✓ · established credential storage ✓ · external-call security reviewed (§8/§19) ✓ · no external trading operations ✓ · revocation/disconnection safe ✓
- **Quality:** adapter/sync/security/cross-provider/API/frontend tests pass (§20) ✓ · typecheck/lint/build pass ✓ · migration validated ×2 DBs ✓ · final diff reviewed ✓ · automated vs sandbox vs live clearly distinguished (§22) ✓ · **no Phase 08 work started** ✓

## 27. Remaining Risks and Dependencies

1. **U4 — live Deriv verification** (user action; runbook §22): until then, provider-facing behavior is fixture-verified only. Risk mitigations already in place: conservative schema validation, fail-loud mapping, bounded budgets.
2. **Deriv contract drift:** new/undocumented contract families or response fields fail loud (`INVALID_PROVIDER_RESPONSE`) instead of being silently mangled — visible, fixable, honest.
3. **Boundary-tie re-upserts:** every sync re-upserts rows whose `sell_time` equals the checkpoint (bounded, idempotent) — the price of zero data loss on same-second settlements.
4. **Catalog maintenance:** identification patterns are facts frozen in code (versioned `2026-10.1`); evolution is additive and version-stamped.
5. Standing predecessors, unchanged: U2 (OANDA live), U3 (discovery), U1 (MT5), cTrader approval.

## 28. Phase 08 Readiness Assessment

The module now has **two real adapters sharing one pipeline**, a universal broker layer, and a green 1212-test base — the cross-provider consistency surface Phase 08 needs is exercised and regression-protected. Phase 08 (final hardening/E2E validation) remains **not started** (hard stop honored) and will inherit: the U2/U4 live-validation runbooks, the production-config review (env gates, CORS, scheduler opt-in), and the acceptance-report consolidation. Recommended order for Phase 08: (1) execute U2 + U4 live hops, (2) run the consolidated hardening pass (red-line/IDOR/secrets/scheduler/restart), (3) production-config review + coverage decision, (4) acceptance report.

## 29. Final Status

**COMPLETE** — for the phase as scoped: one genuine, secure, maintainable second provider (Deriv WS v3) behind the existing architecture, plus the owner-mandated universal broker layer with connect-time identification, with every claim traced to code, tests, or official documentation, and every non-verified area (live connectivity) labeled as such.

**Hard stop honored:** no Phase 08 work, no third provider, no deployment, no destructive DB operation, no external trading action, and no unrelated module touched.
