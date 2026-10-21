# Audit record — t40: Academy practice — pattern drills + candle simulator

- **Date**: 2026-09-27
- **Verdict**: PASS
- **Commit**: `6831a3a`

## Scope
- Route /academy/practice — (1) Identify the pattern: 5 exercises over the shared CandleSvg engine with announced context, 4 options, inline colored verdict + teaching explanation, local drill score; (2) Candle simulator: OHLC sliders + shape presets (Doji/Hammer/Shooting star/Marubozu) rendering a live candle with automatic anatomy reading (doji / rejection wicks / marubozu / ordinary).
- Honest framing: 'Grading stays with the course quizzes — this room is for repetitions.' Practice tab (Dumbbell) completes the Academy fold: Overview / Courses / Progress / Practice / Glossary.

## Ritual results
tsc 0, eslint 0 · Desktop 1440 dark+light: drill verdict 'Correct — …' with score 1/1, simulator presets update candle + read ('Marubozu — conviction'); slider drag verified via state path (preset wiring identical; synthetic test-event artifact documented) · Mobile 390 sw=iw · console 0 errors. Dev server crash mid-pass — restarted detached (setsid).

## Evidence
- `apps/web/scripts/shots/t40/ (3 PNG)`

## Notes
The Academy's five internal tabs are all live: the LMS spine is complete. Bookmarks (optional §33) are the known deferred piece — the progress store can carry them without schema churn.
