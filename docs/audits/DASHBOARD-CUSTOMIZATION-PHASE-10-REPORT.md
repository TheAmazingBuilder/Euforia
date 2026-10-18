# Dashboard Customization — Phase 10 Report
## UX, Accessibility & Interaction Consistency

Date: 2026-10-19

> **Honest scope note (read first).** The original Phase 10 owner spec was
> lost with the 2026-10-19 sandbox restore (worklog task 14) — it was only
> ever received in conversation. This phase was executed from the CONDENSED
> spec preserved in the session summary (audit-first over the §3 surface
> list; consistent interaction patterns; WCAG 2.2 AA *practices* as a target;
> P&L must not rely on red/green alone; icon-only accessible names;
> form/error association; loading/empty/error states; theme-token
> discipline; touch targets; no redesign, no new deps, no financial/auth
> changes). If the owner re-uploads the original spec, a conformance pass
> against it is required — this report claims neither.

---

## A. Audit findings (evidence-based)

Method: direct inspection of the dashboard surface (widgets, customization
UI, filter bar, forms, charts, tokens) with file:line evidence; every
"already compliant" item below was verified, not assumed.

**Verified compliant (no changes needed):**
- **Themes**: the three design themes exist as semantic-token sets in
  `src/app/globals.css` — dark-blue **"Encre"** (DEFAULT, line 31), dark
  **"Carbone"** (line 65), light **"Papier"** (line 85). Visual identity
  untouched.
- **No hard-coded colors in dashboard components**: a hex/rgb scan over
  `src/components/dashboard/**` returns ZERO raw palette colors — all
  surfaces/inks go through the semantic tokens (`text-profit`, `text-loss`,
  `bg-surface-raised`, …).
- **P&L values are signed everywhere they encode outcome**:
  `formatR` always signs (+1.20R/−0.80R), `formatSignedMoney` signs
  (+/−) and is used for live P&L (`open-positions-card.tsx:98`), KPI deltas
  use a signed formatter (`kpi-row.tsx:23-24`), the Phase 05 widgets render
  signed R (`formatR`) in achromatic tables.
- **Color is never the only cue on delta chips**: metrics-card chips carry
  an arrow icon + `sr-only` "Improved/Deteriorated" + signed value
  (`metrics-card.tsx:274-289`); week-compare and kpi-row chips carry arrow
  icons.
- **Icon-only buttons carry accessible names**: the grid hover tools
  (`dashboard-grid.tsx` — configure/hide/remove all have aria-labels), the
  workspace manager rows (duplicate/rename/delete/set-default, per-layout
  aria-labels), filter-bar view removal, widget-library/settings controls.
  An automated candidate scan over the dashboard surface produced only
  false positives (buttons with visible text).
- **Charts expose aria labels**: equity constellation, cumulative/daily P&L,
  activity heatmap all pass `ariaLabel` to the chart shell; heatmap tooltips
  print the numbers (avg R, trades, wins) — not color-only.
- **Forms announce errors**: widget-settings dialog error is `role="alert"`
  (`widget-settings-dialog.tsx:154`); filter-bar error block is
  `role="alert"` (`filter-bar.tsx:241`).
- **Loading/empty/error states are consistent**: every suite-fed widget
  renders `aria-busy` skeletons, an explicit empty state, and an error block
  with Retry from the SHARED fetch status (`suiteStatus`); "missing data"
  renders as "waiting for tick…"/"—", never a fabricated zero.
- **Touch targets**: `icon-sm` = 28px, `icon-xs` = 24px — ≥ the WCAG 2.2
  2.5.8 minimum (24px); dense tables scroll horizontally
  (`overflow-x-auto`), probes verify zero horizontal overflow at 390px.
- **Destructive confirmations**: workspace/layout deletion goes through the
  ConfirmDialog; saved-view deletion confirmed (Phase 03); draft-mode
  removes are reversible by design (the draft transaction is the undo).
- **Keyboard**: the grid keeps its Phase 01 keyboard move/resize steps;
  dialogs/popovers/menus are Radix primitives (focus trap + keyboard
  behavior inherited).

**Genuine gaps found (fixed, see §B):**
1. KPI delta chips and week-compare delta chips expose the arrow as
   `aria-hidden` with NO text alternative — screen readers heard "3.2 %"
   with no direction. (The arrow icon was a visual-only cue.)
2. The save-as-template input announced its error via `role="alert"` but
   the input itself was not programmatically linked to it (no
   `aria-invalid`/`aria-describedby`).

## B. Implemented changes

1. `kpi-row.tsx` — DeltaMark UP/DOWN chips now include
   `<span class="sr-only">Up/Down vs previous period:</span>` before the
   signed value (factual wording — the component carries no
   improvement-semantics, so no judgment is spoken).
2. `week-compare-card.tsx` — week delta chip now speaks
   "Up/Down/Unchanged vs last week:" (sr-only) next to the arrow.
3. `layouts-manager-dialog.tsx` — save-as-template input gained
   `aria-invalid` + `aria-describedby="dashboard-save-as-template-error"`
   so the `role="alert"` message is programmatically associated with the
   field it constrains.
- No dependency added, no design-token changed, no metric/formula touched,
  no financial/auth/account-isolation code modified, no feature removed.

## C. Files changed

- `apps/web/src/components/dashboard/kpi-row.tsx` (sr-only direction cue)
- `apps/web/src/components/dashboard/week-compare-card.tsx` (sr-only
  direction cue)
- `apps/web/src/components/dashboard/customization/layouts-manager-dialog.tsx`
  (aria-invalid + aria-describedby)

## D. Validation

- `tsc` clean; eslint clean on the three changed files; web vitest
  **161/161** (sr-only text does not affect any asserted test output).
- Regression probes re-run on the mock preview after the changes:
  `probe-dashboard-workspaces` **16/16** (covers the modified dialog),
  `probe-dashboard-insights` **21/21**, `probe-dashboard-filters` **28/28**
  — zero page errors in all three.
- Not executed: a screen-reader session (no assistive tech in the
  environment) — the sr-only cues are verified in the DOM, not through NVDA/VoiceOver.

## E. Limitations

- **No site-wide WCAG AA compliance claim** — the audit covered the
  dashboard customization surface plus the analytics widgets it hosts; app
  areas outside the dashboard series (journal, academy, settings pages…)
  were not audited in this phase.
- The ECharts canvases remain non-interactive for keyboard users beyond
  their ariaLabel summary (chart-library constraint; data tables exist
  elsewhere for the same numbers — the breakdown/trend widgets).
- Widget-settings dialog errors are announced at dialog level
  (`role="alert"`) rather than per-field (the dialog validates the whole
  config payload on save); acceptable, documented.
- Template deletion has no confirmation dialog (low-stakes, and created
  workspaces are unaffected); flagged as a possible follow-up.
- The original spec's full §3 checklist item-by-item verdicts could not be
  reproduced from the condensed summary alone — the audit above covers the
  summary's enumerated surfaces to the extent they exist in the repo.

## F. Phase status

**COMPLETE (targeted scope)** — audit performed with evidence, both genuine
gaps found were fixed and re-verified through the full gate set. The pass is
a consistency/hardening pass over the existing system, NOT a redesign: zero
new dependencies, zero token changes, zero behavioral changes beyond the
three accessibility cues.

## G. Phase 11 readiness

Phase 11 (Integration & E2E validation) can start from this state: the full
gate battery (unit + component + integration e2e on real Postgres + UI
probes) is green and the dashboard series 01/02/03/05/06/07 is committed.
Per the preserved boundary, Phase 11 was NOT started here.
