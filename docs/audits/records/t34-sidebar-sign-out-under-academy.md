# Audit record — t34: Sidebar sign out under Academy (+ trades table overflow contained)

- **Date**: 2026-09-27
- **Verdict**: PASS* (in-flight fix: separate commit 98a8a5a)
- **Commit**: `ba3af67`

## Scope
- sidebar.tsx: quiet Sign out link (LogOut) at the very bottom of SidebarNav — under Academy, last nav item, shared by desktop sidebar AND mobile sheet; muted/80 voice turning carmin on hover (leaving is the one destructive move in a nav list); href /login like the Settings exit; collapsed mode = icon-only with aria-label + h-px separator.
- In-flight E2E fix (98a8a5a): at 390 on /trades, documentElement.scrollWidth = 961 — the min-w-[980px] trades table bled into the viewport scrollable area THROUGH its overflow-x-auto wrapper (pre-existing, reproduced on HEAD via stash, unrelated to the sidebar change). Fix: [contain:paint] on the scroll card — sw 961 → 390, in-card horizontal scroll kept, zero visual change.

## Ritual results
tsc 0, eslint 0 · Desktop 1440 dark+light: Sign out last item after Academy (compareDocumentPosition), click → /login, collapsed icon+aria-label · Mobile 390 light+dark: sheet shows Sign out under Academy, sw=iw · console 0 errors.

## Evidence
- `apps/web/scripts/shots/t34/ (5 PNG)`

## Notes
The register closes under Academy. Bonus: the wide trades ledger no longer leaks into the viewport metric — future wide tables should reuse the [contain:paint] pattern on their scroll card.
