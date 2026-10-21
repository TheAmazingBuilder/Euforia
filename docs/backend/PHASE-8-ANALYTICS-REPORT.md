# COSMOZ — BACKEND PHASE 8 REPORT
## Analytics & Behavioral Trading Analytics

> Scope: Phase 8 only (§0/§76). Phases 0–7 were audited and are complete (398/398
> tests at Phase 7). No business domain outside Analytics was implemented. STOP
> after this report — no Phase 9.

---

## 1. What was implemented

A production-grade **Analytics bounded context** as a consumer of canonical
domain truth (§2), delivered as live in-memory aggregation over the journal
the Trading Core owns:

- **`GET /api/v1/stats/analytics-suite`** — the Analytics module's ONE dataset
  definition (§5 of the product). Every tab of the existing frontend module
  (Overview, Performance, Risk, Strategy, Market, Time, Psychology, Trade
  Quality, Mistakes, Events, Advanced, Monte Carlo, Reports) renders the same
  filtered closed-trade set; the client only formats. Response blocks:
  meta (descriptor / warnings / anomalies / currency scope), summary (29
  fields incl. PF, expectancy, Sharpe/Sortino/SQN with server-side
  methodology notes), equity curve, cumulative R, rolling(10), daily P&L,
  R/P&L/duration histograms, drawdown periods (cap 6, honest recovery
  semantics), risk exposure + planned-vs-realized buckets, strategy rows,
  symbol/asset-class/direction rows, sessions/hours/weekdays/heatmap,
  psychology (tilt timeline), trade quality (plan adherence), mistakes,
  economic-event context, advanced R statistics + streaks, seeded Monte
  Carlo, and daily/weekly/monthly report rollups.
- **`GET /api/v1/stats/overview`** — the dashboard/session KPI aggregation
  (KPIs, equity curve, day P&L, 7-day deltas, weekly sparklines, weekly
  compare bands, ghost-regret blocks).
- **Behavioral analytics V1 (§23–§32)** — deterministic, statistical,
  explainable, evidence-based; NO AI/LLM (§50):
  - `TAIL_LOSS` — worst 5 % of losers vs total loss mass (WARN ≥ 40 %, ALERT ≥ 55 %);
  - `OVERTRADING` — unusually busy days (≥ max(3, 2×median)) underperforming normal days;
  - `LOSS_STREAK` — longest consecutive losing run (INFO ≥ 5, ALERT ≥ 8);
  - tilt timeline — risk spike = ≥ 2 consecutive losses **and** > +20 % risk vs previous.
  All anomaly messages are **measured facts**, never verdicts or diagnoses (§49).
- **Behavioral/insufficient-data honesty (§30/§54)** — below a 10-trade sample the
  engine stays silent; blocks the journal does not own yet (emotions,
  confidence, tags, mistakes, eco-calendar, MFE/MAE excursions) ship
  empty/null with `excursionAvailable: false` — never fabricated.

## 2. Existing functionality reused

- **Canonical P&L/R** stored on `Trade` (Trading Core, Phase 4) — Analytics
  consumes `pnlNet / rMultiple / riskAmount / fees / swap` and never
  re-derives them (§4/§69; data-consistency tests §63 pin parity).
- **Canonical planned RR** — `TradePlan.rrRatio` (Phase 5 risk engine) and the
  review's FROZEN `planSnapshot.rrRatio` (Phase 6); no second RR engine (§29).
- **Public contracts** (Phase 4–7 precedent): `TradingRepository`,
  `TradeReviewRepository`, `TradePlanRepository` + `INSTRUMENT_SPECIFICATION_PROVIDER`,
  `AccountsRepository`, `IdentityRepository` (user timezone), and
  `PlaybookRepository` (strategy names — newly exported, see §4).
- **Shared contracts consumed verbatim** — `analyticsSuiteResponseSchema`,
  `analyticsFiltersSchema`, `statsOverviewResponseSchema`, `ANALYTICS_HOUR_BUCKETS`,
  `ANALYTIC_SESSIONS`, `ANALYTICS_WEEKDAYS`, `EMOTION_LABELS` — ZERO contract
  changes (§42/§65: frontend untouched).
- **Foundation**: Fastify + `/api/v1` versioning, global `JwtAuthGuard`,
  `ZodValidationPipe` → 400 envelope, `AppError` taxonomy, pino structured
  logging, vitest + embedded-postgres harness.

## 3. New domain/components

```
apps/api/src/modules/analytics/
├── analytics.module.ts            # imports 6 bounded contexts (READ-ONLY)
├── analytics.controller.ts        # GET /stats/analytics-suite, GET /stats/overview
├── analytics.service.ts           # orchestration + attribution resolution
└── domain/                        # PURE engines — no framework/Prisma imports
    ├── analytics-input.ts         # normalized engine rows (canonical values pre-parsed)
    ├── analytics-clock.ts         # 13 period presets on the USER trading-day clock
    ├── analytics-math.ts          # percentiles (linear), sample std, skew/kurt,
    │                              # niceStep, mulberry32, deterministic uuid v5
    ├── analytics-suite.ts         # the full dataset engine (one function, pure)
    └── analytics-overview.ts      # dashboard KPI engine
```

Attribution rules (documented seams):
- **strategy**: `Trade → TradeReview.originTradePlanId → TradePlan.strategyId`;
  everything else is honestly "Out of playbook" — attribution NEVER resolves
  against the latest strategy state (§22 version integrity).
- **plannedRR**: `review.planSnapshot.rrRatio` (frozen) ?? origin plan
  `rrRatio` ?? "No plan".
- **instrumentId**: `InstrumentSpecification` id by exact symbol match, else a
  deterministic RFC-4122-v5 group id derived from the raw symbol (stable,
  display-grade group identity — not a DB reference).

## 4. API / contracts added or changed

**New endpoints (both auth-required, ownership from the JWT principal only):**

| Route | Purpose |
|---|---|
| `GET /api/v1/stats/analytics-suite` | The Analytics module dataset; query = shared `analyticsFiltersSchema` (+ `sims`, default 400, clamped 100–2000, unparsable → default) |
| `GET /api/v1/stats/overview` | Dashboard/session KPI aggregation (unfiltered) |

**Shared packages**: ZERO changes — existing schemas consumed verbatim.

**Additive public-contract evolutions** (Phase 4–6 export precedent, no breaks):
- `TradingRepository`: `+listClosedJournalRows(userId)`, `+countOpenTrades(userId)`.
- `TradeReviewRepository`: `listActiveReviewSummaries` select `+originTradePlanId`,
  `+planSnapshot` (additive fields; existing consumers unaffected).
- `TradePlanRepository`: `+listPlanAttributionRows(userId)`.
- `InstrumentSpecificationProvider` port: `+listSpecifications()` (+ adapter impl).
- `PlaybookModule` exports: `+= PlaybookRepository` (closed-context opening,
  same pattern as Trading/TradeReview/TradePlanning exports).
- `AppModule`: `+AnalyticsModule`.

**Deliberately NOT implemented**: `GET /stats/analytics` — the frontend hook
`useAnalytics` has no consumer (dead legacy); implementing it would add an
untested surface with no reader. Documented deferral (§11).

## 5. Database / read-model changes

**NONE.** Live in-memory queries over the existing journal (§36: simplest
architecture that satisfies actual requirements). No analytics tables, no
materialized views, no read models, no cache (the filter bag changes per
request — a cache would be dead code). `prisma migrate status`: **up to date
with 7 migrations** — zero schema change, zero migration. Query patterns reuse
existing indexes (`@@index([userId, status])`, `@@index([userId, tradingDate])`).

## 6. FastAPI integration

**None** — and none is justified yet (§39/§70). All Phase 8 workloads
(percentiles, moments, histogram binning, seeded bootstrap) are cheap in
TypeScript at journal scale (300-trade suite computes in ≈150 ms incl.
4 million PRNG samples). The normalized-input → structured-output boundary
(`analytics-input.ts` → suite response) is the documented future seam; NestJS
keeps auth, ownership, orchestration and persistence (§40).

## 7. Security protections

- **Authentication**: global `JwtAuthGuard` — both routes 401 without a token (e2e).
- **Ownership**: the userId comes ONLY from the auth principal; every source
  query is user-scoped (`listClosedJournalRows`, reviews, plans, accounts,
  strategies) (§46).
- **IDOR**: filtering by another user's `accountId` narrows to an honest empty
  dataset (no rows leak); e2e proves B sees exactly B's journal and never A's
  trade ids/emails (leakage scan) (§46).
- **Privacy (§47)**: behavioral anomaly messages are aggregate facts; no
  payload/financial histories in logs — analytics telemetry logs counters only
  (`closedTrades`, `singleCurrency`, `anomalyCount`, `queryDurationMs`).
- **No psychological diagnosis (§49)**: signal vocabulary, codes, severities,
  messages and hints are factual ("unusually busy days", "consecutive losing
  trades") — the product's correlational wording lives in the frontend.
- **Reproducibility (§52/§53)**: fixed Monte Carlo seed (mulberry32,
  documented constant), deterministic orderings — same journal + same filters
  ⇒ byte-identical response (e2e-pinned).

## 8. Tests executed

- **Unit (80 new)**:
  - `analytics-clock.spec.ts` (20): 13 period presets incl. CUSTOM fallback,
    DST/tz boundaries, Monday-first weeks, ISO week rollover.
  - `analytics-math.spec.ts` (14): linear percentiles, sample std, moments,
    niceStep, PRNG determinism, uuid v5 stability.
  - `analytics-suite-engine.spec.ts` (46): summary math, PF-null on zero gross
    loss, multi-currency nulls, descriptor strings, filters, equity, histograms,
    drawdown state machine (recovered/unrecovered/diggers), risk buckets,
    strategy rows, time buckets, tilt spikes, quality/mistakes/events honest
    seams, advanced stats, Monte Carlo clamps + determinism, report rollups,
    anomaly thresholds (TAIL_LOSS/OVERTRADING/LOSS_STREAK).
- **e2e (14 new)**: auth boundary, user isolation + IDOR filter + leakage scan,
  schema-valid exact-metric suite over a reference journal (vs canonical DB
  values §63), determinism, full filter bag, 400 validation battery, empty
  journal honesty, overview blocks, 300-trade performance smoke.
- **Full suite**: **492/492 tests green (30 files)** — includes Phases 1–7
  regression.

## 9. Verification results

| Check | Result |
|---|---|
| API typecheck (`tsc --noEmit`) | ✅ |
| API lint (`eslint . --max-warnings=0`) | ✅ |
| API build (`tsc -p tsconfig.build.json`) | ✅ |
| Full test suite | ✅ 492/492 (30 files) |
| Shared package typecheck | ✅ (zero changes) |
| Web typecheck | ✅ (zero changes — frontend untouched §65) |
| Migrations | ✅ `up to date` — zero schema change |

## 10. Known limitations

1. **Strategy attribution is chain-based**: trades not explicitly linked
   (review → origin plan) count as "Out of playbook" even if the trader
   mentally used a strategy. The documented fix is a Trading Core attribution
   column (`Trade.strategyId`) — Phase 7's recommended evolution, OUT of
   Phase 8 scope (no unrelated-module redesign §70).
2. **Honest empty blocks**: emotions, confidence bands, tags, mistakes ledger,
   eco-event context and MFE/MAE excursions render empty/null until their
   owning domains exist (Discipline/Mistakes, Eco Calendar, intratrade
   high/low capture). The suite is contract-complete and flags availability
   (`excursionAvailable: false`, `calendarCoverage: null`) instead of
   fabricating data.
3. **`/stats/analytics` deferred**: the legacy response shape has no UI
   consumer (dead hook); the mock still implements it, the API does not.
4. **`trade-views` presets (scope ANALYTICS)** are frontend calls to a module
   owned by the Trades domain upgrade — not implemented backend (out of scope).
5. **Overview discipline/ghost blocks are honest zeros**: DailyStat
   materialization and the Regret Registry (ghost trades) are future bounded
   contexts; the contract ships nulls/zeros as specified.
6. **Monte Carlo is a fixed-seed simulation** — deterministic by design;
   changing the seed or detector versions requires the §53 versioning
   discussion (documented in the methodology string).

## 11. Recommended next phase

1. **Trading Core attribution evolution** (Phase 7 §II already recommended):
   add `Trade.strategyId / setupId / strategyVersionId` with freeze-before-
   mutation semantics — it lights up the entire Strategy tab and the
   strategyId filter end-to-end (currently chain-based).
2. **Discipline/Mistakes + DailyStat materialization** — feeds the overview
   discipline score, mistakes ledger and the Cosmoz Index.
3. **Eco calendar backend** — completes the Events tab.
4. **Saved views (`/trade-views`) with ANALYTICS scope** — presets UX.
5. Session Live / Backtesting / Academy remain **out of scope until
   explicitly instructed** (§76 STOP respected).
