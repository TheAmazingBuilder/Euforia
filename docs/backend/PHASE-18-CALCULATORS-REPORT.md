# COSMOZ — BACKEND PHASE 18
## Trading Calculators & Quantitative Utilities — Final Report

| | |
|---|---|
| **Date** | 2026-10-04 |
| **Base** | Phase 0 (`78e30ac`) + Phase 1 (`865945f`) + Phase 2 (`f7516cf`) + Phase 3 (`69247a7`) + Phase 16 Security + Phase 17 Monitoring |
| **Scope** | Deterministic calculation layer: Lot Size + Compounding. NOT a risk engine, NOT a P&L engine, NOT backtesting, NOT execution (§1/§66). |
| **Verification** | typecheck api/shared/web ✅ · lint api ✅ · build ✅ · **242/242 tests ✅** (41 new: 30 unit + 11 e2e) · Prisma valid ✅ · **no migration** · real-HTTP runtime verification ✅ |

---

## 1. Repository Audit Findings

- **There is NO standalone Calculator page in the frontend.** The only "Lot Size Calculator" is the **Position Sizer embedded in the trade-capture form** (`apps/web/src/components/trades/position-sizer.tsx`), computed 100 % client-side via `@cosmoz/shared/utils/risk.ts` (`suggestPositionSize`, `computeRiskAmount`, `computeRR`). Navigation (15 items), command palette and bottom nav contain no calculator entry.
- **The Compounding Calculator does not exist anywhere in the frontend** — no route, no component, no mock. Only a glossary entry in Academy ("Compounding — gains growing on top of gains"). The Phase-18 prompt's expected compounding contract (§21) had therefore no frontend to mirror; its contract was defined by this phase per §21–§26.
- **No calculator API surface exists**: no MSW handler, no fetch/axios call, no shared schema named `calculators.*`. The only server-side sizing reference was the **mock's** `POST /trades` resolver (`apps/web/src/mocks/store.ts:778-811`) — floor-to-0.01 micro-lot semantics the real backend must embody at write time (`tradeSizeModeSchema`: *"risk_percent: % of current balance → server computes quantity"*).
- **Instrument specifications have NO canonical server-side source** (the audit's gap #1): no `Instrument` Prisma model, no endpoint, no provider metadata (`NormalizedAccountInfo` carries no specs; adapters expose no `fetchInstruments`). The only per-instrument spec model is the shared `instrumentSchema` (pipSize/digits/contractSize) consumed from `GET /instruments` **mocks**. Spec rule of the codebase: *"Specs live per instrument; there are NO per-asset-class constants in code."*
- **Trade Planner / Trading Core / Analytics backends do not exist** (confirmed in `app.module.ts` — only SecurityEvent, Identity, Accounts, Security, Monitoring). Nothing to integrate with yet; nothing to migrate.
- **Existing financial math is minimal and canonical**: one backend formula (`deriveUnrealizedPnl`, `Prisma.Decimal`, `trading-sync.service.ts`) and the shared LIVE-ESTIMATE helpers explicitly documented as *"the server recomputes authoritative values at write time"* (`risk.ts:3-10`). This phase implements exactly that recomputation layer.
- **Backend conventions ready to reuse**: flat bounded contexts with a pure `*.logic.ts` file (pattern `monitoring.logic.ts`), Zod contracts in the shared barrel + `ZodValidationPipe`, global `JwtAuthGuard` + `ThrottlerGuard`, `AppError` taxonomy → `{error, code?, message?, issues?}`, `Prisma.Decimal` + decimal-string wire format (`numeric(18,8)`), Vitest unit/e2e harness with embedded PostgreSQL.

## 2. Existing Calculation Logic Reused

| Logic | Location | How Phase 18 uses it |
|---|---|---|
| `suggestPositionSize` / `computeRiskAmount` / `computeRR` | `packages/shared/src/utils/risk.ts` (frontend live estimates) | **Semantics mirrored exactly** (floored micro-lot sizing, symmetric stop distance, directional RR) — proven field-for-field by unit tests against the shared helpers. Not imported into the domain math (the server layer must be float-free); `risk.ts` stays untouched as the client estimate layer (§37 parity, one authoritative server implementation). |
| `tradeSizeModeSchema` | `packages/shared/src/schemas/trade.ts` | Future write-time sizing consumer of the same lot-size logic; contract untouched. |
| `deriveUnrealizedPnl` | Accounts module | Untouched — Accounts keeps the only other financial formula. |
| `Prisma.Decimal` | `@prisma/client` (decimal.js) | Adopted as the project's established precision approach (§18) — no new dependency added (stack frozen). |
| Zod contracts + `ZodValidationPipe` + `AppError` + global guards | Phase 1/2 shared kernel | The entire request/validation/error path is reused; nothing new invented. |

## 3. New Calculator Functionality Implemented

1. **`POST /api/v1/calculators/lot-size`** — authoritative, broker-aware position sizing: risk budget (`balance × riskPercent/100`), stop distance (price + pips), directional RR (optional TP), raw → floored-to-step position size, realized risk, explicit `volumeAdjustment` + `status` (`VALID` / `BELOW_MINIMUM` / `ABOVE_MAXIMUM`) — no silent clamping (§16/§17).
2. **`POST /api/v1/calculators/compounding`** — deterministic period-by-period growth projection: per-period rows (`startingBalance`, `endingBalance`, `periodProfit`, `cumulativeProfit`, `cumulativeGainPercentage`) plus aggregates (`finalBalance`, `totalProfit`, `totalGainPercentage`), full-precision loop (§21–§27).
3. **Shared contract** `packages/shared/src/schemas/calculators.ts`: input/result Zod schemas + types + `CALCULATOR_ERROR_CODES` + documented product caps, exported through the shared barrel (§31).
4. **`CalculatorsModule`** — new bounded context (`modules/calculators/`): controller (thin), service (thin application layer), `lot-size.logic.ts` + `compounding.logic.ts` (pure domain, no Nest/HTTP/DB, directly unit-testable, §32/§33).

**Not implemented (deliberately)**: no calculator history/saved calculations (frontend has none — §53), no account-integrated defaults (no frontend consumer exists — §35/§36 deferred), no database, no cache, no FastAPI, no rate limiter beyond the global one, no monitoring changes.

## 4. Final Calculator Architecture

```text
POST /api/v1/calculators/{lot-size,compounding}      (auth: global JwtAuthGuard; rate: global ThrottlerGuard)
        │ ZodValidationPipe (shared contract, unknown fields stripped)
        ▼
CalculatorsService                      ── application (thin, no formulas — §33)
        ▼
lot-size.logic.ts / compounding.logic.ts ── PURE domain, Prisma.Decimal, no Nest/DB (§32)
        ▼
decimal-string result                   ── wire format numeric(18,8)-compatible
```

```text
CalculatorsModule imports: NOTHING (no Prisma, no other context)
Uses global infra: JwtAuthGuard · ThrottlerGuard · AllExceptionsFilter · shared contracts barrel
```

Ownership after Phase 18 (§3/FINAL PHASE PRINCIPLE):

```text
Accounts       → account state (balance canonical — calculator only RECEIVES a balance)
Trading Core   → canonical trades (nonexistent yet — untouched)
Trade Planner  → planned trade/risk intent (nonexistent yet — will REUSE lot-size.logic)
Analytics      → historical analysis (nonexistent yet — not moved here, §38)
Calculators    → deterministic forward-calculation utilities ONLY
```

## 5. Lot Size Calculation Semantics

- **Inputs** (all decimal strings): `balance` (caller-supplied — Accounts stays canonical, §36), `riskPercent` ("1" = 1 %, capped ≤ 100 %), `entryPrice`, `stopLossPrice` (must differ from entry), optional `takeProfitPrice`, `direction` (`BUY` default), `instrument {pipSize, contractSize, volumeStep?, minVolume?, maxVolume?}`.
- **Formulas** (exact decimal, §11–§16): `riskAmount = balance × pct/100` · `perUnit = |entry − stop| × contractSize` · `rawQuantity = riskAmount / perUnit` · `normalized = floor(raw/step) × step` (default step `"0.01"` = frontend micro-lot granularity; **flooring only — never rounded up**, §16) · `realizedRisk = normalized × perUnit ≤ budget` by construction.
- **RR (§14/§15)**: directional per the frontend `computeRR` — BUY `(tp−e)/(e−s)`, SELL `(e−tp)/(s−e)`; `null` when no TP or SL on the wrong side (risk ≤ 0). Sizing uses the **symmetric** distance — direction never changes the size (frontend parity, §58).
- **Statuses (§17)**: `VALID` · `BELOW_MINIMUM` (size < explicit `minVolume`) · `ABOVE_MAXIMUM` (size > explicit `maxVolume`) — the computed size is always returned as-is; nothing is clamped silently. A budget that cannot cover one step → **422 `POSITION_SIZE_BELOW_MINIMUM`** (the API expression of the frontend's `null`).

## 6. Compounding Calculation Semantics

- **Model**: growth per period on the PREVIOUS ending balance (§22 — never re-applied to the principal): `rate = gainPerPeriodPercent/100` ("5" → 0.05, §23) · `periodProfit = current × rate` · `ending = current + periodProfit` → next period's `current`. The advanced nominal-frequency model `A = P(1+r/n)^(n·t)` (§24) is NOT implemented (no product surface) and is explicitly kept separate.
- **Precision (§27)**: the loop runs on full-precision Decimals; every emitted value is rendered once to the 8-decimal wire format. No per-period rounding exists (the product defines none).
- **Outputs (§26)**: per-period rows with ABSOLUTE profit (`periodProfit`, `cumulativeProfit`) distinct from PERCENTAGE gain (`cumulativeGainPercentage` — always relative to the ORIGINAL starting balance); aggregates `finalBalance`, `totalProfit` (absolute), `totalGainPercentage` (percent). "Total Profit ≠ Total Gain" is enforced by having two differently-named, differently-united fields.
- **Validation (§25/§28)**: `startingBalance > 0`; `periods` integer 1..**1000** (documented cap: ~3 years of daily periods; keeps the row-array response bounded — the prompt's 10 000 000-period pathology is a 400); `gainPerPeriodPercent` ∈ [0, 10 000] (growth-only model — negative rates are not a product concept); any projection crossing **1e15** → 422 `CALCULATION_OVERFLOW` (never `Infinity`).

## 7. Precision Strategy

- **Arithmetic**: `Prisma.Decimal` everywhere in the domain math — no JS float ever enters the calculation pipeline (§18). This is the project's established approach (Accounts' `deriveUnrealizedPnl` precedent); no second decimal library introduced.
- **Wire format**: decimal strings, ≤ 8 fraction digits (mirrors `toDecimalString` and `numeric(18,8)`), trailing zeros stripped, `-0` normalized. Rounding to the wire format happens ONLY at emission (§19) — internal values stay full-precision (`dividedBy` uses decimal.js' 20-significant-digit default, invisible at 8 decimals).
- **Calculation ≠ display precision** (§19): `rawPositionSize` keeps the exact size; `normalizedPositionSize` is the broker-quantized value; both travel separately.
- **Percentage normalization (§12)**: both calculators divide by 100 internally from the percent string; the vectors `0.01 % → 1 $`, `1 % → 100 $` (on 10 000) are pinned by tests — a percent can never silently become a fraction or vice-versa.
- **Frontend parity**: the client keeps its float-based live estimates; on float-safe vectors the server's exact-decimal results render **identical strings** (proved field-for-field by unit tests — §2 row 1). Known float artifacts (e.g. `1.10 − 1.09`) disappear server-side; the floored quantity and realized risk still match.

## 8. Instrument/Broker Dependency Model

- **No universal constants exist** (§9 honored): no hardcoded `XAUUSD`/`EURUSD`/synthetic tables anywhere in the module; every computation receives its spec per request.
- **Spec abstraction (§10)**: `calculatorInstrumentSpecsSchema` — required `pipSize` + `contractSize` (the fields the existing per-instrument contract `instrumentSchema` and the frontend fixtures already carry), optional `volumeStep` (defaults to `"0.01"` — the frontend's actual flooring granularity), optional `minVolume`/`maxVolume` (explicit broker constraints only; `maxVolume < minVolume` is a 400).
- **Canonical source decision (§41)**: the repository has NO canonical server-side instrument source yet — this phase does NOT invent one (no speculative `Instrument` table, §23) and does NOT build provider-spec normalization (no provider returns specs — §42 becomes applicable only when providers expose `fetchInstruments`). The calculator is consumer-agnostic: whenever Accounts/Trading Core introduces the canonical spec source, callers pass those specs through the same input contract.
- **Currency semantics (§20)**: results are in the caller's balance currency (the currency the `balance` input is expressed in). No FX conversion exists in the project — none was invented; quote-currency conversion is a documented limitation (§14).

## 9. API Contracts

Shared contract: `packages/shared/src/schemas/calculators.ts` (Zod, barrel-exported).

```text
POST /api/v1/calculators/lot-size        200 { riskAmount, stopDistance, stopPips,
                                               riskReward|null, rawPositionSize,
                                               normalizedPositionSize, realizedRiskAmount,
                                               volumeAdjustment: NONE|FLOORED_TO_STEP,
                                               status: VALID|BELOW_MINIMUM|ABOVE_MAXIMUM }
POST /api/v1/calculators/compounding     200 { startingBalance, periods, gainPerPeriodPercent,
                                               rows: [{ period, startingBalance, endingBalance,
                                                        periodProfit, cumulativeProfit,
                                                        cumulativeGainPercentage }],
                                               finalBalance, totalProfit, totalGainPercentage }

Errors: 400 { error: "ValidationError", issues: [...] }   — shape/range (incl. entry==stop, risk > 100,
                                                            periods ∉ [1,1000], gain ∉ [0,10000])
        401 { error: "Unauthorized" }                      — anonymous (guards are global)
        422 { error: "BusinessRule", code }                — POSITION_SIZE_BELOW_MINIMUM | CALCULATION_OVERFLOW
```

- Both routes `@HttpCode(HttpStatus.OK)` — a calculation creates **no resource** (repo convention from `security-center.controller`).
- Unknown fields are **stripped** (repo-wide Zod convention — mass-assignment-safe; proven by e2e).
- **Documentation note (§56)**: calculator output is INFORMATIONAL — never an execution instruction; units are account-currency for money, price-units/pips for distances, percent strings for percentages; precision is 8-decimal wire rendering of full-precision computations.

## 10. Database Changes

**None.** Zero Prisma schema changes, zero migrations (§23/§53: no persistence merely because the calculator exists; the frontend exposes no history/saved-calculations feature). `prisma validate` passes on the unchanged schema; `prisma migrate deploy` on the dev DB applies the pre-existing migration set only.

## 11. Security/Ownership Model

- **Authentication**: global `JwtAuthGuard` (no `@Public`) — anonymous calculation is a 401 (§45). Rate limiting: global `ThrottlerGuard` (120 req/min default) — calculations are O(1)/O(1000) max, no second limiter (§52).
- **No cross-user surface (§46)**: the contract accepts NO account ID, instrument ID or any resource identifier — the IDOR vector (User A using User B's account) cannot be expressed. Verified by e2e: forged `accountId`/`userId`/`role`/`providerResourceId` fields are stripped and produce byte-identical responses.
- **No injection surface (§45/§61)**: the contract accepts only decimal strings and enums — no formula field, no user code, no scripting engine. `formula: "balance * process.exit(1)"` in a payload is stripped; the result is unchanged. `NaN`/`Infinity` strings fail the decimal-string regex (400).
- **No persistence, no state (§53)**: results carry no `id`/`createdAt`; identical payloads produce identical responses for the same and for different users (determinism proven by e2e); nothing is written to PostgreSQL.
- **No execution (§43)**: the module holds no order/position capability; probe routes (`/calculators/execute`, `/calculators/order`, `/calculators/history*`) return 404.
- **No secret/data leakage (§57)**: responses contain only computation results — e2e asserts no email/secret material in payloads; logging adds nothing beyond the Phase 1 request logs (no financial payload logging).

## 12. Tests Executed

**Unit — `test/unit/calculators-logic.spec.ts` (30, all executed and passing):**

- Known-value vectors (§49/§50): EURUSD 10-pip reference (budget 100 → size 0.1, pips 100, RR 5); floor policy 0.13698…→ 0.13 with realized 94.9 ≤ 100; broker `volumeStep` 0.1; 1 000 @ 10 % × 3 → **1100/1210/1331** row-exact; compounding-from-previous-ending (500 @ 20 % × 4 → 600/720/864/1036.8 — simple interest would give 900); fractional gain 3.33 % exactness; 10 000 % boundary → 101³.
- Invariants (§47): risk% ↑ ⇒ risk amount & size ↑; stop distance ↑ ⇒ size ↓; **realized risk ≤ budget** across steps/distances/contracts; positive rates never decrease balances; zero rate flat; one-period exactness; higher rate ⇒ higher final; 1 000-period run consistent (rendered tail == aggregates) and < 2 s.
- Percentage normalization (§12): 1 %/0.5 %/0.01 % vectors; 100 % boundary with 1e12 balance (float-cents-breaking).
- Frontend parity (§58): `suggestPositionSize` field-for-field (quantity/riskAmount/stopDistance/stopPips) on 4 vectors (forex, gold, crypto); `computeRR` sign semantics incl. negative ratio.
- Edge cases (§48): entry == stop (contract + domain double-guard), risk > 100, `maxVolume < minVolume`, budget < one step → `POSITION_SIZE_BELOW_MINIMUM` (422 code), zero/negative/fractional periods, out-of-range gains, `CALCULATION_OVERFLOW` guard instead of `Infinity`.

**e2e — `test/e2e/calculators.e2e.spec.ts` (11, all executed and passing, real app + real PostgreSQL):**

- Anonymous 401 on both routes; contract-conformant happy paths (Zod-parsed, vector-exact); unknown-field stripping with forged IDs/formula → byte-identical responses; 10 malformed-input cases → 400; 422 codes; broker statuses un-clamped; user A ≡ user B determinism + no identity leakage; negative capability (10 probe routes → 404); no-persistence assertions.

## 13. Verification Results

| Check (§64) | Command | Result |
|---|---|---|
| Typecheck API | `pnpm typecheck` (apps/api) | ✅ pass |
| Typecheck shared | `pnpm build` (tsc --noEmit, packages/shared) | ✅ pass |
| Typecheck web | `tsc -p tsconfig.json --noEmit` (apps/web) | ✅ pass |
| Lint API | `pnpm lint` (apps/api) | ✅ pass (0 problems) |
| Lint web | `pnpm lint` (apps/web) | ⚠️ 11 errors/2 warnings — **pre-existing** in `apps/web/scripts/*.js`, proven identical with this phase's changes stashed (`git stash -u`); no web file was modified by Phase 18 |
| Unit tests | `pnpm test` | ✅ 30/30 new |
| Full suite (§62 regression) | `pnpm test` | ✅ **242/242** (18 files — identity, security ×3, monitoring, accounts, app + new calculators; zero regression) |
| Build | `pnpm build` (apps/api) | ✅ pass, artifact emitted |
| Prisma validation | `prisma validate` | ✅ schema valid (unchanged) |
| Migration verification | `prisma migrate deploy` (dev DB) | ✅ all pre-existing migrations applied — none added |
| Runtime verification | compiled `main.js` boot on dev DB + real HTTP calls | ✅ `/health` OK; register→verify→login→**lot-size 200 vector-exact** → **compounding 200 (1100/1210/1331)**; anonymous → **401**; overflow → **422 CALCULATION_OVERFLOW**; entry==stop → **400 with issues** |

Not executed: none of the available checks were skipped.

## 14. Known Limitations

1. **No frontend consumer yet** — the Position Sizer remains client-side-only (its live estimates continue to serve the trade form). The endpoints are the authoritative layer the prompt mandates; wiring the sizer (or a future standalone calculator screen) to call them is a frontend-phase decision. **Status: implemented & verified backend-side, intentionally unconsumed.**
2. **Compounding has no frontend counterpart at all** — its contract was defined by this phase (§21–§26), so no UI-compatibility claim is possible or made.
3. **No canonical server-side instrument source** — specs are per-request inputs; the calculator cannot resolve "the specs of instrument X" on its own (deliberate, §8/§41).
4. **No currency conversion** — results are denominated in the caller's balance currency; quote-currency ≠ balance-currency situations return the raw math with no FX (§20: clear limitation, never an invented rate).
5. **Percent-cap design decisions** are product definitions of this phase (risk ≤ 100 %; gain ≤ 10 000 %/period; ≤ 1 000 periods; 1e15 overflow guard) — documented in the contract and above, adjustable in one place.
6. **Web lint is red** for reasons predating this phase (scripts folder) — left untouched per §70 ("do not refactor unrelated domains").

## 15. Deferred Work

| Item | Reason |
|---|---|
| **Phase 9 — Backtesting** | **DEFERRED (unchanged)** — the Backtesting frontend/product module has not been implemented. Not touched (§67). |
| Account-integrated defaults (`accountId` → canonical balance/specs, §35/§36) | No frontend consumer; Accounts balance semantics (snapshot vs. journal balance) deserve their own design when consumed. The input contract needs no change to add it. |
| Canonical `Instrument` specification source (model/endpoint/provider specs) | Belongs to the future Trading Core / Market Data context (§41); this phase provides the consumer-agnostic input abstraction. |
| Advanced compounding `A = P(1+r/n)^(n·t)` | No product surface (§24) — must never be mixed into the gain-per-period model. |
| Calculator history / saved calculations | No frontend feature (§53/§54); if it appears, it needs its own ownership + `calculationVersion` design (§55). |
| Frontend wiring of the sizer to the authoritative endpoint | Frontend work, next phase's call; shared contract already exported. |

### Status legend summary

- **Implemented**: shared contract, lot-size domain + API, compounding domain + API, module wiring, tests, documentation.
- **Verified**: all of the above (§12/§13) — vectors, invariants, parity, validation, security negatives, regression, build, runtime HTTP.
- **Not verified**: nothing from the implemented scope; frontend compatibility beyond parity tests is **not applicable** (no frontend consumer — §14.1).
- **Deferred**: the table above; nothing speculative was built.

**Phase 18 ends here. STOP — no Backtesting, no OCR, no AI, no quantitative optimization, no new market-data infrastructure, no unrelated refactors (§70).**
