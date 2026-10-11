# COSMOZ — BACKEND PHASE 10 REPORT
## Session Live & Real-Time Trading Session Infrastructure

---

## 1. Phase 9 status — explicitly DEFERRED

Phase 9 (Backtesting) was **skipped, not renumbered**. The skip is recorded in
`docs/backend/ROADMAP.md` (new file): status DEFERRED, reason "Frontend
Backtesting module does not currently exist", decision "Do not implement
Backend Backtesting until the product/frontend module exists", and the future
architecture recorded as documentation only. **Zero** backtesting artifacts
were created (no controllers, services, models, engine, Python service,
simulation infra).

## 2. Session Live functionality implemented

New bounded context `apps/api/src/modules/session-live/` (Fastify, `/api/v1`):

- **Trading sessions** — `GET/POST /session-live/sessions`,
  `PATCH /session-live/sessions/:id` (bias/objective/notes while ACTIVE),
  `POST /session-live/sessions/:id/end` (close + **session summary**),
  `POST /session-live/sessions/:id/cancel` (abandon, no summary).
  Exactly one ACTIVE session per user (service 409 + partial unique index
  `TradingSession_one_active_per_user` — race-safe, §62). Mock-parity
  defaults (`primarySymbol "—"`, `5m`, `OTHER`, `NEUTRAL`), mock-parity event
  stream (SESSION_STARTED/BIAS_CHANGED/ANALYSIS_SAVED/NOTE_ADDED/
  LEVEL_ADDED/SESSION_ENDED persisted at action time — never synthesized on
  read, §40).
- **Session summary** (§43) — duration, unique markets, tradeCount (trades
  opened in window), netPnl (closed in window, `pnlNet ?? pnlGross`), avgR
  (rMultiple), notesCount, analysesCount; `violationsCount`/`ecoEventsCount`
  are **explicit honest zeros** (Discipline/Calendar backends do not exist).
- **Saved analyses** — `GET/POST /session-live/analyses`,
  `DELETE /session-live/analyses/:id`; bias/scenarios/levels/indicator+drawing
  configuration frozen as Zod-validated JSON (Phase 7 §32 precedent);
  referenced session ownership-checked (foreign sessionId → 404).
- **Key levels** — `GET /session-live/levels?symbol=`, POST/PATCH/DELETE;
  per-symbol trader documentation, Decimal(18,8) at rest, number on the wire
  (shared contract verbatim).
- **Session timeline** — `GET /session/timeline`: server-resolved trading day
  (user timezone, `tradingDateKey`), ENTRY/EXIT rows from canonical
  `Trade.tradingDate`, stable RFC-4122-v5 derived ids (idempotent replay,
  §63), **moods always `[]`** (Trade carries no emotion columns — honest).
- **Session notes** — `GET/POST/DELETE /session/notes` (server-stamped date +
  wall-clock; NOTE_ADDED event while a session is active; deleting a note
  never rewrites history).

## 3. Existing systems reused (AUDIT FIRST — §4)

- **Phase 0–8 audited before any modification**: reports in `docs/backend/`,
  492/492 tests green at start, conventions binding (flat modules,
  ownership-in-query IDOR→404, AppError envelope, Decimal(18,8), UTC).
- **Accounts (Phase 3) reused, untouched**: `/broker/session` already serves
  the read-only account/positions/orders aggregate from synchronized state
  (the Session-Live panel contract); the provider adapter interface remains
  read-only by construction. **No** LiveAccount/SessionAccount/SessionConnection
  duplicates created (§5).
- **Trading Core (Phase 4) reused**: canonical Trade rows read through
  `TradingRepository` public contract (two additive read methods — Phase 6/8
  precedent). **No** second Trade model (§6).
- **Playbook/Trade Planning/Analytics/Calendar ownership respected**: only
  plain-uuid references stored; no duplicated rule engine, planner or
  analytics (§35–§39).
- **Real-time layer reused**: the existing authenticated market service
  (socket.io + REST snapshot, JWT handshake, `user:<id>` rooms, full-snapshot
  emit, polling fallback) remains the market/positions stream; `/broker/session`
  remains the broker snapshot. NestJS introduced **no second transport** (§14/§15).

## 4. New contracts

**Zero shared-contract changes.** `@cosmoz/shared` schemas
(`sessionLive.ts`, `api.ts` timeline/notes, `broker.ts`) were consumed
verbatim — the exact paths/shapes the frontend already speaks. Backend route
vocabulary = frontend `apiPaths` (sessions/analyses/levels + session
timeline/notes). No speculative routes (§55/§57: no `/snapshot` endpoint —
the frontend requires none; snapshot+stream is served by the existing layers).

## 5. New persistence / read models

Prisma (migration `20261003180600_session_live`):
- models `TradingSession`, `TradingSessionEvent` (child, chronological),
  `SavedAnalysis` (JSON blocks), `KeyLevel`, `SessionNote`;
- enums `TradingSessionStatus`, `TradingWindow`, `MarketBias`,
  `SessionLiveEventKind`, `KeyLevelKind`, `IndicatorKind`, `DrawingKind`
  (shared vocabularies verbatim);
- partial unique index per-user ACTIVE session (race-safe invariant);
- indexes on actual access patterns only (userId+status, startedAt desc,
  sessionId+at, userId+createdAt desc, userId+date+at).
No ticks persisted (§51); no MarketTick model; transient live state stays
transient (§65).

## 6. Real-time architecture (documented — §15 justification)

```text
Provider
   ↓
Accounts / Connectivity (Phase 3 — synchronized state)
   ↓                                  ↓
/broker/session (REST snapshot)    market-service stream
   poll 15s (frontend)              socket.io auth'd, user:<id> room
   ↓                                  ↓
Session Live workspace state       prices + private positions
   ↓                                  ↓
            Next.js Session Live UI
```

Why appropriate: the market service already implements
snapshot-on-connect + incremental broadcast + reconnect-resync +
token re-verification + polling fallback + SIM labeling (§18/§19/§22
client-side phase machine exists); the broker panel is monitoring-grade
15s polling by design. WebSockets AND SSE would duplicate a working
transport (§15: "do not implement both unnecessarily"). Stale detection
(STALE_MS) and freshness are client-side on the feed — unchanged.

## 7. Provider integration

**None added — by design.** Session Live consumes already-synchronized
account state; it holds no credentials, no adapter references, no
provider-specific code paths (§11 provider-agnostic; §59: nothing raw ever
reaches the frontend). The only new cross-context flow is the canonical
domain event `trade.created` (Trading Core publishes after a manual journal
capture; Session Live subscribes → TRADE_DETECTED, source "Journal") through
a new leaf infrastructure bus (`src/shared/events/`) — Session Live is a
subscriber, never the event source of truth (§17). FastAPI untouched (§53:
no workload justifies it).

## 8. Security verification

- **Authentication**: all 16 routes behind the global JwtAuthGuard (no
  @Public) — unauthenticated battery 401 across surfaces (e2e).
- **Ownership**: userId always from the principal; every lookup
  ownership-scoped → foreign session/analysis/level/note = honest 404
  (IDOR battery, e2e); foreign ids invisible in lists; a foreign user's
  ACTIVE session never receives the owner's events.
- **Stream authorization**: the existing market service re-verifies the
  presented token on every explicit subscribe; private streams are
  server-addressed to the `user:<id>` room — clients cannot subscribe to
  arbitrary channels; the WS is not an IDOR bypass (§43/§45, pre-existing +
  regression-tested).
- **Validation**: ZodValidationPipe on every body/query; malformed uuid
  params 400 (e2e).
- **Leakage scan**: no password/secret/credential/token strings in any
  workspace payload; no userId dumps (e2e); event bus failures logged by ids
  only.

## 9. Read-only capability verification

Structural: the module imports no provider adapter, no credentials service —
**there is no execution path to constrain** (§2/§54). Negative battery (e2e):
`POST /session-live/orders`, `POST /session-live/positions/close`,
`PATCH /session-live/positions/:id`, `DELETE /session-live/orders/:id` → 404.
Ending/cancelling a Cosmoz session writes only session rows — never touches
TradingConnection, positions or orders (§41). Session Live may only present
live provider activity through `/broker/session` + the market stream.

## 10. Tests executed

- **Unit** (15 new): lifecycle transitions + mock-parity notes merging;
  summary engine (windows, fallbacks, P&L fallback order, honest zeros);
  timeline assembly (stable v5 ids, open-only trades, chronological order,
  `prettyDecimal`); uuidV5 shape.
- **e2e** (15 new, real AppModule + embedded Postgres): full lifecycle
  (start/409/BIAS_CHANGED/end+summary/re-end 409/cancel/history ordering);
  analyses+ANALYSIS_SAVED; levels per-symbol + LEVEL_ADDED; notes +
  NOTE_ADDED + delete; timeline from canonical trades; **TRADE_DETECTED via
  the domain event bus during an active session** (and nothing fabricated
  without one); unauth battery; IDOR battery; 400 battery; read-only
  negative battery; leakage scans.
- **Full suite: 522/522 green (32 files)** — Phases 1–8 regression included.

## 11. Performance findings

- Session summary = 3 indexed queries per end (window rows, notes count,
  analyses count) — bounded by one user's journal scale; no N+1 (single
  `findMany` per source, `Promise.all` fan-out).
- No duplicate subscriptions (market stream unchanged, shared broadcast);
  no polling added server-side; no per-tick writes (§50/§51 honored).
- Resource management (§47): the bus listener is registered once per service
  and released via `unsubscribeAll` on shutdown; listener cap raised guard
  (16) leaks-aware; conditional `updateMany` transitions avoid lost updates
  (§62) — two tabs cannot double-end a session (409 for the loser).
- No premature optimization: no cache, no queue, no read-model tables —
  evidence-first (§50).

## 12. Known limitations

- `violationsCount`/`ecoEventsCount` are honest zeros until Discipline and
  Eco Calendar backends exist (recorded in ROADMAP.md seams).
- `moods` are always `[]` until emotion columns exist on Trade (Phase 8 seam).
- Timeline emits no SL/TP-modification or ALERT rows (no backend trade-event
  or alerts domain) — never fabricated (§40).
- TRADE_DETECTED covers the manual journal capture path (the mock's exact
  behavior); provider-side activity surfaces via `/broker/session` + market
  stream, not via invented session events (§16).
- Reconnection/stale semantics remain client-owned (existing feed state
  machine); the backend exposes `lastSyncAt`/`lastUpdatedAt`-style data via
  the pre-existing broker contract.

## 13. Recommended next phase

1. **Discipline & behavioral backend** (violations/mistakes/emotions) — the
   largest honest-zero seam this phase exposed; feeds Session Live summary,
   timeline and Analytics psychology/mistakes blocks.
2. **Trade attribution evolution** (Trade.strategyId) — closes the Phase 7/8
   seams (Playbook stats/insights, Analytics strategy grouping).
3. **Eco Calendar backend** — feeds the Session Live event-proximity banner.
4. Frontend wiring switch (NEXT_PUBLIC_API_MOCKED=false) — the Session Live
   contract surface is now fully backend-served; run the §68 verification
   checklist against the dev environment.

**STOP per §75.** No further phases were started (Academy, Nofy, OCR, AI,
Community, Backtesting, Trade Execution — all untouched).
