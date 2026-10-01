# Task 5-b — full-stack-developer — Finish Nofy i18n migration

Date: session of 5-b (follows interrupted 5-a; previous agent record: none in agent-ctx — see worklog entries I18N-1 and 4-b for engine + pattern context).

## Scope executed (EXACTLY as assigned)
- apps/web/src/components/nofy/nofy-editor.tsx
- apps/web/src/components/nofy/nofy-notes.tsx
- apps/web/src/components/nofy/nofy-blocks.tsx
- apps/web/src/components/nofy/nofy-panels.tsx
- apps/web/src/components/nofy/nofy-editor-dialogs.tsx
- apps/web/src/components/nofy/nofy-print.tsx
- dictionaries EXTENDED: apps/web/src/i18n/dictionaries/{en,fr}/nofy.ts

## Key discovery
The interrupted 5-a run had already populated `dict.nofy` (16 groups) but had migrated ZERO component files (grep `useI18n|dict.` over components/nofy → empty). So, like task 4-b for Trades, the job was ~100% key REUSE; only one new group was needed: `slash.seed.{condition,observation,result}` (seeded header cells of the slash "table" command), added mirror-exact in en + fr.

## Keys added (en + fr, group slash)
- slash.seed.condition — Condition / Condition
- slash.seed.observation — Observation / Observation
- slash.seed.result — Result / Résultat

## Keys reused (highlights — full list in worklog)
- shared.*: untitledNote, untitledTemplate, savedFromNote, noteOne/noteMany, tagOne/tagMany, wordOne/wordMany, refOne/refMany, edited, created, deleted, addTag, removeTag, addToFavorites, removeFromFavorites, noFolder, moveToTrash, restore, openNote, noteActions, duplicate
- common.*: saving, retry, cancel
- editor.*, notes.*, folders.*, templates.*, trash.*, overview.* (incl. overview.createFirstNote reused by nofy-notes empty CTA), dialogs.*, print.*, blocks.* (tones, dragReorder…), blockTypes.*, placeholders.*, slash.groups, slash.desc, refKinds.*, time.savedPrefix

## Structural conversions (module-scope → dict at render)
- nofy-editor: `SLASH_ITEMS` → `slashItemsFor(dict.nofy)` in a useMemo (labels=blockTypes/refKinds, descs=slash.desc, seeded table headers=slash.seed; group badge via slash.groups[machineId]); `blocksToMarkdown(title, blocks, { untitledNote, refLabel(kind) })`.
- nofy-blocks: `PLACEHOLDERS` → `placeholderFor(type, N)` (headings reuse blockTypes); exported `blockTypeLabel(type, B)` (reused by Turn-into, textarea aria, nofy-panels template preview); `CALLOUT_TONES` de-labeled → `blocks.tones[tone]`.
- nofy-print: `TONE_LABEL` map deleted → `blocks.tones`.
- Machine ids untouched everywhere (cmd/group/type/refKind/tone values, data-testids, data-block-type, tab ids).

## Verification (all pass)
1. `pnpm exec tsc --noEmit 2>&1 | grep -E "components/nofy|dictionaries/(en|fr)/nofy"` → EMPTY (extra sweep of full output for `nofy|dictionaries/(en|fr)\.ts` → EMPTY; fr mirror compile-checked through Dictionary). Self-introduced arg mismatch (blocksToMarkdown copy object) caught by tsc and fixed.
2. Mandated rg scan (`aria-label="[A-Z]|title="[A-Z]|…|>[A-Z][a-z]+ [a-z]+`) over src/components/nofy/*.tsx → EMPTY.
3. `pnpm exec eslint` on the 6 files → exit 0.
4. Wider literal sweep → only event.key identifiers, machine values, dict-composed template literals, glyph-only strings and doc-comment quotes remain.

## Deliberately left un-migrated (justification)
- `alt ?? caption ?? "image"` + `(draft.title || "note")` fallbacks inside blocksToMarkdown — lowercase fallbacks inside a GENERATED .md artifact, not UI copy; no fitting dict key; not flagged by the scan.
- `updated.toLocaleDateString("en-CA")` — date formatting (same precedent as trade-session-chart Intl), not translatable copy.
- Relative-time strings still come from `nofyRelativeTime` in nofy-shared.tsx (English output) — that file is OUT of my 6-file scope; the `time` dict group already exists for its migration.

## Out of scope / left for a follow-up agent
nofy-view.tsx, nofy-shared.tsx (time vocabulary), nofy-linked-notes.tsx (linked.* group already in dict). No other modules, no configs, no commit, no dev server.
