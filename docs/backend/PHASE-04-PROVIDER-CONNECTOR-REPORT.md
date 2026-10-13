# PHASE 04 REPORT — First Real Trading Provider Connector: Provider Adapter, Authentication, and Account Validation

**Date:** 2026-10-13 · **Repository HEAD at start:** `ddf7ca5` (Phase 03) · **Mode:** pre-implementation review + feasibility re-verification + minimal gap closure, zero dependency install.

Evidence labels: **VERIFIED REPO FACT** · **VERIFIED OFFICIAL DOCS** (URL + verification date) · **IMPLEMENTED THIS PHASE** · **VERIFIED BY TEST** (actually executed) · **DEFERRED** (documented dependency, never worked around).

---

## 1. Executive Summary

Phase 04 asked for **one genuine, working, read-only trading provider connector** — adapter, authentication, and account validation — inside the approved architecture. The pre-implementation review (§4 of the mandate) established a decisive repository fact: the connector **already exists as committed code**. The repository's own Phase 03 (commit `ddf7ca5`, report `docs/backend/PHASE-03-OANDA-CAPABILITY-REPORT.md`) implemented `OandaRestProviderAdapter` — the official OANDA v20 REST read-only subset with Bearer personal-access-token authentication, AES-256-GCM credential vaulting, capability-gated validation, and the segmented connection/sync lifecycle — together with 55 targeted automated tests. Per the mandate ("do not assume a preceding phase is complete just because its prompt was executed"), this phase did **not** re-implement the connector; it (a) re-derived every requirement of §6.1/§8/§9/§10/§12/§13/§14 from the actual code, (b) re-verified the provider feasibility gate against the live official documentation with recorded URLs and a verification date, (c) closed the single genuine gap found — the transport-level **cancellation** backstop — with tests, (d) reconstructed the execution environment lost in a sandbox restart (fresh Postgres cluster, re-seeded reference data, re-applied Prisma-inexpressible partial indexes), and (e) re-ran the full verification battery: **typecheck 0 errors, eslint 0 errors, 1121/1121 automated tests, API + web builds green, and 14/14 live-bridge probes executing the complete connect → validate → sync → inspect → disconnect → reconnect flow against the real running stack.**

The real-provider HTTP hop against `api-fxpractice.oanda.com` remains **deferred to U2** (it requires the user's own practice token, per the roadmap's explicit scoping of the token at validation time). This is disclosed, not hidden: no claim of live verification is made anywhere in this report.

## 2. Initial Repository State

- `git status --short` at phase start: HEAD `ddf7ca5` on `main`, 5 tracked modifications none, ~380 untracked paths (screenshots, verification scripts, and a set of resurrected stale sources from a pre-refactor snapshot — see §23).
- Recent commits: `3d25c29` (Phase 00 audit) → `1685ac6` (Phase 01 architecture) → `45abb23` (Phase 02 Accounts UI) → `1aacbf1` (savepoint doc) → `ddf7ca5` (Phase 03 first real adapter).
- Tags: `savepoint/2026-10-12`, `savepoint/2026-10-13`.
- Monorepo: pnpm workspaces + Turborepo; `apps/api` (NestJS 11 + Fastify + Prisma 6.19 / embedded PostgreSQL 17), `apps/web` (Next.js 16 + React 19 + Tailwind 4), `packages/shared` (zod contracts).
- **Environment damage found and repaired (documented in `worklog.md`, entry `recover-2026-10-13b`):** the embedded Postgres data dir (`apps/api/.localpg/`) and the previous `download/` backup archives were lost in a sandbox restart; `apps/api/.env` was gone. All were reconstructed this phase (see §20).

## 3. Preceding Phase Reports Reviewed

- **Phase 00** — `docs/audits/PHASE-00-ACCOUNTS-CONNECTIVITY-AUDIT.md` (+ the download copy `PHASE-00-ACCOUNTS-AUDIT-2026-10-13.md`): provider feasibility assessment, `TradingAccount` model already present, zero HTTP clients at audit time.
- **Phase 01** — `docs/architecture/accounts-connectivity-target-architecture.md` + `accounts-connectivity-domain-contracts.md` + `accounts-connectivity-provider-feasibility.md` + `accounts-connectivity-phase-roadmap.md` + `PHASE-01-REPORT.md`: adapter port (exactly 6 read methods), provider registry, capability model, lifecycle states, bounded contexts.
- **Phase 02** — `docs/backend/PHASE-02-ACCOUNTS-UI-REPORT.md`: the Accounts UI and the `/trading-accounts*` wire contract the frontend consumes.
- **Phase 03** — `docs/backend/PHASE-03-OANDA-CAPABILITY-REPORT.md`: the real adapter, capability V2, segmented sync, U2/U3 open items.

**Numbering reconciliation (verified repo fact):** the repository's internal roadmap places the "first real adapter" inside its Phase 03 and reserves "Phase 04" for a scheduler. The uploaded master plan (this mandate) places the first real connector at Phase 04. This report follows the **mandate's** numbering; where the repo's Phase 03 delivered a mandate-Phase-04 item, it is labeled **REUSED (built pre-mandate, verified this phase)**.

## 4. Selected Provider

**OANDA — v20 REST API (`oanda-v20`), practice + live hosts, Bearer personal access token.** Exactly one provider implemented (red line §19 respected: no second adapter, no scheduler, no streaming).

## 5. Provider Selection Rationale

- **Phase 00 evidence (REUSED):** OANDA is the only candidate in the approved set with a **publicly documented, individually accessible REST API for retail accounts** — no broker partnership, no terminal, no Windows process, no hosted agent. MT5 requires a persistent terminal/bridge (Phase 06, U1 open); TradingView exposes no authorized brokerage-account API; cTrader's Open API requires an app registration with broker-side dependency; IC Markets is a broker whose platform (MT5/cTrader) inherits those constraints.
- **Phase 01 architecture fit (REUSED):** API-key-style credential maps 1:1 onto the existing `API_KEY` connection method and the AES-256-GCM vault with **zero schema change**; POLL retrieval fits the documented sync model.
- **Mandate fit:** read-only subset is first-class in v20 (all account facts are plain GETs); tokens are individual-trader accessible and user-revocable (§8 of the mandate's special handling is satisfied — no OAuth is forced onto a key-based provider).

## 6. Official Documentation and Verification Dates

All checks performed **2026-10-13** against `developer.oanda.com` (primary source; pages fetched and content-verified, not assumed):

| Fact verified | URL | Result |
|---|---|---|
| v20 REST is the documented live/practice API; individual traders can request tokens | `developer.oanda.com/rest-live-v20/introduction/` + `/authentication/` | HTTP 200; "Personal traders can request a personal access token"; legacy tokens remain valid |
| Authentication = `Authorization: Bearer <token>`; practice host `api-fxpractice.oanda.com`, live host `api-fxtrade.oanda.com` | `/rest-live-v20/authentication/` | Both hostnames present in the page; Bearer scheme present |
| `GET /v3/accounts` — "Get a list of all Accounts authorized for the provided token" | `/rest-live-v20/account-ep/` | Present (this is the token-validity probe the adapter uses for `testConnection`) |
| `GET /v3/accounts/{accountID}/summary` | `/rest-live-v20/account-ep/` | Present |
| `GET /v3/accounts/{accountID}/trades` — state filter documented, **default=OPEN** | `/rest-live-v20/trade-ep/` | Present ("state to filter the requested Trades by. [default=OPEN]") |
| `GET /v3/accounts/{accountID}/pendingOrders` | `/rest-live-v20/order-ep/` | Present |
| `GET /v3/accounts/{accountID}/transactions` — `pageSize` parameter documented | `/rest-live-v20/transaction-ep/` | Present |
| Write endpoints exist on the API (`PATCH /configuration`, `trades/{id}/close`, `POST /orders`, `orders/{id}/cancel`) but are **not referenced anywhere in Euforia's code** | `/account-ep/`, `/trade-ep/`, `/order-ep/` | Red line holds — the adapter references only the five GETs above |
| Token lifecycle/revocation via "Manage API Access" (My Account → My Services) | `/rest-live-v20/authentication/` | Present — supports the `credentialRevocation: SUPPORTED` capability declaration |
| **No public numeric rate-limit figure** on the best-practices page | `/rest-live-v20/best-practices/` | Sections: "HTTP Persistent Connection", "Retrieving and updating account state" — no numeric budget published; the adapter's 429→`RATE_LIMITED` + `Retry-After` passthrough remains the correct posture, exact figures stay **U2** |

## 7. Verified Provider Capabilities

As declared in the adapter's V2 capability descriptor (every cell carries evidence or a limitation — REUSED, re-verified against §6 this phase): `accountMetadata`, `balanceEquity`, `marginInfo`, `openPositions` (from open **trades** — stable `tradeID` + `openTime`), `orders` (from `pendingOrders`; price-less GSLOs excluded, declared), `deals` (from `transactions`; `ORDER_FILL` + `TRANSFER_FUNDS` only), `connectionValidation` (ON_CONNECT, token-scoped probe), `credentialRevocation` (user-revocable token).

## 8. Unsupported or Unverified Capabilities

- `accountDiscovery: UNKNOWN` — the token-scoped list endpoint exists and is probed, but no discovery FEATURE was built (open product question **U3**); connect requires the user-supplied external account id (echo-checked).
- `historyDepth: UNKNOWN` — per-sync window bounded to the v20 page max (1000 transactions); exact practice-account depth unverified (**U2**).
- `streamingAccountUpdates` / `streamingPositions` / `streamingOrderDealUpdates: UNSUPPORTED` — POLL-first strategy (documented), no SSE/WS in scope.
- `PROP_FIRM` environment: honestly rejected before any HTTP call (`UNSUPPORTED_ACCOUNT`).
- Margin level: not reported by v20 summary — persisted as `null`, never invented.
- **Category B/C verification (below) — DEFERRED to U2.**

## 9. Architecture and Adapter Design

**REUSED (verified repo facts):** `TradingProviderAdapter` port exposes exactly 6 read methods + `descriptor` (red line: no execution verb exists anywhere — probed by test); provider-specific isolation inside `modules/accounts/providers/oanda/`; DI-registered behind `ProviderRegistryService`; capability-driven gating at orchestration (pre-call) AND adapter (throw) level; UNSUPPORTED_CAPABILITY is a capability FACT (skipped segment), never a run failure; per-segment persistence (snapshot/positions/orders/deals) with PARTIAL semantics; environment routing on the request context (DEMO→practice, LIVE→live) without widening the port.

**IMPLEMENTED THIS PHASE (the single architecture-relevant change):** transport-level cancellation backstop (§11 below) — an options extension on the adapter constructor, **not** a port change.

## 10. Authentication Flow

**REUSED:** API-key mechanism per official docs — the user creates a personal access token in OANDA's "Manage API Access", submits it through the connect wizard (`POST /api/v1/trading-accounts/connect` with `credentials.method: "API_KEY"`, zod-validated `min(1).max(512)` without echo); the backend performs the **real** provider validation (token-scoped `GET /v3/accounts` + account-summary retrieval + echo identity check) BEFORE any persistence; on success the token is AES-256-GCM encrypted and stored; the frontend never sees it again (a masked 4-character hint only). No OAuth exists in this flow by design — forcing OAuth onto a documented key-based mechanism is forbidden by the mandate (§8).

## 11. Credential Storage and Security

**REUSED:** dedicated `ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY` (AES-256-GCM, base64 32 bytes, key outside the database, never committed — `.env` is gitignored); decryption restricted to the backend execution paths (connect/reconnect/test/sync); `credentialsEnc` never serialized into any client shape (verified against `mappers.ts` — only the masked hint crosses); credentials absent from logs, audit events, and exception messages (canned sanitized messages; red-line + secret-redaction suites green).

**IMPLEMENTED THIS PHASE — transport cancellation backstop (gap G1):** the orchestrator watchdog (`withProviderTimeout`, 10 s default) rejected late but did not abort the underlying `fetch`, leaving a hung socket unobserved. The adapter now carries `AbortSignal.timeout(requestTimeoutMs)` per request (`requestTimeoutMs` = `ACCOUNTS_PROVIDER_TIMEOUT_MS` + 2 s grace, wired in the registry factory so the watchdog's `CONNECTION_TIMEOUT` class stays authoritative); an abort surfaces as an honest `CONNECTION_TIMEOUT`, never a fake success. Two new unit tests cover both halves (abort fires + signal absent when unconfigured).

## 12. Connection Lifecycle Integration

**REUSED (verified by test):** states CONNECTED / ERROR / DISCONNECTED derived from the `TradingConnection` row; connect = validate→retrieve→persist→initial-sync (initial-sync failure never invalidates registration); at most ONE RUNNING sync run per account enforced by a **partial unique index** (Prisma-inexpressible, hand-written DDL — re-applied to the reconstructed databases this phase after the fresh `db push` skipped it, and caught by the §38 concurrency test); stale results cannot overwrite newer successes (409 `SYNC_ALREADY_RUNNING`); no database transaction is held open across a remote call (per-segment transactions after fetch); transient failures never delete connections or journal history (disconnect-only credential wipe, history preserved).

## 13. Account Identity and Metadata

**REUSED:** external account id (`externalAccountId`, user-supplied at connect) is stored separately from Euforia's internal UUID keys; every summary response is **echo-checked** against the requested id (mismatch → `INVALID_PROVIDER_RESPONSE`); account currency outside the journal's closed 9-currency vocabulary → honest `UNSUPPORTED_ACCOUNT`; fields nullable when the provider does not expose them (`marginLevel: null`, SL/TP nulls on positions); provider values vs normalized values distinguished at the zod normalization boundary; no metadata is ever invented.

## 14. API and Frontend Contract Changes

**None.** The wire surface is unchanged this phase (route-for-route MSW parity maintained by the Phase 02 contract; responses re-validated through shared zod schemas at the controller). The adapter options extension is constructor-internal. Frontend compatibility was verified by execution: **14/14 live-bridge probes** over :3000↔:4000 (login → connect 201 → drawer → initial sync → snapshot rendering → deals read → PATCH rename → manual sync → connection test → disconnect → reconnect → no page errors).

## 15. Database and Migration Changes

**No new migration.** This phase repaired the *reconstruction* of the existing schema on a fresh cluster (see §23): corrected two `@db.Uuid` regressions in `schema.prisma` (`OcrCollectionAsset.collectionId/assetId` — the documented pre-existing type drift, confirmed UUID in migration `20261006090000_ocr_v3` lines 51–52), baseline-marked the 37 existing migrations (`migrate resolve --applied`) after `db push`, re-seeded reference data (7 `Instrument` + 7 `InstrumentSpecification` rows, from the original migration INSERTs, idempotent), and re-applied the Prisma-inexpressible partial unique index `TradingSyncRun_accountId_running_key` (the dead `TradingSession` index was verified renamed away and intentionally not recreated).

## 16. Error Handling and Observability

**REUSED:** normative status translation (401→`INVALID_CREDENTIALS`, 403→`UNAUTHORIZED_PROVIDER_ACCESS`, 404→`UNSUPPORTED_ACCOUNT`, 429→`RATE_LIMITED` + provider `Retry-After`, 5xx/network→`PROVIDER_UNAVAILABLE`, malformed→`INVALID_PROVIDER_RESPONSE`, transport abort→`CONNECTION_TIMEOUT`); zero unbounded retries (no automatic retry at all); sanitized canned messages (provider error bodies never surfaced); structured logs carry only safe metadata (userId, accountId, provider, syncRunId, segment, code, duration); security events on connect-failure / all-failed sync paths. **IMPLEMENTED THIS PHASE:** the abort→`CONNECTION_TIMEOUT` mapping (§11).

## 17. Files Created

- `docs/backend/PHASE-04-PROVIDER-CONNECTOR-REPORT.md` — this report.
- `scripts/reseed-reference-data.sql`, `scripts/reapply-partial-indexes.sql` — idempotent recovery DDL (operational tooling, documented in the worklog).
- `scripts/testdb-probe.js` — environment diagnostic used during reconstruction.
- `.wip-quarantine-2026-10-13/` — **untracked** quarantine of resurrected stale sources (see §23); preserved byte-for-byte, NOT committed.

## 18. Files Modified

- `apps/api/src/modules/accounts/providers/oanda/oanda-rest.provider.ts` — `requestTimeoutMs` option + `AbortSignal.timeout` per request + abort→`CONNECTION_TIMEOUT` mapping (G1).
- `apps/api/src/modules/accounts/accounts.module.ts` — `TRANSPORT_ABORT_GRACE_MS = 2_000` wiring into the registry factory.
- `apps/api/test/unit/oanda-rest-provider.spec.ts` — +2 cancellation tests (§19).
- `apps/api/prisma/schema.prisma` — `@db.Uuid` ×2 restored on `OcrCollectionAsset` (minimal necessary fix, documented §15).
- `apps/api/tsconfig.json` — `exclude: ["src/modules/reviews"]` (dead untracked WIP module referencing a non-existent `Goal` model; files preserved on disk, never imported by any tracked code).
- `worklog.md`, `SAVEPOINT.md` — recovery + phase records.

## 19. Tests Added

In `apps/api/test/unit/oanda-rest-provider.spec.ts` (suite now **39** tests):

1. *"aborts a hung request at the configured backstop and surfaces CONNECTION_TIMEOUT"* — a never-settling fetch stub honoring the abort signal; fake timers advance past the backstop; asserts `signal.aborted === true` and the surfaced code is `CONNECTION_TIMEOUT`.
2. *"without requestTimeoutMs no signal is passed (orchestrator watchdog semantics unchanged)"* — asserts the transport receives no signal and that `withProviderTimeout` remains the bounding mechanism (`CONNECTION_TIMEOUT` after its own timer).

All pre-existing suites passed untouched (1121/1121 total, §20).

## 20. Commands Executed and Results (actual observations)

| Command | Result |
|---|---|
| `git status/branch/tag -l` | HEAD `ddf7ca5`, clean tracked tree, 2 savepoint tags |
| `node scripts/dev-db.mjs up` | fresh cluster :5433, DB `cosmoz` + `cosmoz_test` created |
| `prisma migrate deploy` (fresh `cosmoz`) | **failed** on `20261003145823_trade_review` (historical drift, `relation "Trade" does not exist`) → documented baseline strategy adopted |
| `prisma db push` (after `@db.Uuid` fix) | both DBs in sync (cosmoz: "Done in 122ms"; cosmoz_test after the `--url`-unsupported trap: "Done in 212ms", 67 tables) |
| `prisma migrate resolve --applied` ×37 + `migrate status` | "Database schema is up to date!" on both DBs |
| re-seed + partial-index DDL (both DBs) | executed; probe: `Instrument: 7`, `InstrumentSpecification: 7`; index present |
| `corepack pnpm build` (api) | first run failed on dead untracked `src/modules/reviews/` → excluded; then OK (`dist/apps/api/src/main.js`) |
| `corepack pnpm typecheck` (api) | 0 errors (one iteration: unused `url` param in the new test → fixed → 0) |
| `corepack pnpm exec eslint src test` (api) | 0 errors |
| `corepack pnpm vitest run` (api, full) | **1121/1121 passed, 82 files** (1119 pre-existing + 2 new) — includes the standing red-line / IDOR / secret-redaction / accounts e2e / oanda-fixture e2e suites, all green |
| `corepack pnpm build` (web) | first runs failed on resurrected stale sources (140 errors: route collision `/oryon`, pdfmake, stale export names) → quarantine of untracked corpses → **compiled successfully, 50 routes** |
| `next start -p 3000` + probe | `/login` → 200 |
| `node scripts/verify-accounts-live.js` | **14 passed, 0 failed** (§14) |
| API restart on new build | `/api/v1/trading-accounts/providers` unauthenticated → 401 (auth boundary verified live) |
| demo user | re-registered `trader@cosmoz.app`, verified ACTIVE; login → `AUTHENTICATED` |

## 21. Automated vs. Sandbox vs. Live Verification

- **A. Automated tests — DONE:** 1121/1121 (unit 39 OANDA + segments + contracts + the fixture e2e over the real AppModule/Postgres/vault with a local realistic-v20 transport).
- **B. Official sandbox/demo verification — DEFERRED (U2):** requires the user's own OANDA practice token; it must never transit the repo. Runbook unchanged (Phase 03 report §8): start API with `ACCOUNTS_OANDA_PROVIDER=enabled`, connect with `environment: "DEMO"` through the wizard, verify snapshot vs the OANDA console, exercise revocation → 401 → connection ERROR.
- **C. Authorized live-account verification — NOT PERFORMED:** no live credentials; same U2 runbook with `environment: "LIVE"`.

**No claim of live connectivity is made.** Fixture and mock evidence are labeled as such everywhere.

## 22. Security and Read-Only Compliance

- Read-only by construction: the port exposes no execution verb; the adapter references only the five documented GETs (verified against the official endpoint listings, §6); the red-line probe test asserts the descriptor/method surface.
- Credentials: encrypted at rest (AES-256-GCM, dedicated key), never returned, never logged, never serialized; masked hint ≤4 chars; disconnect wipes credentials while preserving journal history.
- Ownership: all routes behind authentication; account loads ownership-scoped (foreign ids → 404); IDOR suites green.
- No new dependency (global `fetch` only); no secret in code, fixtures, or logs; `.env` files gitignored.

## 23. Known Limitations and Blockers

1. **U2 (user):** the real-practice-token validation hop and exact rate-limit figures. Smallest next step: provide a practice token at runtime and follow the §21-B runbook.
2. **U3 (product):** account-discovery breadth remains UNKNOWN (no feature built).
3. **Environment resurrection debt:** the sandbox restart destroyed `.localpg` and the old `download/` archives; fresh backups were recreated this phase (`oryon-git-2026-10-13-v2.bundle` including the full history through Phase 03, plus new DB/extras archives).
4. **Quarantined stale sources (untracked, preserved):** ~380 untracked paths from a pre-refactor snapshot broke `next build` (route collision `/oryon` vs `(app)/oryon`, `pdfmake` imports, stale export names such as `useChartTokens`/`marketFetch`) and `tsc` (dead `apps/api/src/modules/reviews/` referencing a non-existent `Goal` model). They were **moved byte-for-byte to `.wip-quarantine-2026-10-13/`** (web `src`, web root TS tests, api reviews stays excluded-in-place). Nothing was deleted; nothing tracked changed. Decision requested from the owner: confirm deletion of the quarantine after review.
5. The API `tsconfig` exclusion of `reviews/` and the `schema.prisma` `@db.Uuid` restoration are minimal cross-cutting fixes required to build at all (mandate §4.3 allows exactly this class of change, documented).

## 24. Acceptance Criteria Checklist

| Criterion | Disposition |
|---|---|
| Exactly one provider; selection justified | ✅ OANDA v20 (§4–§5); no second adapter |
| Documented, authorized integration path; not a mock | ✅ `isMock: false`; official-docs verification §6; real code paths (transport exercised by fixture e2e) |
| Unsupported functionality explicitly identified | ✅ §8 (UNKNOWN/UNSUPPORTED cells + limitations) |
| Documented auth mechanism implemented | ✅ Bearer PAT per official docs (REUSED, re-verified) |
| Approved secret protection | ✅ AES-256-GCM vault, dedicated key (REUSED) |
| Secrets absent from responses/logs/audit | ✅ mapper audit + red-line/secret-redaction suites green |
| Ownership/authorization enforced | ✅ guards + IDOR suites green |
| Read-only preserved | ✅ §22; red-line probe green |
| Real provider validation operation | ✅ token-scoped probe + summary + echo check (live hop = U2, disclosed) |
| Outcomes map to lifecycle; no false verified | ✅ verified-by-test (CONNECTED only after real validation) |
| Provider failures don't corrupt data | ✅ per-segment persistence; history preserved |
| Metadata honesty; external ≠ internal ids | ✅ §13 |
| Registry + lifecycle reused; no competing architecture | ✅ §9 |
| API/frontend contracts compatible | ✅ zero wire change; 14/14 live probes |
| DB changes minimal/non-destructive | ✅ no migration; reconstruction repairs documented |
| Meaningful tests added | ✅ 2 (cancellation) — the connector's 55+ pre-existing tests re-verified |
| Existing tests pass / failures identified | ✅ 1121/1121 |
| typecheck/lint/builds pass | ✅ all four (§20) |
| Migration validation | ✅ `migrate status` clean on both DBs |
| Evidence: docs referenced; A/B/C distinguished; unverified behavior disclosed | ✅ §6, §21, §8 |

## 25. Phase 05 Readiness

- The connector is a stable, tested foundation; the adapter contract, registry, vault, and lifecycle need **no** changes to admit another provider.
- Open dependencies before any next phase: **U2** (practice token + rate-limit figures), **U3** (discovery decision), owner decision on the quarantined corpses (§23.4).
- Per the mandate's stop condition: **nothing beyond Phase 04 was started** — no scheduler, no streaming, no second provider, no trade import.

## 26. Final Git Diff Summary

Tracked changes (this phase): **6 files modified, 1 file added** —
`M apps/api/prisma/schema.prisma` · `M apps/api/tsconfig.json` · `M apps/api/src/modules/accounts/providers/oanda/oanda-rest.provider.ts` · `M apps/api/src/modules/accounts/accounts.module.ts` · `M apps/api/test/unit/oanda-rest-provider.spec.ts` · `M worklog.md` · `A docs/backend/PHASE-04-PROVIDER-CONNECTOR-REPORT.md`.
Untracked additions (operational, not committed): recovery scripts + fresh `download/` archives + `.wip-quarantine-2026-10-13/`.
