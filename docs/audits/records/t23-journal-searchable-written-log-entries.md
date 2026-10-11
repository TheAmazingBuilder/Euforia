# Audit record — t23: Journal — searchable written log (entries CRUD, tags, mood, two-step delete)

- **Date**: 2026-09-26
- **Verdict**: PASS*
- **Commit**: `d22e238`

## Scope
- Shared contract journalEntry.ts: JournalEntry (date/title/body/tags≤6/mood nullable/relatedTradeId nullable), JournalListResponse, Create/Update inputs (z.input).
- Mock: store.journalEntries (8 honest seeded entries, NEGATIVE dateKeyOffsets), listJournalEntries({q,tag}) server-side filter+sort desc, create/update/delete (MockError 404). MSW GET/POST /journal + PATCH/DELETE /journal/:id.
- Client: endpoints.journal(.journalEntry), keys.journal(params)+journalRoot, hooks useJournalEntries/useCreate/useUpdate/useDelete (journalRoot invalidation).
- UI: (app)/journal + journal-view + journal-entry-dialog. 'Ruled document' layout: marginal date column (day/month/weekday), hairline divide-y rows, Schibsted titles, #tag annotations mono + mood, discreet hover fill, reveal-stagger. Search + tag chips (active = ink block), 'N of total' counter. Create/edit dialog (date, mood select, title, body, tags) with adjust-state-during-render pattern (anti-effect lint). Two-step inline delete ('Delete forever'/'Keep'). Skeletons, two empty variants, error state.

## Fixes found during the pass
- Double JSON encoding — hooks passed JSON.stringify(body) while apiRequest already serializes (repo convention body: input); caused undefined-field entries and cascading GET 500s.
- Seed date offsets were positive (entries dated in the future) — flipped negative.
- Tag chips read via a second unfiltered request to stay stable while searching.

## Ritual results
tsc 0, eslint 0, impeccable detector [] · Desktop 1440: create (9 entries, head of list), filter #lesson (5 of 9), search 'retest' (1 of 9), edit pre-filled + save, two-step delete · Mobile 390 sw=iw · dark + light captured · console error-free.

## Evidence
- `apps/web/scripts/shots/t23/ (6 PNG)`

## Notes
Placeholder replaced by the real register.
