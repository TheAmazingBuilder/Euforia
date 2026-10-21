# Audit record — t19: Sidebar sections (Overview / Trading / Tools / System) + collapsible Academy

- **Date**: 2026-09-26
- **Verdict**: RE-APPLIED — PASS
- **Commit**: `9f2bae8`

## Scope
- lib/navigation.ts restructured: NavSection type + NAV_SECTIONS (overview / trading / tools / system / academy collapsible) + flattened SIDEBAR_ITEMS keeping getPageTitle, getBreadcrumb, getNavItem and the ⌘K palette unchanged.
- SidebarNav: discreet uppercase section labels (11px, tracking-widest, muted/70); ghost button 'Setup seen, not taken' grouped under Overview after Dashboard; Academy fold row (GraduationCap + rotating chevron, aria-expanded) with honest empty state 'Modules coming soon — new tabs will land here.'; collapsed mode = h-px w-6 separators between groups, icon-only rows.
- CosmozMark recreated after rollback loss (cobalt gradient tile 2E6BF6→1B3FB8→0A1745, equity curve with honest dip, emerald sparkle, useId-scoped gradient ids — the one sanctioned hex exception).
- coach/goals pages re-removed (earlier user decision preserved); /reports nav link dropped (page lost to rollback — returned with t21).

## Fixes found during the pass
- E2E: redundant 'ACADEMY' label above the fold row removed — the row already carries its name.
- Rollback damage discovered mid-pass (imports broken) was repaired in the same scope to keep the build coherent.

## Ritual results
tsc 0 errors, eslint 0 warnings · Desktop 1440 light: sections rendered, Academy unfolds, collapsed mode with separators · Dark: tokens adapt, zero hex · Mobile 390 sheet: sections + Academy unfold · scrollWidth = innerWidth everywhere · Ghost modal opens from Overview · /trades + /discipline navigation OK · console clean.

## Evidence
- `apps/web/scripts/shots/t19/desktop-light-sidebar-sections.png`
- `apps/web/scripts/shots/t19/desktop-light-academy-unfolded.png`
- `apps/web/scripts/shots/t19/desktop-light-collapsed.png`
- `apps/web/scripts/shots/t19/desktop-dark-sidebar-sections.png`
- `apps/web/scripts/shots/t19/desktop-light-ghost-modal.png`
- `apps/web/scripts/shots/t19/mobile-dark-sheet-academy.png`
- `apps/web/scripts/shots/t19/mobile-light-trades.png`

## Notes
Re-delivered on the restored base 47cb98e after the workspace rollback; original commit 9f2bae8-era work re-executed from scratch.
