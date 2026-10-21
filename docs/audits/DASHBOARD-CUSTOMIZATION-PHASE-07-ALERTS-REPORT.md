# EUFORIA — DASHBOARD CUSTOMIZATION
## PHASE 07 FINAL REPORT — ALERTS, THRESHOLD MONITORING & EVENT HISTORY

Date: 2026-10-16 · Branch: `main` · Base: `512f681` (Dashboard Customization Phase 02)

---

## A. REPOSITORY AUDIT

### A.1 Verified status of Dashboard Customization Phases 01–06

| Phase | Status | Evidence |
|---|---|---|
| 01 — Customization foundation (edit mode, widget registry, layouts, templates) | **DONE** | commit `81513e1`, worklog `6-dashboard-customization-phase01`, probes `verify-dashboard-customize.js` |
| 02 — Widget customization & performance analytics | **DONE** | commit `e3b773a`, worklog `7-dashboard-customization-phase02` |
| 03 — Saved analytical views | **NOT IMPLEMENTED** | no code, no commit, no worklog entry; `dashboardPreferencesSchema` has no view/filter fields |
| 04 — Performance goals | **GOAL SYSTEM EXISTS (predates the series)** | `/goals` CRUD + server-side progress (8 metrics, statuses PENDING/ACHIEVED/ON_TRACK/AT_RISK/BEHIND) in `apps/api/src/modules/review/goal.service.ts`; GOALS_PACE widget on the dashboard. No phase-specific Phase-04 work exists |
| 05 — Performance insights & pattern analysis | **NOT IMPLEMENTED** | no `insight`/pattern code beyond pre-existing playbook setup insights |
| 06 — Workspace management | **NOT IMPLEMENTED** | Phase 01's layout collection exists; no workspaces-above-layouts layer |

Per spec §2 ("identify missing prerequisites, and implement only the minimum integration
needed for Phase 07") Phases 03/05/06 were **not** back-filled. Phase 07 integrates with the
Phase-04 goal system that verifiably exists.

### A.2 Existing event & notification mechanisms (found and reused)

- **Alert inbox (single system, reused — no second notification system)**:
  `DisciplineRow(kind=ALERT)` table → `GET /alerts` + `PATCH /alerts/:id/read`
  (`discipline.controller.ts`), `alertSchema` (`packages/shared/src/schemas/alert.ts`) with
  `readAt`/`dismissedAt`. Two UI surfaces already consumed it: the dashboard ALERTS widget
  (`alerts-feed.tsx`) and the topbar bell popover (`notification-center.tsx`, 3 tabs +
  grouping + archive). **Gap found**: `dismissedAt` existed in schema/UI filters but no route
  set it — filled this phase.
- **Domain event bus**: `DomainEventsService` (global module) with `trade.closed` published by
  ALL five closed-trade write paths (manual close, capture-closed, CSV import, OCR bridge,
  provider reconciliation) — the sanctioned trigger point (discipline subscribes the same way).
- **Authoritative metrics**: `AnalyticsService.getAnalyticsSuite` (Phase-8 engine, the wired
  owner of `GET /stats/analytics-suite`) — period + account + strategy filters, user-timezone
  period resolution. Summary conventions verified: `winRate` 0..1 ratio, `maxDrawdownPct ≤ 0`,
  money fields `null` on multi-currency scopes.
- **Goal authority**: `GoalService` (progress + status per goal, computed server-side).
- **Persistence precedent**: "kind + data Json" bounded-context rows; `uuidV5` deterministic
  ids (`shared/ids/uuid-v5.ts`); CAS-style state guards via Prisma JSON path filters.
- **Monitoring module**: ops-health thresholds (in-memory episodes) — a DISTINCT domain,
  deliberately not mixed with trading analytics.
- **Nofy**: personal knowledge workspace — unrelated (name collision only).

---

## B. IMPLEMENTED FUNCTIONALITY

### B.1 Supported rules and metrics (spec §4)

Rule kinds (shared discriminated union `metricAlertRuleSchema`):
- **THRESHOLD** — `metric` + `condition` + `threshold` over a server-resolved period preset.
- **GOAL** — `goalId` + `goalCondition` (`ACHIEVED` | `PROGRESS_BELOW` + `thresholdPct`).

Metric registry (`METRIC_ALERT_REGISTRY`, 6 entries — only metrics the suite computes
reliably; units make currency/percent mismatches structurally invalid):

| Metric | Unit | Source (authoritative) | Notes |
|---|---|---|---|
| `NET_PNL` | MONEY | `summary.netPnl` | null (NO_DATA) on multi-currency scopes |
| `WIN_RATE` | PERCENT 0–100 | `summary.winRate` (0..1) × 100 | null on empty samples |
| `PROFIT_FACTOR` | RATIO | `summary.profitFactor` | null while the sample has zero losses |
| `TRADE_COUNT` | COUNT | `summary.trades` | 0 is a valid observation; `EQUAL` allowed |
| `DRAWDOWN_PCT` | PERCENT 0–100 | `−summary.maxDrawdownPct` (≥0 magnitude) | null on multi-currency/empty |
| `AVG_R` | R | `summary.avgR` | null on empty samples |

Conditions: `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`,
`EQUAL` (registry-restricted to TRADE_COUNT). Periods: 9 server-resolved presets (TODAY →
ALL) — `CUSTOM` deliberately excluded (a standing rule on fixed dates silently expires).
Optional `accountId` / `strategyId` (uuid or `"none"` = out-of-playbook) scopes, validated
against the owner's accounts/strategies on every write. `cooldownMinutes` 0–10 080.

### B.2 Evaluation and retrigger semantics (spec §6 — documented policy)

- **Transition-based triggering**: an event fires when the condition transitions
  false→true. A rule whose condition is already true on its first evaluation fires ONCE,
  then stays quiet while it remains true (spec §6's "monthly P&L ≥ $1,000" example: repeated
  refreshes cannot create duplicates — proven by unit + e2e + live probe).
- **Cooldown** (optional, per rule) suppresses retrigger EVENTS within the window (flapping
  control). A suppressed trigger still commits the transition — after the cooldown a
  NEW false→true is required; a still-true condition never re-fires. Unit-tested with an
  injected clock; the policy is documented in the schema and UI copy.
- **Missing data / failed calculations never trigger and never flip the stored transition
  state** (a data gap can neither manufacture nor swallow a transition). Empty goal samples
  (PENDING) are honest `NO_DATA` — no fabricated status (spec §10).
- **Disabled rules are not observed**: their state stays frozen; enabling resumes from the
  last observed condition.
- GOAL rules: `ACHIEVED` = progressPct ≥ 100 (the goal engine's authoritative status folded
  to a boolean); `PROGRESS_BELOW` = progressPct < thresholdPct.

### B.3 Event persistence and deduplication (spec §9)

- Events are rows in the EXISTING inbox (`DisciplineRow kind=ALERT`) with
  `type = METRIC_THRESHOLD` (new `AlertType` value, additive) and severity `NOTIFY`
  (neutral wording — spec §8).
- Each event payload freezes the full trigger context (`metricAlertEventPayloadSchema`):
  ruleId, ruleName, ruleKind, metric/condition/threshold/observedValue/unit/period (THRESHOLD)
  or goalId/goalTitle/goalCondition (GOAL), accountId/strategyId, resolved period window
  (`meta.resolvedFrom/To` from the suite — never re-derived), evaluatedAt, evaluationKey.
  **Rule deletion never breaks history** (violation-style frozen context).
- **Idempotency**: event id = `uuidV5("metric-alert:<ruleId>:t<triggerCount>")` — a replayed
  publish collides on the primary key and is a no-op (`publishAlert` returns whether it
  actually inserted; the evaluate counter reports only real insertions).
- **Concurrency**: every rule-state write is a compare-and-set on the stored `triggerCount`
  (Prisma JSON path filter) — racing evaluations serialize; no event loss, no duplicate, no
  state regression.
- Retention: no cleanup (spec §9 — nothing arbitrarily deletes recent history).

### B.4 Evaluation triggers and honest frequency (spec §7)

- **After closed-trade writes**: subscription to `trade.closed` (all five write paths),
  debounced per user (`METRIC_ALERTS_DEBOUNCE_MS`, default 1000 ms) — a 64-trade CSV import
  coalesces into one evaluation.
- **Manual**: `POST /alert-rules/evaluate` (diagnostics, deterministic tests, UI "Run now").
- **Batching**: THRESHOLD rules are grouped by (period, accountId, strategyId) scope — ONE
  suite call per distinct scope per pass; GOAL rules share one `listGoals` pass (spec §14).
- **NOT real-time**: no scheduler, no queue, no streaming. Latency = up to the debounce
  window after a journal write (or on-demand). Documented honestly here and in the service.
- The engine's ONLY writes are a rule-state JSON document and an inbox alert row — it
  structurally CANNOT trigger any trading action (spec §16 red line).

### B.5 Alert-center UI (spec §8/§13)

- **Alert rules manager** (`components/notifications/alert-rules-manager.tsx`): list with
  kind badges, unit-aware one-line summaries, enable/disable switches, edit form, delete
  confirmation, per-rule recent-events expander (loading/empty states), "Run now"
  evaluation, honest empty state. Opened from the notification center header ("Rules") —
  the topbar is not crowded (no new topbar-level element).
- **Notification center** (extended in place): `METRIC_THRESHOLD` type icon/label, a
  unit-formatted observation line on metric events (`$1,250.50 (threshold $1,000.00)`), a
  per-row **dismiss** action (bell-off icon; dismissed rows show a badge in the archive
  tab — audit history kept), goal deep-links extended to METRIC_THRESHOLD payloads carrying
  a goalId (`Open in Goals` → `/journal?tab=goals&goal=<id>`), keyboard-accessible rows.
- Design system reused: existing Dialog/Select/Switch/Badge/Button primitives, theme
  tokens, severity palette unchanged (`NOTIFY` = neutral accent).
- No sounds, no browser/email/SMS/push notifications (spec §16).

### B.6 Goal & dashboard integration (spec §10/§11)

- GOAL rules consume `GoalService` exclusively — **no second goal calculation engine**.
- Deleted goal → `NO_DATA` (rule stays quiet) — never a fabricated status (e2e-proven).
- Rules persist independently of dashboard layouts/workspaces: a full dashboard-preferences
  GET+PATCH does not disturb rule evaluation (e2e-proven). No layout reference exists in the
  rule schema by design.

---

## C. ARCHITECTURE AND SECURITY

### C.1 Files changed (17 modified, 11 new)

**Shared contracts**
- `packages/shared/src/schemas/metricAlerts.ts` **(new)** — registry, rule/input/response
  schemas, semantic validation, event payload, shared formatters
  (`formatMetricAlertValue`, `METRIC_ALERT_PERIOD_LABELS`).
- `packages/shared/src/enums.ts` — `METRIC_THRESHOLD` added to `alertTypeSchema` (additive).
- `packages/shared/src/index.ts` — export.

**API (NestJS)**
- `apps/api/prisma/schema.prisma` — `MetricAlertRuleRow` model (userId FK cascade, `data`
  Json, `@@index([userId])`) + `User.metricAlertRules` relation.
- `apps/api/prisma/migrations/20261016120000_metric_alert_rules/` **(new)** — migration.
- `apps/api/src/modules/metric-alerts/` **(new module)**:
  - `metric-alerts.logic.ts` — PURE engine (observation extraction, condition comparison,
    transition tick, cooldown, event identity, copy, semantic key) — no Nest, fully
    unit-testable (monitoring.logic house pattern).
  - `metric-alerts.repository.ts` — the ONLY Prisma boundary (insert-with-id, find/list
    for user, updateData, deleteForUser).
  - `metric-alerts.service.ts` — CRUD use cases (ref validation, duplicate 409), the
    evaluation orchestration (scope batching, suite/goal authority, tick → publish → CAS),
    the debounced `trade.closed` subscription.
  - `metric-alerts.controller.ts` — routes below.
  - `metric-alerts.module.ts` — imports AnalyticsModule, ReviewModule, DisciplineModule,
    AccountsModule, PlaybookModule, PrismaModule.
- `apps/api/src/modules/discipline/discipline.service.ts` — `publishAlert` (deterministic-id
  bridge, P2002 → boolean) + `dismissAlert` + Prisma import.
- `apps/api/src/modules/discipline/discipline.repository.ts` — `insertRowWithId`.
- `apps/api/src/modules/discipline/discipline.controller.ts` — `PATCH /alerts/:id/dismiss`.
- `apps/api/src/modules/analytics/analytics.module.ts` — exports `AnalyticsService` (the
  alert engine consumes the suite; computes no financial math).
- `apps/api/src/modules/review/review.module.ts` — exports `GoalService` (the only
  goal-status authority).
- `apps/api/src/app.module.ts` — `MetricAlertsModule` registered.

**API routes (all authenticated, userId from principal, ZodValidationPipe bodies,
uuid-validated params, shared-contract parse on reads)**

| Method + path | Purpose |
|---|---|
| `GET /alert-rules` | list the user's rules |
| `POST /alert-rules` | create (400 invalid / 404 foreign ref / 409 exact duplicate) |
| `PATCH /alert-rules/:ruleId` | rename / retune / enable / disable (kind immutable) |
| `DELETE /alert-rules/:ruleId` | delete; events keep their frozen payload |
| `GET /alert-rules/:ruleId/events` | recent inbox events for one rule (cap 50) |
| `POST /alert-rules/evaluate` | explicit evaluation pass (counters) |
| `PATCH /alerts/:alertId/dismiss` | delivery state; row survives (audit history) |

**Web (Next.js)**
- `apps/web/src/lib/api/endpoints.ts`, `keys.ts` — paths + query keys.
- `apps/web/src/lib/api/queries/metric-alerts.ts` **(new)** — 7 hooks (CRUD, evaluate,
  rule events, dismiss) invalidating the shared `alerts` cache.
- `apps/web/src/lib/notifications/alert-rule-summary.ts` **(new)** — pure summaries
  (shared formatter with the API — zero client drift) + 5-test spec.
- `apps/web/src/components/notifications/alert-rules-manager.tsx` **(new)** — manager +
  form + delete-confirm dialogs (shared-schema client validation, inline errors).
- `apps/web/src/components/layout/notification-center.tsx` — type maps, observation line,
  dismiss action, goal deep-link, Rules entry, keyboard support.
- `apps/web/src/mocks/handlers/metric-alerts.ts` **(new)** + `discipline.ts` (dismiss) +
  `index.ts` + `store.ts` (`dismissAlert`) — MSW mirror validated by the SAME shared schemas.
- `apps/web/vitest.config.ts` — include `src/lib/notifications/__tests__`.

### C.2 Authorization & idempotency mechanisms

- userId ALWAYS from the JWT principal; every query scoped by `userId`; foreign ids → 404
  (IDOR convention) — proven per route in e2e (rules, events, dismiss, evaluate isolation).
- Account/strategy/goal references validated against the authenticated user's own records
  on create AND update (404 otherwise).
- Exact-duplicate guard on a semantic key (kind, metric, condition, threshold, period,
  scopes / goalId, goalCondition, thresholdPct) → 409; near-duplicates (escalation ladders)
  remain allowed — behavior documented in the schema comment.
- No dynamic expression evaluation anywhere: explicit operator + metric registries; the
  payload is data, never executed (spec §12).
- Input validation on the server for every write (shared Zod schemas + semantic registry
  rules: unit bounds, integer counts, condition availability).
- Optimistic concurrency: CAS on `state.triggerCount`; deterministic event ids make replays
  storage-level no-ops.

---

## D. VALIDATION

| Check | Command | Result |
|---|---|---|
| Shared typecheck | `tsc --noEmit` (packages/shared) | **0 errors** |
| API typecheck | `tsc --noEmit -p tsconfig.json` (apps/api) | **0 errors** |
| Web typecheck | `tsc --noEmit` (apps/web) | **0 errors** |
| ESLint (API changed files) | `eslint src/modules/metric-alerts … test/…` | **0 problems** |
| ESLint (web changed files) | `eslint components/notifications … mocks/…` | **0 problems** |
| API unit (Phase 07) | `vitest run test/unit/metric-alerts-logic.spec.ts` | **24/24** |
| API e2e (Phase 07) | `vitest run test/e2e/metric-alerts.e2e.spec.ts` | **18/18** |
| Adjacent regressions | discipline + settings + trade-reviews + analytics + stats + contracts | **80/80** |
| Full API suite | `vitest run` (89 files) | **1286 passed / 7 failed** — all 7 verified PRE-EXISTING at HEAD via `git stash` (5 × accounts bridge HMAC tests failing on setup `POST /trading-accounts/connect` → 422, 2 × scheduler-concurrency guard "expected 409 got 200" incl. the worklog-documented OANDA recovery-sweep flake). Same failures reproduce with Phase 07 stashed. |
| Web unit | `vitest run` (apps/web) | **98/98** (93 prior + 5 new) |
| API build | `tsc -p tsconfig.build.json` | **OK** |
| Web build | `next build` | **OK** (34+ routes) |
| Live API probe | `node scripts/live-metric-alerts-probe.mjs` (real API :4000, seeded demo) | **18/18** |
| UI probe (Playwright) | `node scripts/verify-alert-rules.js` (:3000, MSW mirror) | **12/12** + screenshots `scripts/shots/alert-rules-{manager,form,final}.png` |

Post-fix re-runs: the `publishAlert → boolean` change and the probe's `find() → ?? null` fix
were re-verified (48/48 on the three Phase-07/discipline suites; probes re-run green).

---

## E. LIMITATIONS

1. **Unsupported metrics**: only the 6 registry metrics. R_EARNED (total R) is absent — the
   authoritative summary exposes mean R (`avgR`), and deriving a sum would duplicate math
   outside the authority. Per-period drawdown on multi-currency scopes is honestly NO_DATA
   (suite convention). Custom date-range rules are excluded by design (standing rules need
   rolling windows).
2. **Evaluation frequency**: after closed-trade writes (debounced 1 s default) + manual
   endpoint. NOT real-time; no background scheduler. If the app is idle, rules do not
   re-evaluate until the next trigger — documented in the service header and UI copy.
3. **Pre-existing failures (out of scope, unchanged)**: accounts bridge HMAC e2e setup and
   the scheduler-concurrency guard tests fail identically at HEAD (verified via stash);
   the worklog already tracked the OANDA recovery-sweep flake.
4. **Multi-device**: rules persist server-side (jsonb) — consistent across devices; the
   MSW mirror is session-scoped (mock convention).
5. **No email/SMS/push/browser notifications, no AI/predictive alerting, no broker
   actions** — excluded by spec §16; the engine has no execution path whatsoever.
6. **Goal rules have no suite scope** (account/strategy): the goal engine computes over the
   user's whole journal — mirroring the authoritative `/goals` behavior.

---

## F. PHASE STATUS

**COMPLETE** (within the audited scope).

Evidence: §D's table (typechecks, lint, builds, 24+18+80+98 test assertions, 18/18 live
probe, 12/12 UI probe); §B's implemented functionality each maps to tested behavior
(transitions, dedup, cooldown, NO_DATA, disabled freeze, scopes, goal integration, dismiss,
IDOR isolation, workspace decoupling); §C's authorization battery is e2e-proven per route.
The 7 pre-existing failures are explicitly verified as unrelated to this phase (stash test).

---

## G. PHASE 08 READINESS

**Do not start Phase 08 before these prerequisites are resolved** — readiness is NOT
claimed beyond the evidence below:

1. **Phases 03/05/06 of this series remain unimplemented** — any Phase 08 spec building on
   saved analytical views, insights, or workspaces must first commission those phases
   (they are independent of Phase 07's alert domain).
2. **Pre-existing test debt** should be triaged before the next phase relies on the full
   suite being green: accounts bridge HMAC e2e setup (5 tests) and the two
   scheduler-concurrency guard tests (accounts + OANDA fixture).
3. **Verified reusable from Phase 07**: the alert-rule domain (shared schemas, registry),
   the evaluation engine (pure logic + CAS + deterministic ids), the inbox bridge
   (`publishAlert`/`dismissAlert`), and the debounced `trade.closed` trigger — any future
   channel (digests, rule templates) should extend these, not duplicate them.
4. Phase 07 adds no pending migrations beyond `20261016120000_metric_alert_rules` (applied
   to both dev and test databases; baseline tooling ran).
