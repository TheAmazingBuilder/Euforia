# COSMOZ — BACKEND PHASE 4 REPORT

## Trading Core & Trade Journal Foundation

Status: **COMPLETE** — build ✓ · typecheck ✓ · lint ✓ · 212/212 tests ✓ · Phase 1–3 regression ✓ · frontend compatibility ✓

---

## 1. What Was Implemented

A new **Trading Core bounded context** (`apps/api/src/modules/trading/`) providing the canonical journal representation of trading activity, per the Phase 4 mandate:

- **Canonical Trade model** — `Trade` is a journal-level business object, strictly distinct from broker positions (`TradingPosition`) and broker executions (`TradingDeal`). It carries lifecycle (`TradeStatus`), provenance (`TradeSource`), direction (`BUY|SELL`), symbol, currency, journal aggregates, plan snapshot (stops/TP/risk), journal metadata (`notes`), server-computed `tradingDate`, soft delete, and scoped external identity.
- **Execution model** — `TradeExecution` (role `ENTRY|EXIT`) preserves the full execution history: partial fills, scale-in, scale-out and partial closes are journaled as individual legs and never flattened irreversibly (§6/§17–§19). This entity subsumes data-model.md's `TradeExit` (role=EXIT + reason/note), avoiding duplicate concepts.
- **Authoritative financial implementation** (`trade-aggregation.service.ts`) — ONE exact-decimal implementation of weighted average entry/exit, quantity totals, gross P&L, fees (−Σ commissions), swap (Σ signed), net P&L, R-multiple, `tradingDate` (user-timezone server-side) and lifecycle status. No controller, service, frontend or analytics duplicates it (§46). Lifecycle rule proven by tests: a trade closes only when exits consume the full entered volume — a partial exit keeps it OPEN (§10/§18).
- **Reconstruction & reconciliation pipeline** (`trade-reconstruction.service.ts` + repository transaction):
  - Balance operations (symbol null) never become trades.
  - **Position-linked deals** (provider supplies `externalPositionId`, MT5 semantics) group exactly by linkage; the group's position side anchors role classification; attachments to an existing open trade stay stable across syncs.
  - **Unlinked deals** fall back to a causal FIFO walk per symbol — prefix-deterministic, so append-only provider streams re-sync idempotently (§55); same-side deals extend the open group (scale-in).
  - **Open positions without a journal trade** produce OPEN trades from position entry facts; live floating state (profit/current price) is deliberately NOT copied — the provider stays authoritative for live state (§11).
  - **Provider corrections** are detected by comparing journaled execution facts against the persisted deal; changed executions update in place and the parent trade is re-aggregated (§28).
  - **No resurrection**: deals mapped to a user-deleted (soft-deleted) journal trade are skipped forever.
  - Concurrency: one transaction per reconcile, serialized by `SELECT … FOR UPDATE` on the account row; unique constraints are the idempotency backstop (§55). No distributed locking.
- **API surface** (`/api/v1/trades`, all authenticated): list (filters + server-side sort + bounded pagination), detail (with executions), create manual (open/closed variants), manual close (single/partial legs), update (source-aware rules), soft delete, external sync reconciliation, bulk import.
- **Idempotent synchronization consumer** — `POST /trades/sync {accountId}` consumes ONLY the Accounts context's public contract (already-synchronized normalized deals/positions). Repeated runs create nothing new (proven by e2e). Trading Core never calls provider adapters (§26 critical boundary).
- **Manual + import provenance** — manual trades are honest `source=MANUAL` (no fabricated external ids); import rows are `source=IMPORT` with content-based stable references, so identical re-imports are skipped, not duplicated (§27/§29/§58).

## 2. What Was Reused

- **Foundation (Phase 1)**: error taxonomy + global exception filter, `ZodValidationPipe`, request correlation, pino logging, Prisma lifecycle, Fastify adapter + helmet/CORS/body-limit, `/api/v1` URI versioning, global `JwtAuthGuard` + `CurrentUser` principal.
- **Identity (Phase 2)**: `IdentityModule` exports (`IdentityRepository` for user timezone → `tradingDate`; authentication context).
- **Accounts (Phase 3)**: the whole connectivity/sync pipeline, normalized deal/position rows, ownership-in-query convention (IDOR → 404), controlled-failure mock provider (extended additively only).
- **Shared contracts**: existing enums (`TradeStatus`, `Direction` BUY|SELL, `ExitReason`), decimal-as-string/ISO-Z primitives, the established `{ trades, total }` list envelope, error-envelope conventions, test harness (`buildTestApp`, embedded Postgres, `authenticatedUser`).

## 3. Database Changes

One migration: **`20261003131801_trading_core`** (applied to dev; test DB applies via the existing global setup).

- New enums: `TradeSource`, `TradeStatus`, `Direction`, `ExecutionRole`.
- New model `Trade` — per the binding conventions: `Decimal(18,8)` money/prices/quantities, UTC timestamps, uuid PKs, soft delete (`deletedAt`), indexes for real access patterns (`userId+status`, `userId+entryAt desc`, `accountId+entryAt desc`, `accountId+symbol`, `userId+tradingDate`), unique `(accountId, externalPositionId)`.
- New model `TradeExecution` — unique `(accountId, externalDealId)` (the §27 idempotency key; Postgres NULLs keep manual legs unconstrained), indexed `(tradeId, executedAt)`.
- `TradingDeal` **+ `externalPositionId String?`** (+ index) — the additive Phase 3 extension enabling provider-semantics grouping (§9/§17).
- Relations: `User.trades`, `TradingAccount.trades`, `TradingAccount.tradeExecutions` (cascade, consistent with Phase 3).

**External mapping realization (§9/§42/§44)**: no separate `ExternalTradeMapping` table — position-level mapping lives on `Trade.externalPositionId` (unique per account) and deal-level mapping on `TradeExecution.externalDealId` (unique per account). Same guarantees, one fewer entity, DB-enforced idempotency.

## 4. Trade / Execution Model

```
User ─┬─ TradingAccount ─┬─ TradingPosition   (external live state — Accounts ctx)
      │                  ├─ TradingDeal ──────┐  (external executions — Accounts ctx)
      │                  └─ (exported repository: the ONLY consumed boundary, §26)
      └─ Trade (canonical journal object; Cosmoz owns the identity)
              └─ TradeExecution[] (ENTRY/EXIT legs; externalDealId preserved, never the PK)
```

- Trade row stores journal-level aggregates maintained exclusively by the aggregation service; executions store provider truth verbatim (signed commissions/swap, deal side).
- Aggregate → wire conversion (`Decimal → decimal-string`) happens only in mappers; Prisma models never cross to the API (§33/§37/§38).
- Raw provider payloads are not stored or exposed; normalized external state remains inside Accounts (§39).

## 5. Synchronization & Reconciliation Strategy

Explicit, deterministic, idempotent: `POST /trades/sync {accountId}` → read persisted deals+positions through the exported `AccountsRepository` → plan (pure) → apply (one transaction, account-row lock) → honest counts response (`dealsConsidered`, `executionsCreated/Updated`, `tradesCreated/Updated/Closed`). Corrections update in place; duplicates are skipped (both at plan level and by unique constraints); deleted journals are never resurrected. Auto event-driven reconciliation after a broker sync is deliberately deferred (see §10) — the Accounts sync pipeline itself was not modified beyond the additive linkage field.

## 6. API Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/trades` | List — filters `accountId, status, symbol, direction, source, openedFrom/To, closedFrom/To`; `sort=entryAt|exitAt|pnlNet`, `order`, `page` (default 1), `limit` (default 50, max 200); response `{ trades, total, page, limit }` |
| GET | `/api/v1/trades/:id` | Detail — full lifecycle data + chronological executions |
| POST | `/api/v1/trades` | Create MANUAL trade (variant `open` \| `closed`; P&L never accepted from client) |
| POST | `/api/v1/trades/:id/close` | Close a MANUAL OPEN trade (mode `single` \| `partial` legs; ≤ remaining volume) |
| PATCH | `/api/v1/trades/:id` | Journal metadata (any source); execution facts (MANUAL only; results recomputed server-side) |
| DELETE | `/api/v1/trades/:id` | Soft delete / archive (§57) |
| POST | `/api/v1/trades/sync` | Reconcile external activity into journal trades (idempotent) |
| POST | `/api/v1/trades/import` | Bulk import client-mapped rows (source=IMPORT, content-idempotent) |

Stable error codes (`TRADING_CORE_ERROR_CODES`): `TRADE_NOT_FOUND` (404 — also the IDOR response), `ACCOUNT_NOT_FOUND` (404), `INVALID_TRADE_STATE` (422), `INVALID_EXECUTION` (422), `EXTERNAL_TRADE_IMMUTABLE` (422), `DUPLICATE_EXTERNAL_ACTIVITY` (409). Database errors never surface (§64).

## 7. Security / Ownership Measures

- Every route requires a valid session (global guard); userId always derives from the token — **no client-controlled ownership** anywhere (schemas expose no owner field).
- Ownership-in-query lookups: foreign trades/accounts are honest 404s (no existence oracle).
- **IDOR battery (e2e)**: user B cannot read/edit/close/delete user A's trades (404 each), cannot reconcile user A's account, and A's trades never appear in B's lists.
- Source-aware immutability: broker-derived execution data on EXTERNAL_SYNC trades cannot be edited or manually closed (422 `EXTERNAL_TRADE_IMMUTABLE`) — journal metadata remains editable.
- Leakage scan (e2e): no credentials/credential hints/provider secrets/Prisma internals in any payload; every response validates against shared contracts.
- No execution capability introduced: no order placement/modification/close endpoints anywhere; provider adapters unchanged (read-only red line intact, §47).

## 8. Tests Executed

- **Unit — aggregation (13)**: lifecycle/quantities, weighted scale-in/out, partial-close semantics, long/short symmetry, exact decimal arithmetic, no-invented-P&L, rMultiple rules, server-side tradingDate/timezone fallback.
- **Unit — reconstruction (10)**: linked grouping, role classification, scale-out/partial-close integrity, idempotent re-plan, attach-to-open, correction detection, no-resurrection, balance-op exclusion, FIFO pairing + scale-in + prefix-determinism.
- **e2e — trades (22)**: auth boundary (401 matrix), manual create (open/closed, validation), manual close (single/partial/over-close/already-closed), metadata edits + recompute, soft delete → 404, listing/filters/pagination/sort, sync reconstruction + re-sync idempotency + immutability rules, import + content idempotency + row validation, IDOR battery, ownership-derivation, leakage scan, malformed ids.
- **Regression**: full suite **15 files / 212 tests — all green**, including all Phase 1–3 suites (app, identity, accounts, security, security-negative e2e; mock provider, sync-status, contracts, error-mapper, env, aes-gcm, request-id units).

## 9. Verification Results

- `prisma validate` ✓ · `prisma migrate dev` (trading_core) ✓
- `tsc --noEmit` (api) ✓ · `tsc -p tsconfig.build.json` (build) ✓ · `eslint` ✓
- `@cosmoz/shared` typecheck ✓ · **web typecheck ✓** (frontend consumes the shared package source — additive exports are compatible; no frontend changes required)
- Full `vitest` run: **212/212 passed** (embedded Postgres `cosmoz_test`, never a dev/prod DB)
- e2e harness boots the REAL AppModule over Fastify — startup, DI wiring and health paths exercised continuously.
- Environment repair during setup (documented in worklog): the sandbox shell exported a stale `DATABASE_URL` (overriding `.env` for the Prisma CLI) and `pnpm-lock.yaml` contained two concatenated YAML documents (kept the complete one). Neither affects application code.

## 10. Known Limitations

1. **Instrument catalog deferred** — `symbol` is stored verbatim (provider truth, §14); the `instrumentId` FK from data-model.md awaits the Instruments domain. No silent symbol normalization.
2. **CSV import idempotency is content-based** — rows without stable broker references map to a deterministic content hash; a re-import with corrected values (e.g. edited quantity) is treated as a new row. Broker-supplied refs arrive with the import/export pipeline.
3. **FIFO fallback is a V1 grouping** for providers without deal→position linkage; linked providers (MT5 semantics, incl. the mock) group exactly. Refinement is local to the reconstruction service.
4. **Sync-path volume invariants are provider-truth** — over-closing streams are journaled verbatim (closedQuantity may exceed quantity); only MANUAL closes enforce remaining-volume bounds.
5. **MFE/MAE, decision grades, tags, trade views, screenshots, review endpoints** — deferred (discipline/playbook domains, §59/§68). The frontend's `graded` filter has no backend counterpart yet.
6. **`PLANNED`/`CANCELLED` statuses** exist in the stable vocabulary but no Phase 4 path produces them (Trade Planner is future).
7. **Manual/import trades require an existing owned account** — journal-only (broker-less) accounts are a later feature; connecting a journal account belongs to the Accounts domain.
8. **Event-driven auto-reconciliation** after a broker sync is deferred to avoid touching the Phase 3 sync flow; the explicit `/trades/sync` boundary keeps Accounts fully in charge of provider access.
9. **Account-row hard delete** would cascade trades (consistent with every Phase 3 relation); no API path deletes accounts — semantics revisit if account deletion ever ships (§57 covers disconnect: history preserved).

## 11. Remaining Blockers

None for Phase 4. Prerequisites for later phases (not blockers here): real provider adapters will supply deal linkage via the already-extended normalization contract; the analytics/review/session-live domains consume the canonical aggregates through the Trading Core's exported types when their phases arrive.

---

**STOP — Phase 4 complete.** Phase 5 has not been started and awaits an explicit prompt.
