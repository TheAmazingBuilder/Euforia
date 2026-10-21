# Audit record — t26: Journal PDF export — jsPDF typeset 'Le Registre' download

- **Date**: 2026-09-26
- **Verdict**: PASS (real PDF artifact verified)
- **Commit**: `068d52e`

## Scope
- Dependency jspdf 4.2.1 added to apps/web (lazy-import on click — no initial-bundle cost).
- lib/journal-export.ts: exportJournalPdf(items, meta) — A4 portrait, 20mm margins, 17mm ledger margin; header 'COSMOZ / TRADING JOURNAL - LE REGISTRE' + counter + export date, accent note 'Filtered view: …' when filters active; each entry = courier marginal date ('26 SEP 2026 — SATURDAY'), helvetica bold title, mono meta line (#tags, mood, trade: SYMBOL side +R), wrapped body, hairlines between entries; page breaks by height estimation; footers 'cosmoz - the trading register' + 'Page X / Y'.
- View: outline 'Export PDF' button (FileDown / spinner) beside New entry, disabled when empty/loading; payload = the CURRENT filtered view (search/tag) with resolved trade chips; success toast 'N entries on M pages' or error.

## Ritual results
tsc 0, eslint 0 · Desktop 1440 dark: full export → real downloaded file (visually verified: 8 entries / 2 pages, layout conformant) · tag-filtered export → '4 entries on 1 page' + 'Filtered view: tag #lesson' note inside the PDF · light theme + mobile 390 sw=iw · console clean.

## Evidence
- `apps/web/scripts/shots/t26/ (3 PNG + filtered-sample PDF artifact)`

## Notes
The filtered view on screen IS what goes to paper.
