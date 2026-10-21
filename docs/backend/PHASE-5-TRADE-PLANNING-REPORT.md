# COSMOZ — BACKEND PHASE 5 REPORT
## Trade Planning, Risk Management & Checklist

Status: **COMPLETE** — all verification executed fresh in this session (295/295 tests green).
This report follows mandate §75. Per §75 STOP: no Phase 6, no Trade Review, no Analytics, no Playbook was started.

---

## 1. Audit findings

Phases 0–4 were confirmed complete and current (reports under `docs/backend/`, code inspected directly):

- **Foundation (P1)**: Fastify + NestJS 11, `/api/v1` URI versioning, global `JwtAuthGuard`, AppError taxonomy (10 categories → stable envelope `{error, code?, message?, issues?, requestId?}`), `ZodValidationPipe`, pino structured logging + request-id, Prisma module, health, rate limiting.
- **Identity (P2)** / **Accounts (P3)** / **Trading Core (P4)**: `apps/api/src/modules/{identity,accounts,trading}`.
- **Binding conventions observed**: flat bounded contexts (one repository = only Prisma touchpoint with narrow row projections; application service; thin controller; mappers), Decimal(18,8) money as decimal-strings, uuid `@db.Uuid`, UTC, ownership-in-query (IDOR → honest 404), `@@unique` composite idempotency keys, vitest + embedded-postgres (`cosmoz_test`), reserved-enum precedent (`TradeStatus.PLANNED` was already reserved "for the future Trade Planner").
- **No TradePlan existed anywhere** in the backend. No backend Playbook/checklist engine (frontend MSW only), no backend instrument catalog, no FX service, no portfolio risk limits.
- **Frontend (§56 audit)**: no planner page exists; `position-sizer.tsx` is capture-form UX preview over `@cosmoz/shared` risk utils; MSW `PATCH /trades/:id/plan` is open-trade SL/TP editing, not pre-trade planning. The frontend was NOT modified in this phase.

## 2. Existing functionality reused

| Existing capability | How Phase 5 reuses it |
|---|---|
| `@cosmoz/shared` utils/risk.ts (`computeRR`, `computeRiskAmount`, `suggestPositionSize`) | Formula source. The backend engine implements the SAME semantics with Decimal precision (§13) — no parallel formulas; shared utils remain the frontend preview path (data-model.md §13 makes the server authoritative). |
| `tradeSizeModeSchema` (`quantity \| risk_percent \| risk_amount`) | Reused verbatim as the plan sizing vocabulary. |
| Checklist vocabulary (`checklistItemSchema {id,label,required}`) | Reused in the frozen plan checklist snapshot (§24/§25). |
| `AccountsRepository` public contract (`findAccountForUser`, `latestSnapshot`) | Ownership-validated account resolution + balance anchor (`latestSnapshot.balance ?? startingBalance`). |
| Foundation error taxonomy / pipe / guard / logging / request-id | Consumed unchanged; no new framework code in the context. |
| Phase 4 conventions | Conditional-write concurrency, honest-404 IDOR, `{…, total, page, limit}` list envelope, migration discipline. |

Not duplicated (§3): no second lot-size engine, no second risk engine, no second checklist engine, no second account/ownership system, no second Trade model, no authentication mechanism.

## 3. Files/modules changed

```
packages/shared/src/schemas/trade-planning.ts   NEW — full contract (below)
packages/shared/src/index.ts                    MODIFIED — +1 export

apps/api/prisma/schema.prisma                   MODIFIED — TradePlanStatus enum,
                                                TradePlan, InstrumentSpecification,
                                                User.tradePlans / TradingAccount.tradePlans
apps/api/prisma/migrations/20261003141559_trade_planning/  NEW — DDL + reference seed
apps/api/package.json                           MODIFIED — + decimal.js (direct dep;
                                                already in the lockfile via @prisma/client)

apps/api/src/modules/trade-planning/            NEW bounded context
  domain/ports.ts                     InstrumentSpecificationProvider / FxRateProvider /
                                      RiskLimitProvider (pure TS, no framework imports)
  domain/risk-engine.ts               authoritative planned-risk engine (Decimal)
  domain/trade-plan-lifecycle.ts      explicit transition table + operation policies
  domain/trade-plan-validator.ts      pre-trade battery (engine + checklist + limits)
  adapters/providers.ts               catalog / passthrough-FX / no-limits adapters
  trade-plan.repository.ts            narrow rows, guarded writes, conditional transitions
  trade-plan.service.ts               use cases (create/update/commit/validate/cancel/
                                      abandon/recalculate/list/get)
  trade-plan.mappers.ts               rows → contract views
  trade-plan.controller.ts            9 routes under /api/v1/trade-plans
  trade-planning.module.ts            port bindings via DI tokens; exports []
  trade-planning.tokens.ts            DI symbols

apps/api/src/app.module.ts                      MODIFIED — + TradePlanningModule
apps/api/test/unit/trade-plan-risk-engine.spec.ts     NEW (deterministic engine battery)
apps/api/test/unit/trade-plan-lifecycle.spec.ts       NEW (transition table)
apps/api/test/unit/trade-plan-validator.spec.ts       NEW (battery composition)
apps/api/test/e2e/trade-plans.e2e.spec.ts             NEW (27 HTTP-level scenarios)
docs/backend/PHASE-5-TRADE-PLANNING-REPORT.md         NEW (this file)
```

## 4. Database changes

Migration `20261003141559_trade_planning` (applied to dev via `prisma migrate dev`; test DB applies through `global-setup`):

- **`TradePlanStatus`** enum: `DRAFT | PLANNED | VALIDATED | CANCELLED | ABANDONED | EXECUTED`.
- **`TradePlan`** — one clean aggregate (§33): ownership (`userId`, `accountId` FKs, both cascade), status/direction/entryType/symbol/currency/timeframe, `strategyId` as a bare uuid REFERENCE (no FK — Playbook backend does not exist, §26/§67), user-input configuration (`entryPrice/stopLoss/takeProfit`, `sizeMode/sizeValue`) stored DISTINCT from engine-derived risk columns (`balanceSnapshot, riskPercent, riskAmount, stopDistance, stopPips, positionSize, potentialProfit, potentialLoss, rrRatio`, all `Decimal(18,8)`), frozen `checklist` JSONB + `checklistComplete`, `lastValidation` JSONB, status stamps (`validatedAt/cancelledAt/abandonedAt/plannedAt`), `clientRequestId`. Constraints/indexes: `@@unique(userId, clientRequestId)` (NULLs distinct) + indexes matching actual access patterns only: `(userId,status)`, `(userId,plannedAt desc)`, `(userId,accountId)`, `(userId,symbol)`, `(accountId,status)`.
- **`InstrumentSpecification`** — the §15 authoritative catalog (symbol unique, assetClass, quoteCurrency, pipSize, contractSize, min/max/step volumes, digits, isActive). Seed block (migration-tooling INSERTs, idempotent `ON CONFLICT DO NOTHING`): EURUSD, GBPUSD, USDJPY, XAUUSD, BTCUSD, US30, NAS100 — reference CONFIGURATION DATA, deliberately outside business logic.
- **No schema change to Phase 4 tables.** The Trade ↔ TradePlan link (`originPlanId`) is deliberately NOT added (§62: no product path creates trades from plans yet; Trading Core is Phase 4 territory — noted in the schema). `EXECUTED` is reserved vocabulary with no producing path, mirroring the Phase 4 `TradeStatus.PLANNED` precedent.

## 5. API contracts added

Shared contract `schemas/trade-planning.ts`; all routes authenticated (global guard), validated by `ZodValidationPipe`, decimal-strings on the wire:

```
POST   /api/v1/trade-plans                      create (DRAFT, or PLANNED with commitNow;
                                                idempotent via clientRequestId → 201/replay)
GET    /api/v1/trade-plans                      list — filters status/accountId/symbol/
                                                direction/strategyId/plannedFrom/plannedTo,
                                                sort createdAt|plannedAt|updatedAt, page/limit
GET    /api/v1/trade-plans/:planId              detail (rationale, frozen checklist,
                                                lastValidation, status stamps)
PATCH  /api/v1/trade-plans/:planId              edit DRAFT/PLANNED; recomputes risk
POST   /api/v1/trade-plans/:planId/commit       DRAFT → PLANNED (idempotent)
POST   /api/v1/trade-plans/:planId/validate     battery (§21); pass → VALIDATED,
                                                fail → stays PLANNED + persisted findings;
                                                idempotent echo on VALIDATED
POST   /api/v1/trade-plans/:planId/cancel       PLANNED/VALIDATED → CANCELLED (idempotent)
POST   /api/v1/trade-plans/:planId/abandon      DRAFT/PLANNED → ABANDONED (idempotent)
POST   /api/v1/trade-plans/:planId/recalculate  fresh balance/specs/fx → refreshed derived risk
```

Error codes (`TRADE_PLANNING_ERROR_CODES`): `TRADE_PLAN_NOT_FOUND` (404, also the IDOR response), `ACCOUNT_NOT_FOUND` (404), `TRADE_PLAN_INVALID_STATE` (422), `TRADE_PLAN_CONCURRENT_MODIFICATION` (409), `INVALID_TRADE_PLAN_CONFIGURATION` (422), `INSTRUMENT_SPECIFICATION_UNAVAILABLE` (422), `CURRENCY_CONVERSION_UNAVAILABLE` (422). Validation findings are structured `{code, severity(ERROR|WARNING), field, message}` with 11 stable codes (e.g. `STOP_LOSS_INVALID_DIRECTION`, `POSITION_SIZE_BELOW_MINIMUM`, `CHECKLIST_INCOMPLETE`, `RISK_LIMIT_EXCEEDED`). Prisma models are never exposed.

## 6. Risk engine behavior

- **Pure Decimal arithmetic** (`decimal.js` — direct dep, same class Prisma uses); no floating-point money (§13). Domain file imports no NestJS/Prisma (§59).
- **Formulas mirror `@cosmoz/shared` utils/risk.ts exactly** (preview ≠ authority, but semantics identical): money risk = |entry − stop| × qty × contractSize × fx; RR = reward distance ÷ risk distance (currency-free ratio, §19); planned R = RR (§20).
- **Sizing**: `risk_percent` → budget = balance × pct/100 → size = floor(budget ÷ perUnitCost); `risk_amount` → size = floor(amount ÷ perUnitCost) with percent derived; `quantity` → money risk derived. **Deterministic rounding = ROUND_DOWN to the catalog `volumeStep` (0.01 fallback)** so realized risk never exceeds budget (§17).
- **Instrument specifications** come exclusively through the `InstrumentSpecificationProvider` port from the catalog table — nothing hardcoded in logic (§15); provider/instrument specs are injectable.
- **Account currency is explicit** (§16): per-unit cost converted quote→account through the `FxRateProvider` port; the passthrough adapter returns 1 for same-currency and **null otherwise — no fabricated rates**; plans carry `balanceSnapshot` (planning-time anchor) and `currency`.
- **Invalid configurations never silently produce risk** (§11/§12): wrong-side or equal-to-entry SL/TP are structural 422s at create/update; a missing SL is allowed in quantity mode but flagged ERROR at validation; zero/negative balance → `BALANCE_UNAVAILABLE`; volume min/max enforced.
- **Risk limits** (§22) flow through the `RiskLimitProvider` port (default: none — no invented portfolio rules); percent and amount limits are enforced inside the validation battery.

## 7. Checklist integration

- **Audit result**: no backend checklist engine exists to reuse (Playbook is a frontend MSW contract) — per §23 the smallest reusable abstraction was created: the **frozen planning-time checklist snapshot** (`{templateId, templateName, items[{id,label,required,checked}]}`) carried on the plan aggregate, reusing the shared checklist item vocabulary.
- Definition vs execution are separated by construction: the snapshot is written at create/validate time and never rewritten by later template edits (§24/§25) — "what checklist was satisfied when this was planned" stays answerable for future Trade Review.
- The validation battery treats unchecked **required** items as ERROR (`CHECKLIST_INCOMPLETE`), optional items as informational, and no-checklist as no-op (no discipline policy invented).
- Playbook integration is a bare `strategyId` reference (no FK, no dependency on Playbook internals, §26); the full Playbook module remains out of scope (§67).

## 8. TradePlan lifecycle

Explicit transition table (`domain/trade-plan-lifecycle.ts`), enforced by conditional writes:

```
DRAFT → PLANNED (commit) → VALIDATED (battery pass) → EXECUTED (reserved, future Trade link)
  │         │                  │
  │         ├── → CANCELLED    └── → CANCELLED
  │         └── → ABANDONED
  └── → ABANDONED
```

- States implemented = what the product requires today: `EXECUTED` reserved (no inbound edge), `EXPIRED`/`PARTIALLY_EXECUTED` deferred (no scheduler / no execution linkage — §63).
- **Mutation policy (§38)**: only DRAFT/PLANNED editable/recalculable; VALIDATED preserves the planning snapshot forever (cancel + re-plan instead).
- **Creation never auto-validates** (§37) and **nothing ever executes** (§30): the planner prepares intent only; order placement does not exist in any code path.
- **Idempotency (§40)**: create dedupes on `(userId, clientRequestId)` (unique constraint + P2002 fallback); commit/validate/cancel/abandon are guarded no-ops when retried after success.
- **Concurrency (§41)**: every transition is a single conditional `updateMany` (status guard + ownership + stamps atomically); a lost race is an honest 409, never a blind success.

## 9. Security protections

- Authentication on every route (global JWT guard, zero `@Public`); authorization/ownership enforced in the service — `userId` always from the principal, all lookups ownership-scoped (§28/§44).
- Tested negative battery (§50): cross-user read/update/validate/cancel → honest 404s; foreign `accountId` → 404 `ACCOUNT_NOT_FOUND`; forged `userId` in the payload ignored (schema strips; principal wins); unauthenticated → 401 on all 9 routes; malformed ids → 400.
- No secrets in logs: structured events (`trade_plan.created/updated/committed/validated/validation_failed/cancelled/abandoned/risk_calculated`) carry only `requestId`-safe ids (`userId/planId/accountId`) (§43/§47).
- Error responses never leak stacks/DB internals (Foundation filter; leakage scan included in e2e) (§46).

## 10. Tests executed

New Phase 5 (83):
- **Unit — risk engine (28)**: deterministic §49 cases (10k × 1% → 100 / 0.2 lots / 2R), SELL mirroring, flooring & step behavior, directional integrity (wrong side, equal-to-entry, missing), specs/fx degradation (quantity-mode warnings vs risk-mode errors, no fabricated money), volume min/max, zero/negative balance, Decimal precision (0.05×0.1×3 = exactly "0.015"), very large budgets.
- **Unit — lifecycle (31)**: every legal/illegal transition (incl. `EXECUTED` reserved, terminal states), editability/validatability/cancellability/abandonability policies.
- **Unit — validator (8)**: pass path, warnings never block, checklist gate (required unchecked → ERROR; optional unchecked → pass), risk-limit gate (percent/amount, at-limit not excess, no limits → no rules), engine findings flow-through.
- **e2e (27)**: auth boundary; creation (draft/commitNow/risk-percent self-consistent derivation/structural 422s/unknown symbol/quantity-mode tolerance); idempotent create; commit/validate/cancel/abandon happy paths + idempotent retries; invalid transitions; checklist-incomplete battery with persisted findings; freeze after validation; server-side recompute on edit; recalculation; listing filters/pagination; full IDOR battery; forged ownership; leakage scan; **planning never produces journal trades**.

## 11. Verification results

Fresh commands, this session:

| Check | Command | Result |
|---|---|---|
| API typecheck | `tsc -p tsconfig.json --noEmit` | ✅ 0 errors |
| Shared typecheck | `tsc --noEmit` (packages/shared) | ✅ 0 errors |
| Web typecheck | `tsc --noEmit` (apps/web) | ✅ 0 errors |
| API lint | `eslint src/**/*.ts test/**/*.ts` | ✅ 0 problems |
| API build | `tsc -p tsconfig.build.json` | ✅ |
| Migration | `prisma migrate dev` → dev DB | ✅ applied (incl. reference seed) |
| Full test suite | `vitest run` (19 files) | ✅ **295/295** (212 pre-existing Phase 1–4 regression + 83 new) |
| Web production build | `next build` | ⚠️ `/login` prerender fails — **pre-existing on the clean Phase 4 baseline (verified via `git stash`)**, unrelated to Phase 5 (frontend untouched; the repo's verification gate for web is `tsc`, per Phase 4 practice). Documented, not hidden (§72). |

## 12. Known limitations

1. **No FX conversion**: cross-currency planning (e.g. EUR account × USD-quoted instrument) is rejected with `CURRENCY_CONVERSION_UNAVAILABLE` rather than estimated — by design (§16: no fake rates). A future FX context plugs into `FxRateProvider`.
2. **Instrument catalog is minimal**: 7 seeded reference rows; unknown symbols block risk-based sizing (quantity-mode planning still works). A dedicated Instrument Catalog phase should own this table's growth.
3. **No automatic expiry**: `EXPIRED` deferred (no scheduler exists); no partial-execution semantics (§63); `EXECUTED` unreachable until a future phase links canonical Trades.
4. **Risk limits default to none**: `RiskLimitProvider` is the seam; no portfolio rules invented (§22).
5. **No live Trade linking**: `Trade.originTradePlanId` deliberately not added (Phase 4 schema untouched).
6. Frontend consumes MSW; wiring the real planner UI to these endpoints is frontend work outside this phase (§56: no frontend redesign).

## 13. Architectural decisions

1. **Authoritative backend engine, shared preview math** — the engine mirrors `@cosmoz/shared` risk formulas with Decimal precision; one semantic source, two precision tiers (§13/§57).
2. **Clean aggregate over per-concept tables** (§33): risk columns + checklist JSONB + lastValidation JSONB on `TradePlan`; no TradePlanRisk/TradePlanValidation/TradePlanChecklistEvaluation tables.
3. **Input vs derived separation** (§39): `sizeMode/sizeValue` persisted verbatim next to engine-owned derived columns; edits recompute server-side; clients can never write derived values.
4. **Ports-first for everything missing** (§15/§16/§22): `InstrumentSpecificationProvider` (DB-catalog adapter), `FxRateProvider` (honest passthrough), `RiskLimitProvider` (no-limits) — future contexts plug in without engine changes; domain stays framework-free (§59).
5. **Catalog-in-context**: `InstrumentSpecification` is owned by trade-planning today, documented as extractable by a future Instrument Catalog phase.
6. **Conditional-write concurrency + idempotent commands** — consistent with Phase 3/4 discipline, no new infrastructure.
7. **Direction = BUY|SELL** (existing product vocabulary), never LONG/SHORT booleans (§8).
8. **No domain-event bus** (§42): events are structured logs today (Foundation pattern); a bus would be new infrastructure without a consumer — deferred until a real subscriber exists.
9. **FastAPI untouched** (§58): transactional planning logic lives in NestJS; no FastAPI dependency added.

## 14. Recommended next phase

**Trade Review & Lesson Capture** — it is the natural first consumer of both this phase (plan-vs-actual deviation: the frozen planning snapshots make "executed differently from plan" measurable for the first time) and Phase 4's canonical journal. Alternatively, **Instrument Catalog & FX** would unlock cross-currency planning and provider-grade specs before Review. Either way: Playbook backend, Analytics, and Session Live remain later per the roadmap.

**STOP** — per §75, implementation halts here awaiting explicit instructions.
