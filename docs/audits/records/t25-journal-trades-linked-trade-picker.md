# Audit record — t25: Journal ↔ trades — linked-trade picker + execution chips on entries

- **Date**: 2026-09-26
- **Verdict**: PASS
- **Commit**: `1fbcd8f`

## Scope
- Contract: updateJournalEntryInputSchema accepts relatedTradeId (nullable optional) — link/relive/delink.
- Mock: updateJournalEntry applies relatedTradeId; seed threads 4 entries to REAL fixture trades via linkSeedEntry (most recent CLOSED trade of the symbol with tradingDate ≤ entry date, honest null fallback): BOOM500/XAUUSD/XAUUSD/BTCUSDT.
- Dialog: 'Linked trade' Select (mono) — all trades newest-first, label 'SYMBOL · long/short · date · +R/open', hint 'Tie the note to the execution it reviews.'; JournalDraft carries relatedTradeId.
- View: LinkedTradeChip hairline mono (Link2 accent, bold symbol, buy/sell arrow profit/loss, net P&L + formatR colors, 'open' warning when not closed); resolution via useTrades + useInstruments (memoized maps).

## Ritual results
tsc shared 0, tsc app 0, eslint 0 · Desktop 1440 dark+light: 4 seed chips shown (BOOM500 +111.79 +1.01R / XAUUSD +175.59 +1.76R / XAUUSD +90.81 +0.98R / BTCUSDT +112.94 +1.26R), linked entry created (9 entries, chip at head), edit → 'Not linked' → chip removed (4 remaining) · dialog light captured · Mobile 390 light+dark sw=iw · console clean, 0 page errors.

## Evidence
- `apps/web/scripts/shots/t25/ (5 PNG)`

## Notes
Journal entries are now threaded to executions.
