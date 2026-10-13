# EUFORIA ACCOUNTS — PHASE 00 AUDIT REPORT

## Accounts & Trading Connectivity — Complete Technical Audit and Feasibility Assessment

**Date of audit:** 2026-10-13 (all repository reads, test executions, and provider-documentation checks performed on this date).
**Repository HEAD at audit time:** `5f82266` (`savepoint/2026-10-13`), working tree clean.
**Audit mode:** READ-ONLY. Evidence labels used throughout: `VERIFIED IN SOURCE`, `VERIFIED BY TEST`, `VERIFIED BY RUNTIME`, `VERIFIED BY OFFICIAL DOCUMENTATION`, `INFERRED`, `UNKNOWN`.
**Verification discipline note:** three independent deep audits (backend, frontend, data-model/security) were cross-checked, and every load-bearing claim was re-verified directly by the orchestrator before being accepted. One sub-agent claim (a syntax error in `accounts.e2e.spec.ts`) was **refuted** during verification — see §11 for the full account.

---

## 1. Executive Summary

**What exists.** The Accounts & Trading Connectivity backend is a **complete, disciplined, honestly read-only Phase-3 implementation** inside the NestJS modular monolith (`apps/api/src/modules/accounts/`, 14 files, ~2,970 LOC): a provider-adapter port that is read-only *by construction*, a capability-descriptor model, a single mock adapter gated by env flag, AES-256-GCM credential encryption with domain-separated keys, account/connection/snapshot/sync-run concept separation, transactional idempotent sync with a DB-enforced single-runner guard, 13 stable error codes with HTTP mapping, per-user rate limits, and an audit-event ledger. A full e2e suite over a real migrated Postgres test database covers 35+ behaviors including IDOR, secret redaction, and an "execution red line" asserting that no order/position-write route exists.

**What is genuinely operational.** The backend surface (`/api/v1/accounts*`, `/api/v1/broker/session`) is implemented, compiled, served on :4000, and its tests pass **as executed during this audit** (unit 81/81, e2e 35/35 — §11). Contracts in `packages/shared/src/schemas/trading-account.ts` are complete and UI-ready.

**What is NOT wired.** The **web app has no Accounts UI at all**: no `/accounts` route, no sidebar entry, no connect flow, no detail view, no hooks, no MSW handlers for the trading-account contract. Two dead links point to the non-existent `/accounts` route (Oryon lower panel, Recognition success). What the user sees today as "accounts" is a **journal-account catalog served by MSW fixtures** (3 hardcoded accounts), an Integration Hub that is a **different, simulated bounded context**, and an honestly `NOT_CONFIGURED` broker-session row in Oryon.

**Most important gaps.** (1) Frontend Accounts module missing entirely (backend ready). (2) Zero real provider connectivity — by explicit policy ("do not fake real connectivity"), no HTTP/WS client dependency, no SDK, no scheduler/queue in the API; sync is user-triggered only. (3) Two confirmed code defects (§13): Monitoring filters sync runs on a status literal (`"SUCCESS"`) that the writer never produces (real statuses: `RUNNING/COMPLETED/FAILED`), so sync health/latency always report zero; and a fully implemented second controller (`/trading-accounts*`) is never registered — a dead HTTP surface. (4) Integration Hub persists demo secrets in **plaintext** inside `IntegrationRow.data` while the service that would encrypt them exists **unwired** (dead code). (5) One schema↔DB drift: `TradingDeal.externalPositionId` exists in the database but not in `schema.prisma`.

**Principal architectural risks.** Mock/fixture account balances are rendered in risk-relevant UI (position sizer) with no "demo data" marker — a user could mistake fixture numbers for real equity. Provider-adapter capability gating has never been exercised (only the all-capabilities mock is registered), so the code paths for honest "unsupported capability" behavior are untested. No background sync exists, so "connection health" is only as fresh as the last manual sync.

**Can the current foundation support the target product?** **Yes.** The domain model (external state ≠ external deal ≠ canonical trade), the adapter port, the security posture, and the sync write-set are the right architecture and need extension, not replacement. The largest single body of missing work is **frontend**, followed by **real provider adapters**, then **scheduled synchronization**.

---

## 2. Repository and Architecture Map

### 2.1 Workspace topology — VERIFIED IN SOURCE

| Package | Path | Role |
|---|---|---|
| `cosmoz` (pnpm 12.4.2 + turbo) | `/home/z/my-project` | monorepo root; workspace = `apps/*`, `packages/*` |
| `@cosmoz/api` | `apps/api` | NestJS 11 (Fastify adapter), Prisma 6, embedded Postgres 17.5 (`:5433`, DB `cosmoz`), serves `/api/v1/*` on :4000 |
| web app | `apps/web` | Next.js 16 App Router, React 19, react-query, MSW browser worker (mock mode is the **default**), Tailwind |
| `@cosmoz/shared` | `packages/shared` | zod contracts; source-exported, no build step |
| `market-service` | `mini-services/market-service` | **outside the pnpm workspace** — Bun, socket.io :3003, real Binance public REST+WS data, mock auth verifier with production boot-guard |
| `ocr-service` | `mini-services/ocr-service` | Python/FastAPI OCR sidecar consumed by the API over `fetch` |

`apps/api` consumes **no** market-service endpoint (no reference to `:3003` anywhere in `apps/api/src` — verified by grep). Market data and account connectivity are currently fully disjoint domains.

### 2.2 Connectivity-relevant dependencies — DECLARED/INSTALLED/IMPORTED/USED

| Dependency | Declared | Imported | Used for | Verdict |
|---|---|---|---|---|
| `@nestjs/common/core/platform-fastify` 11.x | yes | yes | HTTP transport; **no WS adapter installed** | USED |
| `@prisma/client` 6.19.3 | yes | yes | all Trading* persistence | USED |
| `zod` 3.x | yes | yes | normalization boundary + wire contracts | USED |
| `decimal.js` / `Prisma.Decimal` | yes | yes | exact money math (`trading-sync.service.ts:317-324`) | USED |
| `@nestjs/jwt`, `@node-rs/argon2`, `otpauth`, pino, helmet, cookie | yes | yes | auth/logging foundations | USED |
| `@nestjs/throttler` 6.x | yes | yes | global IP throttler under per-user limiters | USED |
| `@nestjs/schedule`, `node-cron`, `bullmq`, `ioredis`, amqp | **NO** | absent | — | NOT DECLARED — no scheduler/queue exists |
| HTTP clients (`axios`, `got`, `undici`, `node-fetch`) | **NO** | absent | native `fetch` only (OCR sidecar, not brokers) | NOT DECLARED |
| WS libs (`ws`, `socket.io`, `@nestjs/websockets`) | **NO** (only as peer-deps metadata) | absent | — | API has no WebSocket server |
| Broker SDKs (MetaApi, MetaTrader5, cTrader, OANDA, Deriv) | **NO** | absent | — | NOT DECLARED — consistent with "no fake connectivity" policy |
| `socket.io-client` 4.8.3 | apps/web only | `apps/web/src/lib/realtime/market.ts:5` | market feed → :3003 | USED (web only) |

**Net verdict:** the accounts backend is deliberately dependency-free; provider I/O is simulated in-process. `VERIFIED IN SOURCE` (package.json files + pnpm-lock importers).

### 2.3 API modules touching the target domain

`modules/accounts` (the Accounts bounded context), `modules/integrations` (Integration Hub — **different bounded context**, simulated), `modules/trading` (Trading Core Phase 4 — deals→journal-trade reconstruction), `modules/monitoring` (observes Accounts via a narrow read contract), `modules/identity` (application user + auth + global JWT guard + SecurityEvent ledger), `modules/calendar` (contains an exemplary `provider.port.ts` port/adapter seam). `VERIFIED IN SOURCE`.

---

## 3. Existing Accounts Implementation (actual, not intended)

### 3.1 The concepts the spec demands all exist and are correctly separated — VERIFIED IN SOURCE

| Concept | Entity | Where | Notes |
|---|---|---|---|
| (a) Application user | `User` + `modules/identity` | identity.module | distinct from trading identity |
| (b) Trading account | `TradingAccount` (schema.prisma:286-332) | `@@unique([userId, providerId, externalAccountId])` | stable external identity |
| (c) Trading connection | `TradingConnection` (schema.prisma:337-364) | **explicitly separate entity**, 1:1 with account | own status enum `DISCONNECTED/CONNECTING/CONNECTED/ERROR`; disconnect wipes credentials, keeps history |
| (d) Provider adapter | `TradingProviderAdapter` interface (accounts/provider.types.ts:136-161) + `ProviderRegistryService` | single registered impl: `MockTradingProviderAdapter` (env-gated) | session-oriented semantics explicitly deferred ("documented, not speculative", provider.types.ts:13-19) |
| (e) Account snapshot | `TradingAccountSnapshot` (schema.prisma:369-393) | adapter-level `NormalizedSnapshot` → DB → wire `tradingAccountSnapshotViewSchema` | all metrics nullable — "unavailable ≠ invented" |
| (f) Sync execution | `TradingSyncRun` (schema.prisma:485-504) + `TradingSyncService` | partial unique index `WHERE status='RUNNING'` (migration `20261003115414_accounts_connectivity` L200-206) → P2002 → 409 `SYNC_ALREADY_RUNNING` | concurrency-safe |

No duplicate/overlapping entities were found for concepts (a)–(f) in the accounts context. Three name-adjacent but unrelated things exist and must not be confused with them: `identity/account.service.ts` (user profile), the Integration Hub's `IntegrationConnection` (simulated, second generation — see §6.4), and the journal `Account` catalog contract (`packages/shared/src/schemas/account.ts`).

### 3.2 HTTP surface — VERIFIED IN SOURCE

Two controllers delegate to the same `TradingAccountService`:
- `AccountsController` `@Controller("accounts")` (accounts.controller.ts:43) — **registered** in accounts.module.ts:58: `GET /accounts`, `GET /providers`, `GET /:accountId`, `GET /:accountId/snapshot|positions|orders|deals`, `POST /accounts` (connect, 201), `POST /:accountId/connection/test`, `POST /:accountId/connection` (reconnect), `DELETE /:accountId/connection` (disconnect), `POST /:accountId/sync`, `GET /:accountId/sync`. No `@Public` anywhere (global JwtAuthGuard).
- `TradingAccountsController` `@Controller("trading-accounts")` (trading-accounts.controller.ts:47-48) — fully implemented (providers/connect/list/detail/positions/orders/deals/test/sync/reconnect/PATCH rename/DELETE disconnect) but **never registered in any module** → dead HTTP surface. Confirmed: `accounts.module.ts:58` lists only `[AccountsController, BrokerController]`, and a repo-wide grep finds no other registration.
- `BrokerController` `@Controller("broker")` — `GET /broker/session` builds from **persisted** state only (never live provider calls): default CONNECTED → most recent CONNECTED → honest `ERROR` → `NOT_CONFIGURED` (trading-account.service.ts:577-605).

### 3.3 Sync pipeline — VERIFIED IN SOURCE

`TradingSyncService.executeSync` (trading-sync.service.ts:186-287): create run → snapshot → positions → orders → deals, **sequentially**, each adapter call under `withProviderTimeout` (default 10 s, env-tunable `ACCOUNTS_PROVIDER_TIMEOUT_MS`), each payload zod-validated at the normalization boundary (`normalization.ts`, invalid → `INVALID_PROVIDER_RESPONSE`), then **one transaction** `persistSyncResult` (accounts.repository.ts:364-540) writes snapshot upsert + position/order/deal upserts keyed `(accountId, external*Id)` + `lastSyncAt` + run completion. Failure path: `failSyncRun` + `setConnectionError` for auth-class codes (`INVALID_CREDENTIALS`, `UNAUTHORIZED_PROVIDER_ACCESS`) + `TRADING_ACCOUNT_SYNC_FAILED` audit event + normalized rethrow. Deal→journal-trade reconstruction (`modules/trading`, `TradeReconstructionService`) consumes `AccountsRepository` ("never calls provider adapters directly") but has **no live HTTP trigger** — `TradingController` is intentionally unwired (`trading.module.ts` controllers: [], documented Phase-12 follow-up); the pipeline is covered by unit tests only.

---

## 4. Frontend and UX/UI Audit

### 4.1 Inventory — VERIFIED IN SOURCE

The App Router tree contains **no `/accounts` route** (verified against the full `(app)/` group: dashboard, trades, oryon, journal, playbook, analytics, recognition, calendar, discipline, academy, nofy, events, tasky, tools/*, monitoring, integrations, security, settings, profile, goals). `lib/navigation.ts` has **no Accounts entry** in any sidebar section. Two **dead links** target the missing route: `components/oryon/oryon-lower-panel.tsx:396` ("Connect in Accounts") and `components/recognition/recognition-success.tsx:85`.

What actually renders account-related data today:

| Surface | File | Data source |
|---|---|---|
| Topbar `AccountSwitcher` | `components/layout/account-switcher.tsx` (mounted `topbar.tsx:177-179`) | MSW fixture accounts; selection local-only ("real account-scoped data arrives later", :22-25) |
| Settings → Account card | `components/settings/cards/account-card.tsx:144-173` | same fixtures; note "Broker connections… are managed in Integrations" |
| Sizer / live-calc balance | `lib/api/queries/catalogs.ts:72-81` (`useCurrentBalance`) | client-derived `startingBalance + Σ netPnl` from MSW fixtures |
| Monitoring `BrokersPanel` | `components/monitoring/monitoring-panels.tsx:451-503` | derived from the **simulated integration engine**, two mock layers away from any broker |
| Security `ConnectedAccountsPanel` | `components/security/security-panels.tsx:810-862` | hub state (vault refs, masked hints) |
| Oryon `AccountContextRow` | `components/oryon/oryon-lower-panel.tsx:365-411` | MSW `GET /broker/session` → hardcoded honest `NOT_CONFIGURED` |
| Integration Hub | `components/integrations/*` | simulated connect flow (vault reference, demo beats) — **different domain** |

### 4.2 Data-integrity traces (fixture → rendered pixel) — VERIFIED IN SOURCE

- **Chain A (balance):** `mocks/fixtures/catalog.ts:136-170` (`"Deriv Live"` startingBalance 10,000 USD) → `mocks/fixtures/generate.ts:191-202` → `mocks/store.ts:283-284` (`currentBalance()`) → MSW handler `mocks/handlers/catalogs.ts:39-46` (`GET /accounts`) → `useAccounts` + `useStatsOverview` → `useCurrentBalance` → `trade-form.tsx:154` (position sizer). **Flag: no "demo data" marker anywhere on this chain.**
- **Chain B (connection status):** `mocks/integration-engine.ts:672-689` + engine state → MSW `handlers/integrations.ts:23-30` → `useIntegrationsOverview` → `mocks/monitoring-engine.ts:772-808` (`brokers()`) → Monitoring `BrokersPanel` badges ("CONNECTED", "Last sync 12s ago"). **Flag: visually indistinguishable from real broker telemetry.**
- **Chain C (broker session):** `mocks/handlers/broker.ts:16-31` → hardcoded `{ state: "NOT_CONFIGURED", account: null, positions: [], lastSyncAt: null }` → 15 s poll (`queries/broker.ts:19-22`) → Oryon row. **Honest by construction** — the model to preserve.

**Mode wiring (critical operational fact):** `lib/api/mode.ts:15-17` — `API_MOCKED = NEXT_PUBLIC_API_MOCKED !== "false" && NEXT_PUBLIC_API_LIVE !== "true"`. `apps/web/.env.local` **does not exist** (verified) → **the web app currently runs 100% on MSW**. A verified live bridge exists (`NEXT_PUBLIC_API_LIVE=true` → `/api/v1` proxy → :4000, `next.config.ts:23-29`; `curl :4000/api/v1/auth/me` returned 401 this session — server up, auth-gated).

### 4.3 Contract readiness vs UI readiness

`packages/shared/src/schemas/trading-account.ts` is a complete, UI-ready contract **unused by the web app**: connect input (providerId, environment, externalAccountId, displayName, credentials `{method: "API_KEY", secret}`), reconnect, connection view with `credentialsHint` only, sync-run views, snapshot (balance/equity/unrealizedPnl/margin/freeMargin/marginLevel, all nullable), details, 4-check test response, "history preserved" disconnect, rename-only PATCH, 13 stable `TRADING_ERROR_CODES`. Frontend wiring: **zero** `apiPaths`, hooks, MSW handlers, or forms for it.

### 4.4 Design-system reusability — VERIFIED IN SOURCE

Operative theme is "Le Registre" (`DESIGN.md`, `app/globals.css`): dark navy `#0E1116`, single cobalt accent `#4E6EE0`, JetBrains Mono for all numerals, no glow/gradient; an opt-in Euforia brand kit (deep navy `#020617`, violet `#8B5CF6`, cyan `#22D3EE`, two gradients) exists at `design-system/brand.ts` + `design-system/euforia.css` and is explicitly "opt-in styling only". Reusable primitives for Accounts (~80% of what's needed): shadcn base kit (`components/ui/*`), `settings-primitives.tsx` (`SettingsCategoryCard`, `ConfirmDialog` with `requireTyped`, `SettingsCardSkeleton`), **monitoring primitives** (`StatusBadge`, `FreshnessBadge`, `MetricLine`, `ageLabel`/`ageFromIso`, `useNowClock`), security patterns (`ReAuthDialog`, `SecretOnceDialog`, masked hints), hub connect-dialog patterns. **Missing primitives to build:** provider picker, environment segmented control (DEMO/LIVE/PROP), credential secret input with show-once, connection-test checklist renderer, sync-progress row, account card with Demo/Live stamping. Responsive conventions: Tailwind `sm/md/lg`, `useIsDesktop` (1024 px) dialog↔sheet switching, mobile bottom-nav. i18n: EN-only typed dictionaries (`i18n/config.ts:15-17`) — new copy must go into a `dict.accounts.*` namespace.

---

## 5. NestJS Backend Audit

Full inventory in §3; backend-only findings summarized here. **Architecture shape:** flat application services + one repository + thin controllers (the repo's established supporting-context discipline), `AccountsRepository` as the only Prisma touchpoint and the "narrow read contract" consumed by Monitoring/Trades/OCR. **Application service** (`trading-account.service.ts`, 702 LOC): reads (list/getDetails/listDetails/snapshot/syncStatus/positions/orders/deals), lifecycle (connect with environment check + duplicate check + audit event + best-effort initial sync; testConnection with 4 named checks; reconnect with 409 `ALREADY_CONNECTED`; disconnect preserving history; synchronize), broker session assembly, IDOR-safe `loadOwned` gate on every operation. **Sync service** (`trading-sync.service.ts`, 324 LOC): §3.3. **Registry** (`provider-registry.service.ts`): unknown provider → 422 `UNSUPPORTED_PROVIDER`; production without the mock → honest 422 on connect. **Rate limiting:** connect 5 / reconnect 5 / sync 20 per 15 min per user (in-memory sliding window over `AuthRateLimiterService`), 429 + `Retry-After`; global IP Throttler beneath. **Audit events:** `TRADING_ACCOUNT_CONNECTED | CONNECTION_FAILED | DISCONNECTED | SYNC_FAILED` on the shared append-only `SecurityEvent` ledger, recorded without secrets. **Error model:** adapter-level `ProviderError` (7 codes, sanitized messages) → `normalizeProviderError` → stable wire codes `TRADING_ERROR_CODES` (13 codes with documented HTTP mapping: 422 client-fixable, 409 conflicts, 429 rate, 502 provider-side) → `ExternalProviderError` 502 "never leaks provider internals". Timeout seam `withProviderTimeout` on every adapter call. `VERIFIED IN SOURCE`.

**Capability model:** `tradingProviderCapabilitiesSchema` = `{ account, snapshot, positions, orders, deals, history }` booleans on the descriptor (`packages/shared/src/schemas/trading-account.ts:99-123`) + `isMock` flag + `supportedPermissions` (READ_* only, 7 values) + `supportedConnectionMethods` (currently `["API_KEY"]` only). **No STREAMING_* capability exists.** Capability booleans are declared but **never enforced on a call path** (only the all-true mock is registered) — an untested honest-degradation path.

---

## 6. Database and Domain Audit

### 6.1 Account-domain models — VERIFIED IN SOURCE (schema.prisma) + VERIFIED BY RUNTIME (information_schema)

Seven tables created by migration `20261003115414_accounts_connectivity` (206 lines), all FK-cascading to `User`/`TradingAccount`:
- `TradingAccount` — identity; `startingBalance Decimal(18,8)`; unique `(userId, providerId, externalAccountId)`; `propConfig Json?`
- `TradingConnection` — 1:1; `credentialsEnc` (AES-256-GCM, `@default("")`), `credentialsHint`, `permissions String[]`, `lastError`, `lastConnectedAt`, `lastSyncAt`; index `(providerId, status)`
- `TradingAccountSnapshot` — `accountId @unique` (**latest-only**); balance/equity/unrealizedPnl/margin/freeMargin/marginLevel `Decimal(18,8)?`; `syncedAt`, `syncRunId`
- `TradingPosition` — unique `(accountId, externalPositionId)`; volume/entry/current/SL/TP/profit/swap/commission `Decimal(18,8)?`
- `TradingOrder` — unique `(accountId, externalOrderId)`
- `TradingDeal` — unique `(accountId, externalDealId)`; `positionId` (MT5 netting link); index `(accountId, positionId)`
- `TradingSyncRun` — status/trigger/startedAt/finishedAt/durationMs/upsert counts/errorCode/requestId; **DB-only partial unique index** on `accountId WHERE status='RUNNING'` (verified present at runtime)

### 6.2 External vs canonical boundary — VERIFIED IN SOURCE

Three-layer separation is real: external state (`TradingAccountSnapshot` latest-only, `TradingPosition/Order`), external deals (`TradingDeal`, idempotent upserts), canonical trade (`Trade` with `@@unique([accountId, externalRef])` and `@@unique([accountId, externalPositionId])`; legs in `TradeExecution` with `@@unique([accountId, externalDealId])`). "Live floating values are NOT copied into the journal (§11)" (`trade-reconstruction.service.ts:309-313`). Reconstruction is idempotent (skips already-journaled deals, never resurrects soft-deleted trades, Decimal-exact correction detection). Partial closes: supported (EXIT legs, scale-in, FIFO walk, `TradeExit`, `closedQuantity`). Reopen: `TradeEvent` declares `REOPENED` but **no code writes it** — declared vocabulary only.

### 6.3 Decimal discipline — VERIFIED IN SOURCE + RUNTIME

House convention "Money/prices/quantities → Decimal(18,8), string wire format" is honored essentially everywhere: all Trading* monetary columns are `numeric` at runtime; wire values are decimal strings; derived unrealized PnL uses `Prisma.Decimal`. The single `Float` in the schema is `OcrRecognitionGroup.fusionConfidence` (0–100 score, not money) — acceptable. **No Float is used for money, prices, volumes, or P&L.**

### 6.4 Drift and dead generations — VERIFIED IN SOURCE + RUNTIME

- **Schema/DB drift:** `TradingDeal.externalPositionId` exists in DB (migration `20261003131801_trading_core` L23-26, verified at runtime) but **not** in `schema.prisma` (the model only has `positionId`).
- **Two Integration generations:** the **wired** Hub uses `IntegrationRow` (kind-discriminated JSONB row-store); a **normalized generation 2** (`IntegrationConnection` with `credentialsVaultRef`, `IntegrationEvent`, `IntegrationError`, `IntegrationWebhookEndpoint` with `secretEnc`, `IntegrationWebhookDelivery` with `(endpointId,eventId)` idempotency) is modeled + migrated but **wired to nothing** — its infrastructure services (`WebhookSecretService`, `IntegrationRateLimiterService`) are orphaned dead code (repo-wide grep: referenced only by their own files).
- **42 un-modeled tables** exist in `public` (Academy ×13, session_live ×7, full_coverage remainder, duplicate `EcoEvent`) — all 0 rows, un-consumed (matches worklog:1274).
- **Live DB state (runtime):** 122 user tables; all account/connectivity tables **0 rows**; only `User` (1) and `Instrument` (7) carry data. The accounts domain is fresh/unused in the dev database.

### 6.5 Snapshots — verdict

`TradingAccountSnapshot` exists with timestamp + source metadata (`syncedAt`, `syncRunId`) but is **upserted latest-only** — there is **no historical snapshot series**. If the product wants equity curves from connectivity data, that history is MISSING (currently by design per §25 comment; `@@index([accountId, syncedAt])` is redundant given the unique — cosmetic).

---

## 7. End-to-End Data Flow (verified traces)

**Representative flow — manual sync (backend, real):** `POST /api/v1/accounts/:id/sync` → global JwtAuthGuard (session-checked) → `AccountsController.synchronize` → per-user rate limit (20/15 min, 429+Retry-After) → `loadOwned` (ownership in WHERE; foreign id → 404) → `TradingSyncService.synchronize` → `startRun` (partial-unique guard; concurrent → 409) → `executeSync`: `ProviderRegistryService.get` → adapter `fetchSnapshot/fetchPositions/fetchOrders/fetchDeals` under `withProviderTimeout` → zod normalization boundary (invalid → 502 `INVALID_PROVIDER_RESPONSE`) → **one transaction** `persistSyncResult` (upserts by external ids) → run `COMPLETED` with counts → wire views (`toSnapshotView`, `toAccountDetails`) → react-query client. With the only registered adapter being the mock, every real value on this path is simulated — by design and labeled (`isMock: true`).

**Representative flow — what the UI shows today (frontend):** §4.2 Chains A/B/C — all MSW; the only honest-by-construction account surface is the Oryon broker-session row. The real backend flow above is **not reachable from the UI** (no client wiring, mock mode default).

**Gap between the two flows:** the connect form → `tradingAccountConnectInputSchema` → `POST /accounts` → connect use case → adapter `testConnection`+`fetchAccountInfo`+`fetchSnapshot` → `createAccountWithConnection` (one transaction) → audit event → best-effort initial sync — this entire backend chain exists and is e2e-tested, but has **no UI**.

---

## 8. Provider Feasibility Matrix

Research performed **2026-10-13** against official/authoritative sources; confidence per the spec's scale. Cells that could not be verified from an official source are marked UNKNOWN rather than guessed.

| Field | **MT5 (MetaTrader 5)** | **IC Markets** | **OANDA** | **TradingView** | **cTrader** | **Deriv** (in-repo catalog) |
|---|---|---|---|---|---|---|
| Provider / variants | MetaQuotes platform; brokers ship MT5 servers | Broker (Raw Trading Ltd, "IC Markets Global"); platforms: MT4, MT5, cTrader, TradeLocker | Broker; own v20 REST API (live + practice) | Charting/social platform + broker-integration host | Spotware platform; brokers offer cTrader accounts | Deriv (crypto/derived indices broker) |
| Connection method | **No official cloud REST API.** Official paths: (1) MetaTrader5 Python module — requires a locally-running terminal, official quick-start is Windows-based; (2) broker-side gateway; (3) third-party cloud bridge (MetaApi) | No direct broker API — connectivity must go **through a platform** (MT5 → see MT5 column; cTrader → Open API) | **Official REST v20** (`/v3/accounts`, positions, orders, transactions) + streaming pricing | **No official API for reading a user's broker account.** Developer surface is charting (Charting Library/widgets); broker links are TradingView-side partnerships | **Official cTrader Open API** — OAuth 2.0 authorization-code flow; official client libraries | **Official API** (websocket-first) with real-time pricing, portfolio data, trade execution |
| Authentication | Terminal login (account+password+server) per session; Python `initialize/login` | inherits platform (MT5 terminal creds / cTrader OAuth) | Personal access token (Bearer) — official docs portal | N/A (no API) | OAuth 2.0 (verified on official help center) | API token / OAuth (official docs) |
| Account metadata | `account_info()` (Python) / adapter-dependent | via platform | VERIFIED portal exists (developer.oanda.com/rest-live-v20 — fetched 2026-10-13); endpoint specifics per official docs | UNSUPPORTED | via Open API (ProtoOAAccountListByAccessToken) | VERIFIED official page (api.deriv.com — fetched 2026-10-13): "portfolio data" |
| Balance/equity | `account_info()` fields (balance, equity) | via platform | Supported (accounts summary) | UNSUPPORTED | via Open API | Supported (official page) |
| Margin values | via platform/terminal | via platform | Supported | UNSUPPORTED | via Open API | Supported (official page) |
| Open positions | `positions_get()` | via platform | Supported (open positions endpoint family) | UNSUPPORTED | via Open API | Supported |
| Pending orders | `orders_get()` | via platform | Supported | UNSUPPORTED | via Open API | Supported |
| Deals/history | `history_deals_get()` (also `history_orders_get`) | via platform | Supported (transactions endpoints) | UNSUPPORTED | via Open API | Supported (statement/transactions) |
| Streaming | None native from Python/terminal polling; MetaApi offers streaming (third-party) | inherits platform | Streaming pricing documented (v20 pricing stream section; **specific rate-limit numbers not verified this audit**) | Market data ≠ account access | Open API supports subscriptions (details per official docs) | Real-time via websocket (official page) |
| Rate limits | UNKNOWN (no official published REST limits — no official REST exists) | UNKNOWN | Documented by OANDA (exact figures **not verified** in this audit — portal fetch confirmed docs existence, not every page) | N/A | Documented by Spotware (not fetched this audit — mark partially verified) | Documented by Deriv (not fetched in detail) |
| Required infrastructure | **A running MT5 terminal connected to the broker** (Windows-oriented; Linux via Wine is community territory — not official). Or a third-party bridge service (external dependency, cost, credentials shared with a third party) | Whichever platform the account uses | **None beyond HTTP** — plain REST + token | — | OAuth app registration (Spotware developer portal) + REST/websocket client | HTTP/Websocket client only |
| Operational constraints | Unattended terminal hosting (Linux sandbox lacks official support); terminal closed = no data; one terminal manages the accounts logged into it | Same constraints as underlying platform | Region/entity differences (live vs practice hosts); token revocation | Cannot be delivered via TradingView itself | OAuth token lifecycle | Crypto-focused; not an MT5-style FX broker |
| Security constraints | Broker credentials in a terminal/bridge; third-party bridge sees credentials | inherits platform | Read-only token scope possible; token never leaves server | — | OAuth scope; refresh handling | Token scope |
| Implementation status in Euforia | Catalog entries (`mt5-bridge`) in the simulated Hub; **no adapter, no SDK dep** | Hub catalog entry only | None | Hub catalog entry only (`tradingview`); display-charts domain unrelated | Hub catalog entry (`ctrader`) with demo "expired credentials" beat | Hub catalog entry (`deriv`); market-service has REAL Binance data (different provider) |
| Feasibility | **Feasible with constraints** (terminal/bridge required; choice = OPEN QUESTION) | **Feasible via platforms only** — not as a standalone integration | **Feasible — cleanest official path** | **UNSUPPORTED for account sync** (legitimate alternative: connect underlying broker) | **Feasible** (official OAuth API; requires extending `supportedConnectionMethods` beyond `["API_KEY"]`) | **Feasible** (official API; read-only subset used) |
| Evidence (checked 2026-10-13) | metatrader5.com (official site); mql5.com/en/docs/python_metatrader5 (official Python module: `account_info`, `positions_get`, `orders_get`, `history_deals_get`, `order_send` — note execution methods exist, read-only discipline mandatory) | ic.com ("IC and IC Markets Global are the trading names of Raw Trading Ltd"; Standard/Raw Spread **cTrader** accounts documented) | developer.oanda.com/rest-live-v20/introduction/ (portal live; title "Introduction" fetched) | tradingview.com/brokers/ (broker directory/reviews — a partner surface, not an account API); no official account-data API found on official channels | help.ctrader.com/open-api/ ("Getting started - Open API" fetched; official help states Open API auth is based on OAuth 2.0) | api.deriv.com (official: "real-time pricing, trade execution, portfolio data") |
| Confidence | Verified (module surface) / partially verified (hosting constraints) | Partially verified (platform list) | Partially verified (portal verified; sub-pages not exhaustively fetched) | Partially verified (absence claims are hard to prove; no official API found) | Verified (official docs portal + OAuth statement) | Verified (official page) |

**Third-party MT5 bridge (MetaApi):** metaapi.cloud + metaapi.cloud/docs/client (fetched via search 2026-10-13) — a commercial cloud service exposing MT4/MT5 over REST/streaming; its own docs describe the raw API as broker-oriented with a client SDK for developers. It is **third-party** (not MetaQuotes, not the user's broker): account credentials would be shared with that service, it adds cost and an external availability dependency. Viable, but a product decision — see §17.

---

## 9. Real-Time and Synchronization Audit

**What exists — VERIFIED IN SOURCE.** Sync triggers: `INITIAL` (best-effort inside connect/reconnect) and `MANUAL` (`POST sync`) **only** — the trigger enum is `["INITIAL","MANUAL"]` (`trading-account.ts:74`). There is **no scheduler, no queue, no cron** in the API (`@nestjs/schedule`/`bullmq`/`ioredis` absent from manifests and lockfile importers; the only background timer in the API is the OCR retention sweep). Monitoring itself records the honest evidence string: *"no scheduler in this build"* (`monitoring.service.ts:768`). Per-call timeout seam (10 s default). Single-runner enforcement via DB partial unique index (409 `SYNC_ALREADY_RUNNING`). Atomic write-set per run. Idempotent upserts by `(accountId, external*Id)` — repeated syncs are idempotent (asserted by e2e and unit tests). **No delta cursors / watermarks in the accounts context** (full refresh per run) — the Hub's simulated `syncCursor`/backoff belongs to the other bounded context. **No heartbeat/prober:** liveness is *inferred* — `deriveSynchronizationStatus` (mappers.ts:92-106) yields `UNKNOWN/SYNCING/LIVE/STALE/ERROR` with a 15-min freshness TTL; an active TCP connection is explicitly NOT treated as data-currency. `DELAYED` is reserved in the schema but never produced.

**Realtime transport — VERIFIED IN SOURCE.** The API has **no WebSocket gateway and no @Sse** for accounts (zero `@WebSocketGateway` hits; SSE exists only in OCR controllers as manual `text/event-stream`). The only WS server is `mini-services/market-service` (socket.io :3003, authenticated handshake, real Binance public data with REST fallback + backoff ladder, **mock token verifier** with a production boot-guard). The web client polls `GET /broker/session` every 15 s (react-query, visibility-gated). Native frontend integration points for future push: `useSyncExternalStore` store pattern (already used for the positions stream) or `queryClient.invalidateQueries(queryKeys.accounts/brokerSession)`.

**Kinds of updates (§10.1):** the system distinguishes connection-health changes (connection status enum) from data currency (sync status axis) — orthogonal by design — but does not yet differentiate per-object freshness beyond account-level `lastSyncAt`. Provider-specific latency classes are not modeled.

**Reconnection/recovery (§10.3):** manual re-trigger only; stale marking via TTL; duplicate prevention via unique constraints; missed-change reconciliation = full refresh. Persistent failures surface via connection `ERROR` + Monitoring `AUTH_FAILED`/`DEGRADED` mapping. No automatic resume/backoff for accounts (by design in V1).

---

## 10. Security and Read-Only Audit

**Credential storage — VERIFIED IN SOURCE.** AES-256-GCM (`infrastructure/crypto/aes-gcm.ts:18-40`): random 12-byte IV, `v1.<iv>.<tag>.<data>` base64url envelope, tamper → decrypt returns `null` (unit-tested: roundtrip, fresh IVs, tamper, wrong key, malformed — 5/5 passed this audit). Domain-separated keys: `ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY` for `TradingConnection.credentialsEnc` (32-byte base64 enforced at env schema), `AUTH_MFA_ENCRYPTION_KEY` for TOTP secrets, `INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY` declared. Secrets **never returned**: mapper layer is the only row→wire translator; connection views expose `credentialsHint` (`••••`+last4) only; responses re-`parse`d against wire schemas at controller level. Disconnect wipes `credentialsEnc`/`credentialsHint` while preserving history. pino redaction at the root logger (`req.body.secret`, `*.credentials`, `*.token`, `*.password`, `*.apiKey` → `[Redacted]`). Account/integration log calls emit only ids/counts/error codes; e2e asserts secrets never appear in any response surface and provider failure messages are sanitized. **Key rotation: NOT implemented** (`v1.` prefix is version-ready; no key-id, no re-encrypt path; `CREDENTIAL_ROTATED` vocabulary exists only in the unwired generation).

**Read-only enforcement — VERIFIED IN SOURCE.** `TradingProviderAdapter` intentionally exposes NO execution methods ("not even unused ones", provider.types.ts:9-19). Permissions vocabulary is READ_* only and always derived from the adapter descriptor — "the client can never grant them". No schema/endpoint for order placement/modification/closing exists (shared contract red-line comments; repo-wide grep for `placeOrder|createOrder|closePosition|modifySl|cancelOrder|submitOrder` → single hit = the red-line comment itself). The e2e "EXECUTION RED LINE" test asserts 404 on five write paths — **passed 35/35 this audit**. Journal-side guard: broker-synced trades refuse MANUAL close.

**Ownership/IDOR — VERIFIED IN SOURCE.** Global `JwtAuthGuard` (APP_GUARD) + session revocation check; no accounts/integrations/broker route is `@Public`. Ownership is part of every lookup: `findAccountForUser(accountId, userId)` (foreign id → 404), `loadOwned` gate on all reads/writes, `renameAccount` via `updateMany({ where: { id, userId } })`, sync-run feeds scoped `where: { account: { userId } }`. The connect payload has **no userId field** — principal only. e2e covers cross-user isolation (read/sync/test/disconnect all 404 for user B on user A's account; broker session never leaks another user's account). **No IDOR found.**

**Findings requiring remediation (see §13 for severity):**
1. The wired Integration Hub persists demo secrets **plaintext** in `IntegrationRow.data` (`DEMO_WEBHOOK.secret "whsec_demo_…"`, fake `${providerId}-secret-…` derivations) while `WebhookSecretService` (which would encrypt into `IntegrationWebhookEndpoint.secretEnc`) sits **unwired**. Demo material, real table, absent at-rest encryption.
2. `TradingAccountsController` is implemented but unregistered (dead surface carrying the richer PATCH/test/reconnect aliases).
3. No per-route capability enforcement path exists yet (untestable until a second adapter registers).

---

## 11. Testing and Verification Evidence (commands actually executed during this audit)

| # | Command (cwd) | Result | What it proves |
|---|---|---|---|
| 1 | `git status --short`, `git diff --stat`, `git diff --cached --stat` | clean, empty | §4 safety: no user work at risk; HEAD `5f82266` |
| 2 | `npx vitest run test/unit/{mock-trading-provider,sync-status,aes-gcm,error-mapper,trade-reconstruction,integrations-hub}.spec.ts` (apps/api) | **6 files, 81/81 passed** (8.10 s) | mock adapter read-only permissions + payload validity + idempotency + sanitized errors; sync-status truth table; AES-GCM properties; error taxonomy; deals→trades reconstruction; hub domain contracts |
| 3 | `npx vitest run test/e2e/accounts.e2e.spec.ts` (apps/api; real migrated test DB via global-setup) | **35/35 passed** (10.6-10.7 s, two runs) | full accounts lifecycle over HTTP: auth boundary, connect, 409 duplicates, failure normalization (422/502×3), sync idempotency, 409 concurrent, NOT_CONNECTED, auth-failure → ERROR, IDOR 404s, secret redaction, execution red-line 404s, 429+Retry-After, audit events |
| 4 | `npx vitest list test/e2e/accounts.e2e.spec.ts` | listed all tests | file parses (see below) |
| 5 | Read-only Prisma queries via `scripts/audit-db-readonly.mjs` (information_schema + counts) | 122 tables; account tables 0 rows; column types `numeric`/`uuid`/`text` as expected; partial unique index present | runtime schema facts (§6) |
| 6 | `curl :4000/api/v1/auth/me` | 401 | API up, auth-gated |
| 7 | Provider doc fetches (page_reader) — developer.oanda.com, help.ctrader.com, api.deriv.com, mql5.com, tradingview.com, metaapi.cloud | contents captured | §8 evidence |

**The refuted finding (verification discipline in action).** A deep-audit sub-agent reported a syntax error in `test/e2e/accounts.e2e.spec.ts:742` ("`for (const ethod, url] of [`"), verified via byte dumps. Initial re-checks through `sed|cat -A` and a Python `repr()` appeared to **confirm** it — but `vitest list` and two full e2e runs passed, and a byte-exact counter settled it: `OCC_CLEAN = 3, OCC_BROKEN = 0, HAS_ESC = 0`. **The file is intact; the apparent corruption was an artifact of the shell-output channel, which strips the literal three-character sequence `[m`** (an over-eager ANSI-sanitizer — outputs containing `[m` are displayed missing those bytes, while the Read tool's channel renders them correctly). Consequence recorded for future sessions: **trust the Read tool over raw shell echoes when outputs contain `[m`-style sequences, and settle byte questions with counts/booleans, not echoed text.** (The investigation did clear and regenerate the Vite transform cache — a gitignored, auto-regenerated artifact.)

**Remains unverified.** Real-provider connectivity (nothing in this audit contacted a broker — by mandate); OANDA/cTrader/Deriv sub-page details (rate-limit figures, exact endpoint sets); capability-gated degradation paths (no second adapter exists); deals→journal reconciliation over live HTTP (`TradingController` unwired); frontend consumption of the accounts backend (no wiring exists).

---

## 12. Capability Classification (consolidated)

| Class | Items (evidence anchor) |
|---|---|
| **KEEP** | Read-only adapter port + capability descriptors + mock gating (`provider.types.ts:136`, `accounts.module.ts:49`); account/connection/snapshot/sync-run separation + orthogonal lifecycle enums; AES-GCM vault with domain-separated keys; transactional sync write-set + partial-unique runner guard; ownership-in-WHERE + principal-only flows; honest-null discipline end-to-end; broker-session honesty (`NOT_CONFIGURED`); Decimal(18,8) + string wire; error taxonomy + sanitization + timeout seam; SecurityEvent audit ledger; Oryon `AccountContextRow` pattern; monitoring primitives for status/freshness UI |
| **REUSE** | Calendar `provider.port.ts` port/Symbol-token pattern for future adapters; `AuthRateLimiterService` base (consolidate the Hub's inline reimplementation); `withProviderTimeout` + normalization boundary for every new adapter; Monitoring's narrow-contract consumption pattern; `tradingAccountConnectInputSchema` and the whole unused shared contract for the frontend; live-mode bridge (`NEXT_PUBLIC_API_LIVE`); generation-2 Integration models (encrypted webhook secrets, idempotent deliveries) once wired |
| **IMPROVE** | Monitoring `SUCCESS`→`COMPLETED` mismatch (`monitoring.service.ts:325,389`); register or delete `TradingAccountsController`; encrypt Hub secrets (wire `WebhookSecretService`); merge the two Hub provider catalogs (runtime vs domain copies); reconcile `TradingDeal.externalPositionId` schema drift; `listDetails` N+1 (fine at V1 counts); persist/derive `PARTIAL` run status or drop it; dedupe redundant snapshot index; add `dict.accounts.*` i18n namespace instead of hardcoded literals |
| **MISSING** | Any Accounts UI (route/nav/connect flow/detail view/hooks/handlers); real provider adapters (all contexts); scheduled/background sync; server-side push (WS/SSE) for account state; delta cursors + retry/backoff; capability-gated error path (`UNSUPPORTED_CAPABILITY`); connection heartbeats; historical snapshot series (if equity curves are wanted); key-rotation support; live HTTP trigger for deals→journal reconciliation; Demo/Live visual semantics; sidebar Accounts entry (2 dead links exist today) |
| **MOCKED** | `MockTradingProviderAdapter` (only registered adapter; env-gated, `isMock: true`); Integration Hub runtime (simulated beats/latency/credentials — 12 catalog providers have **no adapters behind them**); MSW fixture accounts shown unmarked in risk-relevant UI; market-service auth verifier (mock JWT seam; its Binance market data is real) |
| **UNSUPPORTED** | TradingView account synchronization (no official API; alternatives: underlying broker); any execution surface (by policy — red line held); streaming capabilities (none declared anywhere server-side) |
| **DEFER** | Account deletion semantics (explicit V1 product decision, `trading-account.service.ts:531-536`); route unification of trades surfaces (Phase-12 note); session-oriented adapter methods (documented, not speculative); retention cron; 42 un-modeled generation tables (model or drop); multi-portfolio desk contract (`schemas/portfolio.ts` — authored, unconsumed) |

---

## 13. Architecture Risks (ranked)

| Severity | Risk | Impact | Mitigation (recommended, not implemented) |
|---|---|---|---|
| **HIGH** | Mock/fixture account data rendered in risk-relevant UI with no marker (Sizer balance Chain A; Monitoring telemetry Chain B) | Users can mistake fixture numbers for real equity/telemetry; violates the product's own honesty bar | Never wire the sizer to fixtures once snapshots exist; add explicit demo-data markers to any pre-integration display; keep the Chain C honesty model as the template |
| **HIGH** | Zero real connectivity + manual-only sync means "health/freshness" is meaningful only after user action | Product promise ("reliable updates") not yet deliverable; stale data can look live (LIVE status only means "synced < 15 min ago") | Phase roadmap §16: scheduled sync before any "live" marketing; keep `STALE`/`UNKNOWN` visible |
| **MEDIUM** | Monitoring misreports sync health (`SUCCESS` filter vs `COMPLETED` reality) | Ops blindness: successCount always 0, latency always null — first real integration would look broken | One-line fix + test, fold into Phase 01 |
| **MEDIUM** | Dead `TradingAccountsController` surface | Contract drift risk: two intended public shapes, one live; the richer PATCH/test/reconnect aliases are unreachable | Register or delete in Phase 01; document the chosen canonical surface |
| **MEDIUM** | Hub demo secrets plaintext in `IntegrationRow.data`; encryption service orphaned | At-rest exposure pattern normalized; bad precedent before real secrets arrive | Wire generation-2 encryption before ANY real credential touches the Hub |
| **MEDIUM** | Capability gating never exercised (single all-true mock) | First real adapter may reveal honest-degradation bugs late | Phase 02: add a "capability-poor" test adapter + contract tests |
| **MEDIUM** | MT5 hosting constraint (terminal required; Linux sandbox lacks official support; third-party bridge = credentials to external service) | The flagship provider may be blocked or require an external dependency decision | Resolve OPEN QUESTION (§17) before Phase 03; do not design around an undocumented API |
| **LOW** | `TradingDeal.externalPositionId` schema↔DB drift; 42 orphan tables; redundant index | Reconciliation surprises in future migrations; cognitive load | Schema alignment + catalog cleanup in a hygiene pass |
| **LOW** | In-memory per-user rate limiters (multi-instance unsafe) | Limits reset per instance at scale | Acceptable now; move to shared store when horizontally scaling |
| **LOW** | `listDetails` N+1 | Latency at >dozens of accounts | Batch load when list page ships |

---

## 14. Proposed Target Architecture (PROPOSAL — not current reality)

The real architecture (§2-§6) already matches the intended shape; the proposal is **extension, not rebuild**:

```text
┌─ Next.js (apps/web) ──────────────────────────────────────────────┐
│  /accounts page (list • connect wizard • detail drawer)           │
│  AccountSwitcher ← real snapshot balance; Demo/Live stamps        │
│  hooks: useTradingAccounts/useConnect/useSync (react-query)       │
│  MSW handlers mirroring trading-account.ts (mock parity)          │
└──────────────┬────────────────────────────────────────────────────┘
               │ /api/v1/*  (live bridge when NEXT_PUBLIC_API_LIVE)
┌─ NestJS (apps/api) ───────────────────────────────────────────────┐
│  AccountsController (+ decide /trading-accounts fate)             │
│  TradingAccountService • TradingSyncService • Registry            │
│  TradingProviderAdapter port (READ-ONLY, capability descriptors)  │
│   ├─ MockTradingProviderAdapter (env-gated, kept)                 │
│   ├─ [P1] OandaAdapter        (REST v20 + token)                  │
│   ├─ [P2] CTraderAdapter      (Open API + OAuth — needs method    │
│   │                            enum extension beyond API_KEY)     │
│   ├─ [P3] Mt5BridgeAdapter    (pending OPEN QUESTION)             │
│   └─ [P4] DerivAdapter        (official WS API)                   │
│  normalizer (zod) → persistSyncResult (1 tx) → Trading* tables    │
│  [later] scheduler (@nestjs/schedule) → periodic sync runs        │
│  [later] SSE/WS push or react-query invalidation on sync          │
└────────────────────────────────────────────────────────────────────┘
```

Domain boundaries preserved: External Broker State ≠ External Deal ≠ Canonical Trade; Accounts stays owner of connectivity/normalization/persistence; Hub stays the simulated demo context (until generation-2 is deliberately wired); Monitoring keeps reading the Accounts narrow contract. Data-return path identical to today's (adapter → normalize → use case → repository → contract → frontend), with real adapters swapping in behind the same port.

---

## 15. Recommended Provider Implementation Order

1. **OANDA** — only provider with a clean, official, HTTP-only path matching the current `API_KEY`-token model; token auth; read endpoints for accounts/positions/orders/transactions; no hosting constraints. Lowest risk first real adapter; exercises capability gating with a genuinely partial provider.
2. **cTrader (Open API)** — official OAuth 2.0 API; covers IC Markets users on cTrader accounts too (one connector, two logos). Requires extending `supportedConnectionMethods` (OAuth) and refresh-token handling — a deliberate contract evolution, well isolated.
3. **Deriv** — official websocket API already mirrored by a Hub catalog entry; crypto users; read-only subset; low hosting complexity.
4. **MT5** — blocked on the §17 decision: (a) self-hosted terminal bridge (official but Windows/terminal-hosting heavy; not viable in this Linux sandbox without documented workarounds), (b) third-party cloud bridge (MetaApi — fast but external credential/cost/availability dependency), or (c) defer. **Do not** fabricate an MT5 path around undocumented endpoints.
5. **IC Markets** — delivered *through* its platforms (cTrader connector in #2 covers Raw Spread accounts; MT5 accounts ride the MT5 decision). Not a standalone integration.
6. **TradingView** — unsupported for account sync; legitimate alternative = connect the underlying broker directly. Charting display needs are already served by the Oryon chart engine.

Rationale: user workflow first (MT5-style retail traders dominate the target audience, but the MT5 decision is genuinely open), official-API availability, testability, security posture, hosting fit with the current sandbox (Linux, no Windows terminal).

---

## 16. Subsequent Phased Roadmap (recommendation based on findings)

| Phase | Objective | Scope | Dependencies | Deliverables | Tests | Exit criteria |
|---|---|---|---|---|---|---|
| **01 — Accounts UI + hygiene** | Make the existing backend visible and usable | `/accounts` route + sidebar entry; list, connect wizard (provider → environment → external id → credential), detail drawer (snapshot/positions/orders/deals/sync runs), rename, test, reconnect, disconnect confirm; MSW parity handlers; fix Monitoring `SUCCESS`→`COMPLETED`; register-or-delete `TradingAccountsController`; fix the 2 dead links; `dict.accounts.*` namespace; demo-data markers on fixture-driven surfaces | none (backend complete) | working Accounts module in web; hygiene PRs | unit (hooks/plan logic), MSW-handler tests, Playwright probes (connect→sync→detail over mock), regression suite green | connect/sync/detail flows pass over MSW AND over live bridge against :4000; tsc/eslint/build clean; no fixture balance shown without a marker |
| **02 — First real adapter (OANDA) + OAuth groundwork** | Prove the port with reality | `OandaAdapter` (REST v20, token, read-only subset); capability-driven degradation (partial provider); schema extension `supportedConnectionMethods` (pre-work for OAuth); sandbox/practice support; e2e with recorded fixtures + optional live-sandbox smoke (manual, opt-in) | user provides OANDA practice token at validation time (never committed) | adapter + registry entry + docs | unit (normalization), e2e (failure classes: 401/429/5xx mapping), contract tests | practice-account connect→sync→journal-visible snapshot/positions/deals on a real OANDA practice account; red-line suite still green |
| **03 — Scheduled sync + freshness** | "Reliable updates" promise | `@nestjs/schedule` (or minimal interval worker) → periodic sync per account with backoff; stale marking driven by real runs; monitoring wiring for scheduler runs; cap concurrency per provider | Phase 02 | scheduler service + config per account | unit (backoff), e2e (rate-limit interplay), integration (double-run guard) | accounts refresh without user action; STALE appears when scheduler paused; no 429 storms |
| **04 — cTrader adapter (OAuth)** | Official OAuth path; covers IC Markets cTrader | Spotware Open API adapter; OAuth code exchange + refresh persistence (encrypted), token lifecycle UX (reconnect prompts) | contract method extension (02) | adapter + auth flow | unit + e2e mocked OAuth; live demo-account smoke | connect a cTrader demo account; refresh/reconnect path proven |
| **05 — MT5 decision + implementation** | Resolve the flagship-provider question | Per §17 decision: terminal-bridge service (outside sandbox constraints acknowledged) OR MetaApi integration (vendor review, credential handling review) OR documented defer | §17 resolved | chosen-path design note + adapter or defer record | per path | MT5 account visible in Euforia, or formal defer recorded |
| **06 — Deriv adapter + history depth** | Broaden coverage | Official WS adapter (read-only); historical snapshot series decision (equity curves) | Phases 02-03 patterns | adapter; snapshot-history design | as 02 | as 02 |

Each phase ends with: commands actually run + results reported, regression suites green, no fabricated data anywhere, red-line tests still passing.

---

## 17. Open Questions and External Dependencies

**Requiring the user's decision:**
1. **MT5 path** — self-hosted terminal bridge (needs a Windows/wine-capable host outside this sandbox; operational burden), third-party cloud bridge (MetaApi — external service receives broker credentials; cost; availability), or defer MT5 and lead with OANDA/cTrader? This blocks Phase 05 and shapes Phase 01-02 contract work (e.g., whether a `PLATFORM_BRIDGE` connection method enters the schema early).
2. **Provider priority confirmation** — is OANDA truly first among the user's own accounts, or does the demo/primary workflow (Deriv, per the hub fixtures and market-service's Binance) argue for reordering?
3. **Equity history** — do you want historical snapshot series (equity curves from connectivity) now, or keep latest-only (current design) until a concrete product need?
4. **Sandbox hosting constraint** — any real-adapter validation will require provider sandbox/demo credentials entered by you at runtime (never stored in the repo). OANDA practice + cTrader demo accounts are the zero-cost starting points.

**Resolvable by engineering without user input:** Monitoring status fix; controller registration decision (recommend: register + document); Hub secret encryption wiring; catalog merge; schema drift alignment; capability-gating tests with a capability-poor adapter; i18n namespace.

---

## 18. Final Recommendation

**Smallest safe next step:** **Phase 01 as scoped in §16** — build the Accounts UI against the already-complete backend (with MSW parity mirroring the shared contract), folding in the three one-line-class hygiene fixes discovered here (Monitoring status filter, `TradingAccountsController` registration, dead `/accounts` links). It requires **no new dependencies, no schema changes, no provider credentials**, delivers immediately visible product value, and creates the feedback loop (connect → sync → inspect) that every later real-adapter phase will exercise through the same UI. Meanwhile, answer the §17 MT5 question in parallel — it is the only genuine product decision blocking the connectivity roadmap.

---

## 19. Files Modified

```text
No source files modified.
No migrations created.
No dependencies installed.
```

Disclosures (non-source artifacts):
- `docs/audits/PHASE-00-ACCOUNTS-CONNECTIVITY-AUDIT.md` — this report (new file, uncommitted per Phase-00 rule "do not commit changes").
- `scripts/audit-db-readonly.mjs` — read-only diagnostic script created by the data-model audit agent (as sanctioned in its tasking); kept for reproducibility.
- `node_modules/.vite` — Vite transform cache deleted and auto-regenerated during the e2e-verification investigation (gitignored tool cache, not user work).
- `apps/api` test database (`cosmoz_test`) — rows created/destroyed by the two e2e runs (normal test-harness behavior; separate from the dev database `cosmoz`).
- `/tmp/provider-research/*.json` — provider-documentation captures (outside the repo).

---

## 20. Commands Executed and Results

| Command | Result |
|---|---|
| `git status --short` / `git diff --stat` / `git diff --cached --stat` | clean tree; no modifications; HEAD `5f82266` |
| `git log --oneline -1` / tag inspection | HEAD = `savepoint/2026-10-13` |
| `npx vitest run test/unit/{mock-trading-provider,sync-status,aes-gcm,error-mapper,trade-reconstruction,integrations-hub}.spec.ts` | **81/81 passed** |
| `npx vitest run test/e2e/accounts.e2e.spec.ts` (×2, second run after cache regeneration) | **35/35 passed** both times |
| `npx vitest list test/e2e/accounts.e2e.spec.ts` | full test list (parse OK) |
| read-only Prisma/information_schema queries (`scripts/audit-db-readonly.mjs`) | 122 tables; accounts domain 0 rows; types as declared; partial unique index present |
| `curl :4000/api/v1/auth/me` | 401 (expected — auth-gated, server up) |
| `rg`-based greps (controllers registration, `SUCCESS` literals, encryption usage, execution-method searches, catalog duplication) | evidence cited inline (§3, §5, §10, §13) |
| web fetches of official provider documentation (page_reader, 2026-10-13): developer.oanda.com/rest-live-v20/introduction/, help.ctrader.com/open-api/, api.deriv.com/, mql5.com/en/docs/python_metatrader5, tradingview.com/brokers/, metatrader5.com, metaapi.cloud/docs/client, ic.com | contents captured; cited in §8 |
| byte-exact verification of `accounts.e2e.spec.ts` (`data.count(b'const [method, url] of')` = 3; `b'const ethod, url] of'` = 0) | refuted the syntax-error claim (§11) |

**Not executed (by mandate):** any commit, any migration, any dependency install, any real-provider authentication, any order/execution operation, any source-file edit.
