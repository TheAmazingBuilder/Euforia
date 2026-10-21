# Audit record — t20: Session toolbar mobile wrap fix (11px horizontal overflow at 390)

- **Date**: 2026-09-26
- **Verdict**: RE-APPLIED — PASS
- **Commit**: `eacc941`

## Scope
- session-toolbar.tsx: the Marked price block switches from min-w-0 flex-1 to w-full min-w-0 sm:w-auto sm:flex-1 — full row below sm, flex from sm up.
- Desktop (1440) verified unchanged.

## Ritual results
tsc 0, eslint 0 · 390: scrollWidth = innerWidth (overflow gone) · 1440: scrollWidth = innerWidth · 0 page errors · console clean.

## Evidence
- `apps/web/scripts/shots/t20/ (2 PNG)`

## Notes
Faithful re-application of the lost commit 3e4d57b (destroyed by the rollback).
