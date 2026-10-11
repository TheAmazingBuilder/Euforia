# Audit record — t38: Academy progress — per-category ledger, level rubric, achievements

- **Date**: 2026-09-27
- **Verdict**: PASS
- **Commit**: `9a18d56`

## Scope
- Route /academy/progress — 4-KPI band (level + rubric label, streak, courses completed, overall %), continue-learning CTA, 12 per-category rows (N/M · % with ink bars turning profit when complete), 6 achievements grid computed from the record (earned = amber icon, else muted), honest footnote.
- Progress tab (Gauge) joins the Academy fold.

## Ritual results
tsc 0, eslint 0 · Desktop 1440 dark+light: 12 rows (Risk 2/5 · 40%, TA 1/4 · 25%), 6 achievements 1 earned · Mobile 390 sw=iw · console 0 errors.

## Evidence
- `apps/web/scripts/shots/t38/ (3 PNG)`

## Notes
Progress is per account by construction — isolation is in the store contract, not a UI promise.
