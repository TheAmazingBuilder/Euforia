# Session Live Rebuild — Phase 0 Implementation Map

Source prompts: `upload/Pasted Content_1790841527415.txt` (master spec, §1–78) +
`upload/Pasted Content_1790841798564.txt` (V1 roadmap, Phases 0–17).

## Existing capability → reusable infrastructure

| Capability | Existing infra | Verdict |
|---|---|---|
| Market data (real) | `mini-services/market-service` (Binance real + Simulated labeled SIM, socket.io + REST `/prices` `/candles`, port 3003) | REUSE — Phase 3 satisfied |
| Feed resilience | `apps/web/src/lib/realtime/market.ts` — phase machine live/reconnecting/offline/connecting, STALE_MS, polling fallback, telemetry | REUSE — Phase 8 satisfied |
| Chart | `components/session/price-chart.tsx` — ECharts candles/line/area, volume pane, replay scrubber, position overlays, chart prefs | REUSE base → extend |
| Broker read-only | `/broker/session` MSW + `broker-panel.tsx` (NOT_CONFIGURED honest state, no actions) | REUSE — Phase 7 satisfied |
| Journal positions | `symbol-positions.tsx`, `open-trade-card.tsx`, unrealizedPnl helper | REUSE |
| Session notes | `/session/notes` GET/POST/DELETE + `session-logbook.tsx` | REUSE — Phase 6 partial |
| Timeline | `/session/timeline` (events + moods, server day) + `event-timeline.tsx` | REUSE — extend with session events |
| Eco events | `/eco-events` + `useEcoEvents` | REUSE — Phase 10 |
| Playbook | `/strategies` (structured entryConditions/confirmations/invalidations/risk) + `/setups` | REUSE — Phase 9 |
| Rules engine | `/rules/status` (limits current vs limit, riskBudgetSpentPct, violationsToday) | REUSE — Phase 9 |
| Nofy | full notes API (blocks + refs STRATEGY/SETUP/SYMBOL) + `useCreateNofyNote` | REUSE — Phase 12 |
| Instruments | `/instruments` (assetClass, digits, pipSize) | REUSE — Phase 3 symbol list |
| Auth | MSW single-user, user-scoped store | OK |

## Missing Session Live capability → required change

1. **Trading Session entity** (Phase 1): new `sessionLive` schemas + MSW store section +
   `/session-live/sessions` endpoints (create+start, end w/ summary, history, active).
   Statuses: ACTIVE/COMPLETED/CANCELLED (PLANNED folded into create→start).
   Session events array (SESSION_STARTED/ENDED, ANALYSIS_SAVED, NOTE_ADDED,
   TRADE_DETECTED — Source: Journal, LEVEL_ADDED, BIAS_CHANGED).
2. **Saved Analysis** (Phase 11): `/session-live/analyses` CRUD; stores bias,
   scenarios, key levels, indicator config, drawings, strategy/setup, notes.
3. **Key Levels** (Phase 5): `/session-live/levels` per-symbol CRUD
   (SUPPORT/RESISTANCE/PDH/PDL/SESSION_OPEN/WEEKLY_HIGH/WEEKLY_LOW/CUSTOM…),
   opt-in chart overlay (user previously asked to remove the AUTO overlay — overlay stays OFF by default).
4. **Indicators** (Phase 4): real math in `lib/utils/indicators.ts`
   (EMA, SMA, VWAP window-anchored, RSI, MACD, ATR, Bollinger, Volume) rendered as
   overlays or sub-panes; add/remove/edit params/hide/show/reset; persisted in
   localStorage draft + Saved Analysis restore.
5. **Drawing tools** (Phase 4): HLINE, TREND, RAY, RECT, TEXT, MEASURE, FIB
   anchored to (time, price); click-pair placement; panel lists edit/delete/clear;
   persisted in localStorage draft + Saved Analysis restore.
6. **Market Context panel** (Phase 5): OBJECTIVE (price, change, market session phase,
   ATR(14), day range from candles) vs TRADER INTERPRETATION (bias, levels, scenarios) —
   visually separated.
7. **Economic events + proximity** (Phase 10): panel + "HIGH IMPACT EVENT IN N MIN" banner.
8. **Playbook & Rules context** (Phase 9): strategy/setup selectors (read-only context),
   rules status panel.
9. **Session shell** (Phase 2): header with status chips (Session, Market feed, Broker),
   duration, Start/End dialogs, history drawer; empty states everywhere.
10. **Nofy save** (Phase 12): "Save to Nofy" creates a structured note (blocks + refs).
11. **Session review** (Phase 13): end-session summary + reflection template → Nofy note
    (reuses Nofy; no parallel review system).
12. **News**: NO provider exists in the app — omit panel in V1 (documented; extension point).

## Non-negotiables honored

- NO order execution anywhere (no BUY/SELL/CLOSE/MODIFY UI or endpoints; broker panel read-only).
- Objective data never mixed with interpretation.
- Simulated feeds labeled SIM; missing metrics render "—".
- External attribution on trade events ("Trade detected — Source: MT5" pattern).
- Keep every existing Session Live feature (open trades, regret registry, logbook,
  ghost check-ins, mood strip, timeline, replay, discipline banner) — additive rebuild.

## Key file paths (2026-10-01)

- Page: `apps/web/src/app/(app)/session/page.tsx` → renders `SessionView`
- View: `apps/web/src/components/session/session-view.tsx`
- Chart: `apps/web/src/components/session/price-chart.tsx` (ECharts via `components/charts/echart.tsx` `createChartInstance`)
- Feed: `apps/web/src/lib/realtime/market.ts` (`useLiveQuotes/useLiveQuote/useFeedStatus/useCandles`, STALE_MS)
- Store: `apps/web/src/mocks/store.ts` (`nowIso`, `todayKey`, `MockError`, `createTrade` @919, `mockStore` @4978)
- Handlers: `apps/web/src/mocks/handlers/*.ts` registered in `handlers/index.ts`; `endpoint()`, `latency()`, `toErrorResponse()`, `pathParam()` in `handlers/utils.ts`
- Contracts: `packages/shared/src/schemas/*.ts` re-exported by `packages/shared/src/index.ts`
- Queries: `apps/web/src/lib/api/queries/*.ts`; paths in `lib/api/endpoints.ts` (`apiPaths`); keys in `lib/api/keys.ts`
- Design tokens: surface/surface-raised/accent/profit/loss/warning/border, `font-heading`, `ledger-label`, `stamp stamp-ink`
- Hooks available: `useStrategies`, `useSetups`, `useRulesStatus`, `useEcoEvents`, `useBrokerSession`, `useCreateNofyNote(NofyNoteCreateInput)`, `useInstruments`
