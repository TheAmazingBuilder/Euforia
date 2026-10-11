# COSMOZ — PHASE 13 REPORT: Economic Calendar & Market Events

Status: **DONE — Phase 9 (Backtesting) remains DEFERRED.** This report follows the
Phase 13 §67 return contract. No next phase was started (§67.6 — STOP after Phase 13;
explicit authorization required for Phase 14).

---

## 1. Calendar functionality implemented

The Economic Calendar bounded context lives at `apps/api/src/modules/calendar/` and is
the **canonical economic-event layer** of Cosmoz — the single authoritative store that
Session Live, Trade Planner, Trade Review, Analytics and Nofy consume through the
public read port (`CalendarQueriesService`). It serves the **6 routes** the audited
frontend speaks verbatim (`lib/api/endpoints.ts` + MSW handlers — nothing invented),
all authenticated (global JwtAuthGuard, no `@Public`):

| Route | Behaviour |
|---|---|
| `GET /api/v1/eco-events` | Canonical events over the configured rolling window (defaults −92 d / +13 d — spans the Analytics 90-day journal horizon), chronological, shared `ecoEventSchema` wire shape (`{ events: [...] }`, no pagination envelope — mock parity). Triggers the lazy sync first. |
| `GET /api/v1/calendar-view?from&to` | The trading-calendar overlay: zero-filled day rows (tradesCount/pnlNet/rEarned/disciplineScore/violationsCount/ecoHighCount/ecoCount/block/excludedFromStats) + range summary + `dailyLossLimitPct` (user's shared preferences) + display `currency` (main account). Hard 401-row emission cap; `from > to` and over-wide ranges → 422. |
| `GET /api/v1/calendar-blocks` | The principal's overlay markers, date-ascending. |
| `PUT /api/v1/calendar-blocks` | Full-replace upsert keyed `(userId, date)`; note defaults by kind (OFF → "Planned day off", NEWS → "High-impact news" — mock parity). |
| `DELETE /api/v1/calendar-blocks/:date` | Idempotent: `{ block: <removed|null>, deleted: true }`. |
| `POST /api/v1/calendar-blocks/import-eco` | HIGH-impact release days over the next two weeks (user timezone day keys, mock §22 parity) become NEWS blocks — never overwrites an existing block; exact mock messages; 200. |

Out of scope, enforced structurally (§7/§38/§63): no market data (candles/ticks/quotes/
indicators), no news platform/social feed, no AI/LLM, no notifications infrastructure,
no broker execution, no analytics computation inside Calendar, **no Backtesting
(Phase 9 DEFERRED)**, no second event store in any consuming context.

## 2. Existing functionality reused (audit-first, no duplicates)

- **Shared contracts**: `@cosmoz/shared` `schemas/eco-event.ts` + `schemas/api.ts`
  (eco/calendar-view/calendar-blocks schemas) consumed VERBATIM. ZERO shared-package
  changes, ZERO frontend changes.
- **Auth/ownership**: Phase 2 identity (global guard, `@CurrentUser`, userId in every
  block where-clause). No second auth mechanism.
- **Backend conventions**: `/api/v1` URI versioning, `ZodValidationPipe` → 400
  `{error:"ValidationError",issues}`, `AppError` taxonomy (BusinessRuleError 422 for
  range invariants — the MSW 422 precedent), flat module + single Prisma repository +
  thin controller + pure domain, vitest + embedded-postgres harness.
- **Preferences (§14)**: the ONE shared preferences doc — `risk.dailyLossLimitPct`
  read via `userPreferencesSchema`/`DEFAULT_USER_PREFERENCES` from the shared barrel
  (IdentityRepository). No second timezone/preference system; the frontend renders in
  the user's profile timezone (`PATCH /me` — untouched).
- **Cross-context reads (§34-§37)**: closed-trade daily aggregates through
  TradingRepository (additive `listClosedDailyRows`, Phase 6/8/10 precedent), main
  account currency through AccountsRepository, instrument quote currencies through the
  existing `INSTRUMENT_SPECIFICATION_PROVIDER` (Analytics §21 join).
- **Trading-date helpers**: `tradingDateKey` (Trading Core) reused for import-eco day
  keys — no date-key duplication.

## 3. Architecture (provider-agnostic, §5/§61)

```
External Economic Provider
          ↓
   Provider Port (domain/provider.port.ts)
          ↓
   BuiltinEconomicProvider          (infrastructure — deterministic sample
   "builtin-sample"                  adapter; real providers = one adapter away)
          ↓
   Normalization (domain) → Zod validation, impact mapping, UTC instants,
   textual values, status derivation (§12/§15/§18/§19/§48)
          ↓
   Deduplication / idempotent upsert on (provider, providerEventId) (§24)
          ↓
   Canonical Calendar (EconomicEvent + CalendarSyncRun)
          ↓
   Public read port → Session Live (summary) · Analytics (§21) · Nofy (EVENT refs)
   User overlay → CalendarBlock (per-user, trading-calendar view + import-eco)
```

- **Provider payloads never reach the wire** (§47/§49): the wire projection selects
  only the 8 shared-contract fields; provider identity/tone vocabulary stay internal.
- **No scheduler introduced (§26)**: the audited repo has no cron/queue/worker. Sync
  is LAZY — the first consumer after the freshness TTL (`CALENDAR_SYNC_TTL_SECONDS`,
  default 60 s) triggers one run; concurrent callers join the in-flight promise
  (in-process lock) and cross-process races converge on the unique constraint. A
  failed run is recorded and **stale-but-valid canonical data is served** (§28).
- **No FastAPI**: no workload justifies a Python round-trip (Phase 8 §39 precedent).

## 4. Database design (§43/§44)

New migration `20261003202121_calendar_economic_events` — 3 models, 3 enums:

| Model | Purpose | Constraints / indexes |
|---|---|---|
| `EconomicEvent` | Canonical, provider-independent event; textual actual/forecast/previous (§18/§19), UTC `scheduledAt` (§13), derived `EcoEventStatus` | `@@unique([provider, providerEventId])` (§24 idempotence), `@@index([scheduledAt])`, `@@index([status])`, `currency @db.Char(3)` |
| `CalendarSyncRun` | Freshness + observability per run (§29/§52): window, counts (seen/created/updated/unchanged/rejected), durationMs, bounded safe `errorMessage` | `@@index([provider, startedAt(sort: Desc)])` |
| `CalendarBlock` | Per-user overlay marker (`OFF`/`NEWS`) | `@@unique([userId, date])`, FK → User CASCADE |

NOT created (explicitly unjustified by the frontend audit — §8 "minimum model"):
`EconomicEventOccurrence`, `EconomicEventCategory/Country/Currency` tables (the
frontend filters by currency chips derived from data), `UserCalendarPreference`
(no calendar preference exists in the UI). Composite indexes (`scheduledAt + impact`
etc.) deliberately not created until a real query pattern justifies them (§44).

## 5. Files changed / created

```
apps/api/prisma/schema.prisma                                    (+3 enums, +3 models, User.calendarBlocks)
apps/api/prisma/migrations/20261003202121_calendar_economic_events/
apps/api/src/modules/calendar/domain/economic-event.ts            (NEW — normalization, windows, day keys)
apps/api/src/modules/calendar/domain/provider.port.ts             (NEW — port + injection token)
apps/api/src/modules/calendar/domain/calendar-aggregation.ts      (NEW — pure calendar-view engine)
apps/api/src/modules/calendar/infrastructure/builtin-economic.provider.ts (NEW — deterministic adapter)
apps/api/src/modules/calendar/infrastructure/calendar.repository.ts (NEW — only Prisma contact)
apps/api/src/modules/calendar/calendar.service.ts                 (NEW — use cases + lazy idempotent sync)
apps/api/src/modules/calendar/calendar-queries.service.ts         (NEW — public read port)
apps/api/src/modules/calendar/calendar.controller.ts              (NEW — 6 routes)
apps/api/src/modules/calendar/calendar.wire.ts                    (NEW — wire types)
apps/api/src/modules/calendar/calendar.module.ts                  (NEW)
apps/api/src/config/env.schema.ts                                 (+CALENDAR_SYNC_TTL_SECONDS, +window past/future days)
apps/api/src/config/app-config.ts                                 (+calendar section)
apps/api/src/modules/trading/trading.repository.ts                (+listClosedDailyRows — additive read, Phase 13 section)
apps/api/src/modules/session-live/session-live.service.ts         (ecoEventsCount: canonical count — was hard 0)
apps/api/src/modules/session-live/session-live.module.ts          (+CalendarModule import)
apps/api/src/modules/analytics/domain/analytics-input.ts          (+quoteCurrency on instrument/trade rows)
apps/api/src/modules/analytics/domain/analytics-suite.ts          (+SuiteCalendarEvent, real §21 phases/byImpact/coverage — was stubbed)
apps/api/src/modules/analytics/analytics.service.ts               (calendar join via public port + quoteCurrency resolution)
apps/api/src/modules/analytics/analytics.module.ts                (+CalendarModule import)
apps/api/src/modules/nofy/nofy-reference-resolver.ts              (EVENT refs resolve — was `return null`)
apps/api/src/modules/nofy/nofy.module.ts                          (+CalendarModule import)
apps/api/src/app.module.ts                                        (+CalendarModule)
test/unit/calendar-domain.spec.ts                                 (NEW — 15 tests)
test/e2e/calendar.e2e.spec.ts                                     (NEW — 12 tests)
test/unit/analytics-suite-engine.spec.ts                          (updated §21 expectations + new classification test)
test/e2e/analytics.e2e.spec.ts                                    (updated events-block expectations — shape + invariant)
test/e2e/nofy.e2e.spec.ts                                         (EVENT picker now served — seeded canonical event)
```

## 6. Providers & synchronization jobs

- **One provider registered**: `builtin-sample` (deterministic, zero credentials, zero
  network — §4 "do not assume any provider is available"). Reproduces the reference
  engine: seed `floor(nowMs/86_400_000) ^ 0xe0`, mulberry32, the exact 19-template
  weekday pools (US 08:30/10:00 ET, FOMC 14:00/14:30, ECB 08:15/08:45 — documented
  fixed-offset ET→UTC conversion, mock "fixture precision is fine" compromise), the
  exact value-draw order (uuid → forecast → previous → actual; ±10% drift, 1 decimal /
  integer ≥ 100), `actual` filled only when the instant has passed (×1.04 beat base).
  Identity is **day+index stable** (`MACRO-YYYYMMDD-<i>`) so next-day seeds upsert —
  never duplicate (§24).
- **No cron/queue**: lazy throttled sync (§22/§26). Sync run lifecycle:
  RUNNING → SUCCEEDED/FAILED with full counters (observability event names reserved
  per §52: `calendar.sync.completed` / `calendar.sync.failed` / `calendar.sync.rejected`
  — structured logs, bounded samples, no payload dumps).
- **Rate limits / retries**: n/a for the built-in adapter (no network); the PORT is
  where provider-specific limits, pagination, retries and backoff live for future
  adapters (§27) — none invented here.

## 7. Tests (28 new; full suite 636/636 green)

- **Unit — `test/unit/calendar-domain.spec.ts` (15)**: payload validation + safe
  rejection (§48), impact mapping (unknown tone rejected — §15), status derivation
  (§12), textual values (§18/§19), window bounds + day-key arithmetic, provider
  determinism (same instant → identical payloads), weekday-only emission, stable
  identity across days (§24), released-actual rule, wire-shape isolation, view
  zero-fill, OFF exclusion / NEWS blocking, summary math, 401-row cap (§31).
- **Unit — `analytics-suite-engine.spec.ts`**: §21 without events (unclassifiable
  trades honestly out of every bucket) + NEW full classification fixture
  (DURING/BEFORE/AFTER/NONE, nearest-event tie-break, currency join, ±4 h byImpact,
  coverage from/to, classified/unclassified invariants).
- **E2E — `calendar.e2e.spec.ts` (12)**: 401 on all 6 routes; eco wire shape validated
  against the SHARED schema (>50 events, chronological, −92/+13 bounds, future actual
  null); no provider internals on the wire; blocks upsert/defaults/full-replace/
  idempotent delete; cross-user block isolation (IDOR); import-eco + second-run
  no-op with exact mock messages; calendar-view real aggregates over seeded canonical
  P&L (95 − 50 = "45", R "0.9"), OFF-day exclusion, currency/limit echo; 400 vs 422
  range errors; Session Live summary counting a seeded in-window event; Nofy EVENT
  ref resolution (label/meta/href exact).
- **Regression updates (§67.2 — Phase-13-related only)**: analytics suite e2e/events
  block (the "no calendar backend" stubs were replaced by live canonical coverage —
  shape + closed-set invariant asserted in e2e; exact classification math in unit),
  nofy picker EVENT branch (now served; deterministic seeded event).

## 8. Security verification (§46/§47/§49)

- Every route authenticated (401 battery in e2e) — shared reference data is still
  served behind auth; user blocks are user-scoped with IDOR tests.
- No provider credentials exist (built-in adapter) and none could reach the client:
  the wire projection is a fixed 8-field select.
- Query abuse bounded: fixed sync window, 401-row view cap, 422 on inverted/wide
  ranges, 400 on malformed keys; picker scans take-limited.
- Raw provider payloads never persisted on the event row nor exposed; sync failures
  log bounded provider-free messages; `CalendarSyncRun.errorMessage` capped at 300 chars.
- Validation binds to shared Zod contracts before any domain logic runs.

## 9. Performance verification

- `/eco-events` serves ~285 rows ordered by `scheduledAt` (indexed) — single query,
  no N+1 (verified on live smoke: 54 ms first call including the full lazy sync).
- `/calendar-view` = 4 parallel reads (user, accounts, bounded daily rows, window
  events) + pure in-memory aggregation; no full-table scans (tradingDate-bounded,
  indexed `[userId, tradingDate]` on Trade).
- Sync upsert: one read + partitioned `createMany` + targeted updates in ONE
  transaction; unchanged rows (same-UTC-day re-syncs) are skipped entirely.

## 10. Known limitations (honest, documented)

- `disciplineScore: null` / `violationsCount: 0` on calendar-view day rows: the
  discipline journal is not owned by any backend context yet (Phase 8 §20 precedent —
  never fabricated). The frontend renders them as unavailable.
- Built-in provider times use the mock's fixed EDT offset (no DST precision — mock
  parity, documented in the adapter header). A real provider adapter brings real
  provider timezone semantics.
- Without a trading account, `/calendar-view` is an honest 404 (the view echoes the
  main account currency; the frontend never calls it account-less).
- `EcoEventStatus` `UPDATED` is reserved (enum present, no producer yet — webhook
  feeds are a future seam).
- Mock 422 body `{message}` → backend `{error:"BusinessRule", message}` (the standard
  error envelope the frontend renders first — documented divergence, not a contract
  break).

## 11. Verification run

`typecheck ✓ · lint ✓ · vitest 636/636 (38 files) ✓ · build ✓ · prisma validate ✓ ·
migrate (dev + test) ✓ · live smoke ✓` — boot → health → register → verify → login →
`GET /eco-events` (285 events; 247 released with actual, 38 scheduled) → account →
`GET /calendar-view` (zero-fill + eco counts + preferences echo) → `PUT /calendar-blocks`
(default note) → `POST /calendar-blocks/import-eco` (8 NEWS days imported) → second
import (0 — idempotent) → inverted range 422 → idempotent delete.

## 12. Phase roadmap state

Phase 13 recorded in `docs/backend/ROADMAP.md` as COMPLETED. **Phase 9 (Backtesting)
remains DEFERRED** and was NOT reactivated, NOT implemented, NOT touched (§67.5).

**STOP** — awaiting explicit authorization for Phase 14 (§67.7-§67.9: no unrelated
improvements, no frontend redesign, no speculative AI or infrastructure).
