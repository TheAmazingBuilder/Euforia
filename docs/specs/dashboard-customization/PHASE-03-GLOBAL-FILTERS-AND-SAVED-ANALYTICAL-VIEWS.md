# EUFORIA — DASHBOARD CUSTOMIZATION
# PHASE 03: GLOBAL DASHBOARD FILTERS & SAVED ANALYTICAL VIEWS

## 1. ROLE AND MISSION

Act as a senior frontend architect, senior Next.js and React engineer, TypeScript specialist, data analytics engineer, and trading journal domain expert.

Your mission is to implement Phase 03 of Euforia's Dashboard Customization System directly in the existing repository.

Euforia is an established trading journal application. Phase 01 introduced the core Dashboard customization foundation, including widget registration, editable layouts, drag-and-drop, resizing, saved layouts, and templates.

Phase 02 introduced or planned configurable widgets, KPI selection, chart presentation settings, and performance analytics.

Phase 03 must build on the actual code delivered by the preceding phases.

The objective is to provide a centralized filtering system that allows users to analyze their trading performance using a shared context across compatible Dashboard widgets.

Users must be able to select a date range, account, instrument, strategy, trade direction, and other supported dimensions. They must also be able to save, reuse, duplicate, rename, and delete analytical filter views.

This is a direct implementation task.

**Audit the actual repository, implement the feature, integrate it into the existing application, and run the relevant tests. Do not stop after producing an implementation plan.**

Do not start Phase 04.

---

## 2. MANDATORY REPOSITORY AUDIT

Before making changes, inspect the actual implementation of Phases 01 and 02.

Verify:

- The existing Dashboard route and component hierarchy.
- The Dashboard layout and widget configuration models.
- The Widget Registry.
- The existing analytics and chart widgets.
- Existing metric calculation utilities.
- Existing data-access services and API contracts.
- Trade, account, strategy, instrument, and execution-direction models.
- Existing date-range utilities.
- Existing timezone and trading-session conventions.
- Existing state-management and query-caching patterns.
- Existing persistence adapters.
- Existing saved-layout functionality.
- Existing application theme and UI components.
- Existing authentication and user-isolation mechanisms.
- Existing tests and project scripts.

Determine which filter dimensions are supported by actual data and which require additional work.

Do not invent account fields, strategy metadata, trade statuses, API endpoints, or filtering capabilities.

If an earlier phase is incomplete, implement Phase 03 in a way that remains compatible with the current code and report relevant limitations.

After the audit, summarize the implementation decisions briefly and continue directly with implementation.

---

## 3. SCOPE AND OBJECTIVES

Implement the following capabilities where supported by the existing data model:

1. A centralized Dashboard filter bar.
2. Date-range filtering.
3. Account filtering.
4. Instrument or symbol filtering.
5. Strategy filtering.
6. Long-versus-short direction filtering.
7. Trade-status filtering when supported by the existing domain.
8. Additional filter dimensions only when they have a reliable source of truth.
9. A shared filter context for compatible widgets.
10. Filter-aware KPI calculations.
11. Filter-aware chart and heatmap rendering.
12. Active-filter indicators.
13. Clear-all and individual-filter reset actions.
14. Saved analytical views.
15. Creation, renaming, duplication, selection, and deletion of saved views.
16. Persistence using the established architecture.
17. Loading, empty, error, and invalid-filter states.
18. Responsive and accessible filter controls.

The filter system must be modular enough to support additional dimensions in later phases.

Do not implement unrelated Dashboard customization features.

---

## 4. CENTRALIZED FILTER ARCHITECTURE

Create a typed global Dashboard filter model.

Adapt names and file locations to the existing architecture.

A conceptual model may include:

- Date range.
- Account IDs.
- Instrument identifiers.
- Strategy IDs.
- Trade directions.
- Supported trade statuses.
- Optional additional validated dimensions.

Use stable IDs for accounts, strategies, and other entities.

Do not identify entities by display labels when stable identifiers exist.

Represent filter state independently from widget presentation configuration and Dashboard layout configuration.

Maintain a clear distinction between:

- Saved Dashboard layout.
- Individual widget configuration.
- Active global filters.
- Saved analytical view.
- Underlying trade and account data.

A saved layout defines which widgets are displayed and how they are arranged.

A saved analytical view defines the filter context used to analyze the underlying data.

Do not merge these two concepts into one object.

If the existing architecture already supports a shared filter context, extend it rather than creating a duplicate implementation.

Use strict TypeScript and the existing state-management conventions.

---

## 5. GLOBAL FILTER BAR

Implement a professional, compact filter bar within the existing Dashboard.

The bar must integrate naturally with the Dashboard header and the application's existing visual hierarchy.

Provide controls for the supported filter dimensions.

### Date range

Support useful presets where appropriate:

- Today.
- Yesterday.
- Last 7 days.
- Last 30 days.
- This week.
- Previous week.
- This month.
- Previous month.
- This quarter.
- This year.
- All available history.
- Custom date range.

Only include presets that can be implemented consistently with the existing date utilities.

For custom ranges:

- Validate start and end dates.
- Prevent invalid ranges.
- Define whether boundaries are inclusive or exclusive.
- Apply consistent timezone semantics.
- Avoid duplicate or missing records at period boundaries.

Do not assume that a calendar day is identical to a broker trading session.

Use existing application conventions.

### Account filter

Allow users to select one or more available accounts where supported.

Requirements:

- Use stable account identifiers.
- Provide clear labels.
- Support selecting all accounts.
- Support clearing the account filter.
- Avoid exposing accounts the current user is not authorized to access.
- Handle an empty account list gracefully.

Do not fabricate account options.

### Instrument filter

Allow users to select one or more instruments available in the eligible dataset.

Examples may include symbols such as XAUUSD or EURUSD only if they exist in the actual application data.

Requirements:

- Use stable instrument identifiers where available.
- Avoid duplicate symbols caused by inconsistent formatting.
- Support multiple selections if useful.
- Handle empty instrument lists.

Do not normalize distinct instruments into the same identity without an established canonicalization rule.

### Strategy filter

Allow users to select existing strategies.

Requirements:

- Use stable strategy IDs.
- Support multiple selections where appropriate.
- Represent untagged trades explicitly if that is supported by the data model.
- Avoid treating missing strategy metadata as a valid strategy ID.
- Preserve compatibility with existing strategy-management functionality.

### Direction filter

Support the direction values used by the existing trade domain.

For example:

- Long.
- Short.

Do not invent direction values or reinterpret existing position-side semantics.

### Trade-status filter

Implement only if the existing domain has meaningful status definitions.

Clearly distinguish closed trades, open positions, cancelled records, and other supported states.

Do not treat incomplete trades as closed trades.

If status filtering is unsupported by the current data model, document the limitation instead of inventing semantics.

### Filter interaction

Users must be able to:

- Change a single filter.
- Combine multiple filters.
- Clear one filter.
- Clear all filters.
- View active filters.
- Remove active filters from compact filter chips where appropriate.
- See the currently selected date range.
- Save the current filter combination as an analytical view.

Avoid an excessively large filter bar.

Use dropdowns, popovers, compact selects, or a responsive filter drawer as appropriate.

On mobile, preserve access to every supported filter without causing horizontal overflow.

---

## 6. FILTER SEMANTICS AND DATA CORRECTNESS

Define the semantics of every filter explicitly.

Unless an existing application convention requires otherwise, use the following rules:

- Multiple selected values within the same dimension use OR semantics.
- Different filter dimensions combine using AND semantics.
- An empty dimension selection means that the dimension imposes no restriction.
- An explicitly selected "untagged" category, if supported, matches records with missing metadata.
- The All Accounts option must not be confused with an empty account list that means no accounts.
- An invalid entity ID must not broaden access to unauthorized data.

Example:

Selected accounts: A and B.

Selected instruments: XAUUSD.

Selected directions: Long.

The resulting eligible dataset contains records belonging to account A or B, using XAUUSD, and matching the Long direction, within the selected date range and other active constraints.

The actual implementation must follow the application's existing domain definitions.

### Important: date semantics

Inspect how trade dates are represented.

Determine whether date filters apply to:

- Entry date.
- Exit date.
- Realized-trade recognition date.
- Another established reporting timestamp.

Use a consistent default across the Dashboard and document it.

If a widget requires a different date basis, expose that as an explicit widget-level option only if the underlying analytics contract supports it.

Do not silently use entry dates for one widget and exit dates for another while presenting their results as directly comparable.

### Important: financial correctness

Filtering must not change the meaning of a metric.

For example:

- Profit factor must be calculated from the eligible trades.
- Win rate must use the established eligible-trade population.
- Drawdown must follow the existing equity or balance calculation semantics.
- Trade count must use the correct record population.
- Open-position metrics must not be mixed with realized closed-trade metrics unless explicitly designed to do so.

Do not filter a previously aggregated metric when the correct result requires filtering the underlying records and recalculating the metric.

Reuse the existing calculation layer wherever possible.

---

## 7. SHARED FILTER CONTEXT

Implement a single authoritative filter state for the Dashboard.

Compatible widgets must consume the same active filter context.

Do not implement separate, independent copies of the global filters in each widget.

The architecture must distinguish:

- The selected filter values.
- The validated effective filters.
- The eligible dataset or server query parameters.
- Derived analytics results.
- The saved analytical view definition.

Use existing query keys, cache invalidation conventions, and state-management tools.

Avoid introducing a new state-management framework.

### Required behavior

When a global filter changes:

1. Validate the new selection.
2. Update the authoritative filter state.
3. Derive the eligible data or query parameters.
4. Recalculate affected analytics.
5. Update compatible KPI widgets.
6. Update compatible charts and heatmaps.
7. Update active-filter indicators.
8. Preserve the current Dashboard layout.
9. Preserve individual widget presentation settings.
10. Avoid a full-page reload.

Do not trigger unnecessary requests when only a local presentation setting changes.

Debounce only where necessary and without making the interface feel unresponsive.

Ensure that stale responses cannot overwrite more recent filter results.

---

## 8. FILTER-AWARE WIDGET CONTRACT

Create or extend a reusable contract for widgets that support global filters.

Each compatible widget should declare the dimensions it supports.

For example:

- A realized P&L widget may support date range, account, instrument, strategy, and direction.
- An account-balance widget may support account selection but require different date semantics.
- An open-position widget may support account, instrument, and direction while treating date filtering differently.
- A calendar widget may not support trade filters at all.

These are examples, not assumptions about existing widget capabilities.

The Widget Registry should expose filter compatibility metadata in a maintainable way.

Do not force every widget to apply every filter.

### Unsupported filters

If a selected filter does not apply to a widget:

- Do not silently produce a misleading result.
- Do not claim the widget is fully filtered.
- Follow a clear product convention: either mark the widget as unaffected or communicate the unsupported dimension where necessary.

The UI must make it possible to distinguish filtered widgets from unaffected widgets.

Avoid cluttering every widget with repetitive explanatory text.

Use concise indicators or contextual details where appropriate.

---

## 9. FILTER-AWARE ANALYTICS

Update compatible existing Dashboard widgets to consume the shared filter context.

Prioritize widgets already available in the application.

Examples include:

- Net P&L.
- Gross profit and gross loss.
- Win rate.
- Profit factor.
- Trade count.
- Average winning trade.
- Average losing trade.
- Expectancy.
- Average risk-reward ratio.
- Equity curve.
- Daily or cumulative P&L charts.
- Strategy comparison.
- Long-versus-short analysis.
- Performance heatmaps.

Only implement widgets that exist or can be safely integrated with existing domain services.

Do not create duplicate analytics implementations.

### Consistency requirement

The same active filters must produce consistent populations across compatible widgets.

For example, if a user filters to one account and a particular month, the trade count and the corresponding performance calculations must refer to the same eligible population unless a widget explicitly documents different semantics.

When a metric needs a different population, make that distinction explicit.

### Aggregation correctness

Do not average already aggregated averages when a weighted or record-level calculation is required.

Do not derive profit factor from the ratio of average winning and average losing trades.

Do not average cumulative equity values to obtain total P&L.

Use the correct calculation method for each metric.

---

## 10. SAVED ANALYTICAL VIEWS

Implement a saved-view system separate from Dashboard layout management.

A saved analytical view represents a reusable set of filter values.

It must not create another Dashboard page.

### 10.1 Saved view model

A saved view should include:

- Stable view ID.
- User-facing name.
- Optional description.
- Schema version.
- Serialized filter definition.
- Creation timestamp where supported.
- Last-updated timestamp where supported.
- Optional metadata required by the existing persistence architecture.

Do not persist trade data inside a saved view.

Do not duplicate widget configurations in the saved-view model.

### 10.2 Create a view

Allow the user to save the current validated filter combination under a name.

Requirements:

- Validate the name.
- Avoid accidental duplicate names according to the existing UX conventions.
- Preserve the filter definition.
- Clearly identify the active view.
- Provide feedback only after persistence succeeds.

If the current filter state contains invalid or unavailable entity IDs, validate it before saving.

### 10.3 Apply a saved view

When a saved view is selected:

- Load its filter definition.
- Validate the definition against the current schema.
- Resolve supported entity references safely.
- Update the authoritative filter state.
- Recalculate compatible widgets.
- Update the active-view indicator.
- Preserve the selected Dashboard layout.

If a referenced account or strategy no longer exists or is no longer accessible, handle the missing reference safely and explain the issue when necessary.

Never bypass authorization to restore an old view.

### 10.4 Rename a view

Allow users to rename their saved views.

Validate the new name and preserve the existing filter definition.

### 10.5 Duplicate a view

Create a new view ID and an independent copy of the filter definition.

Future changes to one view must not mutate the other.

### 10.6 Delete a view

Allow users to delete a saved view after an appropriate confirmation.

Deleting a view must not delete accounts, strategies, trades, layouts, or other application data.

### 10.7 Reset filters

Provide a Clear All action that restores the documented default filter state.

Do not delete saved views when clearing the current filters.

Define a predictable relationship between the active saved view and subsequent manual filter changes.

For example, when a user modifies a saved view's filters, indicate that the active filters have diverged from the saved definition. Allow the user to update the view or save a new view, depending on the established UX.

Do not silently overwrite a saved view when the user changes a filter.

---

## 11. SAVED VIEW AND LAYOUT INDEPENDENCE

Maintain a clear separation between saved layouts and saved analytical views.

A saved layout controls:

- Widget membership.
- Widget ordering.
- Widget dimensions.
- Widget presentation configuration.

A saved analytical view controls:

- Date range.
- Account selection.
- Instrument selection.
- Strategy selection.
- Direction.
- Other supported filter dimensions.

Users must be able to change layouts without unintentionally deleting saved views.

Users must be able to change views without resetting widget positions or sizes.

If a layout and a saved view are ever associated in a future feature, represent that relationship explicitly rather than implicitly coupling the two models.

Do not introduce automatic layout-view binding in this phase unless an existing product requirement already defines it.

---

## 12. PERSISTENCE AND USER ISOLATION

Inspect the existing persistence architecture.

Use the established server-backed preference or application persistence mechanism when suitable.

If no suitable server persistence exists, use the established local adapter and clearly document the limitations.

Do not invent API endpoints.

Do not claim cross-device synchronization unless it is actually implemented.

### Persistence requirements

- Persist saved analytical views using the existing conventions.
- Validate serialized view definitions.
- Version the schema.
- Handle missing and malformed data.
- Migrate older schemas when safe.
- Avoid destroying valid views because one view is invalid.
- Keep local storage access safe for Next.js server rendering if applicable.
- Handle persistence failures.
- Prevent stale asynchronous operations from overwriting newer data.

### Security requirements

- Saved views must belong to the correct user when server persistence is used.
- Enforce ownership and authorization server-side.
- Do not trust client-supplied user IDs.
- Do not expose inaccessible account or trade information.
- Do not store authentication secrets in view definitions.
- Never broaden a query because an invalid filter value was encountered.

---

## 13. LOADING, EMPTY, ERROR, AND STALE STATES

Every affected widget must handle the relevant data states.

### Loading

Show the existing loading indicator or skeleton while filtered data is being retrieved.

Avoid unnecessarily blocking unrelated parts of the Dashboard.

### Empty result

If the selected filters match no records, display a meaningful empty state.

Do not show fabricated zeroes or unrelated unfiltered results.

Distinguish between:

- No trades exist.
- Trades exist, but the current filters exclude them.
- Required data is unavailable.
- A metric cannot be calculated from the available population.

### Error

If filtering fails:

- Display an appropriate error.
- Preserve the selected filter values when safe.
- Allow the user to retry.
- Do not silently replace the requested view with unfiltered results.

### Stale results

Ensure that results from an earlier filter selection cannot overwrite the results for a newer selection.

Follow the existing query-cancellation and cache-key conventions.

---

## 14. USER EXPERIENCE AND DESIGN

Use the existing Euforia design system.

Reuse:

- Theme tokens.
- Typography.
- Buttons.
- Select components.
- Popovers and dialogs.
- Date pickers.
- Checkboxes and multi-select controls.
- Notifications.
- Loading and empty-state components.
- Responsive breakpoints.

The filter bar should be compact and professional.

Use progressive disclosure for less frequently used filters.

Support clear active-filter chips and a visible saved-view selector.

Avoid:

- A second navigation system.
- Excessively large filter panels.
- Unnecessary gradients.
- Repeated labels that clutter every widget.
- Fake filter options.
- Placeholder buttons.
- Hardcoded financial results.
- Inconsistent controls.
- Unrelated Dashboard redesigns.

All interactive controls must work.

Ensure dark and light themes remain readable.

Support keyboard navigation, accessible labels, focus indicators, and appropriate touch targets.

---

## 15. PERFORMANCE REQUIREMENTS

Keep filtering efficient.

- Reuse existing query caching.
- Avoid unnecessary requests.
- Use stable query keys based on validated filter values.
- Avoid recomputing unrelated widgets.
- Do not serialize the complete trade dataset into filter state.
- Avoid redundant copies of filter state.
- Prevent request races.
- Keep filter interactions responsive.
- Reuse existing analytics calculation services.
- Avoid introducing expensive client-side transformations if an existing server-side query is more appropriate.

For client-side filtering, confirm that the required dataset is complete and authorized.

For server-side filtering, use actual existing API contracts and correct authorization.

Do not implement partial filtering that silently omits records while presenting the result as complete.

---

## 16. TESTING REQUIREMENTS

Use the existing testing stack.

### Filter model tests

Test:

- Default filter state.
- Valid date ranges.
- Invalid date ranges.
- Multiple selections within one dimension.
- AND semantics across dimensions.
- Empty selection semantics.
- Missing entity IDs.
- Unsupported filter dimensions.
- Schema validation and migration.

### Filtering correctness tests

Test:

- Account filtering.
- Instrument filtering.
- Strategy filtering.
- Direction filtering.
- Date boundaries.
- Combined filters.
- Untagged trades where supported.
- Closed versus open records where supported.
- Consistent eligibility across metrics.
- Correct handling of empty results.

### Financial analytics tests

Test:

- Filtered net P&L.
- Filtered win rate.
- Filtered profit factor.
- Filtered expectancy.
- Filtered trade count.
- Filtered drawdown where supported.
- Missing values.
- Zero denominators.
- Breakeven trades.
- Partial closes where relevant.
- No double counting.
- Correct aggregation of filtered data.

### Saved analytical view tests

Test:

- Creating a view.
- Applying a view.
- Renaming a view.
- Duplicating a view.
- Deleting a view.
- Clearing active filters.
- Modifying filters after applying a saved view.
- Detecting unsaved differences from the saved definition.
- Independent copies of duplicated views.
- Missing or inaccessible entity references.
- Persistence failures.
- Schema migration.

### Integration tests

Verify:

- Changing global filters updates compatible widgets.
- Unsupported widgets are not falsely represented as filtered.
- Chart and KPI results use consistent filter semantics.
- Switching views preserves the Dashboard layout.
- Switching layouts preserves saved views.
- Filter state survives reload according to the persistence design.
- Existing widget configuration remains intact.
- Existing drag-and-drop and resizing still work.
- Existing route protection and authorization remain intact.

Do not test only mocked filter outputs. Exercise the actual filtering and state-management logic.

---

## 17. QUALITY CHECKS

Execute relevant project commands for:

- TypeScript type checking.
- Linting.
- Unit tests.
- Component and integration tests.
- Production build where practical.

Inspect the final diff for:

- Unrelated changes.
- Duplicated filtering logic.
- Inconsistent date semantics.
- Incorrect metric populations.
- Missing authorization checks.
- Unsafe fallbacks.
- Stale request races.
- Broken saved layouts.
- Unnecessary dependencies.
- Hardcoded data.
- Inaccessible controls.

Fix regressions introduced by the implementation.

Report baseline failures separately from regressions.

Never claim a test or build passed unless it was actually executed and verified.

---

## 18. STRICTLY OUT OF SCOPE

Do not implement:

- Advanced notification systems.
- Risk-limit alerts.
- Automated refresh scheduling.
- AI analytics.
- Trade execution.
- New broker integrations.
- New trading strategies.
- Unrelated charting-module changes.
- A full Analytics module rewrite.
- Cross-user sharing.
- Collaboration.
- New backend services without a demonstrated requirement.
- New database migrations without a demonstrated requirement.
- Automatic binding of saved views to Dashboard layouts.
- Features planned for Phase 04 or later.

Do not start Phase 04.

---

## 19. DEFINITION OF DONE

Phase 03 is complete only when:

1. The Dashboard has a working centralized filter bar.
2. Supported date presets and custom date ranges work.
3. Supported account, instrument, strategy, and direction filters work.
4. Filter semantics are explicit and tested.
5. Different dimensions combine correctly.
6. Compatible widgets share the same authoritative filter context.
7. KPI and chart results update correctly.
8. Financial calculations use the correct eligible dataset.
9. Unsupported filter dimensions are communicated accurately.
10. Active filters can be viewed and cleared.
11. Saved analytical views can be created.
12. Saved views can be applied, renamed, duplicated, and deleted.
13. Saved views persist using the established architecture.
14. Layouts and analytical views remain independent.
15. Missing or inaccessible entities are handled safely.
16. Loading, empty, and error states are implemented.
17. Stale results cannot overwrite newer filter results.
18. Existing Dashboard customization remains functional.
19. Automated tests cover critical filter and financial behaviors.
20. Relevant quality checks have been executed.
21. No unrelated data or modules have been modified unnecessarily.
22. The final report reflects the actual implementation status.

---

## 20. REQUIRED FINAL IMPLEMENTATION REPORT

After implementation, provide a report in English containing:

### A. Repository Audit

Describe the actual filter infrastructure, analytics services, widget contracts, data models, and persistence mechanisms discovered.

### B. Implementation Summary

Describe the global filter bar, supported filter dimensions, shared filter context, filter-aware widgets, and saved analytical views.

### C. Files Changed

List significant new and modified files and explain their responsibilities.

### D. Filter Semantics

Document:

- Date basis and timezone conventions.
- AND/OR selection semantics.
- Empty-selection behavior.
- Handling of missing metadata.
- Treatment of unsupported filters.
- Treatment of open and closed trades.

### E. Financial Correctness

Explain how filtered metrics are calculated and how consistency between widgets was verified.

### F. Persistence and Security

Explain how saved views are stored, migrated, isolated, and validated.

### G. Verification

List tests, type checking, linting, and build commands actually executed, with their results.

### H. Limitations

Document unsupported filter dimensions, missing data sources, incomplete features, and persistence limitations.

### I. Final Status

Choose one:

- COMPLETE
- PARTIALLY COMPLETE
- BLOCKED

Do not claim completion if essential requirements remain unimplemented or critical verification has not been performed.

---

## FINAL EXECUTION INSTRUCTION

Inspect the actual Euforia repository and the implementations of Phases 01 and 02 first.

Implement Phase 03 directly in the existing codebase.

Reuse the established data services, calculation utilities, widget contracts, persistence adapters, and design system.

Prioritize consistent filter semantics, accurate financial analytics, safe saved-view persistence, and a responsive user experience.

Run the relevant tests and quality checks, inspect the final diff, and report the actual results.

Do not stop after an implementation plan or a mockup.

Do not start Phase 04 until Phase 03 has been implemented and verified.