# Accounts & Trading Connectivity — API Proposal

**Phase 01 deliverable (C of 5).** A future API surface proposal, consistent with the existing NestJS routing/versioning conventions. **No controllers, route handlers, DTOs, or services are implemented in Phase 01** (mandate §12/§20). Every "existing" row below is `VERIFIED IN SOURCE`; every "proposed" row is a design for a later phase.

Conventions observed in the live API (`apps/api/src/modules/accounts/`): global prefix `/api/v1`, global `JwtAuthGuard` (APP_GUARD, no `@Public` on any accounts route), thin controllers delegating to `TradingAccountService`, zod-validated bodies re-parsed at the controller boundary, stable error codes in the envelope.

---

## 1. Proposed API Capabilities

| Capability | Status today | Phase |
|---|---|---|
| List registered providers + capability metadata | **EXISTS** — `GET /accounts/providers` | — |
| Connect (register + validate + initial sync) | **EXISTS** — `POST /accounts` | — |
| List user's connected accounts (summaries/details) | **EXISTS** — `GET /accounts`, `GET /accounts/:id` | — |
| Connection health check (named 4-check test) | **EXISTS** — `POST /accounts/:id/connection/test` | — |
| Reconnect / Disconnect | **EXISTS** — `POST|DELETE /accounts/:id/connection` | — |
| Read snapshot / positions / orders / deals | **EXISTS** — `GET /accounts/:id/snapshot|positions|orders|deals` | — |
| Trigger + read synchronization | **EXISTS** — `POST|GET /accounts/:id/sync` | — |
| Broker session (honest NOT_CONFIGURED default) | **EXISTS** — `GET /broker/session` | — |
| Rename account (label only) | **EXISTS** in contract (`tradingAccountUpdateInputSchema`), exposed only on the dead `TradingAccountsController` → **PROPOSED**: register (§2) | 02-hygiene |
| Account discovery (list provider-side accounts before connect) | **PROPOSED** — only for providers whose capabilities say `accountDiscovery: SUPPORTED` (doc B §4.2) | 03+ (per provider) |
| Paginated deal/order history windows | **PROPOSED** (query params on existing GET routes) | 04 |
| OAuth callback endpoint | **PROPOSED** — only with the `OAUTH_AUTHORIZATION_CODE` method (Phase 05) | 05 |
| Request a scheduled-sync refresh / scheduler status | **PROPOSED** with the scheduler (Phase 04) | 04 |

## 2. Candidate Routes (existing surface + minimal additions)

### 2.1 Existing registered surface (unchanged)

| Method + route | Purpose | Auth | Response contract |
|---|---|---|---|
| `GET /api/v1/accounts/providers` | Provider registry descriptors | JWT (user-scoped) | `tradingProviderListResponseSchema` |
| `POST /api/v1/accounts` | Connect: test → metadata → persist → initial sync (201) | JWT + rate limit 5/15min | `tradingAccountDetailsResponseSchema` |
| `GET /api/v1/accounts` | List user accounts | JWT | account summaries |
| `GET /api/v1/accounts/:accountId` | Full details | JWT + ownership (404 foreign) | `tradingAccountDetailsResponseSchema` |
| `GET /api/v1/accounts/:accountId/snapshot` | Latest snapshot | JWT + ownership | `tradingAccountSnapshotViewSchema` |
| `GET /api/v1/accounts/:accountId/positions` | Open positions | JWT + ownership | `tradingPositionsResponseSchema` |
| `GET /api/v1/accounts/:accountId/orders` | Orders | JWT + ownership | `tradingOrdersResponseSchema` |
| `GET /api/v1/accounts/:accountId/deals` | Deals | JWT + ownership | `tradingDealsResponseSchema` |
| `POST /api/v1/accounts/:accountId/connection/test` | 4 named checks | JWT + ownership | `tradingConnectionTestResponseSchema` |
| `POST /api/v1/accounts/:accountId/connection` | Reconnect (409 `ALREADY_CONNECTED`) | JWT + ownership + rate limit 5/15min | details |
| `DELETE /api/v1/accounts/:accountId/connection` | Disconnect (wipes credentials, history preserved) | JWT + ownership | `tradingDisconnectResponseSchema` |
| `POST /api/v1/accounts/:accountId/sync` | Manual sync (409 `SYNC_ALREADY_RUNNING`) | JWT + ownership + rate limit 20/15min | `tradingAccountSyncResponseSchema` |
| `GET /api/v1/accounts/:accountId/sync` | Latest run + sync status | JWT + ownership | `tradingSynchronizationViewSchema` |
| `GET /api/v1/broker/session` | Honest broker-session aggregate for Oryon | JWT | broker session view (persisted state only, never live provider calls) |

### 2.2 Proposed additions

| Method + route | Purpose | Notes |
|---|---|---|
| `PATCH /api/v1/accounts/:accountId` | Rename (label only) | Body: `tradingAccountUpdateInputSchema` [EXISTS]. **Decision required (02-hygiene):** the implemented-but-unregistered `TradingAccountsController` already carries this + aliases. **Recommendation: register the controller and keep `AccountsController` as the single documented surface, deleting duplicate route aliases** — one canonical shape (audit MEDIUM risk "register-or-delete"); the PATCH route then becomes live with zero new code. Alternative (delete) is acceptable but loses the rename endpoint the UI phase needs |
| `GET /api/v1/accounts/providers/:providerId/discover` **[PROPOSED Phase 03+, conditional]** | List provider-side accounts for the supplied credentials, when `accountDiscovery: SUPPORTED` | POST-with-body for credentials would be `POST /accounts/providers/:providerId/discover` (secrets only ever in request body over TLS, never in URLs — security rule §14.2 of the mandate). Returns discovery summaries; selection then feeds the normal connect flow. Only ever shipped for a provider that verified discovery support |
| `GET /api/v1/accounts/:accountId/deals?from&cursor&limit` **[PROPOSED Phase 04]** | Windowed history | §5 pagination rules |
| `POST /api/v1/accounts/oauth/:providerId/callback` **[PROPOSED Phase 05]** | OAuth authorization callback | Only with the OAuth method; state validation + replay protection designed in that phase (mandate §12 security note) |

No other routes are proposed — the mandate's capability list is covered by the existing surface plus the four rows above (mandate §12: "conceptual capabilities, not a requirement to create every endpoint").

## 3. Request and Response Contract References

All request/response payloads reuse `packages/shared/src/schemas/trading-account.ts` **[EXISTS]** verbatim (doc B §5-§8 documents each). New capability/discovery payloads follow doc B §4.2 when implemented. Validation: zod at the shared-contract level, re-`parse` at controller boundaries (verified existing pattern). No raw provider payloads ever cross to the client (mandate §12).

## 4. Authentication and Authorization Expectations

- **Authentication:** global JWT guard + session revocation check; every accounts route is user-scoped; no `@Public` (verified today — kept as an invariant).
- **Authorization/ownership:** every `:accountId` resolves through `loadOwned` (ownership in WHERE; foreign id → 404, not 403 — verified e2e behavior). Connect carries **no** client-supplied userId; the principal is authoritative.
- **Rate limits (existing, kept):** connect 5 / reconnect 5 / sync 20 per 15 min per user → 429 + `Retry-After`; global IP throttler beneath. Discovery (when it exists) joins the connect bucket (credential-bearing operation).
- **Secrets:** only ever in request bodies; never in URLs, queries, logs, or error messages; never returned (pino redaction + e2e assertions verified).

## 5. Pagination and Filtering Decisions

- Today: no pagination — full current-state lists (positions/orders) and "recent deals". Acceptable at V1 scale (verified honest).
- **[PROPOSED Phase 04]:** `deals` (and, if needed, `orders`) gain `limit` (default 100, max 500) + `from`/`to` ISO windows + opaque `cursor` for provider-backed history paging. Opaque cursors only — no provider cursor material leaks to clients (mandate §8.9). `GET /accounts/:id/sync` gains `runs?limit` (default 10) listing recent runs.
- Filtering stays minimal: account list may filter by `status`/`environment` (UI need); no generic query language.

## 6. Error Behavior

- Envelope: stable machine `code` from `TRADING_ERROR_CODES` [EXISTS, 13 codes] + sanitized human message (doc B §10 for the full mapping and the two **[PROPOSED]** additive codes `UNSUPPORTED_CAPABILITY` (422), `SYNC_CURSOR_INVALID` (502)).
- HTTP mapping (verified): 422 client-fixable · 409 conflicts · 429 rate (+`Retry-After`) · 502 provider-side · 404 foreign-id · 401 unauthenticated.
- Consumers must treat unknown codes as 502-class (documented forward-compatibility rule).
- Provider outages never mutate connection state (doc B §3.1); auth-class failures do.

## 7. Real-Time Delivery Implications

- **Phases 02-03:** none — react-query polling + explicit invalidation on sync completion (existing verified pattern). The 15 s `GET /broker/session` poll continues.
- **Phase 04 (scheduler):** after a scheduled sync mutates state, the API records it; clients pick it up on their poll cadence; an optional SSE stream for sync-status changes is *considered* only if polling proves insufficient (mandate §15: don't assume WebSocket).
- **Phase 05+ (streaming providers):** any push channel (WS/SSE) must (a) authenticate + authorize per-user server-side, (b) carry only that user's account events, (c) degrade gracefully to polling. Event names reserved in doc A §8. No subscriptions exist today — nothing to implement until a streaming provider phase begins.

## 8. Endpoints Explicitly Excluded (execution red line)

The following are **permanently out of scope**; the architecture must never grow them (mandate §3.1, §20; port red-line comment `provider.types.ts:9-19`; standing e2e "execution red line" test asserts 404 on write paths):

- Order placement / modification / cancellation (any verb on orders that mutates provider state)
- Position closing or modification (SL/TP changes at the provider)
- Any "trade execution", "quick trade", or one-click action against a connected account
- Any endpoint forwarding provider-write APIs (MT5 `order_send`, OANDA order endpoints, cTrader execution messages, Deriv trade endpoints)
- Credential return/export endpoints (read-back of stored secrets in any form)
- Raw provider payload passthrough/proxy endpoints

A PR adding any of these violates the architecture and must be rejected regardless of provider permission breadth; where a provider's API is execution-capable (all of the real candidates), the adapter implements and documents the read-only subset only (doc D per-provider notes).
