# COSMOZ — Backend Phase 14 Report

## Integrations & External Services Platform

Status: **COMPLETED** · Date: 2026-10-03 · Branch state: typecheck ✓ / lint ✓ / tests 691/691 ✓ / build ✓ / migrations ✓ / real smoke ✓

---

## 1. Scope & Primary Objective

Phase 14 delivers the backend foundation for the Cosmoz **Integrations** module: a
centralized, secure, provider-agnostic framework for generic external service
integrations that are **not already owned by a specialized bounded context**.
The bounded context owns: external integration configuration, provider
registration, connection status/lifecycle, credential references, integration
health, webhook registration + inbound pipeline, integration metadata and the
Hub's audit/error ledgers. It owns **NOT** trades, trading accounts, economic
events, strategies, analytics, academy content, Nofy notes, OCR results or
market data (Phase 14 §7).

The frontend Integrations Hub (page, hub view, MSW engine — 12 providers,
actions, webhook simulation) already existed and served as the audited
behavioural spec. **Zero frontend changes, zero `@cosmoz/shared` changes.**

## 2. Repository Audit (Step 1) & Ownership Map (Step 2)

Audit findings that shaped the design:

| Integration surface found | Classification | Decision |
|---|---|---|
| Accounts → `TradingConnection` (AES-GCM `credentialsEnc`), `TradingProviderAdapter` + registry, `POST /accounts` lifecycle, `GET /broker/session` | **OWNED BY EXISTING DOMAIN** | Untouched. Hub *projects* account views read-only through `AccountsRepository`. |
| Calendar → `EconomicEvent` + `CalendarSyncRun` (provider port, builtin adapter, lazy TTL sync) | **OWNED BY EXISTING DOMAIN** | Untouched (see §9 for the two additive port extensions). Hub *projects* eco feed via the public queries port. |
| Identity → mailer transport port, TOTP/AES-GCM crypto, `SecurityEventService` (`INTEGRATION_CONNECTED`/`DISCONNECTED` types already reserved) | **REUSABLE INFRASTRUCTURE** | Reused: security audit events, error taxonomy, rate-limiter pattern, `ZodValidationPipe`, JWT guard, event bus. |
| Shared contracts → `schemas/integration.ts` + `utils/integrations.ts` (already exported by the barrel) | **REUSABLE INFRASTRUCTURE** | Consumed verbatim — no duplicate schemas. |
| Frontend MSW `integration-engine.ts` + handlers | **SPEC OF BEHAVIOUR** | Ported: statuses, messages, gates, beat logic, pipeline steps. |
| `components/system/integrations-view.tsx` (frontend) | **UNUSED / ORPHAN** | Not referenced anywhere; left alone (frontend out of scope). |
| Outbound webhooks card in the Hub UI | **DOCUMENTATION ONLY in UI** | No backend invented (§58 — no speculative providers; see §11 Deferred). |
| Queues / cron / OAuth / storage (S3) / FastAPI | **DO NOT EXIST in repo** | None introduced (§27: reuse or abstain — no workload justifies them). |

Ownership rule enforced (§2/§5/§30/§61):

```text
Trading provider connectivity → Accounts (unchanged)
Economic calendar provider    → Calendar (unchanged)
OCR / vision                  → FastAPI sidecar (unchanged)
Generic external providers    → Integrations (NEW — this phase)
```

## 3. Architecture (Steps 3–4: Boundary + Provider Port)

```text
apps/api/src/modules/integrations/
├── domain/
│   ├── provider-catalog.ts          # 12 static registry entries (NO provider table)
│   ├── integration-lifecycle.ts     # PURE connect/disconnect/test/sync decisions
│   └── webhook-pipeline.ts          # HMAC signing + PURE pipeline evaluator
├── infrastructure/
│   ├── integrations.repository.ts   # ONLY Prisma contact; narrow rows; tx-aware
│   ├── webhook-secret.service.ts    # AES-256-GCM wrapper (dedicated domain key)
│   ├── integration-rate-limiter.service.ts  # sliding window per (user, provider)
│   └── builtin-news.ts              # deterministic sample news (uuidV5-stable ids)
├── integrations.service.ts          # use cases + cross-context projections
├── integrations.controller.ts       # 6 routes, verbatim frontend vocabulary
└── integrations.module.ts           # imports Identity/Accounts/Calendar + Events
```

No god service (§51): the service orchestrates lifecycle state machines defined
in the pure domain layer; provider-specific behaviour lives in the catalog +
builtin adapters. Controllers carry zero provider logic (§52). The domain layer
imports no Prisma types (§53). The provider registry is **code** (§11), like the
accounts descriptors — adding a provider = 1 catalog entry + adapter behaviour,
nothing else (§50).

## 4. Files Changed

**Created (11):**

- `apps/api/src/modules/integrations/domain/provider-catalog.ts`
- `apps/api/src/modules/integrations/domain/integration-lifecycle.ts`
- `apps/api/src/modules/integrations/domain/webhook-pipeline.ts`
- `apps/api/src/modules/integrations/infrastructure/integrations.repository.ts`
- `apps/api/src/modules/integrations/infrastructure/webhook-secret.service.ts`
- `apps/api/src/modules/integrations/infrastructure/integration-rate-limiter.service.ts`
- `apps/api/src/modules/integrations/infrastructure/builtin-news.ts`
- `apps/api/src/modules/integrations/integrations.service.ts`
- `apps/api/src/modules/integrations/integrations.controller.ts`
- `apps/api/src/modules/integrations/integrations.module.ts`
- `apps/api/test/unit/integrations-hub.spec.ts` · `apps/api/test/e2e/integrations.e2e.spec.ts` (tests)
- `docs/backend/PHASE-14-INTEGRATIONS-REPORT.md` (this report)

**Modified (9, all additive or config):**

- `apps/api/prisma/schema.prisma` — 5 enums + 5 models + `User` relations
- `apps/api/src/config/env.schema.ts` — `INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY`
- `apps/api/src/config/app-config.ts` — `integrations.webhookEncryptionKey`
- `apps/api/.env.example` — documented key section
- `apps/api/test/global-setup.ts` — test-only key
- `apps/api/src/app.module.ts` — `IntegrationsModule` registration
- `apps/api/src/shared/events/domain-event-bus.ts` — additive `integration.webhook.received`
- `apps/api/src/modules/calendar/infrastructure/calendar.repository.ts` — additive `listHubEvents()`
- `apps/api/src/modules/calendar/calendar-queries.service.ts` — additive `listHubEvents()` port method
- `apps/api/test/unit/env.schema.spec.ts` · `test/e2e/security-negative.e2e.spec.ts` — new required key in fixture envs
- `docs/backend/ROADMAP.md` · `apps/api/README.md` — phase records

## 5. Data Model & Migration (Step 6)

Migration `20261003213149_integrations_platform` (non-destructive, additive only):

| Model | Purpose | Key constraints |
|---|---|---|
| `IntegrationConnection` | per-user connection state (status, authState, **vault reference** + masked hint, sync state, one-shot scenario) | `@@unique([userId, providerId])`, `@@index([userId, status])` |
| `IntegrationEvent` | Hub activity feed (sanitized messages) | `@@index([userId, occurredAt(desc)])` |
| `IntegrationError` | open-errors ledger (`code` enum, retryable, actionHint, retryAfterMs, `clearedAt`) | `@@index([userId, occurredAt(desc)])`, `@@index([userId, providerId, clearedAt])` |
| `IntegrationWebhookEndpoint` | per-user inbound endpoint (path, ACTIVE/PAUSED, **AES-GCM `secretEnc`** + hint, lastAcceptedEventId) | `path @unique`, `@@unique([userId, providerId])` |
| `IntegrationWebhookDelivery` | delivery ledger; `@@unique([endpointId, eventId])` IS the idempotency guard | `@@index([endpointId, receivedAt(desc)])` |

Not created (§38 — no speculative tables): provider table (code registry),
news table (deterministic builtin), OAuth/credential-blob tables (vault
references carry no secret material). Provider/Connection distinction (§9) is
structural: the registry entry is static code, the connection row is per-user
runtime state.

## 6. Credential & Secret Mechanisms (Steps 5, 9; §14/§15/§18/§20)

- **Vault references only.** `connect` accepts `vault://<box>/<key>` (shared
  Zod regex). The Hub stores the reference + a masked hint derived from the
  reference (`••••` + last 4). Secret material NEVER travels through this
  module — nothing to encrypt because nothing raw is received.
- **Webhook signing secrets** are generated server-side (`whsec_<12hex>`),
  encrypted at rest with AES-256-GCM under the **dedicated**
  `INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY` (key separation precedent: accounts ≠
  MFA ≠ integrations), decrypted only to compute/verify signatures, never
  returned — the API exposes only `secretMaskedHint` (`whsec_••••e7c1` style).
- **No plaintext credentials anywhere**: no plaintext columns, no GET returns
  secrets, messages are secret-free by construction, pino `redact` paths
  already cover credential-shaped fields (§37).
- Signature comparison is constant-time (`timingSafeEqual`).
- No key rotation plumbing was added (no UI/requirement — §13 minimum set;
  `credentialsLastRotatedAt` is stamped on connect for future use).

## 7. API (Steps 8, 10; contract verbatim)

All routes authenticated (global JWT guard), all POSTs `@HttpCode(200)` (MSW
parity), validation via shared Zod schemas, errors through the global filter
(`{error, code, message, requestId}`):

| Route | Behaviour (mock parity) |
|---|---|
| `GET /integrations/overview` | Aggregate: summary + 12 providers + account views + eco feed + news + webhooks(+deliveries ≤12) + events(≤30) + errors(≤12) + retention. Lazily provisions the inbound webhook endpoint on first read. |
| `POST .../providers/:id/connect` | 404 unknown → 422 `LICENSE_UNVERIFIED` (§29 gate) → 409 `ALREADY_CONNECTED`. Stores vault ref + hint; cTrader's **first pairing** ships the deterministic `expired-credentials` scenario (status `AUTH_REQUIRED`, event `TEST_FAILED`). Clears `CREDENTIALS_EXPIRED`. Emits `INTEGRATION_CONNECTED` audit only on success. |
| `POST .../providers/:id/disconnect` | 404 → 409 `NOT_CONNECTED`. Detaches credentials, clears all provider errors, `historyPreserved: true` (§26), audit `INTEGRATION_DISCONNECTED`. |
| `POST .../providers/:id/test` | 4 checks (authentication / permissions / connectivity / providerResponse) with verbatim mock details. Pass clears auth errors; pass on degraded provider → `RECOVERED`. Fail → `AUTH_REQUIRED` + `EXPIRED` + `CREDENTIALS_EXPIRED` ledger entry. Never trades (§27). |
| `POST .../providers/:id/sync` | 404 → 409 `NOT_CONNECTED`/`AUTH_REQUIRED` → **429 `RATE_LIMITED` + `Retry-After`** after the provider quota (30/60 s default, 60/60 s market, 3/10 s macro). Deterministic beat: every 5th ECONOMIC sync → 1 failed record, `retryCount++`, backoff nextRetryAt (1 s→2 s→…cap 60 s), status `DEGRADED` + `PARTIAL_SYNC`. Success → `CONNECTED`, cursor retained. Retention prune runs on the write path. |
| `POST .../webhooks/:endpointId/simulate` | Builds a provider-shaped delivery, signs it (HMAC-SHA256 over `<ts>.<json>`), then runs the **real** pipeline: ① timestamp freshness (±5 min replay window) → ② signature (constant-time) → ③ idempotency (`provider:eventId`). `mode` corrupts exactly one step (`bad-signature` / `stale-timestamp` / `replay`). Accepted deliveries publish `integration.webhook.received` on the domain bus (§21/§29). |

Provider ids implemented (§59 Step 9 — exactly the product's existing set): the
12 builtin deterministic registrations (`deriv`, `mt5-bridge`, `ctrader`,
`binance-exchange`, `binance-market`, `simulated-feed`, `macro-sample`,
`news-wire`, `tradingview`, `email-outbound`, `push-outbound`, `webhook-out`).
No real third-party adapters were invented (§58 — never fake real connectivity;
the registration/adaptation seams are ready for licensed providers).

## 8. Cross-Domain Integration (§29 — ports, never tables)

- **Eco feed**: `CalendarQueriesService.listHubEvents()` — **additive** port
  method that guarantees a fresh read (runs the same lazy, TTL-throttled,
  in-flight-locked sync as `GET /eco-events`) and returns canonical rows WITH
  provider provenance so the Hub builds the shared `providerKey` identity.
  Calendar tables are never touched by Integrations; no second event store.
- **Account views**: `AccountsRepository.listAccountsByUser` +
  `findConnectionByAccountId` + `latestSnapshot` + `listPositions` (already
  public) — read-only projection into `TradingAccountView`, nulls stay nulls
  (§6 honesty), permissions mapped
  (`READ_ACCOUNT/BALANCE/EQUITY→READ_ACCOUNT`, `READ_POSITIONS`, `READ_ORDERS`,
  `READ_DEALS→READ_EXECUTIONS`).
- **Audit**: `SecurityEventService` with the pre-existing
  `INTEGRATION_CONNECTED` / `INTEGRATION_DISCONNECTED` types; audit-write
  failure never breaks the lifecycle action.
- **Events**: `DomainEventMap` grew additively
  (`integration.webhook.received`) — consumer domains subscribe at their own
  pace; none exist yet, none required (§28).

## 9. Background Jobs (§27)

None introduced. No queue/worker/cron exists in the repo and Phase 14 has no
workload justifying one: sync is user-triggered and bounded; retention pruning
runs lazily on the sync write path (mock parity); the domain event bus remains
the only in-process fan-out. This matches the Calendar precedent ("no cron;
sync is lazy").

## 10. Tests & Verification (§45 security matrix coverage)

- **Unit (29)** — `test/unit/integrations-hub.spec.ts`: registry invariants
  (12 unique, licensing gates, per-provider quotas, single WEBHOOK_INBOUND,
  read-only), connect outcomes (masked hint, §32 one-shot), test matrix
  details, sync determinism (duration series, per-kind records, partial beat,
  backoff), webhook evaluator (all 4 verdicts + seen/replay), secret hygiene,
  news stability.
- **E2E (26)** — `test/e2e/integrations.e2e.spec.ts`, real app + real DB:
  - 401 battery on all routes (the MSW mock skips auth — the real surface does NOT);
  - boot overview re-parsed by `integrationsOverviewResponseSchema` (12
    DISCONNECTED, empty ledgers, provisioned endpoint, populated Calendar eco
    feed, 6 labelled news);
  - connect lifecycle incl. 404/400/422/409, masked-hint parity, cTrader
    scenario → reconnect recovery, history-preserving disconnect, audit rows
    asserted in DB;
  - test endpoint honest-failure + 4-check pass + ledger `CREDENTIALS_EXPIRED`;
  - sync counters/cursors + 429 after the 60-request market quota with
    `Retry-After` header + ledger `RATE_LIMITED` + `SYNC_FAILED` feed event;
  - webhook pipeline: valid / bad-signature / stale-timestamp / replay /
    unknown endpoint / malformed uuid;
  - **IDOR**: cross-user webhook simulate → 404 (ownership in every
    where-clause);
  - **secrets**: overview payload contains no `secretEnc`, no raw secret,
    masked hints only.
- **Full suite**: 691/691 (40 files) — 636 pre-existing + 55 new, zero
  regressions. `env.schema.spec` and `security-negative` fixtures updated for
  the new required key (fail-closed validation proven again).
- **typecheck ✓ · lint ✓ · build ✓ · `prisma validate` ✓ · `migrate deploy`
  idempotent ✓**
- **Real smoke** (`scripts/smoke-phase14.mjs`): boot → health → register →
  verify → login → overview (289 eco events from Calendar) → licensing 422 →
  connect (hint parity) → 409 → test (4 checks) → sync (1 record) → webhook
  valid/bad-signature/replay → disconnect (history preserved) → security
  overview shows both audit events — **ALL GREEN**.

## 11. Known Limitations & Deferred Work (documented honesty)

1. **Outbound webhooks are documentation-only** (the Hub card describes
   `X-Cosmoz-Event/X-Cosmoz-Signature/X-Cosmoz-Delivery`, retries, 2xx-ack) —
   no outbound delivery engine was built (§58: no speculative infrastructure;
   no frontend operation requires it yet).
2. **Webhook application of eco `actual` values** is published as an
   application event; Calendar does not yet subscribe, so accepted webhooks do
   not mutate canonical eco events. The response contract (`accepted/…`) is
   fully honoured. Wiring a Calendar subscriber is a small, additive follow-up
   when a licensed economic provider exists.
3. **Inbound raw webhook endpoint** (`POST /integrations/webhooks/:path`)
   intentionally not exposed: no real inbound provider exists; the simulate
   endpoint exercises the identical pipeline (§19/§21 minimum-set rule).
4. **News retention pruning** is a no-op server-side: the builtin news feed is
   deterministic and always fresh (ids stable via uuidV5); the mock's
   2-day-prune behaviour applies only to its in-memory demo state.
5. **Sync durations/counters** are the mock's deterministic series (simulated
   latency per provider); real adapters will report real latency/duration.
6. **ECONOMIC partial-sync beat and the 3/10 s macro quota** are implemented
   and unit-tested but unreachable e2e today: `macro-sample` is
   licensing-gated (422 on connect) — by design (§29), the sample feed cannot
   be connected by end users.
7. `IntegrationError.code` uses the shared closed enum; the mock's extra
   transport codes (`UNKNOWN_PROVIDER`…) live in the HTTP error envelope
   `code` field, not the ledger.

## 12. Definition of Done — Confirmation

- Architecture: dedicated bounded context; specialized domains retain
  ownership; provider logic isolated; **no god service; no duplicate provider
  systems** (§62 Architecture ✓).
- Security: vault-reference credentials; secrets never in responses/logs;
  webhook signature + replay window + idempotency; **IDOR tested** (§62
  Security ✓).
- Domain: provider ≠ connection; explicit lifecycle; explicit capabilities;
  isolated provider behaviour (§62 Domain ✓).
- Infrastructure: bounded retries/backoff; provider rate limits; idempotent
  webhook ledger; **no new queue/cron** (§62 Infrastructure ✓).
- API: shared Zod contracts; DTOs separate from Prisma; sensitive fields
  excluded; errors normalized (§62 API ✓).
- Testing: unit + e2e + security + provider-adapter + webhook suites pass
  (§62 Testing ✓).
- Verification: typecheck/lint/tests/build/migration validation all green;
  all existing frontend integration flows covered by the contract
  (§62 Verification ✓).

**Backtesting (Phase 9) remains DEFERRED** — nothing was implemented,
scheduled or stubbed for it.

**STOP** — Phase 14 ends here. Phase 15 is NOT started; explicit
authorization is required for any further phase.
