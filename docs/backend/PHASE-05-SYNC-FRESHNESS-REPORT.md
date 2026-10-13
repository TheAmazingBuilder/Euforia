# PHASE 05 REPORT — Trading Account Data Synchronization, Reconciliation, and Freshness Management

**Date:** 2026-10-13 · **Repository HEAD at start:** `f89d0b6` (system sweep commit above Phase 04 `23035b4`) · **Mode:** implementation per the uploaded master spec (§1–§25), read-only red line preserved, zero dependency install.

Evidence labels: **VERIFIED REPO FACT** · **VERIFIED OFFICIAL DOCS** (URL + verification date) · **IMPLEMENTED THIS PHASE** · **VERIFIED BY TEST** (actually executed) · **DEFERRED** (documented dependency, never worked around).

---

## 1. Executive Summary

Phase 05 asked for **reliable synchronization of external trading-account data through the Phase 04 connector** — initial and periodic sync, snapshot persistence, status and history, freshness tracking, idempotency, bounded retries, rate-limit awareness, safe frontend presentation, and tests for normal and failure paths. The pre-implementation audit (§4 of the mandate) produced a decisive finding: **the real-provider deals path was broken against the documented v20 API and both list endpoints silently truncated** — the time-based ListTransactions response carries **page URLs, not rows** (fetching it had never been exercised against the real host because the live hop is U2), and ListTrades/ListOrders default to `count=50` while the adapter sent no `count`. This phase closed those correctness gaps **with the provider's own documented mechanisms**, then built the missing operational envelope on top: the **documented `sinceid` incremental checkpoint** (spec §8.2), **position-closure reconciliation** gated on an adapter-provided completeness fact (§13.2), the **config-gated background scheduler** with stale-run recovery (§9/§15), **bounded transient retries** with backoff/jitter/Retry-After (§15), **per-resource freshness** with explicit derivation rules (§11), a **bounded keyset-paginated sync-history endpoint** (§16), and the **minimal frontend + MSW mirror** to present all of it honestly (§16.1). Verification: **typecheck 0 errors (api + web), eslint 0 errors, 1159/1159 automated tests (83 files — 38 new), API + web builds green in both modes, both databases migrated, 25/25 MSW-mode probes, 14/14 live-bridge probes over the real running stack, and a live curl verification of the two new wire surfaces.** No claim of live OANDA connectivity is made anywhere — that remains U2 (§22).

## 2. Initial Repository State

- `git status --short` at phase start: clean tracked tree at HEAD `f89d0b6` on `main`. `f89d0b6` is a system-generated commit (UUID message, 1174 files) that swept in all previously-untracked paths — including **433 files under `.wip-quarantine-2026-10-13/`** which the Phase 04 report had deliberately kept untracked. Nothing was deleted or rewritten this phase; the quarantine content is now merely *tracked* (it stays outside every build path). The owner's pending decision on the quarantine (Phase 04 §23.4) is unchanged in substance.
- Recent commits: `45abb23` (Phase 02) → `1aacbf1` (savepoint) → `ddf7ca5` (Phase 03 adapter) → `23035b4` (Phase 04 connector verification + cancellation) → `f89d0b6` (system sweep).
- Monorepo unchanged: pnpm + Turborepo; `apps/api` (NestJS 11 + Fastify + Prisma 6.19 / embedded PostgreSQL 17), `apps/web` (Next.js 16 + React 19), `packages/shared` (zod contracts).
- Environment: Postgres :5433 up (reconstructed in Phase 04), API :4000 up (Phase 04 build), web :3000 up (live bridge), demo user `trader@cosmoz.app` ACTIVE.

## 3. Phase 00–04 Deliverables Reviewed

- **Phase 00** — `docs/audits/PHASE-00-ACCOUNTS-CONNECTIVITY-AUDIT.md`: provider feasibility, `TradingAccount` model present, zero-scheduler finding.
- **Phase 01** — the five `docs/architecture/` documents: 6-method read-only port, capability model, lifecycle separation (connection axis ≠ sync axis), frozen roadmap (its internal "Phase 04 = scheduler" maps to THIS phase under the master-spec numbering, as reconciled in the Phase 04 report §3).
- **Phase 02** — `docs/backend/PHASE-02-ACCOUNTS-UI-REPORT.md`: the Accounts UI, the `/trading-accounts*` wire contract, MSW engine/handlers (the route-for-route mirror this phase extends).
- **Phase 03** — `docs/backend/PHASE-03-OANDA-CAPABILITY-REPORT.md`: the real adapter, capability V2, segmented sync with PARTIAL semantics, per-segment run timestamps, single-RUNNING partial unique index.
- **Phase 04** — `docs/backend/PHASE-04-PROVIDER-CONNECTOR-REPORT.md`: docs re-verification ledger, transport cancellation backstop, environment reconstruction, `docs/backend/PHASE-04-PROVIDER-CONNECTOR-REPORT.md` §23 quarantined-sources disclosure.
- Prisma models/migrations, the Monitoring module's sync-health reads, and the existing test/fixture infrastructure were re-inspected at HEAD (VERIFIED REPO FACTS; details throughout §5–§20).

## 4. Verified Provider Capabilities (capability inventory, mandate §4)

| Capability | Status | Required evidence |
|---|---|---|
| Account identity | **SUPPORTED** | `fetchAccountInfo` — echo-checked `/summary` (repo, re-verified) |
| Account metadata | **SUPPORTED** | `/summary`; leverage derived from reported `marginRate`; `server` honest null |
| Balance and equity | **SUPPORTED** | `/summary` balance + NAV |
| Margin and free margin | **SUPPORTED** | `/summary` marginUsed/marginAvailable; `marginLevel` not reported → null |
| Open positions | **SUPPORTED** (complete only via Phase 05 pagination) | `GET /trades?state=OPEN` + `count` [default=50, **maximum=500**] + `Link rel="next"` — developer.oanda.com/rest-live-v20/trade-ep/, verified 2026-10-13 |
| Orders | **SUPPORTED** | `GET /pendingOrders` + same `count`/Link semantics (order-ep, verified 2026-10-13); GSLO exclusion stands |
| Deals/executions | **SUPPORTED** (only via documented pages/sinceid — the inline-rows assumption was wrong) | ListTransactions body = `{ from, to, pageSize, count, pages: [idrange URLs], lastTransactionID }`; rows come from `idrange` or `sinceid` — transaction-ep, verified 2026-10-13 |
| Historical records | **PARTIALLY_SUPPORTED** | Time-window max 365 days; page caps (pageSize max 1000); per-run page/row budgets documented (§9 below) |
| Incremental synchronization | **SUPPORTED** (implemented) | `GET /transactions/sinceid?id=` — "return all Transactions newer than the TransactionID" (documented cursor; spec §8.2 mechanism) |
| Live updates | **UNSUPPORTED** | POLL-first strategy unchanged; no SSE/WS; freshness is sync-anchored, never "real-time" |

**Newly verified official-docs facts (2026-10-13):** `count` defaults on trades/orders (50, max 500); `Link` header pagination ("A link to the next page … if the results were paginated"); ListTransactions returns `pages` (idrange URLs) and NOT inline rows; `sinceid` returns rows inline; **documented rate limits: 120 req/s (trades/orders/sinceid/idrange families) and 30 req/s (time-based transactions)** — this partially closes the U2 rate-limit unknown; the 429 + Retry-After posture remains, now with documented ceilings.

## 5. Implemented Synchronization Scope

Per spec §5.1 (smallest valuable resource set; account state mandatory), the existing four-segment pipeline (snapshot / positions / orders / deals) is retained as the scope, now **correct and complete against the real provider**:

1. **Initial synchronization** — bounded pull: one ListTransactions call + up to `MAX_DEALS_PAGES = 5` idrange pages (≤ `MAX_DEAL_ROWS = 10 000` rows), `count=500` Link-followed trades/orders lists (≤ 20 pages each). **IMPLEMENTED THIS PHASE** (adapter).
2. **Periodic synchronization** — the scheduler (§12 below). **IMPLEMENTED THIS PHASE** (config-gated, default off).
3. **Manual synchronization** — pre-existing, re-audited against §9.3 line by line (authenticated ✓, ownership ✓, rate-limited 20/15min ✓, 409 on overlap ✓, response IS the run view ✓, capability gates ✓).
4. **Account snapshot persistence** — pre-existing single-row upsert; **unchanged** (snapshot HISTORY table remains the Phase 07 roadmap item — deferred, documented).
5. **Synchronization status and history** — status pre-existing; **history endpoint IMPLEMENTED THIS PHASE** (§14).
6. **Last-successful-sync and freshness** — snapshot-anchored `lastSyncAt` pre-existing; **per-resource freshness IMPLEMENTED THIS PHASE** (§13).
7. **Duplicate prevention / idempotency** — pre-existing unique constraints + upserts; re-verified by the idempotence e2e (double sync, identical counts).
8. **Timeout handling** — pre-existing watchdog + transport abort; **unchanged**.
9. **Rate-limit-aware scheduling** — **IMPLEMENTED THIS PHASE**: per-account cooldown on thrown RateLimitError (≥ provider Retry-After, capped at 15 min), one jittered sweep per interval, documented per-endpoint ceilings.
10. **Retry and recovery** — **IMPLEMENTED THIS PHASE**: bounded transient retries (§11) + stale-run CANCELLED recovery (§12).
11. **Safe frontend presentation** — **IMPLEMENTED THIS PHASE** (§14/§15): history list, per-resource freshness lines, honest states only.
12. **Tests** — 38 new (§20).

## 6. Deferred and Unsupported Resources

- **Orders terminal-state reconciliation: DEFERRED (documented).** An order absent from a complete `pendingOrders` response has left the pending state, but the listing does not expose whether it filled or cancelled — distinguishing them requires per-order transaction correlation (extra provider calls per order). The row is preserved with its last known `PENDING` status and its per-row `syncedAt` provenance; nothing is invented (spec §13.1 "how closures are represented" — the honest representation here is *not represented at all*, documented).
- **Deals → canonical journal import: OUT OF SCOPE** (spec §23 forbids it; no journal row is created, overwritten, or deleted by sync — verified by the journal-red-line suites, still green).
- **Snapshot history table, cTrader/second provider, streaming, backtesting, Phase 06:** untouched (stop condition honored).

## 7. Synchronization Architecture

The Phase 03 flow is preserved end-to-end (trigger → eligibility → run creation → adapter → validation → normalization → per-segment persistence → finalize). **IMPLEMENTED THIS PHASE**, inside the existing boundaries:

- The port gained **no new method**; two methods return richer typed results (`PositionsSyncResult { positions, complete }`, `DealsSyncResult { deals, observedThrough, complete }`) and the request context gained an optional `dealsCursor` (same precedent as the Phase 03 `environment` context extension, documented as an architecture amendment). The port remains read-only by construction; the red-line probe test still asserts the 6-method surface.
- Provider-specific pagination/cursor logic lives **entirely inside the OANDA adapter/mapping** (doc A §4.1); the orchestrator sees only normalized results and completeness/cursor facts.
- No database transaction is held open across any provider call (per-segment transactions after fetch — pre-existing discipline, preserved).

## 8. Domain and Persistence Changes

**IMPLEMENTED THIS PHASE — one additive hand-written migration (`20261013221500_accounts_sync_freshness`, deployed to `cosmoz` AND `cosmoz_test`, `prisma generate` re-run):**

- `TradingPosition.state` (`TEXT NOT NULL DEFAULT 'OPEN'`) + `TradingPosition.closedAt` (`TIMESTAMP(3)` nullable) — reconciliation representation (§6.4/§13.2): rows are **never deleted**; `closedAt` is the **observation** time (the provider does not report a per-position close event in this listing — the provider event time is explicitly unavailable, §11).
- `TradingConnection.dealsCheckpoint` (`TEXT` nullable) — the live provider-issued cursor (opaque to the domain; never serialized to any wire shape — verified by grep over `mappers.ts`).
- `TradingSyncRun.dealsCheckpoint` (`TEXT` nullable) — checkpoint **progress** for the run that advanced it (§10 metadata).
- `trigger` doc comment: `INITIAL | MANUAL | SCHEDULED` (String column — no DB change). Run status gains `CANCELLED` (String column — no DB change).

Why each change is needed, why minimal: the reconciliation needs a persisted state (a row that simply stops refreshing is indistinguishable from a stale refresh — spec §13.1); the checkpoint needs a home that survives process restarts and is advanced **atomically with the rows it covers** (same transaction in `persistDealsSegment`); the run-level copy gives §10's "checkpoint progress" observability without a second read path. No index added (positions per account are small; both existing indexes prefix on `accountId`). No destructive change; existing rows keep their meaning (`state` defaults to `OPEN`).

## 9. Initial Synchronization Behavior

**IMPLEMENTED THIS PHASE (the documented-correctness fix).** With no checkpoint, `fetchDeals` calls the time-based ListTransactions (`pageSize=1000`; documented defaults: from = account creation, to = request time; max window 365 days), receives **page URLs**, and follows up to 5 idrange pages in order, stopping early at the 10 000-row cap. Every page consumed advances the observation; the result reports `complete=false` honestly when caps leave pages unvisited — the checkpoint still covers **exactly** the observed rows, so the next run resumes from there (sinceid) and catch-up progresses run over run without any unbounded pull (spec §7 "persist progress safely … resume without duplicating", §8.1 "record the supported range"). Positions/orders now pass `count=500` (the documented maximum — the previous code got the endpoint default 50) and follow `Link rel="next"` to exhaustion or the 20-page cap.

## 10. Incremental Synchronization and Checkpoints

**IMPLEMENTED THIS PHASE.** With `connection.dealsCheckpoint` present, `fetchDeals` calls the documented `sinceid?id={cursor}` and returns all newer rows (≤ 10 000-row processing cap; `complete=false` when the cap binds). `observedThrough` = the **max transaction id OBSERVED across ALL rows — including the bookkeeping classes the deal mapping filters out** (otherwise an all-bookkeeping window could never advance the cursor). The corrupted-cursor case (non-numeric) throws `INVALID_PROVIDER_RESPONSE` **before any fetch** — never a silently wrong query. Checkpoint safety (§8.4): the cursor is written **inside the persistence transaction** of `persistDealsSegment` and only when non-null — a checkpoint never covers unpersisted rows, never moves backward, never wipes. At-least-once retrieval + idempotent upserts is the explicitly blessed posture (spec §8.4); the e2e proves resume-fetches-only-new, then a no-op run keeps the checkpoint.

## 11. Idempotency, Reconciliation Rules, and Error Handling

- **Upsert rules** — provider-owned fields upsert; user-authored journal data untouched; optional provider fields missing from one response become null on that segment's rows (pre-existing semantics, preserved). **IMPLEMENTED THIS PHASE:** a re-reported position **reopens** the row (`state: "OPEN"`, `closedAt: null` in the upsert) — a re-reported external id is a provider fact that supersedes the closure observation (e2e-verified both directions).
- **Position closure (§13.2) — IMPLEMENTED THIS PHASE:** closure runs **in the same transaction** as the positions upserts and ONLY when the adapter reports `complete=true` (full pagination, no cap boundary, no page failure). An absent id → `state=CLOSED`, `closedAt=syncedAt`. An incomplete response closes nothing (adapter cap test + unit tests).
- **Conflict handling** — duplicate provider records collapse via unique constraints; concurrent upserts are last-write within segment transactions; stale workers cannot overwrite newer runs (single-RUNNING index + 409); out-of-order updates are handled by provider event timestamps on rows; checkpoint conflicts are impossible (single writer per account by the index).
- **Retries — IMPLEMENTED THIS PHASE** (`sync-retry.ts`, pure and injectable): transient classes = `PROVIDER_UNAVAILABLE`, `CONNECTION_TIMEOUT`, `RATE_LIMITED`; permanent = everything else (credentials/authorization/account/response-contract failures are **never** retried). Bounded: `ACCOUNTS_SYNC_SEGMENT_RETRIES` (default 2) extra attempts; backoff `500ms·2^attempt` + 0–250 ms jitter, hard-capped at 5 s per wait (a MANUAL run's HTTP request spans the run — a long provider Retry-After ends the segment honestly instead of stalling the caller; the next run retries from scratch). `Retry-After` is respected as the floor of the wait, inside the cap. No checkpoint ever advances past a failed page (the adapter returns nothing on a first-page failure; later-page failures truncate the result with `complete=false` and the checkpoint covers only observed rows).
- **No transient error destroys a connection** — auth-class flips remain the only lifecycle-affecting failures (pre-existing paths, untouched).

## 12. Scheduling and Concurrency Strategy

**IMPLEMENTED THIS PHASE — `AccountsSyncSchedulerService`** (module provider; reuses the established ocr-retention in-process pattern; **no new queue dependency**; no distributed locking — the modular monolith's §38 index remains the only concurrency authority).

- **Deployment-model decision (spec §9):** the documented deployment is a single long-running NestJS process — an in-process timer is the simplest safe approach; serverless restart semantics do not apply (documented, not assumed).
- **Gating:** `ACCOUNTS_SYNC_SCHEDULER` (enabled|disabled, **default disabled** — real-provider automation is opt-in, §57 posture; the boot log honestly states the disabled state). The interval floor is 60 s (env schema).
- **Eligibility:** `status=CONNECTED` AND credentials non-wiped AND adapter registered AND descriptor-declared environment matches the account. Disconnected/revoked/auth-ERROR connections are never scheduled (retrying broken credentials on a timer would hammer the provider); a deregistered provider is skipped without a run (no failed-run noise).
- **Non-overlap:** run creation rides the §38 partial unique index — an overlapping trigger 409s and the scheduler treats it as "already running" (silent skip).
- **Bounded concurrency:** a worker pool of `ACCOUNTS_SYNC_MAX_CONCURRENCY` (default 3) across connections; per-connection try/catch — one user's failing connection never blocks another (§9.1 isolation, e2e-verified via the sweep).
- **Rate-limit awareness:** a thrown RateLimitError puts that account on cooldown ≥ Retry-After (capped 15 min; the next sweep retries naturally).
- **Jitter:** each sweep re-arms with ±10 % of the base interval (anti-thundering-herd, §15).
- **Recovery (§15 "safe restart"):** every sweep first marks RUNNING runs older than `ACCOUNTS_SYNC_STALE_RUN_MS` (default 120 s — the watchdog bounds every segment, so such a run cannot be alive) as **CANCELLED**; the same sweep runs **once at module init even when the timer is disabled**, so a crashed process's stale run unblocks manual synchronization (e2e: the 409 proof → sweep → SCHEDULED run completes).

## 13. Synchronization Lifecycle, Status, and Freshness Semantics

- **Status semantics** — the pre-existing axis is preserved exactly (§10.1): last-attempted (run row), last-successful (`lastSyncAt`, advances only on snapshot persistence), current state (RUNNING/SYNCING), connection authorization (separate axis). A failed run never overwrites the last success; a queued/running run is not a success; PARTIAL → DELAYED, never LIVE. The run status enum gains CANCELLED (never a provider result — a recovery artifact only).
- **Per-resource freshness — IMPLEMENTED THIS PHASE** (§11 of the mandate): one aggregate query (`_max` over the four segment timestamps) feeds explicit, documented rules — `NEVER` (no successful refresh), `FRESH` (≤ 15-min TTL), `STALE` (> TTL) — exposed as an **additive optional** `synchronization.resources` block on the details contract, plus the four segment timestamps on every run view. A resource is never labeled "FAILED": a failed segment simply never advances its timestamp, so the resource ages into STALE while the account-level status carries the failure story (documented scoping decision). Polling is never described as real-time anywhere (dict strings follow the Phase 02 voice).

## 14. API and Frontend Changes

**IMPLEMENTED THIS PHASE — the minimum the scope requires (spec §16):**

- `GET /trading-accounts/:accountId/sync-runs?limit=&before=` — bounded (server-capped 1–50, default 20), keyset-paginated (`before` = the previous page's `nextCursor`, strictly `<`), newest first; authentication + ownership (foreign ids → 404; IDOR-safe via `loadOwned`); inputs zod-validated (bad limit/cursor → 400); response validated through the new shared `tradingSyncRunsResponseSchema`. No raw provider data, no credentials, no cursor exposure.
- Details/list/rename/sync responses gain the additive optional `resources` freshness block and run-view segment timestamps — wire-compatible with every existing consumer (the MSW mirror and the web build were updated in the same phase and all probes pass against both).
- **Frontend (minimal, §16.1):** `useTradingAccountSyncRuns` query (limit 10); the drawer's Overview tab renders a **Sync history** section (newest 8 runs with status badge, trigger — Manual/Scheduled/Initial — counts, start time); each activity tab (positions/orders/deals) renders a per-resource freshness line ("Updated <UTC> · Fresh/Stale/Never synced"); EN dict strings in the established honest voice. Query keys follow the `trading-accounts` root prefix (coarse invalidation preserved — a sync invalidates the history too).
- Loading/empty/stale/failure states are distinguishable; no mock data replaces real stale data anywhere; the UI never claims real-time.

## 15. Security and Read-Only Compliance

- **Ownership:** the history endpoint reuses `loadOwned`; the scheduler's internal path is repository-scoped and controller-inaccessible; IDOR suites green. The client never supplies a userId or connection owner anywhere in the sync domain (pre-existing posture, unchanged).
- **Read-only by construction:** no execution verb exists on the port (red-line probe green); the adapter's new calls are exclusively documented GETs (`count`/`Link`/`sinceid` — all read endpoints per §4's evidence table); no write endpoint is referenced.
- **Credentials:** vault unchanged; the new code paths decrypt via the existing service only; the checkpoint is never a secret and never crosses the wire; redaction suites green (no token in any response — re-asserted by the live probe's secret checks).
- **SSRF posture — IMPLEMENTED THIS PHASE:** provider-issued pagination URLs (Link header, ListTransactions `pages`) are followed ONLY after a same-origin + `/v3/`-path guard (`safeProviderPagePath`); a cross-origin link is `INVALID_PROVIDER_RESPONSE` (unit-tested with an `evil.example` fixture).
- **Logs:** structured, correlation-bearing (userId/accountId/provider/syncRunId/segment/code/duration); no credentials, no raw payloads (pre-existing logger discipline).
- **Provider scopes/quotas:** POLL-only, documented ceilings (120/30 req/s), bounded budgets everywhere (§9/§11/§12).

## 16. Database Migrations

One additive migration (§8), hand-written in the established discipline (`migrate dev` remains unusable on this repo's historical drift — documented since Phase 03): `ALTER TABLE … ADD COLUMN IF NOT EXISTS` × 4, replay-safe, zero data rewritten. **Deployed and verified on both `cosmoz` and `cosmoz_test`** (`prisma migrate deploy` → "All migrations have been successfully applied" ×2; `prisma generate` → client with new fields; runtime probe `SELECT` on the new column OK). Migration validation: `migrate deploy` idempotent, schema and client in sync, existing rows untouched (default `OPEN`).

## 17. Synchronization Run Metadata (§10 completeness)

Per run, the existing row already carried: run id, account, trigger, start/completion, outcome, per-resource counts, first failing code, request correlation id, four segment timestamps. **IMPLEMENTED THIS PHASE:** the checkpoint progress field. Not stored: secrets, unfiltered provider payloads (verified — the run row carries only codes/counts). Retention: run history is append-only per account; the history endpoint is bounded; a dedicated retention policy remains future work (documented; no unbounded history is *served*).

## 18. Files Created

- `apps/api/src/modules/accounts/sync-retry.ts` — bounded transient-retry helper (pure).
- `apps/api/src/modules/accounts/accounts-sync-scheduler.service.ts` — scheduler + recovery.
- `apps/api/prisma/migrations/20261013221500_accounts_sync_freshness/migration.sql` — additive migration.
- `apps/api/test/unit/sync-retry.spec.ts` — 12 tests.
- `docs/backend/PHASE-05-SYNC-FRESHNESS-REPORT.md` — this report.
- (test fixture/e2e and spec extensions are modifications of existing files, listed next; `apps/web/scripts/debug-msw-connect.mjs` was a temporary diagnostic, deleted after use.)

## 19. Files Modified

- `packages/shared/src/schemas/trading-account.ts` — +SCHEDULED trigger, +CANCELLED status, run-view segment timestamps (optional), `resourceFreshness`/`tradingResourceFreshness` schemas, `resources` on the synchronization view, `tradingSyncRunsResponseSchema` (all additive).
- `apps/api/prisma/schema.prisma` — `TradingPosition.state/closedAt`, `TradingConnection.dealsCheckpoint`, `TradingSyncRun.dealsCheckpoint`, trigger comment.
- `apps/api/src/modules/accounts/provider.types.ts` — context `dealsCursor`; `PositionsSyncResult`/`DealsSyncResult`; port return types (no new method; read-only intact).
- `apps/api/src/modules/accounts/providers/oanda/oanda-rest.provider.ts` — `requestWithMeta` (Link header), `followPaginatedList` (count=500 + same-origin-guarded Link following, page caps), `fetchDeals` (documented pages → idrange initial pull; `sinceid` incremental; row caps; cursor validation), `parseNextLink`, `safeProviderPagePath`.
- `apps/api/src/modules/accounts/providers/oanda/oanda-mapping.ts` — `oandaTransactionsPagesSchema`, `OandaTransactionRow`, `maxTransactionId` (refuses non-numeric ids — no checkpoint guess).
- `apps/api/src/modules/accounts/providers/mock-trading.provider.ts`, `providers/capability-poor-test.provider.ts` — new result shapes (fixture honesty: mock serves its set as complete).
- `apps/api/src/modules/accounts/accounts.repository.ts` — `SyncRunRow` extension; `listSyncRuns`, `cancelStaleRunningRuns`, `listSchedulableConnections`, `findAccountById`, `latestResourceTimestamps`; `persistPositionsSegment` (+atomic closure, +reopen semantics), `persistDealsSegment` (+atomic checkpoint); `listPositions` → OPEN only (current positions; CLOSED rows are history, never served as current).
- `apps/api/src/modules/accounts/trading-sync.service.ts` — SCHEDULED trigger path (`runScheduledSync`), retries wiring (defensively bounded), deals cursor hand-off, checkpoint/closure parameters.
- `apps/api/src/modules/accounts/trading-account.service.ts` — `listSyncHistory`; `loadFull` + resource timestamps.
- `apps/api/src/modules/accounts/trading-accounts.controller.ts` — `GET :accountId/sync-runs` with zod-validated query params.
- `apps/api/src/modules/accounts/accounts.module.ts` — scheduler registration (config-gated timer, unconditional recovery sweep).
- `apps/api/src/config/env.schema.ts`, `apps/api/src/config/app-config.ts` — `ACCOUNTS_SYNC_SCHEDULER/INTERVAL_MS/MAX_CONCURRENCY/STALE_RUN_MS/SEGMENT_RETRIES`.
- `apps/api/test/unit/oanda-rest-provider.spec.ts` (+11), `test/unit/sync-status.spec.ts` (+4), `test/unit/sync-segments.spec.ts` (fixture fields), `test/unit/mock-trading-provider.spec.ts` (unwrap), `test/e2e/oanda-fixture.e2e.spec.ts` (fixture upgraded to the documented ListTransactions/idrange/sinceid behavior + 11 Phase 05 scenarios).
- `apps/web`: `lib/api/endpoints.ts`, `lib/api/keys.ts`, `lib/api/queries/trading-accounts.ts` (+barrel), `components/accounts/account-detail-drawer.tsx` (history section + freshness lines), `i18n/dictionaries/en/accounts.ts` (9 strings), `mocks/trading-accounts-engine.ts` (syncRuns method, segment timestamps, resources mirror), `mocks/handlers/trading-accounts.ts` (sync-runs route).

## 20. Tests Added (38)

**Unit (27):** `sync-retry.spec.ts` — 12 (first-success no-sleep; transient recovery; **never** retry credentials/authorization/account/malformed; bounded exhaustion throws the ORIGINAL error; Retry-After floor with the 5 s cap; exponential cap; jitter amplitude; classification set). `oanda-rest-provider.spec.ts` — +11 (Link following to completion + `count=500` assertion; cap boundary → honest `complete=false`; **cross-origin Link refused**; no-Link = documented end; `sinceid` resume incl. bookkeeping-inclusive `observedThrough`; empty incremental answer; corrupted cursor refused **before fetch**; initial pages → idrange flow; `parseNextLink` / `safeProviderPagePath` / `maxTransactionId` pure tables). `sync-status.spec.ts` — +4 (NEVER/FRESH/STALE rules; TTL boundary; per-resource independence).

**e2e over the real AppModule/DB/vault with the upgraded realistic fixture (11):** initial pull records checkpoint `2355` on BOTH the connection and the INITIAL run; resume fetches **exactly one** new deal and advances to `2360`; a no-activity run persists 0 and keeps the checkpoint; absent position → CLOSED + row preserved (never deleted); re-reported position → reopens (`closedAt` null); stale-RUNNING 409 proof → sweep CANCELLEDs it and a SCHEDULED run completes; CANCELLED visible in bounded history with segment timestamps on the wire; keyset pagination walks backward strictly; limit/cursor validation → 400; foreign account → 404; unauthenticated → 401.

**Standing batteries re-run green:** vitest **1159/1159 (83 files)** — includes the red-line, IDOR, secret-redaction, accounts (35), and monitoring suites. MSW engine 74/74.

## 21. Commands Executed and Results (actual observations)

| Command | Result |
|---|---|
| `git status/log/show` (pre-implementation) | clean tree at `f89d0b6`; sweep-commit content inspected (433 quarantine files now tracked) |
| `curl developer.oanda.com/{trade,order,transaction}-ep/` (2026-10-13) | 200 ×3; parameter/`pages`/`sinceid`/Link/rate-limit facts extracted and recorded (§4) |
| `DATABASE_URL=postgresql://cosmoz@127.0.0.1:5433/cosmoz npx prisma migrate deploy` (and `cosmoz_test`) | "All migrations have been successfully applied" ×2 (after the documented `DATABASE_URL=file:` shell-override trap was hit and bypassed — env var wins over `.env`) |
| `npx prisma generate` | client regenerated; new column queryable at runtime |
| `corepack pnpm exec eslint src test` (api) | 0 errors |
| `corepack pnpm exec eslint src` (web) | 0 errors, 4 pre-existing `_locale` warnings |
| `corepack pnpm vitest run` (api, full) | **1159 passed / 0 failed, 83 files** |
| `corepack pnpm build` (api) | OK (`dist/apps/api/src/main.js`) |
| `corepack pnpm build` (web) | "Compiled successfully" (both modes — live bridge AND mocked) |
| API restart (:4000, explicit `DATABASE_URL`, OANDA enabled) | boot clean; log line: "accounts sync scheduler disabled (ACCOUNTS_SYNC_SCHEDULER != enabled) — no periodic synchronization"; 401 without token |
| `node scripts/verify-accounts.js` (mocked mode :3000) | **25 passed, 0 failed, 1 note** |
| `node scripts/verify-accounts-live.js` (live bridge :3000↔:4000) | **14 passed, 0 failed** (login → connect 201 → initial sync → balance → deals → rename → manual sync → test → disconnect (wipe) → reconnect → no page errors) |
| live curl (auth → `GET /trading-accounts/:id/sync-runs?limit=3`, details) | runs with per-segment timestamps + `resources` block (all FRESH), status LIVE |
| `bun scripts/accounts-tests.ts` | 74/74 |

## 22. Automated, Sandbox, and Live Verification (honest separation)

1. **Automated tests (test doubles) — DONE:** 1159/1159 (§20).
2. **Official sandbox (`api-fxpractice.oanda.com`) — NOT PERFORMED: DEFERRED to U2.** No practice token exists in this environment; the fixture transport is realistic but is not OANDA. The runbook is unchanged (Phase 03 §8 / Phase 04 §21-B): start the API with `ACCOUNTS_OANDA_PROVIDER=enabled`, connect a practice account with `environment: "DEMO"`, verify the snapshot against the OANDA console, then exercise revocation → 401 → connection ERROR. With this phase's fixes, that hop now exercises the *documented* pagination/cursor flow for the first time.
3. **Authorized live-account verification — NOT PERFORMED** (no live credentials; same U2 runbook with `environment: "LIVE"`).

**No claim of live provider connectivity is made.** Every fixture/mock result in this report is labeled as such.

## 23. Known Limitations and Blockers

1. **U2 (user):** the practice-token validation hop remains the acceptance gate for real connectivity; exact personal rate-limit budgets are now partially documented (120/30 req/s per endpoint family) but the personal quota behavior is still observed only as 429 + Retry-After.
2. **Orders terminal states:** never invented (§6) — correlation with transactions is the documented future work.
3. **Deals initial depth:** bounded per run (5 idrange pages / 10 000 rows); catch-up is incremental and correct, but a FIRST full-history backfill of a very large account proceeds over several runs rather than one (bounded budgets by design, spec §20).
4. **`historyDepth` capability stays UNKNOWN** until U2 confirms practice-account depth against the real host.
5. **Sweep payload note:** the scheduler's tick calls `runDueSynchronizations` sequentially with the configured pool; a sweep with many accounts takes up to `ceil(n/3) × runDuration` — bounded and isolated, not parallel across the pool beyond the cap (documented behavior).
6. **Quarantine (owner decision pending):** the `.wip-quarantine-2026-10-13/` sources are now tracked by the system sweep commit — still excluded from all builds; deletion decision unchanged from Phase 04 §23.4.

## 24. Acceptance Criteria Checklist (mandate §22)

| Criterion | Disposition |
|---|---|
| Phase 04 adapter reused | ✅ no second adapter, no port widening (§7) |
| Genuine read-only provider requests | ✅ documented GETs only; red-line suite green |
| Resource scope documented and supported | ✅ §5/§6 |
| Account data normalized and persisted safely | ✅ zod boundaries; per-segment transactions; Decimal precision untouched |
| Repeated sync creates no duplicates | ✅ unique constraints; idempotence e2e green |
| Checkpoints never advance beyond unpersisted data | ✅ atomic-with-persistence write; unit + e2e proofs |
| Partial failures accurately represented | ✅ PARTIAL/first-code semantics preserved; e2e green |
| Existing valid data preserved during outages | ✅ no deletion anywhere; closure is a state, not a delete; 401-path e2e green |
| Connection status ≠ synchronization status | ✅ axes untouched; CANCELLED is a run state, not a connection state |
| Freshness reflects actual successful timestamps | ✅ per-resource derivation from segment timestamps; documented rules |
| Scheduling/concurrency safe for the deployment model | ✅ §12; single-RUNNING index; bounded pool; default OFF |
| Manual refresh authorized and rate-limited | ✅ pre-existing surface re-audited against §9.3 |
| Financial precision retained | ✅ Decimal(18,8) plumbing untouched; wire decimal-strings |
| Secrets not exposed | ✅ redaction suites green; live probe secret checks green |
| Journal trades never silently created/overwritten/deleted | ✅ import stays out of scope; journal suites green |
| Automated tests cover normal and failure paths | ✅ 38 new; 1159/1159 |
| Existing APIs/frontend compatible | ✅ additive-only wire; 25/25 + 14/14 probes |
| Quality checks pass / failures documented | ✅ tsc/eslint/builds/tests all green |
| Final diff contains only justified changes | ✅ §18/§19 |
| Verification claims match evidence | ✅ §22 |

## 25. Deployment and Operational Considerations

- **Enabling the scheduler:** set `ACCOUNTS_SYNC_SCHEDULER=enabled` (+ optional `ACCOUNTS_SYNC_INTERVAL_MS`, `ACCOUNTS_SYNC_MAX_CONCURRENCY`, `ACCOUNTS_SYNC_STALE_RUN_MS`, `ACCOUNTS_SYNC_SEGMENT_RETRIES`). Default deployment = no automatic provider calls (boot log states it).
- **Restart safety:** stale RUNNING runs are CANCELLED at the first post-restart sweep (or at boot even when the scheduler is off); no manual unblock procedure is needed anymore.
- **Rate limits:** documented 120/30 req/s ceilings; the pipeline's budgets (page caps, bounded retries, cooldowns) keep a single account far below them; increase `ACCOUNTS_SYNC_INTERVAL_MS` rather than concurrency when in doubt.
- **Observability:** the run rows + history endpoint are the primary debugging surface; structured logs carry syncRunId/segment/code; the scheduler logs skipped/cooldown events at info/warn.
- **Backups:** a fresh git bundle + DB/extras archives accompany this phase's commit (the standing "never lose work" requirement).

## 26. Phase 06 Readiness

The synchronization pipeline is now complete against the documented provider semantics; the connector contract needs **no further change** to admit another provider (implement the 6 methods with the richer result shapes + register). Open dependencies: **U2** (practice token — now also validates the pagination/cursor flow on the real host), **U3** (account discovery), the quarantine decision (§23.6). The repo's frozen roadmap places cTrader OAuth next (its internal Phase 05) — awaiting the owner's explicit approval per the stop condition.

## 27. Final Git Diff Summary

Tracked changes of this phase: **3 files created, 24 files modified** across `packages/shared` (1), `apps/api` (schema + migration + 13 sources + 4 test files + this report's doc), `apps/web` (7 sources). Additive wire extensions only; one additive migration; no dependency installed; no tracked file deleted; the 433 system-swept quarantine files were neither touched nor removed. Commit: `accounts: Phase 05 — sync/reconciliation/freshness pipeline (documented pagination + sinceid checkpoint, position closure, scheduler + recovery, retries, history API, UI + MSW mirror)`.
