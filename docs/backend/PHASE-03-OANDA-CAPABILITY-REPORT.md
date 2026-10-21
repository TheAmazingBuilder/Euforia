# PHASE 03 REPORT — Accounts & Trading Connectivity: First Real Adapter (OANDA) + Capability Model

**Date:** 2026-10-13 · **Repository HEAD at start:** `1aacbf1` · **Mode:** backend implementation + scoped web delta, one additive hand-written migration, zero dependency install.

Evidence labels: **IMPLEMENTED** (built this phase) · **REUSED** (existing functionality consumed verbatim) · **VERIFIED BY TEST** (actually executed, result quoted) · **FIXTURE EVIDENCE** (realistic payload shapes, never presented as provider verification) · **DEFERRED** (documented dependency, not worked around).

---

## 1. Executive Summary

Phase 03 is **COMPLETE**. The architecture is proven with reality-shaped input: `OandaRestProviderAdapter` implements the read-only port against the official OANDA v20 REST API (practice + live hosts, Bearer personal access token — fits the existing `API_KEY` credential method with zero schema change to credentials), registered behind an explicit per-deployment opt-in gate. The capability model V2 (doc B §4.2 frozen design) is now live code consumed by an enforcement path: three-state support levels (`SUPPORTED/UNSUPPORTED/UNKNOWN`), honest metadata (evidence anchors + limitations), orchestration-side gating where a non-SUPPORTED sync segment is a **capability fact** (skipped, never a failure), and adapter-level enforcement throwing the new `UNSUPPORTED_CAPABILITY` (422) code instead of silently returning empty data.

The sync orchestration was rebuilt from one all-or-nothing transaction into **segment-based execution** (doc B §8.2): snapshot / positions / orders / deals each gate → fetch → normalize → persist independently; ≥1 succeeded AND ≥1 failed → run `PARTIAL` with the first failing segment's code; every supported segment failed → the historical `FAILED` path (connection ERROR on auth-class, security event, rethrow). Runs keep per-segment observation timestamps so a legitimately-empty segment is distinguishable from a failed one. `lastSyncAt` advances **only when the snapshot segment persisted** — the freshness axis is snapshot-anchored; a PARTIAL run reads `DELAYED`, never `LIVE`, until a full run completes (both backend mapper and MSW engine mirror).

Acceptance criterion 1 (practice-account lifecycle through the Phase 02 UI) is **verified over fixture evidence on every other layer**: the full connect → initial sync → reads → idempotent re-sync → PARTIAL → credential-rejection lifecycle passes against the REAL AppModule + real Postgres + real AES-256-GCM vault + real zod boundaries, with the ONLY difference from production being the transport (a local fixture server answering realistic v20 payload shapes). The live OANDA validation itself remains **deferred to U2** (user-provided practice token at runtime; runbook in §12) — the roadmap explicitly scopes the token as a validation-time dependency, and every other criterion is fully discharged.

## 2. Verification Ledger (commands actually executed)

| Command | Result |
|---|---|
| `npx tsc --noEmit` (api) | 0 errors |
| `npx tsc --noEmit` (web) | 0 errors |
| `npx vitest run` (api, full suite) | **1119/1119 passed** (82 files) — includes the standing accounts e2e (lifecycle/IDOR/red-line/secret-redaction/rate-limit), all untouched and green |
| `npx eslint src test` (api) | 0 errors |
| `pnpm build` (web) | OK (33 routes, `/accounts` included) |
| `pnpm build` (api → dist) | OK; `:4000` restarted on the new build |
| `node scripts/verify-accounts.js` (:3000, MSW) | **25 passed, 0 failed** |
| `node scripts/verify-accounts-live.js` (:3000↔:4000 live bridge) | **14 passed, 0 failed** |
| `accounts-tests.ts` (engine, tsx) | **74 passed, 0 failed** |
| New Phase 03 suites | oanda-rest-provider 37 ✓ · sync-segments 9 ✓ · oanda-fixture e2e 9 ✓ · contracts +4 ✓ · sync-status +4 ✓ |
| `prisma migrate deploy` (dev `cosmoz` + test `cosmoz_test`) | `20261013070000_accounts_sync_segments` applied to both |

## 3. What Shipped (files)

**Shared contract** (`packages/shared/src/`)
- `schemas/trading-account.ts` — capability V2 **IMPLEMENTED** exactly per doc B §4.2: `capabilitySupportSchema`, `providerCapabilitySchema` (support + retrieval + requiresPermissions + evidence + limitation), `tradingProviderCapabilitiesV2Schema` (13 keys), `connectionCapabilityOverrideSchema` (connection-scoped narrowing with mandatory `reason`), `CAPABILITY_KEYS`, migration bridge `tradingProviderCapabilitiesAnySchema` + `isCapabilitiesV2` + `capabilitySupportLevel` (V1 booleans → SUPPORTED/UNSUPPORTED; keys outside V1's 6 booleans answer UNKNOWN). `TRADING_ERROR_CODES.UNSUPPORTED_CAPABILITY` added (422-class, doc B §10). Descriptor `capabilities` accepts EITHER shape (adapters migrate one by one — the mock stays V1, OANDA is the first V2 consumer).
- `enums.ts` — `brokerSchema` extended with `"OANDA"` (additive; doc B §13's frozen example declares `"platform": "OANDA"`; column is TEXT, no DB migration needed).

**API** (`apps/api/src/`)
- `modules/accounts/providers/oanda/oanda-rest.provider.ts` — **IMPLEMENTED**: the 6 read methods behind per-method capability guards; environment routing (DEMO→`api-fxpractice.oanda.com`, LIVE→`api-fxtrade.oanda.com`, PROP_FIRM → honest `UNSUPPORTED_ACCOUNT`); global-`fetch` transport (first deliberate outbound call of the domain — **zero dependency installed**); status→code translation per the normative table (401→`INVALID_CREDENTIALS`, 403→`UNAUTHORIZED_PROVIDER_ACCESS`, 404→`UNSUPPORTED_ACCOUNT`, 429→`RATE_LIMITED` **carrying the provider's `Retry-After`**, 5xx→`PROVIDER_UNAVAILABLE`, malformed→`INVALID_PROVIDER_RESPONSE`); canned sanitized messages (provider error text never surfaces); account-echo identity check; account-currency guard (outside the journal's 9-currency vocabulary → `UNSUPPORTED_ACCOUNT`, not a misleading malformed-response); `testConnection` = token-scoped `/v3/accounts` probe (the discovery FEATURE stays U3-gated).
- `modules/accounts/providers/oanda/oanda-mapping.ts` — **IMPLEMENTED**: v20 payload zod schemas (decimal STRINGS preserved verbatim; number-shaped values converted through exact string form; nanosecond RFC3339 truncated to ms UTC ISO); positions from open **trades** (stable `tradeID` + `openTime` — the netted `/positions` aggregate exposes neither → §7.4 identity fallback applied with the provider's documented per-trade identity); orders from `pendingOrders` (verb composed from two provider-verbatim facts: `BUY_LIMIT`/`SELL_STOP`…; price-less guaranteed-stop orders **excluded**, declared as capability limitation — never an invented price); deals from `transactions` (`ORDER_FILL` fills with provider-side trade link from `tradeClosed/tradeOpened/tradeReduced`; `TRANSFER_FUNDS` as balance ops, symbol null, volume "0.00", side by amount sign; every other transaction class excluded by documented filter); symbol map **only for identical instruments** (`EUR_USD→EURUSD`, `GBP_USD→GBPUSD`, `USD_JPY→USDJPY`, `XAU_USD→XAUUSD`) — `BTC_USD` deliberately NOT mapped to the catalog's `BTCUSDT` (different quote asset → wrong-symbol join); unmapped symbols pass through verbatim.
- `modules/accounts/providers/capability-poor-test.provider.ts` — **IMPLEMENTED** (doc E Phase 03): orders UNSUPPORTED (method throws `UNSUPPORTED_CAPABILITY`), deals UNKNOWN (blocks with an honest error), deterministic fixtures; NEVER registered in production (test-only, isMock: true).
- `modules/accounts/trading-sync.service.ts` — **REBUILT**: segment-based `executeSync` (§2 above); `normalizeProviderError` + `UNSUPPORTED_CAPABILITY` → 422-class and `Retry-After` passthrough (default 60 s kept); auth-class failures mark the connection ERROR in BOTH the FAILED and PARTIAL paths; the security event stays on the all-failed path (PARTIAL failures are observable via the run row + Monitoring's `toJobRunStatus`, which maps PARTIAL→FAILED — alerting on a degraded run is honest).
- `modules/accounts/accounts.repository.ts` — **REBUILT** persistence: `persistSnapshotSegment` / `persistPositionsSegment` / `persistOrdersSegment` / `persistDealsSegment` (each its own transaction, each stamping its run-segment timestamp + counts; the snapshot segment also advances `connection.lastSyncAt`) + `finalizeSyncRun` (COMPLETED|PARTIAL + first-error code). The single-transaction `persistSyncResult` is gone by design (doc B §8.2: a failing deals segment must not roll back persisted positions).
- `modules/accounts/mappers.ts` — `deriveSynchronizationStatus`: latest run PARTIAL → `DELAYED` (never LIVE until a full run completes).
- `modules/accounts/provider.types.ts` — `ProviderError` + `UNSUPPORTED_CAPABILITY` code + optional `retryAfterSeconds`; `ProviderRequestContext` + `environment` (port keeps exactly its 6 methods — context enrichment, not widening).
- `modules/accounts/accounts.module.ts` — OANDA registered behind `config.accounts.oandaEnabled` (real adapters are never on by default).
- `config/env.schema.ts` + `config/app-config.ts` — `ACCOUNTS_OANDA_PROVIDER` (`enabled|disabled`, default **disabled**) + `ACCOUNTS_OANDA_REST_URL` (override for fixture tests/region edge; unset = route by environment).
- `modules/accounts/trading-account.service.ts` — contexts now carry `environment` (connect/test/reconnect).

**Prisma** — hand-written additive migration `20261013070000_accounts_sync_segments` (4 nullable `TIMESTAMP(3)` columns on `TradingSyncRun`: `snapshotAt/positionsAt/ordersAt/dealsAt`), schema.prisma updated. **Verified on dev + test DB.**

**Web** (`apps/web/src/`) — minimal, honest delta: MSW engine freshness derivation mirrors PARTIAL→DELAYED; drawer sync toast gains an explicit PARTIAL case (`toast.warning` with the failing segment's code — a partial run is an outcome, not an error) + a `runPartialNote` panel when the last run is PARTIAL; `dict.accounts` keys added. The UI already rendered all six freshness badges (Phase 02) and never read the V1 capability booleans, so the descriptor widening breaks nothing.

## 4. Acceptance Criteria — Disposition (doc E Phase 03)

1. **Practice-account connect → sync → inspect through the Phase 02 UI** — every layer EXCEPT the real HTTP hop is verified: fixture e2e 9/9 over real AppModule/DB/vault + live probes 14/14 against the running `:4000` build. The real-token hop is **DEFERRED to U2** (see §12 runbook). Disposition: partially verified by design (roadmap scopes the token at validation time).
2. **Capability gating proven with an honest 422, never silent emptiness** — **VERIFIED BY TEST**: orchestration skips non-SUPPORTED segments (capability-poor adapter: orders UNSUPPORTED + deals UNKNOWN → run COMPLETED, segments never called); adapter-level enforcement throws `UNSUPPORTED_CAPABILITY` (unit) → `normalizeProviderError` → `BusinessRuleError(422)` with the stable code (unit) — the full wire-mapping chain without the socket.
3. **Failure classes mapped and tested** — **VERIFIED BY TEST**: 401→422 `INVALID_CREDENTIALS` + connection ERROR (e2e mid-life revocation scenario), 429→`RATE_LIMITED` + provider-advertised `Retry-After` (unit + e2e PARTIAL scenario), 5xx/timeouts→502-class (unit), malformed→`INVALID_PROVIDER_RESPONSE` never persisted (unit ×3 + normalization boundary).
4. **Idempotency against real provider payload shapes** — **VERIFIED BY TEST** (FIXTURE EVIDENCE, realistic v20 shapes): repeated syncs upsert to identical row counts (e2e), `(accountId, external*Id)` unique constraints unchanged, `(accountId, tradeID)` position identity stable.
5. **Red-line, IDOR, secret-redaction suites green; normalization + error-mapping + capability + pagination contract tests green; red-line test untouched** — **VERIFIED**: full API suite 1119/1119 including the untouched standing suites; new contract tests cover the capability schema + bridge; the adapter exposes the 6 port methods and no execution verb (unit red-line probe); no dependency installed.

## 5. Decisions and Architecture Amendments (doc E §5 consistency rule)

1. **`brokerSchema` + `"OANDA"`** — additive enum extension; matches doc B §13's frozen example verbatim. No DB migration (TEXT column).
2. **Positions ← open trades, not the netted `/positions` aggregate** — the aggregate lacks a stable id AND an open time (both required by `NormalizedPosition`/§7.4). Trades give `tradeID` + `openTime` + per-trade economics. Consequence (declared in the capability `limitation`): netting accounts show one row per open trade, not per instrument; SL/TP/current-price are order-ID references in the payload → honest nulls.
3. **Price-less orders excluded** — GSLOs carry `distance`, not `price`; inventing a price is forbidden (§6). Exclusion count returned by the mapper; limitation declared on the `orders` capability. No normalization schema loosening.
4. **Transaction filter** — deals = `ORDER_FILL` + `TRANSFER_FUNDS`; other transaction classes (margin-call entries, client-state records…) are bookkeeping, not deals. The exclusion set is code-documented.
5. **Environment on `ProviderRequestContext`** — routing input (practice vs live host) without widening the 6-method port (doc A §4.3 preserved); PROP_FIRM honestly `UNSUPPORTED_ACCOUNT` before any HTTP call (the URL is resolved OUTSIDE the try — a test proved the rejection was otherwise swallowed into `PROVIDER_UNAVAILABLE`; fixed).
6. **`UNSUPPORTED_CAPABILITY` never fails a run** (doc B §8.2) — enforced twice: the orchestration gate pre-call, and a backstop catch for adapter-thrown refusals.
7. **Security-event ledger on the all-failed path only** — PARTIAL runs are degraded, not "sync failed" events; Monitoring's `toJobRunStatus(PARTIAL) → FAILED` keeps the SYNC_FAILURES alert honest.
8. **Currency vocabulary guard** — OANDA accounts in currencies outside the journal's closed 9-currency enum surface `UNSUPPORTED_ACCOUNT` ("…not supported yet"), never a misleading `INVALID_PROVIDER_RESPONSE`; widening the app-wide currency enum is a product decision, not an adapter concern.
9. **`brokerSession` / journal surfaces untouched** — Phase 03 adds no route and changes no existing wire shape (read-only surfaces unchanged; the descriptor union is backward-compatible for all current consumers).

## 6. Operational Traps Discovered (for SAVEPOINT.md)

1. **`prisma migrate dev` is unusable on this repo** — the history contains a pre-existing type drift (`OcrCollectionAsset` text/uuid FK) plus a future-dated migration name (`20261013220000_phase11_analyses_plans`), so the shadow replay fails and `migrate dev` generates a destructive drift-diff migration (dropping Academy/Nofy/… tables). **Discipline: hand-write additive migrations + `prisma migrate deploy`** (dev via `.env`, test via explicit `DATABASE_URL` env). A `migrate dev` failure leaves a FAILED record in `_prisma_migrations` that blocks further deploys — remove the row via `prisma db execute` (Postgres transactional DDL had rolled the partial apply back; data verified intact).
2. **`migrate deploy --url` needs the schema flag** — plain `DATABASE_URL=<url> npx prisma migrate deploy` from `apps/api` is the reliable form.
3. **Wire decimals drop trailing zeros** — `Prisma.Decimal.toFixed()` normalizes `"55.4210"→"55.421"`; test assertions must expect the normalized form.
4. **Web wire shapes ≠ adapter shapes** — `brokerPositionSchema` uses `id`/`direction`/`unrealizedPnl` (NOT externalPositionId/side/profit); probe assertions follow the wire, not the normalized domain shape.

## 7. Open Questions Carried (unchanged ownership)

- **U2 — OANDA practice token + exact rate-limit figures/endpoint depth** (user): blocks only the final live validation; everything else stands. Runbook below.
- **U3 — account discovery breadth**: `accountDiscovery` declared UNKNOWN with limitation; the endpoint exists and `testConnection` probes it, but no discovery feature was built (optional per doc E).
- **Snapshot history series** — still deferred (doc A §10 R3, product decision, Phase 07 revisit).
- **Connection-scoped capability overrides** — schema + tests shipped; the first real producer arrives when a provider restriction justifies one (no speculative storage, mandate §8.10).

## 8. U2 Validation Runbook (when the user provides a practice token)

1. Start the API with `ACCOUNTS_OANDA_PROVIDER=enabled` (no URL override). The token never enters the repo or env — it goes through the connect wizard (`POST /api/v1/trading-accounts/connect`), encrypted at rest by the existing vault.
2. Connect with `environment: "DEMO"`, the practice `externalAccountId` (format `101-004-…-001`), the token as `credentials.secret`.
3. Verify in the UI (`/accounts`): snapshot values match the OANDA web console, `EUR_USD` fills appear as `EURUSD` deals, the freshness badge reads `Fresh` after a sync.
4. Exercise `PARTIAL` (revoke the token mid-life → 401 path) and re-connect recovery.
5. Record actual rate-limit behavior (429 cadence) to close U2's figures and re-scale `TRANSACTIONS_PAGE_SIZE` if needed.
6. NEVER commit the token; the fixture e2e remains the CI-representative evidence.

## 9. What Phase 03 Did NOT Do (scope discipline)

No scheduler (Phase 04), no OAuth (Phase 05), no MT5 (Phase 06, U1 open), no Deriv (Phase 07), no cursors (OANDA bounded pages make full-refresh correct today — decision documented in doc B §8.3), no WS/SSE, no discovery feature, no execution surface of any kind (red line untouched and re-probed), no dependency install (global fetch only), no changes to the journal/Hub bounded contexts.
