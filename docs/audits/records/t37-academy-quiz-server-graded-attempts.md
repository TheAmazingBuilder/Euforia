# Audit record — t37: Academy quiz — server-graded attempts with per-question verdicts

- **Date**: 2026-09-27
- **Verdict**: PASS* (in-flight fix: MSW handler unwrapped {answers} incorrectly → 500; fixed)
- **Commit**: `4236681`

## Scope
- One-question-per-screen flow (radio semantics, progress bar, Back/Next gated on selection, Submit when complete), intro screen with attempts/best, score banner tiered profit/warning/loss with honest copy ('feedback, not a verdict'), per-question verdicts (your answer vs correct, why-the-chosen-wrong explanation), retake.
- QuizCard on the course page (N questions · attempts · best %); 'Quiz' breadcrumb.

## Ritual results
tsc 0, eslint 0 · Desktop 1440: deliberate 2/4 attempt (verdicts + wrong-answer explanations verified) then 4/4 (best 100%, toast, card shows '1 attempt · best 100%') · 0/4 run verified tiered messaging · mobile 390 sw=iw · console 0 errors.

## Evidence
- `apps/web/scripts/shots/t37/ (3 PNG)`

## Notes
Answers never travel to the client before grading — the quiz cannot be inspected via devtools.
