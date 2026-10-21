# Audit record — t35: Academy opens — data engine, internal nav, Overview, catalog, course pages

- **Date**: 2026-09-27
- **Verdict**: PASS
- **Commit**: `413b195`

## Scope
- Shared contracts academy.ts (category/course/lesson/quiz/progress/glossary) — quiz questions ship WITHOUT answers; grading is server-side.
- Mock content engine mocks/academy/: 12 domains, 12 courses, 45 real lessons (~150-200 words each, probabilistic framing, SMC presented as framework-not-law), 8 quizzes x 4 questions with per-wrong-answer verdicts, 54-term glossary, per-user progress store (completions, Toronto-anchored streak, level rubric, achievements, seeded 5-lesson in-flight state).
- Academy fold unfolds: Overview + Courses; Overview dashboard (time-aware greeting via useSyncExternalStore, Continue Learning card, 4-KPI band, level chip, rules-based suggested path labeled 'not AI', 12 category rows); Courses catalog with client search + level/status chips + ?category= deep-link; course detail pages with module sections and completion-aware lesson rows.

## Ritual results
tsc 0, eslint 0 · Desktop 1440 dark+light: greeting, continue card (Candlestick Mastery 3/6, 33%), KPIs (5/45, streak 3 days), 12 categories; catalog: search 'candle'→1, beginner→5, deep-link→'40% of domain'; course page: 4 modules, 6 lessons, 2 done · Mobile 390 sw=iw · console 0 errors (initial errors were stale HMR messages pre-component-creation; verified 0 after clear).

## Evidence
- `apps/web/scripts/shots/t35/ (7 PNG)`

## Notes
Content is dynamic from the client's point of view — a CMS can replace the mock files without touching the UI.
