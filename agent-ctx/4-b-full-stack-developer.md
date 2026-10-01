# Task 4-b — finish Trades i18n migration (full-stack-developer)

## Context found at start
- No prior `/agent-ctx` records existed; the interrupted 4-a run left no worklog entry either.
- Key discovery: **the interrupted agent had already finished the dictionary work** — `en/trades.ts` and `fr/trades.ts` both carry the complete ghost / judgment / reveal / reflect / chart groups (~24 groups total). Verified key-by-key before touching any component, so **zero dict edits were made**.

## Scope executed (EXACTLY 5 files, nothing else)
1. `apps/web/src/components/trades/ghost-modal.tsx`
2. `apps/web/src/components/trades/judgment-gate.tsx`
3. `apps/web/src/components/trades/reflect.tsx`
4. `apps/web/src/components/trades/reveal.tsx`
5. `apps/web/src/components/trades/trade-session-chart.tsx`

Pattern per migrated siblings: `useI18n()` + `const T = dict.trades.<group>`; machine values stay module-scope; labels resolve at render.

## Keys — 100% REUSED (none added; en+fr were already complete)
- **ghost-modal**: ghost.title/badge/description/sheetDescription/marketInstrument/potentialBias/whyNot/skipReasonAria/tomorrow/logIt/logged/failedDescription; ghost.directions.{long,short,undecided}; ghost.reasons.{DISCIPLINE,FEAR,OUT_OF_PLAYBOOK,NO_SETUP,MISSED_EXECUTION}.{label,hint}; errors.ghostLog. REASONS flattened to `readonly SkipReason[]`, DIRECTIONS now carry labelKey.
- **judgment-gate**: judgment.planQuestion/binaryCheck/planYes/planYesDesc/planNo/planNoDesc/gradeQuestion/keysHint/blind/sealing/lockGrade/skip/sealed/entryPrefix/inPosition; shared.outOfPlaybook/gradeWord; reveal.gradeTag.{A..F} (hints + composed aria-label). GRADE_OPTIONS flattened to `readonly Grade[]`; GRADE_BY_KEY untouched.
- **reflect**: reflect.* (intro/mistakes/confirmed/dismissed/confirm/dismiss/emotionAfter/excursion/mfeLabel/maeLabel/newTagPlaceholder/newTagAria/createTagAria/lessonHeading/lessonPh1-3/savedState/escToSkip); emotions.* chips; reuses shared.optionalSingleTap/finish, form.tags, detail.screenshotsWord, common.saving. rotatePlaceholder now takes a labels array.
- **reveal**: reveal.coaching.{win_ab,loss_ab,win_df,loss_df} (via `key in` + loss_ab fallback — coachingKey is z.string()), gradeTag, net, coachingLabel, setupsAvoided, rSaved, starAnimation/on/off/settingsSuffix, constellationAria; shared.newTrade/finish/outOfPlaybook/gradeWord. RevealStar takes ariaLabel prop (stays hook-free).
- **trade-session-chart**: chart.heading/collapse/expand/unavailable/projectionAria/openNote/sl/tp; detail.entry/exit (markers + legend). useMemo deps +chartT/detailT (locale switch rebuilds ECharts labels).

## Self-caught bug
Mid-edit, REASONS render briefly kept `setReason(option.value)` after `option` became the dict entry (no `value` field) — fixed to `setReason(value)` before verification.

## Verification (all pass)
1. `pnpm exec tsc --noEmit | grep -E "components/trades|dictionaries/(en|fr)/trades"` → **empty**.
2. Mandated rg hardcoded-string scan over the 5 files → **empty**.
3. eslint on the 5 files → clean.
4. Wider sweep → only `event.key === "Enter"`, data-testids, machine values, one doc-comment quote (all deliberate).

## Deliberately left + justification
- `Intl.DateTimeFormat("en-US")` in trade-session-chart: renders 24h `HH:mm`, identical across en|fr — formatting behavior, not translatable copy.
- Keyboard maps / testids / machine enum values / doc comments: not user-facing.
- No git commit, no dev server, no Playwright (per task constraints).
