# Audit record — t33: Session Live chart owns the full row — nothing removed, panels re-paired

- **Date**: 2026-09-27
- **Verdict**: PASS
- **Commit**: `1ba4aed`

## Scope
- session-view.tsx: PriceChart leaves the lg:grid-cols-3 (2/3 slot) for a full-width row; BrokerPanel + SymbolPositions move to a lg:grid-cols-2 pair underneath; canvas height widened via heightClass h-[320px] sm:h-[480px]; SessionSkeleton matches the new grid.
- Nothing deleted: toolbar, Entry/SL/TP overlays, open positions, Regret Registry, ghost check-in, timeline, mood strip all kept.

## Ritual results
tsc 0, eslint 0 · Desktop 1440 dark+light: canvas 1134px = full content width (main 1200 − padding 64 − border), 'Trading account' + 'Positions on BOOM500' paired, overlays visible · Mobile 390 dark+light: canvas 356px full width, sw=iw · console 0 errors.

## Evidence
- `apps/web/scripts/shots/t33/ (4 PNG)`

## Notes
The monitoring station breathes; the journaling flow is untouched.
