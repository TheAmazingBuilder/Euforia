# EUFORIA — DASHBOARD CUSTOMIZATION
## PHASE 05: PERFORMANCE INSIGHTS, PATTERN ANALYSIS & TRADING BEHAVIOR

### 1. ROLE AND OBJECTIVE

Act as a senior software engineer, quantitative trading analytics specialist, product designer, and QA engineer working on Euforia.

Your task is to audit the actual repository, verify the implementation of Phases 01–04, and implement Phase 05 as a production-quality extension of the existing dashboard.

The objective is to help traders understand their historical performance by identifying measurable trading patterns, comparing performance across relevant dimensions, and highlighting behavioral tendencies that may be associated with poor outcomes.

This is a deterministic analytics feature. **Do not use AI, machine learning, LLMs, predictive models, or automated trading recommendations.**

Implement the feature, test it, and provide an evidence-based completion report. Do not stop after writing a plan.

### 2. MANDATORY REPOSITORY AUDIT

Before modifying code, inspect:

- The current dashboard and widget registry.
- The actual implementation of Phases 01–04.
- Existing trade, account, strategy, instrument, and execution data models.
- Existing analytics and performance calculation services.
- Existing date-range, account, strategy, instrument, and direction filters.
- Existing saved analytical views and dashboard persistence.
- Existing chart components and design tokens.
- Trade timestamps, timezone handling, trade direction, realized P&L, commissions, and other available execution fields.
- Existing tests, mock data, API contracts, and authorization mechanisms.

Reuse existing calculation services and components where appropriate.

Do not assume that previous phases are complete. If a required capability is missing, identify the gap and implement only the minimum necessary integration for this phase.

Do not rewrite existing modules or duplicate previously implemented features.

### 3. ANALYTICS PRINCIPLES

All insights must be derived from real, available trade-journal data or clearly labeled deterministic development fixtures.

Every insight must be:
- Explainable.
- Reproducible.
- Based on explicitly defined rules.
- Consistent with existing metric definitions.
- Respectful of the user's active analytical scope.
- Accompanied by sample size and relevant context where appropriate.

Never present correlation as causation.

Never claim that a pattern is statistically significant unless a suitable statistical test is implemented and its assumptions are satisfied.

Avoid presenting conclusions from small samples as reliable findings. Use configurable minimum-sample thresholds and display the number of observations supporting each finding.

When data is unavailable, incomplete, or insufficient, explain that limitation instead of fabricating an insight.

### 4. PERFORMANCE PATTERN ANALYSIS

Implement performance breakdowns across the dimensions that are actually supported by the repository.

Potential dimensions include:

- Instrument or symbol.
- Trading strategy.
- Long versus short direction.
- Day of the week.
- Trading hour or session, when timestamps and timezone information are reliable.
- Holding duration, when entry and exit timestamps are available.
- Account.
- Trade setup or tag, if the journal already supports them.
- Risk-to-reward category, if reliable risk data exists.

For each supported dimension, calculate relevant metrics such as:

- Number of closed trades.
- Net realized P&L.
- Win rate.
- Average win.
- Average loss.
- Profit factor.
- Average realized R-multiple, when available.
- Average holding duration, when available.

Use the existing authoritative calculation layer.

Define edge cases explicitly:
- No closed trades.
- No winning trades.
- No losing trades.
- Zero gross losses.
- Missing strategy or instrument.
- Missing timestamps.
- Insufficient observations.
- Mixed account currencies.

Do not calculate profit factor as a meaningful finite number when gross losses are zero without explicitly handling and labeling that case.

Do not aggregate monetary results across currencies without a reliable conversion mechanism.

### 5. LONG VS SHORT COMPARISON

Provide a direct comparison of long and short performance when trade direction is available.

Display, where supported:
- Closed-trade count.
- Net realized P&L.
- Win rate.
- Average win and loss.
- Profit factor.
- Average R-multiple.
- Relevant risk metrics.

Ensure both directions use the same date range, filters, and metric definitions.

Allow users to inspect the underlying trades supporting a comparison if the existing application supports safe drill-down navigation.

Do not infer trade direction from a symbol or profit sign when explicit direction data is available.

If direction data is missing or ambiguous, exclude affected trades from the directional comparison and disclose the excluded count.

### 6. TIME-BASED PERFORMANCE ANALYSIS

Implement day-of-week and time-of-day breakdowns only when timestamp quality and timezone semantics support them.

Requirements:
- Use the existing user or account timezone convention.
- Document how timestamps are converted.
- Avoid mixing local time and UTC buckets.
- Respect the selected date range and active filters.
- Distinguish trade entry time from exit time.
- Use entry time for entry-session analysis unless the existing domain explicitly defines a different convention.
- Display sample sizes for every bucket.
- Handle missing timestamps explicitly.

If the application does not contain reliable session definitions, do not invent exchange sessions. Use clearly labeled time buckets or leave session analysis unsupported.

### 7. TRADING BEHAVIORAL ANALYTICS

Implement deterministic behavioral indicators only where the available data supports them.

#### A. Overtrading indicators

Possible measurements:
- Number of trades per day or session.
- Trading frequency relative to the user's own historical baseline.
- Performance before and after unusually high trading frequency.
- Consecutive entries within a configurable time window.

Do not label a high trade count as inherently bad. Compare it with the trader's own history and show the associated outcomes.

#### B. Potential revenge-trading patterns

Identify observable sequences that may be consistent with revenge-trading behavior, for example:
- A new trade entered shortly after a realized loss.
- Increased position risk following a loss, if reliable risk-per-trade data exists.
- A cluster of trades following a loss with deteriorating aggregate results.

Use neutral language such as "loss-following trade cluster" or "potential revenge-trading pattern."

These are behavioral indicators, not proof of the trader's intent or psychological state.

Define the time window, sequence rules, required fields, and minimum sample size. Make thresholds configurable where appropriate.

#### C. Performance deterioration

Detect measurable changes such as:
- Declining win rate across consecutive comparable periods.
- Deteriorating profit factor.
- Increasing average loss.
- Negative changes in average R-multiple.
- Increasing drawdown, if a reliable equity or balance series exists.

Compare equivalent periods and disclose the sample size for each period.

Do not generate conclusions from periods with materially different sample sizes without showing that difference.

#### D. Loss-streak analysis

Where chronological trade outcomes are reliable, calculate:
- Current consecutive loss streak.
- Longest loss streak within the selected range.
- Historical distribution of loss-streak lengths.
- Performance following a loss streak, if sufficient observations exist.

Clearly define whether breakeven trades break a streak or are ignored. Follow a consistent documented rule.

#### E. Risk consistency

If reliable risk-per-trade data exists, examine:
- Variation in risk between trades.
- Risk changes following wins and losses.
- Trades exceeding a configured or historical risk baseline.

Do not claim risk-limit violations unless an explicit limit exists and the required data is available.

If risk data is absent, mark these analyses as unsupported instead of estimating risk from P&L.

### 8. INSIGHT GENERATION ENGINE

Build a deterministic and testable insight engine.

Each insight should have a structured representation containing, where appropriate:

- Stable identifier.
- Insight category.
- Title.
- Concise description.
- Supporting metric values.
- Comparison baseline.
- Observation count.
- Period analyzed.
- Relevant account, strategy, or instrument scope.
- Confidence or reliability label based on transparent rules.
- Explanation of missing data or limitations.
- Optional navigation target to relevant analytics or trades.

Use neutral reliability labels such as:
- Insufficient data.
- Early observation.
- Repeated pattern.
- Strong historical evidence, only when explicitly justified by the implemented methodology.

Do not call these statistical confidence levels unless they are derived from a valid statistical procedure.

Avoid duplicate or contradictory insights.

Prioritize findings by transparent criteria, such as:
- Magnitude of observed performance difference.
- Number of supporting observations.
- Recency.
- Relevance to the current filter scope.

Document the ranking formula. Do not imply that the ranking predicts future performance.

### 9. DASHBOARD WIDGETS

Integrate the following widgets into the existing customizable dashboard system where appropriate.

#### A. Performance Breakdown

Compare performance across strategies, instruments, or other supported dimensions.

#### B. Long vs Short

Compare directional performance using consistent calculations and filters.

#### C. Trading Activity Heatmap

Display trading frequency or realized performance by day and time bucket when timestamp data supports it.

Use an accessible visual scale, meaningful tooltips, and explicit labels. Do not rely on color alone.

#### D. Behavioral Insights

Display deterministic findings with:
- A concise explanation.
- Supporting metrics.
- Sample size.
- Reliability label.
- Relevant time range.
- A way to inspect supporting data when supported.

#### E. Loss-Streak Analysis

Display current and historical loss-streak information with clear definitions.

#### F. Performance Trend Comparison

Compare consecutive or selected periods using equivalent metrics and clearly labeled dates.

All widgets must reuse the existing widget registry, customization mechanisms, design system, and persistence model.

Do not create a parallel dashboard system.

### 10. GLOBAL FILTERS AND SAVED ANALYTICAL VIEWS

Integrate with Phase 03 only after verifying its actual implementation.

Ensure that:
- Insights respect applicable active filters.
- Date ranges are applied consistently.
- Account and strategy scopes are preserved.
- Unsupported filters do not silently change the analysis.
- Saved views reproduce the same analytical scope when reapplied.
- Changing filters refreshes affected widgets and insights.
- Insight descriptions identify the relevant period and scope.
- Drill-down actions preserve relevant filters where possible.

Do not rebuild the global filter system or saved-view management.

### 11. DATA ARCHITECTURE AND PERFORMANCE

Prefer computing insights from existing domain data and analytics services.

Requirements:
- Separate calculation logic from UI presentation.
- Use typed inputs and outputs.
- Avoid N+1 queries.
- Avoid repeated full-history aggregation for each widget.
- Reuse existing caching and query invalidation mechanisms.
- Paginate or limit trade-level drill-down where necessary.
- Respect user ownership and authorization.
- Avoid exposing another user's trades or analytics.
- Avoid unnecessary persistence of derived insight results.

Persist computed insight snapshots only if there is a documented performance or historical reproducibility requirement.

If snapshots are stored, define their invalidation and refresh behavior when trades change.

Use deterministic mock fixtures only where needed for development and tests. Never confuse fixtures with actual trading data.

### 12. UI, ACCESSIBILITY, AND RESPONSIVENESS

Maintain Euforia's existing visual identity and design tokens.

Requirements:
- Clear hierarchy and compact analytical layouts.
- Consistent financial formatting.
- Accessible chart labels and tooltips.
- Responsive behavior.
- Dark and light theme compatibility where supported.
- Loading, empty, error, and insufficient-data states.
- Clear explanations for specialized metrics.
- Keyboard accessibility for controls.
- No hardcoded colors when design tokens are available.
- No misleading visual emphasis that makes weak patterns appear conclusive.

Avoid unnecessary animations, decorative charts, and redundant KPI cards.

### 13. TESTING

Add tests for the calculation layer, insight engine, API, and UI according to the existing test infrastructure.

Cover at least:

**Performance calculations**
- Empty datasets.
- Zero-loss and zero-win cases.
- Mixed currencies.
- Missing fields.
- Directional comparisons.
- Insufficient observations.
- Date boundaries and timezone conversion.
- Consistency across equivalent filters.

**Behavioral analytics**
- Loss-following trade sequences.
- High-frequency trade clusters.
- Risk changes following losses.
- Consecutive losing streaks.
- Breakeven-trade handling.
- Performance deterioration.
- Small-sample suppression.
- Missing timestamps or risk data.

**Insight engine**
- Stable and deterministic output.
- Duplicate suppression.
- Ranking consistency.
- Reliability-label correctness.
- No unsupported claims.
- Correct handling of missing data.

**Integration**
- Filter changes update applicable insights.
- Saved views preserve analytical scope.
- Trade updates invalidate or refresh affected calculations.
- Authorization prevents cross-user data exposure.
- Widgets handle loading, empty, error, and insufficient-data states.

Run the relevant tests and existing project quality checks. Fix regressions introduced by this phase.

### 14. STRICT SCOPE BOUNDARIES

This phase includes:
- Historical performance breakdowns.
- Long-versus-short comparisons.
- Time-based analysis where supported.
- Deterministic behavioral indicators.
- Loss-streak analysis.
- Performance deterioration analysis.
- Explainable insight generation.
- Dashboard widget integration.

This phase excludes:
- AI or machine-learning models.
- LLM-generated insights.
- Predictive analytics.
- Automated trading recommendations.
- Order execution or trade modification.
- New broker integrations.
- External market-data integrations.
- Automated alerts, emails, or push notifications.
- Reimplementation of previous phases.
- Starting Phase 06.

Euforia remains a read-only trading journal and analytics application with respect to broker trading operations.

### 15. IMPLEMENTATION WORKFLOW

Execute the work in this order:

1. Audit the repository and Phases 01–04.
2. Identify existing metrics, domain services, filters, and reusable widgets.
3. Document missing prerequisites and data limitations.
4. Define the analytical formulas, thresholds, and edge-case behavior.
5. Implement reusable calculation services.
6. Implement the deterministic insight engine.
7. Add or extend API contracts only where necessary.
8. Implement dashboard widgets and drill-down behavior.
9. Integrate existing filters and saved views.
10. Add comprehensive tests.
11. Run tests, linting, type checking, and applicable builds.
12. Inspect the final changes for regressions and duplicated logic.
13. Produce the final report.

Do not stop after the audit or plan unless a genuine blocker prevents implementation.

### 16. DEFINITION OF DONE

Phase 05 is complete only when:
- Supported breakdowns use reliable source data.
- Calculations are consistent with existing analytics.
- Behavioral indicators are transparent and deterministic.
- Small or incomplete samples are handled responsibly.
- Insights explain the evidence supporting each finding.
- Dashboard widgets integrate with the existing customization system.
- Global filters and saved views behave consistently.
- Authorization and data isolation are preserved.
- Relevant tests and quality checks pass.
- Limitations are documented honestly.
- No AI, ML, LLM, predictive model, or order-execution feature has been introduced.

### 17. FINAL REPORT

Provide a final report containing:

**A. Audit findings**
- Existing modules and reusable services.
- Verified status of Phases 01–04.
- Data limitations and missing prerequisites.

**B. Implemented features**
- Performance breakdowns.
- Directional and time-based comparisons.
- Behavioral indicators.
- Loss-streak analysis.
- Insight-generation rules.
- Dashboard widget integration.

**C. Calculation definitions**
- Formulas.
- Thresholds.
- Minimum sample sizes.
- Timezone rules.
- Missing-data behavior.

**D. Files changed**
- Important files created, modified, or removed.
- Brief explanation of each significant change.

**E. Validation**
- Tests executed and results.
- Lint, type-check, and build results.
- Any checks that could not be executed.

**F. Limitations**
- Unsupported analyses.
- Missing source data.
- Known defects or incomplete integrations.

**G. Phase status**
- Complete, partially complete, or blocked.
- Evidence supporting that status.

**H. Phase 06 readiness**
- Identify any remaining prerequisites.
- Do not begin Phase 06.
- Do not claim completion without implementation and validation evidence.

Implement Phase 05 now.
