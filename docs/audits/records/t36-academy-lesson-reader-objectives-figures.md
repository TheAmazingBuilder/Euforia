# Audit record — t36: Academy lesson reader — objectives, figures, completion, navigation

- **Date**: 2026-09-27
- **Verdict**: PASS
- **Commit**: `864991e`

## Scope
- Route /academy/courses/:courseId/:lessonId — objectives contract block, concept sections with mono bullets, 13-figure token-driven SVG registry (shared CandleSvg OHLC engine + structure/risk diagrams: support-resistance role flip, uptrend HH/HL, BOS/CHoCH, double top, bull flag, anatomy callouts, sentiment spectrum, hammer/star, engulfing, morning star, risk-per-trade, position sizing, R multiple).
- Completion tracking (idempotent POST, streak toast), takeaways + common-mistakes ruled blocks, prev/next lesson navigation with REAL titles (contract extended prevLessonTitle/nextLessonTitle).
- Fixes in flight: anatomy label overlap; topbar breadcrumb 'Cosmoz > Cosmoz' on dynamic routes → regex 'Lesson'/'Course'.

## Ritual results
tsc 0, eslint 0 · Desktop 1440: lesson renders (3 objectives, 2 sections, figure, 3 takeaways, 2 mistakes), completion → badge + toast '6 total, 3-day streak', SPA propagation verified (course 2/5→3/5, Overview KPI 5/45→6/45 via ['academy'] invalidation) · hard reload resets the session-scoped mock store (known demo-wide behavior) · mobile 390 sw=iw · console 0 errors.

## Evidence
- `apps/web/scripts/shots/t36/ (5 PNG)`

## Notes
Every lesson reads like a page of the Registre; figures use CSS variables only — the hex exception stays with the brand tile.
