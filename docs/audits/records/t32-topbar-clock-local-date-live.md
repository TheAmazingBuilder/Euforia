# Audit record — t32: Topbar clock — local date + live time before the search affordance

- **Date**: 2026-09-27
- **Verdict**: PASS
- **Commit**: `e70ff29`

## Scope
- layout/topbar-clock.tsx — date (Sat, Sep 26) + live HH:MM:SS + timezone (xl+) in the register's mono voice, tabular-nums, no icon or border (a margin annotation, not a gadget).
- Hydration honest: useSyncExternalStore (1s interval subscribe, epoch-second snapshot, server snapshot null → pre-hydration reserve) — the repo's anti-effect lint rejects synchronous setState in effects; the external-store solution is idiomatic.
- Responsive: date from lg+, time from sm+, phones stay clean (the 390 topbar is dense; the breadcrumb keeps its room).
- Inserted BEFORE the command-palette trigger (Search ⌘K) in the topbar.

## Ritual results
tsc 0, eslint 0 (after useSyncExternalStore refactor) · Desktop 1440 dark+light: clock visible BEFORE search (compareDocumentPosition verified), tick 22:21:33 → :35 → :40 → :42, tokens adapt · Mobile 390: clock hidden, sw=iw · console 0 errors.

## Evidence
- `apps/web/scripts/shots/t32/ (4 PNG)`

## Notes
The desk shows its own time; the layout never lies about SSR.
