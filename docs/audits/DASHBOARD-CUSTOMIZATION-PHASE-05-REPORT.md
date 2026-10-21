# Dashboard Customization — Phase 05 Report
## Performance Insights, Pattern Analysis & Trading Behavior

Date: 2026-10-19 · HEAD at delivery: see git log (step 1 commit `141a247` + step 2/3 commit)
Spec: `docs/specs/dashboard-customization/PHASE-05-PERFORMANCE-INSIGHTS-PATTERN-ANALYSIS.md` (verbatim owner spec on disk)

> Context note: the sandbox restore of 2026-10-19 rolled the repository back to
> Phase 03 (`7b83374`); a previously delivered Phase 05 (sessions of 2026-10-18,
> commit `e6c0774`-line) was lost with no recoverable git objects (worklog task
> 14). This report describes the REBUILD from the verbatim spec on disk.

---

## A. Audit findings (spec §2)

- **Phase status verified**: 01 (customization foundation, `81513e1`), 02 (widget
  configs & performance analytics, `e3b773a`), 03 (global filters & saved views,
  `7b83374`) are implemented and committed; Phase 07 (alert rules, `1da3d75`)
  exists and is unaffected by this phase.
- **Authoritative calculation layer**: `GET /stats/analytics-suite` (Analytics
  module, engine `apps/api/src/modules/analytics/domain/analytics-suite.ts`) —
  one filtered chronological closed-trade dataset feeding every aggregate.
  The suite already owned: per-strategy rows, symbol/asset-class rows, direction
  rows, weekday/hour/session buckets, weekday×hour heatmap, tilt timeline
  (`isSpike = streak≥2 && risk > prev×1.2`), `advanced.streaks`, and three
  anomaly detectors (TAIL_LOSS / OVERTRADING / LOSS_STREAK, min sample 10).
- **Reusable pieces consumed**: the suite's already-sorted `closed` rows (no
  second read), the existing breakeven convention of `advanced.streaks`
  (breakeven neither extends nor breaks a run — reused verbatim), the MSW
  store's fixture rows, the widget registry/library/templates infrastructure of
  Phases 01–02, and the Phase 03 filter context + saved-view scope.
- **Data limitations found (honest seams)**:
  - `AnalyticsTradeRow` deliberately excludes emotion/confidence/tags — the
    emotion/tag suite filters remain honest empties; behavioral insight
    generators therefore use direction, timestamps, P&L/R, risk amounts only.
  - MFE/MAE stay unavailable (`quality.excursionAvailable: false`) — untouched.
  - Direction is schema-guaranteed (`BUY|SELL`); the §5 exclusion rule is still
    implemented and unit-tested for forward-compatibility.
  - **Wiring gap found**: the three Phase 02 suite-fed widgets
    (STRATEGY_COMPARE / LONG_SHORT / ACTIVITY_HEATMAP) each fetched their own
    `{period:"ALL"}` suite and ignored the filter-aware context fetch — while
    the Phase 03 registry declared them FULL. Closed in this phase (see §B/§D).

## B. Implemented features (spec §4–§9)

1. **ONE deterministic insights engine** — `packages/shared/src/analytics/insights.ts`,
   consumed by BOTH the API suite and the MSW mirror (mock parity cannot drift):
   - `computeDurations` — 6 holding-duration buckets (≤15m / 15–60m / 1–4h /
     4–24h / 1–7d / >7d), trades without an exit timestamp counted as
     `excludedMissingTimestamp` (never hidden), money null under multi-currency.
   - `computeStreakProfile` — current/longest loss streak, distribution,
     average, follow-window performance after ≥3-loss streaks (next 3 trades,
     overlapping windows deduplicated), documented breakeven rule shipped in
     the payload.
   - `deriveInsights` — 8 deterministic generators, one insight max per
     category (stable ids = category): DIRECTIONAL, TIME_PATTERN (weekday),
     STREAK (active streak fact), OVERTRADING (busy days vs the trader's own
     normal days — a high count is never labeled bad by itself), LOSS_FOLLOWING
     (trade entered ≤90 min after a losing exit, reported only when the cluster
     actually fared worse, neutral language, "not proof of revenge intent"),
     RISK_BEHAVIOR (sizing after losses vs wins; gated at 60% risk-data
     coverage AND single currency), DETERIORATION (equal chronological halves),
     DURATION (holding-time comparison).
2. **Suite sections (additive contract)**: `durations`, `streakProfile`,
   `insights` (+ `methodology` rules) on `analyticsSuiteResponseSchema`; wired
   into the routed AnalyticsModule engine AND both legacy parity builders
   (`stats.service.ts`, `stats.suite.ts`) — no second query, no N+1 (§11).
3. **Four opt-in dashboard widgets** (registry + library + renderer; the
   default arrangement never grows):
   - PERFORMANCE_BREAKDOWN — one factual table across a configurable dimension
     (strategy/instrument/direction/weekday/hour/duration/asset-class),
     busiest-first display order (presentation, not ranking), display cap 8
     with an honest "+N more" note, per-row sample sizes, "—" for unavailable
     cells, mixed-currency note instead of raw sums.
   - BEHAVIORAL_INSIGHTS — findings with typed metrics, observation count,
     reliability label (tooltip explains it), analyzed period, and the
     methodology footnotes rendered verbatim; empty state explains the
     thresholds ("Comparisons need at least 5 observations per group…").
   - LOSS_STREAKS — summary trio, distribution bars, after-streak block,
     breakeven rule rendered next to the data.
   - PERFORMANCE_TREND — last 6 ISO-week rollups (trades/net P&L/R/win rate)
     with labeled week keys, ΔR vs previous week, "measured history, not a
     forecast" footnote.
4. **§10 filter integration closed**: all seven suite-fed widgets now consume
   the single dashboard-level, filter-aware suite fetch (`SUITE_WIDGET_TYPES` +
   `widgetData.suiteStatus`); widget copy updated ("under the active filters").
   Saved views reproduce scope because the suite query key IS the filter set.

## C. Calculation definitions (spec §13/§8 documentation duty)

- **Minimum samples**: a generator emits only when EVERY compared group holds
  ≥ 5 observations (deterioration halves: ≥ 10 each; overtrading additionally
  needs ≥ 3 busy days; time/duration comparisons need ≥ 2 eligible buckets).
- **Reliability labels** (observation-count bands, explicitly NOT statistical
  confidence): ≥ 50 STRONG_EVIDENCE, ≥ 20 REPEATED_PATTERN, else
  EARLY_OBSERVATION. Suppressed findings are never rendered as facts.
- **Streak rule**: loss = net P&L < 0; breakeven (= 0) neither extends nor
  breaks a run (same as `advanced.streaks`); follow window = 3 trades after
  each ≥3-loss streak end; overlapping windows count each trade once.
- **Loss-following rule**: rows entered ≤ 90 minutes after a losing trade's
  exit; group compared with all other rows on avg R; reported only when worse.
- **Ranking formula**: reliability weight (3/2/1) → effect size (R
  differences capped at 1.0; win-rate deltas scaled by 0.25; risk ratio-1) →
  observations (min of both groups) → stable id. Ranking orders findings for
  review; it does not predict future performance.
- **Timezone rules**: weekday buckets use the journal's persisted user-tz
  trading-day key; duration uses raw entry→exit instants; no new timezone
  logic was introduced.
- **Missing-data behavior**: money aggregates null under multi-currency
  (R/count/rate survive); missing exit → excluded from duration buckets and
  counted; missing risk → risk insight gated; nothing is fabricated.

## D. Files changed

- `packages/shared/src/analytics/insights.ts` (NEW) — the shared engine +
  wire schemas; `packages/shared/src/index.ts` exports it.
- `packages/shared/src/schemas/api.ts` — suite response += 3 sections.
- `packages/shared/src/schemas/settings.ts` — 4 widget keys +
  `performanceBreakdownWidgetConfigSchema` + union + type.
- `apps/api/src/modules/analytics/domain/analytics-suite.ts` — Phase 05 block
  (row mapping + engine calls + response fields).
- `apps/api/src/modules/stats/stats.service.ts`, `stats.suite.ts` — same
  sections in the two legacy parity builders.
- `apps/web/src/mocks/store.ts` — MSW mirror calls the SAME engine.
- `apps/web/src/lib/dashboard-customization/insights-view.ts` (NEW) — pure
  view-models (breakdown/trend/insight formatting, SuiteStatus type).
- `apps/web/src/lib/dashboard-customization/{widget-configs,widget-settings,registry}.ts`
  — defaults, settings panel, registry entries.
- `apps/web/src/components/dashboard/performance-breakdown-card.tsx` (NEW),
  `behavioral-insights-card.tsx` (NEW), `loss-streaks-card.tsx` (NEW),
  `performance-trend-card.tsx` (NEW).
- `apps/web/src/components/dashboard/{strategy-compare,long-short,activity-heatmap}-card.tsx`
  — refactored to the shared context suite (loading/error via `suiteStatus`).
- `apps/web/src/components/dashboard/customization/widgets-renderer.tsx` —
  suiteStatus plumbing + 4 new cases; `dashboard-view.tsx` — SUITE_WIDGET_TYPES
  + suiteStatus; `widget-settings-dialog.tsx`, `widget-icons.ts` — dimension
  select + 4 icons.
- Tests: `apps/api/test/unit/insights-engine.spec.ts` (NEW),
  `test/e2e/analytics.e2e.spec.ts` (+1 section test),
  `apps/web/src/lib/dashboard-customization/__tests__/insights-view.spec.ts` (NEW),
  `__tests__/widget-registry.spec.ts` (suite-fed set updated),
  `test/e2e/settings.e2e.spec.ts` (oversized-order generator updated to the
  15-key canon — the assertion, not the bound, was wrong).
- Probe: `apps/web/scripts/probe-dashboard-insights.js` (NEW, 21 checks).

## E. Validation

- API: unit `insights-engine.spec.ts` 17/17; full API suite **1316/1316**
  (embedded Postgres, real AppModule) — includes the new analytics e2e
  sections test (15/15 in that file).
- Web: vitest **152/152** (includes 8 new insights-view tests); `tsc` clean;
  eslint clean on all changed files; `next build` exit 0.
- Shared: `tsc --noEmit` clean.
- Probes (mock preview, MSW): `probe-dashboard-insights.js` **21/21** —
  four widgets opt-in + render, breakdown rows, insights list (4 findings)
  or honest empty state, methodology footnote, streak rule verbatim, 6-week
  trend, dimension setting applies, suite-fed widgets NOT badged under active
  filters, widgets render under filters, 390px no overflow, zero page errors.
  Regression `probe-dashboard-filters.js` **28/28**.
- Two real findings during probe development were fixed in the PROBE (not the
  product): `dashboard-customize` only exists in view mode (one edit session
  for all adds) and the view-mode gear lives in the grid section wrapper.

## F. Limitations (honest)

- Emotion/tag-based behavioral insights remain impossible until the journal
  projects those fields into the analytics read path — the generators use
  direction/timestamps/P&L/R/risk only; no speculative data.
- RISK_BEHAVIOR uses `riskAmount` (account-currency money) — it is disabled
  for multi-currency scopes rather than summed across currencies.
- The trend widget shows weekly rollups only; daily/monthly rollups exist in
  the payload but are not surfaced by widgets (kept out to avoid a redundant
  KPI card, spec §12).
- Insights are computed over the CURRENT suite scope only; there is no
  cross-period insight baseline beyond the documented deterioration halves.
- The legacy `/stats/overview` route keeps its own unfiltered engine
  (pre-existing parity gap, documented in the audit; out of Phase 05 scope).
- Drill-down navigation from findings to the journal is not implemented (the
  spec allows it "where supported" — the trades page has no deep-link filter
  contract yet); finding descriptions carry period + scope instead.

## G. Phase status

**COMPLETE** within the documented v1 scope. Evidence: engine unit tests
17/17 pinning every documented rule; full API suite 1316/1316; web 152/152;
build + lint + typechecks clean; probes 21/21 + regression 28/28. Every
finding ships with its sample size, reliability label and analyzed period;
no AI/ML/LLM/predictive component exists anywhere in the diff.

## H. Phase 06 readiness

Phase 06 (workspaces, layout collections & templates) prerequisites per its
spec §2 — Phases 01–05 implemented and verified — are now satisfied: 01/02/03
were already committed; 05 is delivered by this rebuild with the §10 filter
integration closed. Remaining prerequisites: none known in-repo. The Phase 06
spec is on disk (`PHASE-06-WORKSPACE-MANAGEMENT-LAYOUT-COLLECTIONS-TEMPLATES.md`).
Phase 06 must not start from this report's status alone — the owner's
instruction sequence (next phase order) governs.
