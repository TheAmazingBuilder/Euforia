# COSMOZ — BACKEND PHASE 3 REPORT
## Accounts & Trading Connectivity — Provider-Agnostic Read-Only Architecture

Status: **COMPLETE** — stopped after Phase 3 per mandate §70; no Phase 4 work started.

---

## 1. What Was Implemented

The **Accounts / Trading Connectivity bounded context** (`src/modules/accounts/`, 14 files)
inside the existing NestJS modular monolith, following the repository's established
supporting-context discipline (flat application services + one repository + thin controllers).

**Domain & contracts**

- `packages/shared/src/schemas/trading-account.ts` (+ index export): orthogonal lifecycle
  enums (`tradingConnectionStatusSchema` DISCONNECTED/CONNECTING/CONNECTED/ERROR,
  `synchronizationStatusSchema` UNKNOWN/SYNCING/LIVE/DELAYED/STALE/ERROR,
  `tradingSyncRunStatusSchema`), V1 connection method (`API_KEY`), V1 read-only
  permission set (7 × `READ_*`), provider descriptor/capabilities schemas, connect /
  reconnect inputs, details / snapshot / sync-run / test / disconnect / sync views,
  deals schema, and `TRADING_ERROR_CODES` (13 stable machine codes, §36). Positions and
  orders reuse the existing Session-Live `brokerPositionSchema` / `brokerOrderSchema`
  verbatim — one wire shape per business concept.
- The pre-existing journal `connectionStatusSchema` (which merges SYNCING into
  connection) was deliberately left untouched for its existing consumers; the trading
  context declares its own orthogonal enums per mandate §15.

**Persistence** (migration `20261003115414_accounts_connectivity`)

- `TradingAccount` (identity: provider, externalAccountId, explicit environment type,
  broker, currency, startingBalance Decimal(18,8), isDefault, propConfig),
  `TradingConnection` (1:1, method/status/permissions/`credentialsEnc`/hint/lastError/
  lastConnectedAt/lastSyncAt), `TradingAccountSnapshot` (latest per account, incl.
  derived unrealizedPnl), `TradingPosition`, `TradingOrder`, `TradingDeal`
  (all keyed by `(accountId, externalXxxId)` for idempotency, §18),
  `TradingSyncRun` (status, trigger, counts, durationMs, errorCode, requestId).
- **Partial unique index** `TradingSyncRun(accountId) WHERE status='RUNNING'` — the §38
  concurrency guard Prisma cannot express; P2002 maps to 409 `SYNC_ALREADY_RUNNING`.

**Provider architecture** — see §4 below.

**Application layer**

- `TradingAccountService`: connect (validate-before-persist → atomic account+connection
  → initial sync), test (4 named honest checks), reconnect (fresh credentials on
  DISCONNECTED/ERROR connections), disconnect (credential wipe, history preserved),
  reads (journal list, details, snapshot, positions, orders, deals, provider registry),
  sync-status view, and the `GET /broker/session` aggregate.
- `TradingSyncService`: synchronization orchestration — one RUNNING run per account,
  timeout-guarded adapter calls, normalization-boundary validation, single-transaction
  persistence, structured logging, failure audit + connection-state handling
  (auth-class failures flip the connection to ERROR; data failures don't).
- `CredentialsEncryptionService` over the new generic `src/infrastructure/crypto/aes-gcm.ts`
  primitive (AES-256-GCM, versioned `v1.` wire format, tamper → null).
- `AccountsRateLimiterService` (reuses the identity sliding-window limiter class with
  accounts vectors: connect 5, reconnect 5, sync 20 per 15 min, keyed by userId).

**Presentation** — `AccountsController` (`/api/v1/accounts*`) and `BrokerController`
(`/api/v1/broker/session`), thin: ZodValidationPipe + auth principal + use case.
Registered in `AppModule` after `IdentityModule`.

**Environment contract** (fail-fast, values never in errors): `ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY`
(required, base64 32 B), `ACCOUNTS_PROVIDER_TIMEOUT_MS` (default 10 000),
`ACCOUNTS_MOCK_PROVIDER` (enabled/disabled; default enabled outside production, §57).
`.env.example`, test global-setup and README updated.

## 2. What Was Reused (audit-before-modify)

- **Phase 0/1/2 evidence** re-verified first (worklog, reports, live tree) — no
  functionality duplicated, no parallel architecture created.
- **Error architecture** (`AppError` taxonomy + `AllExceptionsFilter` envelope) —
  provider failures normalized onto `ExternalProviderError` (502) /
  `BusinessRuleError` (422) / `RateLimitError` (429, Retry-After).
- **Auth stack**: global `JwtAuthGuard` (zero new guards), `@CurrentUser` principal
  (userId never read from the client), status gates.
- **Audit log**: `SecurityEventService` + append-only `SecurityEvent` table reused via
  `IdentityModule` export; the type union gained 4 additive `TRADING_*` literals.
- **Rate limiter**: `AuthRateLimiterService` class reused with accounts-specific vectors.
- **Zod pipeline**: `ZodValidationPipe` + shared contracts barrel (compiled-in
  `src/shared/contracts`), per-route schemas.
- **Prisma conventions**: PascalCase tables, UUID PKs, `Decimal(18,8)` money with
  string wire format, UTC timestamps, `@@index([accountId|userId, …])`, secrets as
  encrypted blobs, interactive `$transaction` form.
- **Testing infrastructure**: `buildTestApp` harness, `authenticatedUser` helper,
  global-setup DB discipline — extended, not replaced.
- **Frontend contracts**: `GET /accounts` returns the exact journal `accountSchema`
  the switcher/settings already consume; `GET /broker/session` returns the exact
  `brokerSessionResponseSchema` the Session-Live panel already polls. **Zero frontend
  changes required** (frontend untouched except a pre-existing typecheck fix, §9).

## 3. Database Changes

- One migration: `20261003115414_accounts_connectivity` — 7 new tables
  (§1 list), all FKs `onDelete: Cascade` to `User`/`TradingAccount`, plus the
  hand-written partial unique index for RUNNING sync runs.
- **No existing tables were altered** (User only gained the `tradingAccounts` relation
  list — no column changes). No existing data touched; `prisma migrate deploy` verified
  against dev and test databases.

## 4. Provider Architecture

```
Application layer (TradingAccountService / TradingSyncService)
        ↓ depends ONLY on
TradingProviderAdapter (read-oriented, stateless)
  testConnection / fetchAccountInfo / fetchSnapshot /
  fetchPositions / fetchOrders / fetchDeals
        ↓ implemented by
MockTradingProviderAdapter (V1)   [future: MT5-bridge, Deriv, cTrader…]
        ↓ normalized through (zod)
normalization.ts boundary → Cosmoz domain shapes
```

- **Execution is architecturally absent**: the interface has no
  placeOrder/modifyOrder/cancelOrder/closePosition methods — not even unused ones (§47).
  E2E asserts execution routes 404.
- **Capabilities & permissions**: each adapter's descriptor declares
  environments/methods/permissions/capabilities; connect stores the descriptor's
  READ_* set on the connection; the client can never grant permissions (no input field
  exists — enforced architecturally, §24).
- **Controlled failures (§55)**: secret prefixes `fail-invalid` → 422
  INVALID_CREDENTIALS, `fail-unavailable` → 502 PROVIDER_UNAVAILABLE, `fail-timeout` →
  502 CONNECTION_TIMEOUT (adapter sleeps past the configured timeout), `fail-malformed`
  → 502 INVALID_PROVIDER_RESPONSE (caught by the normalization boundary).
- **Determinism (§18)**: all mock data is a pure function of the external account id
  (FNV-1a) with fixed UTC epoch anchors — repeated syncs upsert identical objects.
- **MT5 boundary note (§14)**: V1 adapters are stateless API-key readers. Session-
  oriented MT5 connectivity will need a provider-specific bridge; the Accounts domain
  stays in NestJS and the adapter interface is the seam — documented, not built
  (no real credentials/test infrastructure available, §56).

## 5. API Endpoints (all `/api/v1`, all authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/accounts` | Journal identity list (shared `accountSchema`) |
| POST | `/accounts` | Connect: register + connect + initial sync → 201 details |
| GET | `/accounts/providers` | Provider registry descriptors (metadata only) |
| GET | `/accounts/:id` | Full details (identity + connection + sync + snapshot) |
| GET | `/accounts/:id/snapshot` | Latest snapshot view |
| GET | `/accounts/:id/positions` | Normalized open positions |
| GET | `/accounts/:id/orders` | Normalized pending orders |
| GET | `/accounts/:id/deals` | Normalized completed deals |
| POST | `/accounts/:id/connection/test` | Health check → 200 `{ok, checks[4]}` |
| POST | `/accounts/:id/connection` | Reconnect with fresh credentials |
| DELETE | `/accounts/:id/connection` | Disconnect — wipe credentials, keep history |
| POST | `/accounts/:id/sync` | Trigger synchronization run |
| GET | `/accounts/:id/sync` | Synchronization status + latest run |
| GET | `/broker/session` | Session-Live aggregate (read-only, unchanged contract) |

Error surface: stable codes per §36 — 422 `INVALID_CREDENTIALS` / `UNSUPPORTED_PROVIDER`
/ `NOT_CONNECTED`, 409 `DUPLICATE_ACCOUNT` / `ALREADY_CONNECTED` /
`SYNC_ALREADY_RUNNING`, 502 `PROVIDER_UNAVAILABLE` / `CONNECTION_TIMEOUT` /
`INVALID_PROVIDER_RESPONSE` / `SYNC_FAILED`, 429 `RATE_LIMITED` (+ Retry-After), 400
validation envelope, 404 for foreign/unknown ids.

## 6. Security Measures

- **Ownership chain (§19)**: authenticated principal → owned account → connection →
  synchronized state; every lookup is `userId`-scoped, foreign ids 404 (IDOR-tested
  across 10 route shapes × second user).
- **Credentials (§22/§23)**: validated with the provider before persistence; encrypted
  at rest (AES-256-GCM, dedicated 32-byte key, versioned format, tamper → null);
  masked hint only (`••••abcd`); disconnect wipes the ciphertext. E2E asserts the
  secret never appears in ANY response surface (details, lists, positions, orders,
  deals, snapshot, sync, broker session, providers, provider failures) and never in
  audit contexts; the mock's error messages are secret-free by construction and tested.
- **Execution red line (§47)**: no execution methods in the adapter interface, no
  execution routes (404-asserted), permissions are READ_* from descriptors only.
- **Rate limiting (§37)**: connect 5 / reconnect 5 / sync 20 per 15 min per user
  (429 + Retry-After, tested), beneath the global IP throttler.
- **Synchronization integrity (§16/§38)**: single RUNNING run per account (DB-level
  partial unique index, 409-tested); transactional persistence avoids inconsistent
  snapshots; provider failures fail the run with a stable code, never crash the module.
- **Mock safety (§57)**: mock provider gated by `ACCOUNTS_MOCK_PROVIDER` (production
  default off); descriptors carry `isMock` visibly.
- **Config safety**: missing/invalid accounts env → controlled startup failure listing
  key paths only (runtime-verified).

## 7. Tests Executed

**New unit (12)** — `aes-gcm.spec.ts` (roundtrip, IV freshness, tamper, wrong key,
malformed payloads), `mock-trading-provider.spec.ts` (descriptor read-only, boundary
validation of generated data, determinism, all four controlled failures, secret-free
error messages), `sync-status.spec.ts` (UNKNOWN/SYNCING/LIVE/STALE/ERROR derivation,
custom TTL, orthogonal lifecycles).

**New e2e (35)** — `accounts.e2e.spec.ts`: auth boundary, empty-start honesty, registry
listing + unknown provider, connect happy path (201, validated details, initial sync),
journal-contract compatibility, duplicate 409, all four provider-failure
normalizations (+ nothing persisted on failure), validation envelope, default-account
invariant, manual sync + idempotency (no duplicate rows), 409 concurrency guard,
disconnected-sync 422, stale-credential sync → connection ERROR + FAILED run +
sanitized error, sync-status view, read endpoints validated against shared schemas,
broker session NOT_CONFIGURED→CONNECTED→NOT_CONFIGURED, unknown/malformed ids, test
checks (4 named), reconnect lifecycle (restore / 409 while connected / bad credentials
stay disconnected), disconnect semantics (wipe + history preserved + journal kept),
full IDOR matrix, user-B broker isolation, credential-redaction sweep, execution
red-line 404s, connect rate limit (429 + Retry-After), audit events recorded without
secrets.

**Full suite**: 167/167 tests green (106 pre-existing + 61 new; 8→12 files).

## 8. Verification Results

| Check | Result |
|---|---|
| `tsc --noEmit` (api) | ✅ 0 errors |
| `tsc -p tsconfig.build.json` (build) | ✅ clean dist |
| eslint (src + test) | ✅ 0 problems |
| vitest run | ✅ 167/167 (12 files) |
| `@cosmoz/shared` typecheck | ✅ 0 errors |
| `apps/web` typecheck (regression) | ✅ 0 errors |
| Runtime smoke (live server) | ✅ boot → health → 401 guards → register/verify/login → providers → connect 201 (CONNECTED, hint ••••abcd, sync LIVE, 2 positions + 7 deals) → positions/orders/broker-session payloads valid → manual sync COMPLETED → disconnect (historyPreserved) → broker NOT_CONFIGURED |
| Secret redaction (live) | ✅ secret absent from every captured response body |
| Invalid env (live) | ✅ missing key → abort listing key name only; wrong length → precise message; no values leaked |
| Graceful shutdown (live) | ✅ SIGTERM → clean stop |
| DB lifecycle | ✅ migrate deploy on dev + test DBs; no existing schema altered |

## 9. Known Limitations

1. **Synchronous synchronization**: connect/sync runs complete inside the HTTP request
   (timeout-guarded, mock-fast). Slow real providers will need an async handoff
   (run row → worker) — the `TradingSyncRun` record and CONNECTING enum already model
   it; deferred until a real provider requires it (§17 allowance).
2. **No real provider adapter**: only the MOCK adapter exists (§56 — no credentials or
   test infrastructure available; faking real connectivity is forbidden). MT5 likely
   needs a narrowly-scoped bridge (§14); the adapter interface is the seam.
3. **V1 connection method**: `API_KEY` only; OAUTH / BROKER_API / PLATFORM_BRIDGE are
   deliberately undeclared until a provider requires them (§12).
4. **In-memory rate limiter**: correct for the single-instance monolith (same tradeoff
   as identity); horizontal scaling needs a shared store.
5. **Snapshot granularity**: latest snapshot per account (1:1). Historical equity
   curves are future Analytics concerns; sync runs already carry timestamps/counts.
6. **No deletion endpoint**: disconnect ≠ delete (§52/§53); removal semantics
   (soft/hard/anonymization) are an explicit product decision, not invented here.
7. **DELAYED sync status**: declared in the enum, reserved for future per-object
   freshness granularity; not yet derived.
8. **Pre-existing frontend typecheck error fixed** (small cross-phase repair, flagged):
   `apps/web/src/mocks/security-engine.ts` assigned the now-optional `demoCode`
   (`string | undefined`, Phase 2 schema change) to a `string | null` field. One-line
   `?? null` coercion; verified pre-existing via stash, web typecheck now clean.
9. **Frontend MSW parity gap documented, not replicated**: the MSW integrations hub
   (`/integrations/*`, news/eco/webhooks) is a broader integrations domain — out of
   Phase 3 scope (§68). Those routes remain MSW-served until their own phase; the
   accounts endpoints above are the backend contract that replaces the accounts-related
   mock surfaces (`/accounts`, `/broker/session`).

## 10. Remaining Blockers

None blocking Phase 3 acceptance. Inputs required before the NEXT phases of accounts
evolution (not Phase 3 scope):

- Real broker credentials / sandbox accounts (MT5 bridge or broker API) to implement
  and verify a production adapter (§56 conditions).
- Product decision on account deletion semantics and snapshot/audit retention windows
  (§51 — documented as open rather than guessed; security-event retention constants
  from Phase 2 apply until then).
- If synchronization becomes asynchronous later: a worker/scheduler boundary; the run
  schema already supports it without migration.

---

**STOPPED after Phase 3** per mandate §70 — awaiting the next phase prompt.
