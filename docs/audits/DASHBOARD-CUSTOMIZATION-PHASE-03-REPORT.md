# PHASE 03 — GLOBAL DASHBOARD FILTERS & SAVED ANALYTICAL VIEWS
## Final Implementation Report

Date: 2026-10-18 · Series: Dashboard Customization · Spec: `docs/specs/dashboard-customization/PHASE-03-GLOBAL-FILTERS-AND-SAVED-ANALYTICAL-VIEWS.md` (verbatim, owner-provided)
Commits: step 1 `a48fa7b` (contracts + pure logic) · step 2 `686d821` (state machine + registry metadata) · step 3 (integration — this report)

---

## A. Repository Audit

The audit (spec §2, Explore agent, "very thorough") established what Phase 03 had to build ON, not over:

- **The filtering backend already existed and is complete.** `GET /stats/analytics-suite` + `analyticsFiltersSchema` resolve 13 period presets SERVER-SIDE on the user's timezone (`User.timezone` trading-day clock) and filter `accountId / instrumentId / assetClass / strategyId ("none") / direction / session / emotion / exitReason / tagId`. The engine aggregates CLOSED trades only. **The dashboard bar is a new CONSUMER of this engine — never a second calculation layer.**
- **Pre-existing saved views**: `/trade-views` (scopes TRADES|ANALYTICS, `SavedTradeView`) — a name collision to avoid; dashboard views therefore live in the dashboard preferences domain, as a third, separate concept.
- **Widget data sources split in two families**: 4 suite-backed widgets (`METRICS_CARD`, `STRATEGY_COMPARE`, `LONG_SHORT`, `ACTIVITY_HEATMAP`) vs. widgets fed by `GET /stats/overview` (no filter parameters at all: `PNL_BAND`, `HEATMAP`, `WEEK_COMPARE`, `EQUITY_ROW`), the goals engine (`GOALS_PACE`), the raw trade ledger (`BEST_WORST`), and the alerts feed (`ALERTS`).
- **Persistence**: the `dashboard` preferences domain (PATCH /me/preferences/:domain — whole-domain replace, schema-validated server-side, per-user ownership). Two mechanisms existed (User.preferences JSON wired, UserSettings row not wired) — the wired one is used.
- **Conventions**: single-select per dimension everywhere (the Analytics FilterBar is scalar); no datepicker component (native date inputs); en-only static dictionaries in the dashboard module; TanStack Query with optimistic preferences mutations; strict TypeScript.

## B. Implementation Summary

- **Global filter bar** (`components/dashboard/customization/filter-bar.tsx`) mounted once above the customizable grid (visible in view AND edit mode): period presets (only the 13 values the suite contract actually supports — `LAST_7` was deliberately NOT invented), account, instrument, strategy (incl. the "Out of playbook" = `none` semantics), direction, custom range (both bounds required; invalid → honest "stays unfiltered" note), active-filter chips with per-dimension removal, clear-all, saved-view selector, save/manage (rename inline, duplicate, delete with confirmation), divergence badge with an "apply again" restore action.
- **Shared filter context** (§7): the dashboard-level suite fetch uses the authoritative filters — the filter set IS the query key, so a change refetches and stale responses cannot cross key boundaries. `METRICS_CARD` merges the global filters into its own per-period fetches under the documented precedence: **a global date range wins over the widget-level period; the widget period applies only while the global period is ALL; the previous-period comparison is disabled (not faked) under global filters.**
- **Filter capability metadata** (§8): every registry entry declares `filterSupport` — `FULL` (exactly the 4 suite-fed widgets, all five dimensions) or `UNAFFECTED` with an honest reason. When filters are active, unaffected widgets carry a "Not filtered" badge (tooltip = the reason); suite-fed widgets are never badged. The fixed KPI band and the 7 unaffected widgets are NOT rewritten — the badge is the product convention (no repetitive banner text).
- **Saved analytical views** (§10): name + validated filter context, schemaVersion 1, timestamps; create / apply / rename / duplicate (deep independent copy) / delete (confirmation; never touches filters, layouts or data); cap 30; unique names CI; divergence derived (manual edits mark the view "modified — apply again" instead of silently overwriting).
- **State architecture**: a pure reducer (`filters-state.ts`) owns filters + views + anchor + persistence status; **all saved-view model ops run in the hook and dispatch PRE-COMPUTED collections** (ids never generated inside the reducer — React re-runs reducers, and a replay would generate a different id than the committed one; this exact bug was caught by the Playwright probe and fixed before delivery).

## C. Files Changed

New:
- `apps/web/src/components/dashboard/customization/filter-bar.tsx` — the bar UI (controls, chips, views manager, confirm delete).
- `apps/web/src/lib/dashboard-customization/filters-state.ts` — the filter state machine.
- `apps/web/src/lib/hooks/use-dashboard-filters.ts` — machine ↔ preferences wiring, model ops, wholesale merges.
- `apps/web/scripts/probe-dashboard-filters.js` — Playwright probe (28 checks).
- `apps/web/src/lib/dashboard-customization/__tests__/filters-state.spec.ts` — 15 reducer tests.

Modified (significant):
- `packages/shared/src/schemas/settings.ts` — `dashboardFiltersSchema` + `dashboardSavedViewSchema` (step 1); additive optional `activeFilters` on the dashboard domain (step 2). Legacy documents validate unchanged.
- `apps/web/src/lib/dashboard-customization/persistence.ts` — `savedViewsFromPreferences` / `activeFiltersFromPreferences` / `dashboardDomainWithFilters` (wholesale-merge helper).
- `apps/web/src/lib/dashboard-customization/filters.ts`, `saved-views.ts` — pure model (step 1).
- `apps/web/src/lib/dashboard-customization/registry.ts`, `types.ts` — `WidgetFilterSupport` metadata.
- `apps/web/src/lib/hooks/use-dashboard-customization.ts` — layout PATCHes now carry the filter half (see §F).
- `apps/web/src/components/dashboard/dashboard-view.tsx` — bar mount, filtered suite query, catalogs, grid props.
- `apps/web/src/components/dashboard/customization/dashboard-grid.tsx` — "Not filtered" badges + filter pass-through.
- `apps/web/src/components/dashboard/customization/widgets-renderer.tsx`, `apps/web/src/components/dashboard/metrics-card.tsx` — global-filter consumption + merge precedence.
- `apps/api/test/e2e/settings.e2e.spec.ts` — 5 new e2e tests (§G).

## D. Filter Semantics

- **Dimensions**: 5 (period, account, instrument, strategy, direction), SINGLE-select each — this is the existing application convention (the suite API is scalar); multi-value OR semantics are NOT offered because inventing them would fake a capability the authoritative calculation layer does not provide. Dimensions combine with AND (server engine behavior). Absent = no restriction.
- **Date basis**: period presets are resolved SERVER-SIDE on the user's trading-day clock — zero client date math; CUSTOM bounds are inclusive trading-date keys validated (from ≤ to, both required) by the shared schema's `superRefine`.
- **`strategyId: "none"`** = out-of-playbook trades (existing attribution chain review → plan → strategy), never a missing id.
- **Trade status**: excluded — the suite aggregates CLOSED trades only; an open/cancelled filter would be a lie (documented limitation).
- **emotion / tagId / session / assetClass**: excluded from the bar (honest no-op seams in the engine / widget-level concerns) — addable later without breaking stored views (schema is versioned per view).
- **Unsupported filters**: registry-declared; the grid badges unaffected widgets when filters are active; nothing ever claims a filtered result it does not compute.
- **Missing entities**: a stored id that no longer resolves renders as "Unknown account/instrument/strategy" on its chip and is one click to remove; the server can never be broadened by an invalid id (its engine narrows strictly).

## E. Financial Correctness

Filtering never recomputes a metric client-side: the ONLY change is which parameters the existing server suite receives. KPI/charts therefore use the server's eligible population with its own zero-denominator, breakeven, multi-currency (`meta.singleCurrency` + `s_warnings`) and expectancy semantics — identical for every suite-fed widget (consistency by construction: one request per filter combination, one dataset definition). The consistency requirement was verified by the shared query key (all suite widgets re-render from the same response) and the probe's filtered render checks. Multi-currency warnings and empty-filtered states surface through the widgets' existing honest messages ("No closed trades in this period — nothing to measure yet.").

## F. Persistence and Security

- **Storage**: the existing server-backed `dashboard` preferences domain (per-user row, ownership enforced server-side, `stripServerManagedKeys` untouched). No localStorage, no secrets in view definitions, no trade data serialized.
- **Wholesale-merge invariant (the critical one)**: the domain PATCH replaces EVERYTHING, so BOTH writers merge the other half. The filters hook merges layouts from the freshest preferences cache; the customization hook merges `savedViews` + `activeFilters` the same way — **a layout save can no longer wipe the filter context and vice-versa** (the Playwright probe caught the initial one-sided merge and forced this fix).
- **Validation**: every read normalizes (schema parse, per-view salvage, cap/dedupe; invalid `activeFilters` degrades to ALL — a stale document can never lock the dashboard); every write re-validates through the same shared schema the API runs (MSW parity included).
- **Isolation**: e2e-proven — user B never sees user A's views/active filters; a failed PATCH leaves the stored document untouched; reset restores defaults.
- **Schema versioning**: views carry `schemaVersion: 1`; older documents (no savedViews/activeFilters keys) validate unchanged — additive evolution, no migration.

## G. Verification (all actually executed)

| Gate | Command | Result |
|---|---|---|
| Web unit/integration | `npx vitest run` (apps/web) | **145/145** (25 new for Phase 03) |
| Web typecheck | `npx tsc --noEmit` (apps/web) | 0 errors |
| Web lint | `npx eslint` (all changed files/dirs) | 0 problems |
| Web production build | `npx next build` | ✓ Compiled successfully, exit 0 |
| Shared typecheck | `tsc -p tsconfig.json --noEmit` (packages/shared) | 0 errors |
| API typecheck | `pnpm --filter @cosmoz/api typecheck` | 0 errors |
| API lint | `npx eslint test/e2e/settings.e2e.spec.ts` | 0 problems |
| API e2e (real PostgreSQL) | `vitest run test/e2e/settings.e2e.spec.ts` (apps/api) | **25/25** (5 new: round-trip, wholesale-merge layouts intact, malformed rejection + domain untouched, per-user isolation, reset) |
| Playwright probe (mock preview, `next dev`) | `node scripts/probe-dashboard-filters.js` | **28/28** (bar mount, chips+count, 7 honest badges, METRICS_CARD global-note after library add, saved-view create→diverged→restore→duplicate→rename→delete, clear-all, mobile 390px no-overflow, zero console errors) |

Baselines: no pre-existing failures at HEAD in the executed scopes (CI was green at `4970571`; the web suite was 120/120 before this phase).

## H. Limitations (honest)

1. **The fixed KPI band and the 7 overview/ledger/alerts-fed widgets are not filtered** — their data source (`/stats/overview`, goals engine, raw trades, alerts) exposes no filter parameters. They are badged "Not filtered" instead of pretending. Making `/stats/overview` filter-aware would be a backend contract change (candidate for a later phase, NOT silently done here).
2. **Single-select per dimension** — no multi-value OR (suite API is scalar; arrays would be a fabricated capability).
3. **No trade-status filter** (suite aggregates CLOSED trades only).
4. **METRICS_CARD previous-period comparison is disabled under active global filters** (the "previous equivalent" of a server-resolved preset is not derived client-side — refused to fake it).
5. **BEST_WORST not client-filtered** — replicating server filter semantics (timezone presets, attribution chain) client-side would risk semantic drift for a raw-list widget.
6. **Mock-mode reload**: the MSW store lives in browser memory and reseeds on reload — reload-survival is proven SERVER-SIDE (API e2e on real PostgreSQL), not in the mock preview.
7. **Concurrent layout-save × filter-save race** remains last-write-wins at the domain level (same accepted convention as the Phase 01 view-mode operations; both writers merge the other half, so only same-half simultaneity is exposed).

## I. Final Status

**COMPLETE** — within the documented v1 scope: all 22 Definition-of-Done items of spec §19 are satisfied or explicitly scoped by the limitations above, every claim in this report is backed by an executed command listed in §G, and no unrelated module was modified. Phase 04 (goals — pre-existing) is untouched; the next series phase is **05 (Performance insights & pattern analysis)**, whose spec §10 requires Phase 03 to be implemented and verified first — this report is that verification.
