# COSMOZ — BACKEND PHASE 17
## Monitoring, Observability & Operational Health — Final Report

| | |
|---|---|
| **Date** | 2026-10-04 |
| **Base** | Phase 0 (`78e30ac`) + Phase 1 (`865945f`) + Phase 2 (`f7516cf`) + Phase 3 (`69247a7`) + Phase 16 Security |
| **Scope** | Thin operational observability layer: health, API/database metrics, job/provider health, errors, alerts, thresholds. NOT security, NOT analytics, NOT a logging platform (§1/§57). |
| **Verification** | typecheck ✅ · lint ✅ · build ✅ · **201/201 tests ✅** (19 new: 11 unit + 8 e2e) · Prisma valid ✅ · migration `monitoring_settings` applied ✅ |

---

## 1. Repository Audit Findings

- **Frontend Monitoring module is complete and contract-first**: 1 route (`/monitoring`, 11 tabs, auth-gated app shell), a 1,031-line mock engine, and a FULL shared contract (`packages/shared/src/schemas/monitoring.ts`) defining the aggregate, statuses, thresholds, jobs, brokers, alerts and incidents. The backend's job was to implement that contract from REAL signals — no contract change was needed.
- **Mock gaps the backend had to fix** (audit §H): the 3 monitoring mock handlers skip `requireAuth`; PATCHed thresholds are ephemeral (memory-only); 3 of 8 alert rules have no evaluation logic and one ignores its numeric knob.
- **Backend observability already present (Phase 1)**: pino structured logging with redaction, `x-request-id` correlation echo, `AllExceptionsFilter`, health controller (`/health`, `/health/live`, `/health/ready` with DB ping, deliberately outside `/api/v1`). No metrics infrastructure, no queues, no schedulers, no cache, no WebSocket gateway server-side.
- **Real operational signals to consume**: Accounts' `TradingSyncRun` ledger (status/trigger/duration/errorCode — Phase 3) and the Identity mailer transport (Phase 2). Monitoring consumed them; it owns neither.
- **Not executable server-side**: market-feed freshness and WebSocket health are browser-observed (client plane) — kept as honest `UNKNOWN`/`client-observed` board rows the frontend overrides.

## 2. Existing Monitoring Infrastructure Reused

| Capability | Owner (untouched semantics) |
|---|---|
| `/health`, `/health/live`, `/health/ready` | Phase 1 health controller — kept bounded; `/monitoring/*` is a separate, versioned, authenticated surface (§7: health ≠ monitoring) |
| Structured logging + secret redaction | Phase 1 `logging.module` — the ONE logging system; Monitoring adds no logger (§14) |
| Correlation IDs | Phase 1 `request-id` (`x-request-id` echo) — reused, no second tracing id (§19) |
| Error envelope + taxonomy | Phase 1 `app-error`/`error-mapper` — no separate error system |
| Global ThrottlerGuard | Phase 1 — covers the monitoring endpoints (§53); no new limiter |
| `TradingSyncRun` ledger | Phase 3 Accounts — canonical sync/job health (§26) |
| `MailerService` transport | Phase 2 Identity — minimally instrumented for delivery telemetry |
| ZodValidationPipe, `@CurrentUser`, error taxonomy | Phase 1 shared kernel |

## 3. New Monitoring Functionality Implemented

1. **`GET /api/v1/monitoring/overview`** — the full contract aggregate computed from REAL observations, scoped to the authenticated caller (§34).
2. **`PATCH /api/v1/monitoring/thresholds`** — per-user, PERSISTED threshold document (fixes the mock's ephemeral-config gap). Labels travel with their numeric knob.
3. **`POST /api/v1/monitoring/jobs/:jobId/run`** — honest 409 `accepted:false` for every job: Monitoring never fabricates runs and never triggers domain work (§50).
4. **API telemetry infrastructure** (`infrastructure/telemetry/api-telemetry.ts`) — one Fastify `onResponse` hook (registered in `app.setup.ts`, shared by production AND the e2e harness) records route-template + status + duration + guard-stamped principal into a bounded 500-call ring. Nothing persisted (§40).
5. **Mailer delivery telemetry** — minimal instrumentation of the existing `deliver` funnel: sent/failed counters + a 50-entry ring of `{id, at, kind, status}`. NO recipients, NO URLs (§18).
6. **Alert engine** — 6 of the 8 contract rules evaluate against real signals with knob-aware thresholds and per-user episode dedupe (§39) incl. raise/re-raise/resolve transitions feeding the event ledger; the 2 rules with no server-side signal (`MARKET_DATA_STALE`, `QUEUE_BACKLOG`) stay configurable but never fabricate.
7. **System-event ring + incident derivation** — per-user append-only ring (cap 200, return 60) fed by alert transitions, threshold CONFIG_CHANGEs and one derived SYNC_FAILURE event per real failed sync run (deduped by cause). Incidents group by `correlationKey`, resolve on `SERVICE_RECOVERED`, and `rootCause` is never invented (§16).

## 4. Final Monitoring Boundary

```text
AccountsModule ──(AccountsRepository: sync runs, connections)──┐
IdentityModule ──(MailerService: delivery telemetry)───────────┤
app.setup.ts ───(apiTelemetry ring: HTTP observations)─────────┼→ MonitoringModule
MonitoringRepository ──(MonitoringSetting + user-scoped counts)┘   monitoring.controller
                                                                    monitoring.service (aggregate)
                                                                    monitoring.logic (PURE rules)
```

Monitoring owns: the aggregation, the alert episode state, the event ring, the threshold document. It does NOT own: sync semantics, provider adapters, credentials, queues, security events, analytics, any domain data (§24/§26/§35/§36/§60 all verified — see §14 below).

## 5. Health Architecture

- **Liveness/readiness stay Phase 1** (`/health/live`, `/health/ready` with DB ping; 503 + plain `down` on failure). `/health` was NOT turned into a monitoring endpoint (§7).
- **Monitoring health rows (8)**: `api` (telemetry-derived: UNKNOWN with 0 requests, DEGRADED at ≥10 requests & ≥10% errors, else OPERATIONAL), `database` (real ping → OPERATIONAL/DOWN), and honest `UNKNOWN` with evidence for `cache`, `storage`, `workers`, `scheduler`, `queue` (none exist in this build — none was created, §29/§45), plus `websocket` (server gateway absent; client-observed). `sessionUptimeMs` = process uptime.
- **Status model**: the contract's explicit `OPERATIONAL | DEGRADED | DOWN | UNKNOWN` with documented semantics (§9); every row and board entry carries an `evidence` string (§4).

## 6. Metrics Architecture

- **API (§12)**: per-caller aggregation of the bounded ring — totalRequests, errorRatePct (≥400; §14 semantics with the status-code histogram keeping 4xx/5xx distinguishable and 429s counted separately), p50/p95 (nearest-rank, §13), per-endpoint stats incl. `rateLimited`, top-5 slowest by p95, 30 one-minute buckets.
- **Database (§11)**: kind "PostgreSQL", status from the readiness ping, **user-scoped** entity counts (Sessions, Security events, Login records, API keys, Trading accounts, Positions, Orders, Deals, Sync runs — the backend's REAL tables), read/write ops and avg read latency from the caller's own requests, failed queries = 5xx only, slow reads = GET endpoints with p95 > 250 ms, plus an honest `unavailable` list (per-query latency, pool saturation, plans, cache).
- **Storage (§40/§41)**: NO metric points persisted. The ring (500 calls) IS the retention policy; aggregations are derived at read time. No homemade time-series store.

## 7. Logging Architecture

One logging system (Phase 1 pino). Monitoring's event ledger is a CONTRACT concept (user-visible operational events), not a second log pipeline: it is populated by monitoring's own transitions (alerts, config changes) and derived causes (sync failures) — never by copying request logs (§14/§15). Log hygiene unchanged: secrets redacted at the Phase 1 layer; monitoring never logs payloads, headers or query strings.

## 8. Job / Provider Monitoring

- **Jobs observed (§21/§22)**: `trading-sync` (providers queue — derived from the canonical TradingSyncRun ledger: lastRun, success/failure counts, avg duration, queued = RUNNING, stuck = RUNNING > 60 s, error = stable sanitized errorCode) and `email-dispatch` (notifications queue — from mailer telemetry). Both `manualRunnable: false`, `ON_DEMAND`, request-scoped — honest, nothing speculative. Job states use the contract's `RUNNING | SUCCESS | FAILED` (no second engine, §22).
- **Providers (§24/§26)**: broker cards map Accounts' canonical state — connection status (CONNECTED/CONNECTING/DISCONNECTED; ERROR → AUTH_FAILED when the last failed run's errorCode is auth-class, else DEGRADED), lastSyncAt, latency = last successful run duration, syncErrors count, "reported"/"not reported by adapter" surfaces, `readOnly: true`. Integrations panel: honestly `[]` (no Phase 14 backend) — never fabricated.

## 9. API Contracts

```text
GET   /api/v1/monitoring/overview      → MonitoringOverviewResponse (shared schema, unchanged)
PATCH /api/v1/monitoring/thresholds    → { thresholds } (monitoringThresholdsUpdateInputSchema)
POST  /api/v1/monitoring/jobs/:id/run  → 409 { accepted:false, run:null, message } (contract shape)
```

Zero contract changes in `@cosmoz/shared` — the frontend's mocked API surface and the backend implement the SAME schema; the frontend swap stays a config change (`NEXT_PUBLIC_API_MOCKED=false`).

## 10. Access-Control Model

- User-facing (§33: the product mounts `/monitoring` inside the authenticated shell) but **strictly caller-scoped** (§34): every aggregate filters by the guard-stamped `userId` — API telemetry (own requests only), entity counts (own rows), brokers (own accounts), events/alerts/thresholds (own). Public requests (userId null) are excluded from user-scoped stats.
- No admin bypass exists to widen it; no cross-user aggregation endpoint exists. Unauthenticated access → 401 on all three routes (tested).
- Authorization stays authoritative in Identity; Monitoring introduces no new roles/permissions.

## 11. Security / Privacy Controls

- **Secrets (§17/§44)**: responses cannot contain credential/connection-string material — enforced by construction (route templates only, no headers/bodies/query strings recorded; email telemetry excludes recipients) and TESTED by a regex sweep over the full aggregate (`credentialsEnc`, `cz_live_`, `argon2`, `passwordHash`, `postgres://`, `DATABASE_URL`, `JWT_SECRET`, stack-trace signatures → must be absent).
- **Data minimization (§18)**: email deliveries expose kind+outcome only; broker cards expose masked-by-design fields (no credentials, no raw provider errors — only stable errorCodes); no trade payloads, notes or private content anywhere.
- **Rate limiting (§53)**: existing global ThrottlerGuard (overview polling at 12 s ≈ 5 req/min — far below budget); no expensive-aggregation amplification possible without authentication.
- **Negative capability (§50)**: no mutation surface beyond the caller's own threshold document — tested via 8 mutating probes → 404 (events, alerts, brokers, services, orders, security-events…).

## 12. Tests Executed

- **Unit (11)** — `test/unit/monitoring-logic.spec.ts`: nearest-rank percentiles; threshold merge (labels travel with knobs, untouched rules intact, freshness merge); API aggregation (counts, error rate, 429s, status histogram, slowest, 30 buckets, honest zero-state); api status derivation incl. the 10-request gate; broker status mapping incl. auth-class distinction; alert evaluation (minimum-requests gate, KNOBS HONORED — the mock's ignored-knob flaw is regression-guarded, disabled rules silent, no fabricated rules); episode dedupe (raise → occurrences → resolve → RE-RAISE); incident grouping (resolution, duration, never-invented root cause).
- **e2e (8)** — `test/e2e/monitoring.e2e.spec.ts` (real AppModule + real PostgreSQL + real telemetry hook + applied migration): anonymous 401 ×3; full-aggregate contract conformance (8 components with evidence, 8 health rows, user-scoped API telemetry visible on the second read, real PostgreSQL entity counts, 2 honest jobs with observed email run, notification channel states, empty integrations, 8 threshold rules, zero fabricated alerts, secret sweep); threshold PATCH persistence across reads + CONFIG_CHANGE event + label regeneration; input validation (unknown rule id, out-of-range freshness → 400); per-user threshold isolation (A's knob invisible to B); observational-only job runs (409 ×2); per-user data isolation (B's email never in A's payload); negative capability (8 mutation probes → 404).
- **Regression (§51)**: full suite **201/201 green** — Phase 1/2/3/16 suites untouched and passing (identity 16, security 19 + security-events 7 + capability-negative 8, accounts 35, app 23, foundation-negative 9, units).

## 13. Verification Results

| Check | Command | Result |
|---|---|---|
| Typecheck (API) | `pnpm typecheck` | ✅ clean |
| Lint (API) | `pnpm lint` | ✅ clean |
| Unit + e2e | `pnpm test` | ✅ **201/201** (16 files) |
| Build (API) | `pnpm build` | ✅ |
| Prisma | `prisma validate` | ✅ valid |
| Migration | `migrate deploy` against `cosmoz_test` (test global setup) | ✅ `20261004090000_monitoring_settings` applied and exercised |
| Runtime | e2e boots the real AppModule over Fastify with the telemetry hook active | ✅ |
| Shared contract | unchanged — no modification required | ✅ (typechecked within API suite) |

**Not executed**: web `next build` (pre-existing `/login` Suspense prerender issue, documented since Phase 1 — untouched); web typecheck/lint (zero frontend files changed in this phase); dev-database migration (test database only, per the "never reset/never touch a non-test database" convention).

## 14. Architecture Review (§60)

- Health checks reusable and bounded ✅ (Phase 1 untouched; monitoring adds its own authenticated surface)
- ONE logging infrastructure ✅ · metrics separated from trading analytics ✅ (no win-rate/expectancy anywhere)
- Security remains the owner of security events ✅ (Monitoring consumes nothing security-owned; identity only for mail telemetry)
- Monitoring consumes job state, owns no queue ✅ · Accounts/Calendar/Integrations keep provider ownership ✅ (Calendar/Integrations backends don't exist yet — nothing to consume, honestly empty)
- Session Live keeps realtime semantics ✅ (no server gateway; board rows client-observed)
- Secrets/private data excluded ✅ (tested) · access control per-user ✅ (tested) · monitoring itself is not a bottleneck ✅ (one array push per request; read-time aggregation over ≤500 entries + ~10 indexed counts)
- No second logging/metrics/queue/cache/alert system created ✅

## 15. Known Limitations & Deferred Work

1. **MARKET_DATA_STALE / QUEUE_BACKLOG never raise server-side** — no backend signal exists (client-observed freshness; no queue). They remain configurable per contract; documented, not faked.
2. **Transient state is session-scoped** (alert episodes, event rings reset on process restart) — persisted thresholds survive. Historical alert/incident storage was NOT justified by the UI (§39/§45) and is deferred.
3. **Email telemetry is process-wide, not per-user** (channel counters) — deliveries expose no user content; per-user mail analytics would need scoping if ever required.
4. **Client-observed plane** (market feed, WebSocket counters) still originates in the browser — by design; a server-side market/WS gateway would move those rows to engine-observed.
5. **Integrations/Calendar/Nofy monitoring remains `[]`/UNKNOWN** until their backend phases exist (they were never executed — prompts lost to the delivery channel).
6. **Phase 9 — Backtesting: DEFERRED** (unchanged — no product module).
7. Public status page stays the client-side dialog over the same scoped aggregate (no public route, no auth-free path).

---

**Status legend**: Implemented ✅ · Verified ✅ (201/201 executed; nothing claimed without execution) · Not verified: web build/typecheck (no frontend changes; pre-existing issues documented) · Deferred: list above.

**STOP** — per mandate §63: Phase 17 complete. No Backtesting, OCR, AI, extra microservices or infrastructure work has begun; no unrelated domain was refactored; no product module was invented beyond the existing frontend's requirements.
