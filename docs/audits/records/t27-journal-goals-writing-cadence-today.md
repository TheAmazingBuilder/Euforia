# Audit record — t27: Journal goals — writing cadence today / month / year with editable targets

- **Date**: 2026-09-26
- **Verdict**: PASS
- **Commit**: `da764c8`

## Scope
- Shared contract journalGoals.ts: JournalGoals entriesPerDay/Month/Year ints, UpdateJournalGoalsInput partial.
- Mock: store.journalGoals (1/20/240 defaults), get/update, MSW GET/PATCH /settings/journal-goals, endpoints.journalGoals, keys (+Root), hooks useJournalGoals/useUpdateJournalGoals (setQueryData).
- UI: journal-goals.tsx — ruled border-y band under the header; 3 rows (label / h-1.5 bar / mono counter); ink fill turning profit when target reached; 'N linked' annotations (entries linked to a trade in the period); target 0 = honest empty bar; Edit targets → dialog (integer ≥0 validation, save disabled otherwise) → PATCH → toast. Counters computed from allData (UNFILTERED log) with todayKey Toronto.

## Ritual results
tsc shared 0, tsc app 0, eslint 0 · Desktop 1440 dark: 'Today 1/1 · 1 linked', 'This month 8/20 · 4 linked', 'This year 8/240 · 4 linked'; edit targets 1→2 → 'Today 1 / 2' persists (PATCH verified via UI) · light + mobile 390 sw=iw · console clean.

## Evidence
- `apps/web/scripts/shots/t27/ (4 PNG)`

## Notes
The journal now shows writing pace against the plan; linked entries count toward progress.
