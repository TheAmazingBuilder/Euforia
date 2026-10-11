# Audit record — t21: Auto weekly report — /reports page + /stats/weekly contract

- **Date**: 2026-09-26
- **Verdict**: RE-APPLIED — PASS
- **Commit**: `ad9c267`

## Scope
- Shared contract packages/shared/src/schemas/weeklyReport.ts: days[7] zero-filled, totals (netPnl/trades/winRate/rEarned/disciplineAvg), best/worst spot, byInstrument sorted, insights ≤4 toned, generatedAt, isCurrent, currency.
- Mock: store.weeklyReport(start?) — Monday..Sunday window (pure UTC math, parseKey/addDaysKey/mondayKeyOf, base-0 bug avoided), aggregates from closedTrades + disciplineScore, best day 'Fri, Sep 25', insights (winrate, best day, Cosmoz Index adherence, avg R). MSW GET /stats/weekly?start=.
- Client: endpoints.statsWeekly, queryKeys.statsWeekly(start), useWeeklyReport(start).
- UI: (app)/reports + weekly-report.tsx — week navigation (prev/next, next disabled + THIS WEEK badge on current week), 5 KPIs, daily P&L bar EChart (profit/loss gradients + getChartTheme), best/worst trades, per-instrument table, insights panel, skeletons, error/empty states.
- Navigation: Reports (CalendarRange) back in TOOLS between Discipline and Calendar.

## Ritual results
tsc app 0, tsc shared 0, eslint 0 · Desktop 1440 dark + full page: KPIs (+171.73 USD / 5 trades / 60% / +2.44R / 73–100), week navigation validated both directions (Sep 14–20 ↔ Sep 21–27, next disabled + THIS WEEK) · Mobile 390 dark + light sw=iw · console clean.

## Evidence
- `apps/web/scripts/shots/t21/ (4 PNG)`

## Notes
Re-application of the lost commit 9c22d6e.
