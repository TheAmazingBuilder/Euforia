# Audit record — t28: Journal filters & sort — linked/unlinked + mood chips, newest/oldest/title orders

- **Date**: 2026-09-26
- **Verdict**: PASS
- **Commit**: `5ec83c4`

## Scope
- Contract: JournalQuery extended (linked 'true'/'false', mood, JournalSort newest|oldest|title); GET /journal handler reads the 3 new params; store.listJournalEntries filters linked/mood + sorts (title = localeCompare, oldest = inverse date/createdAt key).
- Client: keys.journal + useJournalEntries extended (sort 'newest' does not encode the param).
- UI: 'Sort order' Select (mono) beside search; LINK chip row (All/Linked/Unlinked); MOOD row (moods present in the log, from allData); FilterChip extracted (single grammar: mono hairline, active = ink block) and applied to existing tags too; clickable mood annotation filters that mood; isFiltered + counter + export note extended (mood/linked).

## Ritual results
tsc 0, eslint 0 (fixed Emotion type predicate) · Desktop 1440 dark: Linked → 4 of 8, Unlinked → 4 of 8, mood calm → 3 of 8, Oldest first → 'Weekly review' at head, Title A-Z → alphabetical verified, linked-filtered export → PDF note 'Filtered view: linked to trade' verified in file · light + mobile 390 sw=iw · console clean.

## Evidence
- `apps/web/scripts/shots/t28/ (4 PNG)`

## Notes
The journal becomes a queryable register; everything that existed (search, tags, goals, export) stayed intact — additive only.
