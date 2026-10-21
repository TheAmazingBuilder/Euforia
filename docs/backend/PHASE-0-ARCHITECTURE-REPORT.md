# COSMOZ — BACKEND PHASE 0
## Repository Audit, System Discovery & DDD Architecture Preparation

| | |
|---|---|
| **Date** | 2026-10-03 |
| **Repository HEAD audited** | `main` @ `8160111` — "chore(i18n): playbook tab probe + i18n verification screenshots" |
| **Scope** | Audit & architecture blueprint ONLY — no implementation (per Phase 0 mandate) |
| **Evidence sources** | Direct file inspection, 2 deep-audit sub-reports (P0-A frontend inventory, P0-B infra & contracts), static checks (`tsc`, `eslint`), git history |
| **Status** | ✅ COMPLETE — Phase 1 awaits explicit approval (§27 of the mandate) |

---

# A. Executive Summary

Cosmoz today is a **frontend-complete, backend-absent** product with an unusually strong intermediate layer: a **fully typed, 153-endpoint Zod contract** (`@cosmoz/shared`) and a **high-fidelity mock backend** (MSW v2 — 188 route handlers, 7 domain engines, ~21k lines) that already encodes the server-side business invariants (decision-gated P&L reveal, server-computed trading date, server-graded quizzes, append-only security events, rate limiting, MFA lifecycle).

**What exists and is real:**

1. **`apps/web`** — Next.js 16.3.5 / React 19 / TS strict. 16 business modules, 22 pages, 215 component files, ~92,190 lines of `src`. Every module is COMPLETE (no placeholders in use). Data access is 100% centralized in `lib/api/queries/*` (21 files) over one fetch site (`lib/api/client.ts`).
2. **`packages/shared`** (`@cosmoz/shared`) — 28 Zod schema modules + enums + wire primitives (`decimalString`, UTC `isoDateTime`, `dateKey`, uuid) + pure utils (money/risk/dates/rules). Zero React, zero business-rule leakage. **It is the future backend's contract package, ready to be consumed verbatim by NestJS.**
3. **`mini-services/market-service`** — standalone Bun/socket.io service on :3003. Read-only market data (Binance real provider + deterministic simulator), authenticated WS handshake, `user:<id>` rooms for private positions, per-user SIM positions stream. One deliberate sandbox seam: a hardcoded `MOCK_ACCESS_SECRET` awaiting real JWT/JWKS.
4. **`docs/specs/data-model.md`** — a complete, opinionated Prisma design (8 domains, ~30 models, enums, indexes, security invariants, migration order). This is the authoritative persistence blueprint, referenced by the Zod schemas themselves.

**What does not exist (verified, not assumed):**

- **No NestJS backend** (no `apps/api`, no `nest-cli.json` anywhere).
- **No database layer** (no `prisma/`, no pg/sqlite/redis dependency in any package.json; only a stale root `.env` artifact `DATABASE_URL=file:...custom.db` pointing at a non-existent `db/` dir, consumed by nothing).
- **No Python/FastAPI service** (no `.py`, no requirements/pyproject anywhere).
- **No CI/CD, no Docker, no formal test runner** (no `.github/`, no Dockerfile/compose, no vitest/jest config; ~100 ad-hoc Playwright verification scripts live under `scripts/`).
- **No Next.js API routes** (`src/app/api/` absent; a coach route existed historically at `787d51e` and was consciously removed at `2236b6c` — the precedent for a server LLM boundary).

**Current-state health (verified during this audit):** `tsc --noEmit` → **0 errors** on `apps/web` and `packages/shared`. `eslint` → **`src/` fully clean**; 13 errors + 4 warnings confined to ad-hoc `scripts/**` verification files (`require()` imports — not part of the build).

**Conclusion:** the backend phase is a **greenfield NestJS build behind an existing, stable, evidence-encoded contract**. The mock layer is the executable specification; the Zod package is the shared language; `data-model.md` is the schema seed. The single most important architectural decision this audit makes: **NestJS must be built against `@cosmoz/shared` + `lib/api/endpoints.ts` (the contract), never against the MSW internals (the implementation detail)** — with contract tests to guarantee the swap (`NEXT_PUBLIC_API_MOCKED=false`) is a config change, not a refactor.

> Note on repo state: earlier conversation context referenced Tasky/Events module commits (`9c7500e`) that are **not present** in the audited HEAD history. This report documents the repository exactly as it exists at `8160111`.

---

# B. Repository Structure

```text
cosmoz/  (pnpm@12.4.2 workspaces + Turborepo 2.10 — packages: apps/*, packages/*)
├── package.json                 # cosmoz root; scripts: dev/build/lint via turbo
├── pnpm-workspace.yaml          # apps/*, packages/* (+ allowBuilds policy)
├── turbo.json                   # tasks: build (^build), dev (persistent), lint — NO test task
├── pnpm-lock.yaml               # AUTHORITATIVE lockfile (700 packages)
├── bun.lock                     # STALE artifact (turbo devDep only) — hygiene issue, see §R
├── AGENTS.md                    # Project law: frozen stack, golden rules, mock strategy
├── PRODUCT.md                   # Product truth: behavioral trading coach, 1 operator
├── DESIGN.md                    # "Le Registre" design system ledger (3 themes, tokens)
├── .env                         # STALE artifact: DATABASE_URL=file:...db/custom.db (no db/, unused)
├── apps/
│   └── web/                     # Next.js 16.3.5 (App Router), React 19.2.8, TS strict
│       ├── src/app/             # (auth) 5 pages · (app) 16 pages · theme-test · NO api/ routes
│       ├── src/components/      # 215 files: 16 business modules + ui(shadcn) + layout + auth
│       ├── src/lib/
│       │   ├── api/             # client.ts (sole fetch site) · endpoints.ts (153 paths)
│       │   │                    # urls.ts · keys.ts · telemetry.ts · queries/ (21 files)
│       │   ├── auth/            # token-store (memory-only) · refresh (single-flight) · events
│       │   ├── realtime/        # market.ts (socket.io + polling fallback) · market-health
│       │   ├── hooks/ utils/    # media-query, shortcuts · datetime, color, drawings, prefs
│       │   └── navigation.ts    # 14 sidebar items, 4 sections, bottom-nav
│       ├── src/mocks/           # MSW v2: store.ts (5,297 ln) · 7 engines · 22 handler files
│       │                        # (188 handlers) · fixtures/ (seeded generator 1,124 ln)
│       ├── src/i18n/            # en/fr runtime switching, dict.* module pattern (6 modules)
│       ├── public/              # sw.js (composed MSW+offline) · manifest · mockServiceWorker.js
│       ├── next.config.ts       # transpilePackages + 5 rewrites → market-service :3003
│       └── scripts/             # ~30 ad-hoc Playwright verification scripts (+ helpers/login.js)
├── packages/
│   └── shared/                  # @cosmoz/shared — zod ^3.25.76, source-exported, no build step
│       └── src/                 # index · enums (35) · constants · version · schemas/ (28)
│                                # utils/ (money, risk, format, dates, rules, integrations)
├── mini-services/
│   └── market-service/          # Standalone Bun v1.3.14 project (NOT in pnpm workspace)
│       ├── index.ts             # :3003 — REST /prices /candles /health + socket.io stream
│       ├── auth.ts              # czat1.<payload>.<fnv1a> token gate — MOCK_ACCESS_SECRET seam
│       └── providers/           # binance.ts (real) · simulated.ts (labeled "sim") · types.ts
├── docs/
│   ├── specs/                   # data-model.md ★ · trade-entry-ux.md · session-live-rebuild-map.md
│   │                            # design-tokens.md
│   ├── mockups/                 # 12 validated Stitch screens (HTML + PNG)
│   └── backend/                 # ← this report
└── scripts/                     # ~70 ad-hoc verification scripts + shots/ artifacts
```

**Verification targets absent:** no `nest-cli.json`, no `prisma/`, no `docker-compose.*`, no `.github/`, no `Dockerfile`, no `*.py`, no `pyproject.toml`, no vitest/jest config anywhere (globbed repo-wide).

---

# C. Frontend Feature Inventory

## C.1 Routing & shell

- **22 `page.tsx`** across three groups: `(auth)` login/register/forgot-password/reset-password/verify-email; `(app)` 16 routes; standalone `/theme-test` (outside auth gate, for token/palette work).
- **Zero `error.tsx` / `loading.tsx` / `not-found.tsx` / `middleware.ts` / `proxy.ts`** — route protection is a single client-side `AuthGate` at `(app)/layout.tsx` (documented as spec §34 "centralized protected-route mechanism"). Backend implication: real authorization must be server-side (it is designed but unenforced today).
- Root layout provider stack: `ThemeProvider → QueryProvider → MockProvider → I18nProvider → AuthProvider` + Toaster + ServiceWorkerRegister.
- **`/goals` is a redirect** to `/journal?tab=goals` — Goals was fused into Trade Review; the route exists only for stale deep-links.
- `next.config.ts` proxies 5 paths (`/prices`, `/candles`, `/health`, `/socket.io`, `/socket.io/:path*`) to the market service.

## C.2 Navigation (verified from `src/lib/navigation.ts`)

| Section | Items |
|---|---|
| (standalone) | Dashboard `/` |
| **Trading** | Session Live `/session` · Trades `/trades` · Trade Review `/journal` · Playbook `/playbook` |
| **Insights** | Analytics `/analytics` · Calendar `/calendar` · Discipline `/discipline` |
| **Academy** | Academy `/academy` · Nofy `/nofy` |
| **System** | Monitoring `/monitoring` · Settings `/settings` · Integrations `/integrations` · Security `/security` |

Plus: Profile `/profile` (topbar), mobile bottom-nav (Home/Trades/Playbook/Stats + FAB), ⌘K command palette, notification center. **Deviations from the Phase-0 prompt's conceptual nav:** no Calculators section (position sizing lives inside the trade form), no Trade Planner / Backtesting items (What-If simulator + setups fill that role), no standalone Goals (fused into review).

## C.3 Module inventory

Legend: **Query deps** = files under `lib/api/queries/`; verdict COMPLETE = full interactive feature set, no placeholder content. All modules are mock-backed; components never `fetch` directly (enforced pattern).

| Module | Components | Purpose | Query deps | Notable state | Verdict |
|---|---|---|---|---|---|
| **dashboard** | 15 | KPIs, equity constellation, heatmap, P&L, alerts feed, coach insights, open positions, goals pace | stats, discipline, tradeReview, trades, catalogs, preferences, realtime | react-query only | COMPLETE |
| **session** (Session Live) | 24 | Chart grid w/ drawings+indicators, timeline, logbook, mood strip, ghost settlements, broker panel, private WS positions | sessionLive, session, trades, catalogs, discipline, stats, skippedTrades, broker, realtime | localStorage: chart state, drawings, watchlist, layout, timer | COMPLETE |
| **trades** | 24 | Trade log, entry modal (judgment gate → reveal), position sizer, screenshots, CSV import, trade views, bulk ops, to-grade queue, ghost modal | trades (22 endpoint families), catalogs, discipline | draft autosave (localStorage) | COMPLETE |
| **trade-review** (`/journal`) | 9 | Reviews, Lessons, Goals tabs; monthly report; "save lesson as Nofy note" | tradeReview, nofy, trades | react-query | COMPLETE |
| **playbook** | 19 | Strategies (+versions, duplicate), setups, rules, checklists, templates, performance via analytics suite | playbook, catalogs, stats, trades | react-query | COMPLETE |
| **analytics** | 13 | Analytics suite: A/B comparator, R-heatmap, buckets, dimensions, quarterly report | stats (analytics-suite), catalogs, trades | URL-param filters | COMPLETE |
| **discipline** | 9 | Rules CRUD, violations+ack, score gauge, emotion matrix, mistake ledger, pareto | discipline | react-query | COMPLETE |
| **calendar** | 3 | Trading month calendar + eco calendar + blockers | calendar, tradeReview (goals), discipline (eco), catalogs (balance) | react-query | COMPLETE |
| **nofy** | 9 | Block-based knowledge editor (14 block types), folders, tags, templates, versions, search, linked notes, print/PDF | nofy (15 families) | react-query | COMPLETE |
| **academy** | 15 | Catalog, courses, lessons (checkpoints/quizzes), glossary, flashcards SRS, 4 practice drills, exams, certifications, progress | academy (27 families) | practice state partially localStorage | COMPLETE |
| **monitoring** | 5 | API telemetry rings (real client observation), market feed, integrations, jobs, incidents, public status | monitoring, realtime, market-health | in-memory telemetry rings | COMPLETE |
| **security** | 3 | 2FA enable/confirm/disable + recovery codes, password change, API keys, sessions revoke, re-auth gate, event log | security | react-query | COMPLETE |
| **integrations** | 2 | Provider hub: connect/disconnect/test/sync, webhooks simulate | integrations | react-query | COMPLETE |
| **settings** | 6+10 cards | Preference doc by domain, backup import/export, account deactivate/delete | preferences, backup | server prefs + local mirrors | COMPLETE |
| **profile** | 1 | Identity + account switcher data | profile | react-query | COMPLETE |
| **auth** | 10 | Login (+MFA branch), register, forgot/reset, verify-email, gate, provider | auth | token memory-only | COMPLETE |
| **layout** | 14 | AppShell, sidebar, topbar, bottom-nav, ⌘K palette, notification center, account switcher, language selector, theme system | preferences, alerts, auth | sidebar collapse (localStorage) | COMPLETE |

**Dead code (zero importers, verified):** `components/system/integrations-view.tsx`, `components/shared/page-placeholder.tsx`.

## C.4 Data layer shape (frontend)

- **One fetch site**: `lib/api/client.ts` — `ApiError{status,body}`, error copy from `{error, code?}` envelope, `Authorization: Bearer <accessToken>` injection, **401 lifecycle = single-flight refresh → retry once → stop** (10 auth endpoints exempt).
- **`endpoints.ts` registry**: 153 entries (97 static + 56 parametric builders) — imported by hooks **and** MSW handlers so URL drift is structurally impossible.
- **`keys.ts`**: hierarchical TanStack keys; `tradeMutationInvalidations = [trades, rules-status, alerts, stats-overview, session-timeline]` — cross-module cache coupling made explicit (a mirror of future domain events).
- **No pagination convention**: list endpoints return full arrays (`{trades, total}`); filtering/paging client-side. Documented tolerance: <10k trades/user in V1.
- **Cross-module reads** (frontend-observed): calendar ← goals + eco + accounts; dashboard ← 6 query domains + realtime; playbook performance ← analytics suite; review/nofy ↔ linked notes; session ← trades + ghosts + alerts + broker.

## C.5 Mock backend (the de-facto backend)

- **`store.ts` (5,297 lines)** — typed in-memory domain store built off `@cosmoz/shared` schemas. Volatile (resets per load) except two localStorage jars standing in for the HttpOnly refresh cookie and language pref.
- **`fixtures/generate.ts` (1,124 lines)** — seeded deterministic generator ("same seed → identical data per UTC day") with engineered behavioral patterns: ~15% out-of-playbook, ~20% ungraded, moved stops, oversized positions, revenge pattern, week-6 drawdown episode.
- **7 engines** — auth (1,093 ln: tokens, rotation, rate limits per vector incl. `mfa 5/15min`, MFA + recovery codes, PENDING_VERIFICATION lifecycle), academy (1,359: server-graded quizzes/drills), nofy (1,142: relational refs re-resolved on read), integrations (1,278: providers, backoff, idempotency helpers), security (836: append-only events, single-use re-auth, lockout), monitoring (1,030: aggregates REAL telemetry, "nothing hardcoded"), + store-level engines.
- **22 handler files, 188 handlers** — every handler: `await latency()` (120ms), `parseBody(zod)` → 400 `{error:"ValidationError", issues}`, `requireAuth` → 401 on private routes, consistent error envelope.
- **Browser-only MSW** (`setupWorker`); booted only when `NEXT_PUBLIC_API_MOCKED=true`; composed into `public/sw.js`.

## C.6 i18n, PWA, realtime (frontend)

- **i18n**: runtime EN/FR (no locale routes, no middleware), `useSyncExternalStore` dictionary, FR typed as `typeof en`; 6 business modules migrated to `dict.*` namespaced files; server truth = `PATCH /me/preferences/localization` with `LocaleServerSync` boot reconciliation.
- **PWA**: composed SW (MSW + offline shell, network-first navigations → `offline.html`); **no offline data sync** (aspirational only). Real data egress = JSON backup (`GET /export/backup` → client-validated via `backupPayloadSchema` → file; `POST /import/backup`).
- **Realtime**: single socket.io client (`lib/realtime/market.ts`, 547 ln) — auth handshake with access token, lifecycle driven by auth events (re-handshake on `TOKEN_REFRESHED`, teardown on `SESSION_EXPIRED`/`LOGGED_OUT`), bounded re-auth (3/30s), feed state machine `connecting|live|reconnecting|offline × socket|polling|none`, 3.5s grace → 2s HTTP polling, staleness 8s; events `prices` (global) + `positions` (snapshot into `user:<id>` room, strictly read-only, labeled SIM).

---

# D. Backend Audit

**Verdict: there is no backend.** No NestJS application, no server runtime other than Next.js's own (which exposes zero API routes) and the market service. Consequently there are no controllers, guards, DTOs, repositories, or domain logic to evaluate in Nest terms.

What this audit evaluates instead is **the backend that already exists in embryo** — and its quality is unusually high:

| Dimension | Evidence | Assessment |
|---|---|---|
| API surface | `endpoints.ts` 153 paths + `api.ts` 1,673 ln of request/response schemas | Complete, stable, typed |
| Business invariants | Decision-gated P&L (`awaitingDecisionResponse`), server-computed `tradingDate`/goal progress, server-graded quizzes, reveal-only coaching keys | Explicitly encoded in contract + mocks |
| Auth protocol | Access token memory-only + rotating HttpOnly refresh cookie, single-flight, rate limits, MFA, lockout, account-status lifecycle | Fully specified & mock-executed; cookie semantics untestable in MSW (documented gap) |
| Error model | `{error, code?}` + 15 canonical auth error codes + Zod `ValidationError{issues}` | Consistent |
| Realtime protocol | socket.io handshake auth, `prices`/`positions`/`auth-error`, `user:<id>` rooms, snapshot semantics | Specified in `broker.ts`/`market.ts` schemas, implemented by market-service |
| Multi-user readiness | Mock engines scoped behind `userKey`; every private endpoint per-user by design | Structural, but never exercised by a real DB |

The MSW layer must be treated as a **specification asset to port, not code to ship**: its engines encode the exact behaviors (rotation chains, violation context freezing, anti-enumeration responses, idempotency helpers) that Phase 2+ must reproduce in NestJS — ideally with the same test vectors.

---

# E. FastAPI Audit

**No Python service exists** (no `.py` files, no requirements/pyproject, no venvs, repo-wide). Nothing to audit; the FastAPI boundary in §M is therefore a greenfield design constrained by the mandate's rules (specialized computation only, no second general backend, no direct core-domain mutation).

The nearest existing analog is the **Bun market-service** — it already demonstrates the correct pattern for a specialized sidecar: single responsibility (read-only market data), its own runtime/lockfile, token-gated, no business data, no persistence, honest degradation. FastAPI should copy this *shape*, not its stack.

---

# F. Database Audit

**No database exists** — no Prisma, no ORM, no driver, no migrations, no `db/` directory. The only DB trace is the stale root `.env` artifact (see §R-9).

The database exists as **design**: `docs/specs/data-model.md` is a complete, implementation-ready Prisma design. Key decisions already made (evidence-quoted):

1. **Decimal everywhere, never float** — money/prices = `numeric(18,8)`; matches the wire contract `decimalStringSchema` (strings only).
2. **All timestamps UTC**; user timezone on `User`; **computed `tradingDate` stored per trade** (the user's local trading day — without it, per-day stats break across midnight).
3. **Snapshot live references** — checklist answers frozen as JSONB on the trade (`checklistSnap`); playbook/template changes never rewrite history.
4. **Lightweight event sourcing on trades** — `TradeEvent` (SL/TP/size modified, reopened, note) is *the only way* to detect "stop widened"; final state doesn't tell the story.
5. **Seeded catalogs vs free data** — mistakes/emotions = system catalogs (extensible by user); tags = free, hierarchical, user-owned.
6. **Import idempotence day 1** — unique `externalRef` per account; re-importing a CSV adds zero duplicates.
7. **`DailyStat` is a computed table** (nightly job) — documented exception to "never store computed", fueling heatmaps/pre-mortems/goals; discipline score denormalized; ghost-trade aggregates (`savedR`, `hesitatedR`).
8. **Migration order already drafted** (§14 of the spec): Users/Sessions/AuditLogs → Accounts/Instruments/Trades(+Exits/Events/Screenshots) → Strategies/Tags/Mistakes → Journals/Checklists → Rules/Violations/Alerts → SkippedTrades/Goals/DailyStats → BrokerConnections/ImportBatches → AiInsights.
9. **Security invariants drafted** (§15): never trust client P&L/R/MFE; never trust client userId; every query scoped by session user; IDOR test = 403 on cross-user trade access; catalog seeding via migration tooling only.

Model inventory (~30): User, Session, AuditLog · Account, Instrument, BrokerConnection, ImportBatch · Trade, TradeExit, TradeEvent, TradeScreenshot · Strategy, Tag, TradeTag, Mistake, TradeMistake · SkippedTrade · DailyJournal, ChecklistTemplate · Rule, RuleViolation, Alert · Goal, DailyStat, AiInsight.

---

# G. Shared Contracts Audit (`@cosmoz/shared`)

**Structure**: source-exported package (`main: ./src/index.ts`, `build: tsc --noEmit`), zod ^3.25.76, **zero React imports, zero I/O** — verified. Barrel exports version + constants + 35 enums + 28 schema modules + 6 util modules.

**Wire primitives** (`schemas/primitives.ts`) — the foundation every other schema builds on:
- `decimalStringSchema` — "the ONLY allowed wire format for money, prices, quantities and R-multiples (never `number`)".
- `isoDateTimeSchema` — UTC ISO-8601, Z suffix required.
- `dateKeySchema` — calendar-validated `YYYY-MM-DD`; `uuidSchema`; `jsonValueSchema` (typed Prisma-Json mirror).

**Contract highlights per domain** (28 files): trade (plan/reality/results sections, discriminated create inputs, close single/partial, decision→reveal), account (+propFirmConfig), instrument ("NO per-asset-class constants in code"), strategy + playbook-blocks + playbook (version snapshots frozen, setups, checklists, insights), rule (per-type JSON params), alert, skippedTrade (ghost trades), dailyJournal, dailyStat ("CALCULATED by a nightly job, never user-entered"), mistake (+tradeMistake AUTO/manual), tag, eco-event, backup (schemaVersion'd payload), market (candles are `number` deliberately — chart data, not money), broker ("READ-ONLY — intentionally NO schema for order submission"), sessionLive (documents, never executes), settings (8 preference domains, one doc per user, patched one domain at a time), integration ("Secrets NEVER travel to the frontend"), security (append-only events), auth ("CANONICAL auth contract shared between the Next.js frontend and the future NestJS backend", 15 error codes, refresh token never in body), monitoring (evidence-mandated component status), tradeReview (server-computed goal progress), academy (server-graded, answers stripped publicly), nofy (14 block types, refs = "real relational pointers resolved server-side at read time").

**Utils**: money (`parseDecimal` strict, `toDecimalString` canonical 8-decimals), risk (`computeRR`, `suggestPositionSize` — "LIVE-ESTIMATE helpers: the server recomputes authoritative values at write time"), dates (`toTradingDateKey` — "for parity, NOT to replace the server"), rules (param metadata "so client and mock can never drift"), integrations (backoff, idempotency key, secret sanitization).

**Verdict**: ✅ **Truly domain-independent; liftable into the backend verbatim.** Every "business-ish" helper is explicitly labeled estimate/parity-only, with the authoritative computation documented as server-owned. The package already answers the mandate's rule "*Prisma models must never become frontend contracts*" — the frontend has never seen a DB shape, only these schemas.

**Shared vs backend-only split (existing, to preserve):**
- Remains shared: Zod schemas, enums, constants, pure utils, WS event payload types, error codes.
- Backend-only (to be created in Nest): Prisma schema/mappings, password hashing, token signing/secrets, email delivery, rule-evaluation engine internals, nightly job implementations, catalog seeds.

---

# H. Domain Map

Candidate domains were derived from the codebase (not from the sidebar): each domain below cites its owning contract files, mock engines, and endpoints.

| # | Domain | Classification | Evidence |
|---|---|---|---|
| 1 | **Identity & Security** (auth, sessions, MFA, API keys, security events, account lifecycle) | Generic subdomain | `schemas/auth.ts`, `schemas/security.ts`, auth-engine (1,093 ln), security-engine (836 ln), 21 endpoints |
| 2 | **Profile & Preferences** (`/me`, preference doc, localization) | Generic subdomain | `schemas/settings.ts` (647 ln), preferences handlers, i18n sync |
| 3 | **Accounts & Connectivity** (trading accounts, prop-firm config, broker session read-only, integration providers, webhooks, import batches) | Supporting | `account.ts`, `broker.ts`, `integration.ts` (389 ln), integration-engine (1,278 ln), `data-model.md` Domaine 2 |
| 4 | **Market & Reference Data** (instruments, eco-events, live quotes/candles via sidecar) | Supporting | `instrument.ts`, `eco-event.ts`, `market.ts`, market-service, catalogs handlers |
| 5 | **Trading Journal** (trades, exits, trade events, screenshots, decision gate, trade views, CSV import, ghost/skipped trades) | **CORE** | `trade.ts`, `skippedTrade.ts`, `trade-entry-ux.md`, 21 trades handlers, fixtures generator |
| 6 | **Planning & Playbook** (strategies + versions, setups, checklists, playbook rules, templates) | **CORE** | `strategy.ts`, `playbook.ts`, `playbook-blocks.ts`, 22 handlers, `strategy-picker` coupling |
| 7 | **Discipline & Risk Engine** (rules, violations, alerts, mistakes taxonomy, emotion matrix, discipline score) | **CORE** | `rule.ts`, `alert.ts`, `mistake.ts`, discipline handlers, `data-model.md` Domaine 7 |
| 8 | **Analytics & Reporting** (stats overview, analytics suite, daily stats, reports, what-if) | **CORE** | `schemas/api.ts` analytics-suite (~25 blocks incl. monteCarlo), `dailyStat.ts`, stats handlers |
| 9 | **Review & Goals** (post-trade reviews, lessons, goals) | **CORE** | `tradeReview.ts` (327 ln), review handlers, `/journal` module |
| 10 | **Session Live** (trading sessions, timeline, notes, saved analyses, key levels) | Supporting (operational) | `sessionLive.ts`, `session.ts`, 16 handlers |
| 11 | **Calendar** (calendar blocks, calendar view read-model, eco import) | Supporting | `calendar.ts` handlers, `calendar-module-view` composition |
| 12 | **Knowledge — Nofy** (notes, folders, tags, templates, versions, relational refs) | Supporting | `nofy.ts` (321 ln), nofy-engine (1,142 ln), 23 handlers |
| 13 | **Academy** (catalog, courses, lessons, quizzes, practice, exams, certifications) | Supporting (content platform) | `academy.ts` (594 ln), academy-engine (1,359 ln), 28 handlers |
| 14 | **System Observability** (monitoring overview, thresholds, jobs, incidents, telemetry ingestion) | Generic | `monitoring.ts` (458 ln), monitoring-engine (1,030 ln) |
| 15 | **Backup & Portability** (export/import whole-account JSON) | Shared capability | `backup.ts`, backup handlers, settings cards |

**Not promoted to bounded contexts** (deliberately): Calculators (client-side estimates over instrument specs — no server module needed; the Phase-0 prompt's "Lot Size / Compounding" nav section does not exist in the repo), Notifications center (a surface over `alerts`, owned by Discipline), What-If/Backtesting (query re-aggregation over trades, owned by Analytics — `data-model.md`: "this replaces backtesting"), AI Coach (no live LLM feature; precedent route removed — see §M).

# I. Bounded Context Map

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             COSMOZ MODULAR MONOLITH                         │
│                                                                             │
│  ┌──────────────────┐      ┌──────────────────┐   ┌──────────────────────┐  │
│  │ IDENTITY &       │──────▶ PROFILE &       │   │ SYSTEM               │  │
│  │ SECURITY  (G)    │      │ PREFERENCES (G)  │   │ OBSERVABILITY (G)    │  │
│  │ auth·MFA·sessions│      │ /me·prefs·locale │   │ monitoring·telemetry │  │
│  └───────┬──────────┘      └──────────────────┘   └──────────▲───────────┘  │
│          │ userId scoping (ACL for every context)            │              │
│          ▼                                                   │              │
│  ┌───────────────────────────┐    ┌──────────────────────────┴───────────┐  │
│  │ ACCOUNTS & CONNECTIVITY(C)│    │ MARKET & REFERENCE DATA (S)          │  │
│  │ accounts·prop·broker RO   │    │ instruments·eco-events·live feed     │  │
│  │ integrations·imports      │    │ (delegates feed to market-service)   │  │
│  └──────────┬────────────────┘    └──────────▲───────────────────────────┘  │
│             │ accountId · provider reads    │ quotes/candles (estimates)   │
│             ▼                               │                              │
│  ┌──────────────────────────────────────────┴───────────────────────────┐  │
│  │                    TRADING JOURNAL  (CORE)                           │  │
│  │  trades·exits·trade events·screenshots·decision gate·trade views     │  │
│  │  CSV import·ghost/skipped trades                                     │  │
│  └───┬───────────────┬────────────────┬──────────────────┬─────────────┘  │
│      │ strategyId    │ trade mutations│ closed trades    │ reviews        │
│      ▼               ▼                ▼                  ▼                │
│  ┌─────────────┐ ┌───────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │ PLANNING &  │ │ DISCIPLINE &  │ │ ANALYTICS &  │ │ REVIEW & GOALS   │  │
│  │ PLAYBOOK    │ │ RISK ENGINE   │ │ REPORTING    │ │ (CORE)           │  │
│  │ (CORE)      │ │ (CORE)        │ │ (CORE)       │ │ reviews·lessons  │  │
│  │ strategies· │ │ rules·        │ │ suite·daily  │ │ goals·reports    │  │
│  │ setups·     │ │ violations·   │ │ stats·what-if│ └────────┬─────────┘  │
│  │ checklists  │ │ alerts·       │ └──────────────┘          │            │
│  └──────┬──────┘ │ mistakes      │ ┌──────────────┐          │            │
│         │        └───────┬───────┘ │ SESSION LIVE │          │            │
│         │                ▼         │ (S) sessions │ ┌────────▼─────────┐  │
│         │             ┌─────────┐  │ timeline·    │ │ KNOWLEDGE — NOFY │  │
│         │             │ ALERTS →│  │ analyses·    │ │ (S) notes·refs   │  │
│         │             │ notif & │  │ levels       │ │ folders·versions │  │
│         │             │ dashboard│ └──────────────┘ └──────────────────┘  │
│         │             └─────────┘                                        │
│  ┌──────────────┐  ┌────────────┐  ┌───────────────────────────────────┐  │
│  │ CALENDAR (S) │  │ ACADEMY (S)│  │ BACKUP & PORTABILITY (capability) │  │
│  │ blocks·view  │  │ content·   │  │ export/import whole account       │  │
│  └──────────────┘  │ quizzes    │  └───────────────────────────────────┘  │
│                    └────────────┘                                         │
└─────────────────────────────────────────────────────────────────────────────┘
(G) = generic subdomain   (S) = supporting subdomain   (CORE) = core domain

Specialized sidecar (outside the monolith, existing): market-service (Bun/socket.io :3003)
Future specialized sidecar (§M): FastAPI — OCR · vision · quant · AI
```

**Classification rationale (pragmatic DDD — no ceremonial abstractions):**
- **Core** = the behavioral-coach differentiator (Journal → Discipline → Analytics → Review loop) + Playbook. These carry the product's invariants (decision-gating, event sourcing, violation freezing, discipline index) and deserve rich domain layers.
- **Supporting** = real domain models but without differentiating invariants (Accounts, Market data, Session Live, Calendar, Nofy, Academy) — simpler service+repository style is appropriate.
- **Generic** = solved problems (Identity/Security, Preferences, Observability) — buy/borrow patterns, keep adapters thin.
- **Capability** = Backup is cross-cutting (reads trades+strategies+tags); implement as an application service reaching across repositories inside one transaction, not as an owning context.

---

# J. Context Relationships

| Upstream → Downstream | Relationship | Contract / mechanism |
|---|---|---|
| Identity → *all* | Customer–Supplier (conformist) | `userId` from token; ACL at guard level; every repository query scoped — IDOR invariant (`data-model.md` §15) |
| Profile → Identity | Customer–Supplier | Same aggregate root `User`; preferences doc patched one domain at a time |
| Accounts → Journal | Customer–Supplier | `accountId` FK; account currency for normalization; deleting/deactivating an account must not orphan trades (soft-delete policy — open question §S) |
| Connectivity → Journal | Customer–Supplier (async) | `ImportBatch` → trades with `externalRef` idempotency; broker read models only (`broker.ts`: "intentionally NO schema for order submission") |
| Market → Session Live / Journal | Customer–Supplier (read-only) | candles/quotes for display & *client-side estimates only*; never authoritative P&L |
| Journal → Discipline | **Domain events (the pivotal relationship)** | `TradeCreated/TradeClosed/TradeModified` → synchronous rule evaluation → `RuleViolation` (context JSONB frozen) → `Alert`; cron for time-based rules (risk budget, tilt, cooldowns) — `data-model.md` §"Discipline Engine" |
| Journal → Analytics | Upstream read model | Analytics reads closed trades + skipped trades; `DailyStat` materialized nightly (BullMQ later, plain cron first) |
| Playbook → Journal | Customer–Supplier | `strategyId` nullable FK (null = out-of-playbook, tracked as valuable signal); checklist templates snapshotted into trades |
| Playbook → Analytics | Customer–Supplier | strategy performance views (`/strategies/stats`, underperforming banner) |
| Review → Nofy | Partnership (UI-mediated today) | "save lesson as note" → nofy note; refs are relational pointers resolved server-side (`nofy.ts`) |
| Playbook → Nofy | Partnership | linked notes on setups/rules/strategy detail (`NofyLinkedNotes`) |
| Analytics/Review/Discipline → Calendar | Read-model composition | `/calendar-view` server-computed day rows + range summary + dailyLossLimitPct |
| * → Observability | Published events | client telemetry rings, integration state, job ledger — monitoring aggregates REAL observations ("nothing hardcoded" per engine header) |
| * → Backup | Capability | `export/import/backup` = transactional cross-repository snapshot (`schemaVersion` envelope) |

**Anti-corruption note:** broker/provider payloads must cross into the Trading domain only through adapters that normalize into shared schemas — provider-specific shapes must never leak into core (`data-model.md` Domaine 2 + §17 of mandate). Same for the market-service: its `LiveQuote`/candle contracts are already normalized in `@cosmoz/shared/market`.

---

# K. Dependency Graph (implementation order)

```text
                    ┌────────────────────────────┐
                    │ 0. FOUNDATION               │  NestJS scaffold · Prisma/Postgres ·
                    │    (no business value yet)  │  ZodValidationPipe over @cosmoz/shared ·
                    └────────────┬────────────────┘  {error,code} filter · health · CI · docker-compose
                                 ▼
                    ┌────────────────────────────┐
                    │ 1. IDENTITY & SECURITY      │  register/login/refresh(rotation)/MFA/
                    │    (+ PROFILE & PREFS)      │  verify-email · security events · /me · prefs
                    └────────────┬────────────────┘
                                 ▼
                    ┌────────────────────────────┐
                    │ 2. REFERENCE CATALOGS       │  instruments (+synthetic specs) · accounts ·
                    │    & ACCOUNTS               │  strategies/tags as catalogs · instruments
                    └────────────┬────────────────┘  feed calculators too (client-side)
                                 ▼
                    ┌────────────────────────────┐
                    │ 3. TRADING JOURNAL (CORE)   │  trades CRUD · close → awaitingDecision ·
                    │                             │  /decision reveal · TradeEvent sourcing ·
                    │                             │  exits · screenshots · trade views · bulk ·
                    │                             │  CSV import (idempotent) · skipped/ghost trades
                    └────────────┬────────────────┘
              ┌──────────────────┼───────────────────────┐
              ▼                  ▼                       ▼
 ┌──────────────────┐ ┌──────────────────┐ ┌───────────────────────────┐
 │ 4. DISCIPLINE    │ │ 5. SESSION LIVE  │ │ 6. PLAYBOOK (CORE)        │
 │  rules·violations│ │  sessions·timeline│ │ strategies+versions·setups│
 │  ·alerts·mistakes│ │  ·notes·analyses· │ │ ·checklists·rules·templates│
 │  ·score (events  │ │  key levels       │ │ (needs strategies from 2) │
 │  from Journal)   │ └──────────────────┘ └─────────────┬─────────────┘
 └────────┬─────────┘                                    │
          ▼                                              ▼
 ┌──────────────────────────┐              ┌───────────────────────────┐
 │ 7. REVIEWS & GOALS       │              │ 8. ANALYTICS & STATS      │
 │  reviews·lessons·goals   │◀─────────────│  overview·suite·DailyStat │
 │  (server-computed prog.) │  reads       │  nightly job·what-if      │
 └────────────┬─────────────┘              └───────────────────────────┘
              ▼
 ┌──────────────────────────┐   ┌───────────────────┐   ┌───────────────────┐
 │ 9. CALENDAR & ECO        │   │ 10. NOFY          │   │ 11. ACADEMY       │
 │  blocks·view·eco import  │   │  notes·refs·      │   │  catalog·grading· │
 └──────────────────────────┘   │  versions·search  │   │  practice·exams   │
                                └───────────────────┘   └───────────────────┘
                                 ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ 12. CONNECTIVITY & INTEGRATIONS   providers·webhooks·BrokerConnection  │
 │     (V1 READ-ONLY — zero execution capability) · real ImportBatches    │
 └────────────────────────────────────────────────────────────────────────┘
                                 ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ 13. SYSTEM & BACKUP   monitoring real probes·jobs·incidents · backup   │
 └────────────────────────────────────────────────────────────────────────┘
                                 ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ 14. FASTAPI SPECIALIZED SERVICES  OCR·screenshot recognition·quant·AI  │
 └────────────────────────────────────────────────────────────────────────┘
```

**Evidence-based deviations from the provisional Phase-0 order:**
- **Discipline immediately after Journal** (prompt had it at Phase 5–8 territory): violations are *triggered by trade mutations* (`data-model.md` §"Discipline Engine" — "Evaluated on every trade mutation") — the engine without the events is untestable, and vice-versa.
- **Playbook after Session Live** is interchangeable; both depend only on catalogs. Playbook kept after Session Live because strategies-as-catalogs already arrive in Phase 2 (trades need `strategyId` from day one).
- **Analytics after Reviews**: goal progress (`goalProgressSchema`) is server-computed from analytics metrics; the analytics suite is also consumed by Playbook/Calendar — building it before Reviews minimizes rework.
- **Backtesting is absent by design** — What-If (Phase 8) replaces it per `data-model.md` §"What-If Simulator".
- **Calculators have no backend phase** — they are client-side estimates over `Instrument` specs (Phase 2 delivers the data; shared `risk.ts` already ships the estimate helpers).
- **Academy/Nofy late** despite large mock surface: zero coupling to core domains (only inbound UI refs), low architectural risk, high endpoint count — ideal to schedule when the team needs throughput.
- **Connectivity late (12)**: real broker/import work is gated by external credentials/providers (§S) and must never block the core loop; the mock engines already define its contract.

---

# L. Backend Architecture Blueprint (NestJS modular monolith)

```text
apps/api/                                # NestJS (pnpm workspace member, TS strict)
├── prisma/                              # schema + migrations seeded from docs/specs/data-model.md
│   └── seed/                            # catalog seeds: instruments (forex/crypto/synthetic),
│                                        # system mistakes — migration tooling, never hand-inserted
├── src/
│   ├── main.ts                          # bootstrap, versioning prefix, helmet/cors, graceful shutdown
│   ├── app.module.ts                    # composition root
│   ├── shared/                          # cross-context kernel (no business logic)
│   │   ├── contracts/                   # re-exports @cosmoz/shared (single source of truth)
│   │   ├── http/                        # ZodValidationPipe · ZodSerializerInterceptor ·
│   │   │                                # AllExceptionsFilter → { error, code } · request-id
│   │   ├── auth/                        # JwtStrategy · RolesGuard · CurrentUser decorator
│   │   ├── prisma/                      # PrismaService (infrastructure only, never exported as model)
│   │   └── events/                      # typed in-process event bus (domain events, Phase 3+)
│   └── contexts/
│       ├── identity/                    # ① auth · sessions · mfa · security-events · api-keys
│       ├── profile/                     # ② /me · preferences doc (domain-patched)
│       ├── reference/                   # ③ instruments · tags · system mistakes (catalogs)
│       ├── accounts/                    # ③ accounts · prop-config
│       ├── journal/                     # ④ CORE — trades · decision gate · events · exits ·
│       │   ├── domain/                  #    screenshots · trade-views · import · ghosts
│       │   ├── application/             #    (the richest domain layer: P&L/R/MFE recompute,
│       │   ├── infrastructure/          #     tradingDate, externalRef idempotency, reveal gating)
│       │   └── presentation/
│       ├── discipline/                  # ⑤ CORE — rules · evaluation (event-driven) · violations
│       ├── session-live/                # ⑥ sessions · timeline · notes · analyses · levels
│       ├── playbook/                    # ⑦ CORE — strategies/versions · setups · checklists
│       ├── review/                      # ⑧ CORE — reviews · lessons · goals (progress computed)
│       ├── analytics/                   # ⑨ CORE — overview · suite · daily-stats job · what-if
│       ├── calendar/                    # ⑩ blocks · view read-model · eco import
│       ├── knowledge/                   # ⑪ nofy — notes/folders/tags/templates/versions/refs
│       ├── academy/                     # ⑫ catalog · grading · practice · exams · progress
│       ├── connectivity/                # ⑬ integrations · broker adapters (READ-ONLY) · imports
│       └── system/                      # ⑭ monitoring · jobs · incidents · backup capability
├── realtime/
│   └── gateway/                         # socket.io: relays/extends market-service contract;
│                                        # `user:<id>` rooms · handshake JWT auth ·
│                                        # auth-error codes identical to today's client expectations
└── test/                                # vitest · contract tests (schemas) · e2e (supertest)
```

**Layering rules (pragmatic, per mandate §13):**
- Rich `domain/` layers **only where invariants live**: `journal` (P&L recompute, event sourcing, decision gate), `discipline` (rule evaluation, context freezing), `playbook` (version snapshots), `review` (goal progress), `analytics` (aggregation invariants). Supporting contexts (calendar, knowledge, academy, reference) use a flat `application+infrastructure` service style — architecture for architecture's sake is forbidden.
- **Prisma is infrastructure**: models stay inside `infrastructure/`; mappers translate to `@cosmoz/shared` schemas at the boundary; no Prisma type crosses a context interface.
- **Contracts before controllers**: request/response validation and serialization bind directly to the existing Zod schemas — the API cannot drift from the frontend contract because both import the same files.
- **Money discipline**: `Decimal(18,8)` columns + string wire format; all P&L/R/MFE computed at write time in the domain layer, never trusted from client, never SQL triggers.
- **Auth boundary**: backend authorization is authoritative — `AuthGate` on the web remains UX only (the codebase itself states this).
- **Trading connectivity**: provider logic behind adapters (`connectivity/adapters/{mt5,deriv,binance,...}`); V1 read-only; **no order-execution capability may exist in code, schemas, or adapters** — the shared contract deliberately defines none.
- **Realtime**: keep market-service as the feed sidecar; the Nest gateway owns *private* streams (`positions` into `user:<id>`) or relays them — decision point in §S.
- **Jobs**: nightly `DailyStat` computation (plain cron first, BullMQ when queue semantics arrive), rule-cron for time-based rules (risk budget, tilt, cooldown windows).

---

# M. FastAPI Boundary (future, Phase 15+)

**Principle (from the mandate, confirmed by this audit):** FastAPI is a specialized computation sidecar, never a second general backend, never a direct DB owner.

| Candidate capability | Input | Output | Why Python | Interaction with NestJS | Persistence owner |
|---|---|---|---|---|---|
| **Trade screenshot OCR & recognition** | chart image (TradeScreenshot `storageKey`) | extracted instrument/entry/SL/TP/timestamps, normalized into draft-trade payload | OCR/CV ecosystem (OpenCV, PaddleOCR, vision LLMs) | Nest → FastAPI POST (service token) → async result webhook/job; Nest validates + persists | **NestJS** (FastAPI stateless, no DB) |
| **Chart pattern detection** (extending Academy drills / setup recognition) | candles series | detected patterns + confidence | cv/scipy maturity | same request/response pattern | NestJS |
| **Quantitative analytics** (deep stats beyond V1 suite: distribution fitting, advanced Monte-Carlo, regime analysis) | trades/R series | computed statistics | numpy/pandas/statsmodels — the `analyticsSuiteResponseSchema` already reserves `monteCarlo`/`skew-kurtosis` blocks, currently mocked | same | NestJS |
| **Behavioral analytics / tilt prediction ML** | violation + DailyStat + emotion history | risk scores, pre-mortem features | scikit-learn, ML lifecycle | same | NestJS |
| **AI Coach (conversational, grounded)** | Zod-validated journal context snapshot | grounded insight text | LLM orchestration ecosystem | precedent exists: deleted `app/api/coach/chat` route (787d51e→2236b6c) shows the intended grounding contract; production home = Nest orchestrator → FastAPI (or direct provider) | NestJS (`AiInsight` table designed, incl. `userFeedback`) |

**Target flow:** `Next.js → NestJS → FastAPI → specialized computation → result → NestJS (domain validation + persistence)`. FastAPI never mutates core domain state directly and never talks to PostgreSQL in V1.

**Existing market-service stays Bun** (evidence-based recommendation): it is already a small, honest, single-responsibility sidecar; socket.io pairs naturally with the Nest gateway; rewriting it into FastAPI adds cost without adding capability. Revisit only if Python ML models must share the realtime path.

---

# N. Security Architecture Findings

## N.1 Existing security mechanisms (designed + mock-executed — to be ported, not reinvented)

| Mechanism | Where specified | Mock implementation | Real-backend status |
|---|---|---|---|
| Access token, **memory-only** (never localStorage/sessionStorage/cookie/URL) | `lib/auth/token-store.ts:5` | — | Must be honored: short-lived JWT in response body |
| Rotating **HttpOnly refresh cookie** + rotation chain (`replacedById`) + reuse detection (`revokedAt`) | `data-model.md` Session; `auth.ts` schema ("refresh token HttpOnly cookie, never in body") | localStorage jar stand-in (`cosmoz.mock.refresh-jar`) — HttpOnly is a no-op under MSW (documented in engine header) | **To build** (Phase 1 identity) |
| Single-flight refresh → retry-once 401 lifecycle | `lib/api/client.ts`, `lib/auth/refresh.ts` | exercised via dev-hooks (`__cosmoz_auth.expireAccessToken`) | Backend must emit 401 semantics compatible with single-flight |
| Rate limiting per vector (incl. `mfa: 5/15min`), lockout | auth-engine | ✅ mock-executed | To build (e.g. throttler guard) |
| MFA challenge (6-digit) + recovery codes, single-use | `schemas/auth.ts`, security-engine | ✅ | To build (otpauth/TOTP) |
| Email verification lifecycle (`PENDING_VERIFICATION → EMAIL_VERIFIED`), anti-enumeration forgot-password | auth-engine, `AuthGate` status screens | ✅ (returns `verificationToken` — **mock-only leak**, schema comment: "the real backend never returns verificationToken") | To build + email delivery (§S) |
| Account status lifecycle (`SUSPENDED`, `DEACTIVATED`, delete) | `/me/deactivate`, `/me/delete`, AuthGate | ✅ | To build |
| Single-use re-auth tokens (sensitive ops), append-only security event log | `schemas/security.ts` ("append-only"), security-engine (836 ln) | ✅ | To build (`AuditLog` designed but not yet in mocks) |
| Secrets never to frontend (credentials views, sanitized) | `integration.ts` ("Secrets NEVER travel to the frontend"), `sanitizeSecrets` util | ✅ | To build (AES-GCM at rest, `data-model.md` BrokerConnection) |
| Broker connectivity **read-only** — "intentionally NO schema for order submission"; positions stream "strictly read-only… labeled SIM" | `broker.ts`, `private-positions-stream.tsx`, `session-live-rebuild-map.md` | ✅ | Architectural invariant — keep |
| Frontend authorization is UX only | `auth-provider.tsx` usePermissions comment | — | Backend guard = boundary |

## N.2 Security gaps (discovery only — no fixes in this phase)

1. **No enforcement layer exists at all** — every mechanism above is simulation; the security posture of production Cosmoz is currently zero.
2. **`MOCK_ACCESS_SECRET` hardcoded** in `mini-services/market-service/auth.ts` (+ mirrored in `mocks/auth-engine.ts`) — `czat1.<payload>.<fnv1a>` token gate must be replaced by real JWT verification (JWKS from Nest identity) before any non-sandbox deployment. The file itself documents the plan and keeps call sites stable.
3. **Cookie semantics untested** (MSW cannot exercise HttpOnly) — refresh rotation, SameSite, CSRF interplay must be integration-tested against the real API.
4. **No CSRF/CORS/helmet strategy** documented yet (no server exists to configure).
5. **No audit log** in mocks (designed in `data-model.md` as `AuditLog`) — must exist from Phase 1 for auth events.
6. **No secret management** (env files only; no vault/ssm pattern).
7. **WebSocket authorization** is well designed (handshake + re-verify per subscribe + bounded re-auth) but must be re-implemented server-side and pen-tested (room scoping = IDOR over WS).
8. **No idempotency keys** on mutating endpoints yet (integration engine has helpers; REST API does not).
9. **Tokens in URLs**: verify-email/reset use one-time tokens via query param — acceptable pattern, but expiry/single-use must be server-enforced.

---

# O. Data Ownership Model

```text
User (ownership root — uuid, soft-delete RGPD)
 ├── Session(s), AuditLog, SecurityEvents, ApiKeys, MFA secret
 ├── Preferences doc (one JSON document, domain-patched) · locale · theme
 ├── TradingAccounts (1..*) ── BrokerConnections (credentials encrypted) ── ImportBatches
 ├── Trades (1..*) ── Exits · Events (sourcing) · Screenshots · Tags(m-n) · Mistakes(m-n)
 │                   └─ Strategy (nullable FK; null = hors-playbook, owned signal)
 ├── SkippedTrades (ghosts) · TradeViews (saved filters) · Reviews · Lessons · Goals
 ├── DailyJournals (unique per date) · ChecklistTemplates
 ├── Rules → RuleViolations → Alerts · EmotionMatrix (derived)
 ├── Nofy notes/folders/tags/templates/versions · Academy progress/practice/exams
 └── DailyStats (computed FOR the user, by the system — never user-entered)

Global reference data (NOT user-owned, read-only to users):
 Instruments (incl. synthetic specs: pipSize/contractSize/digits) · system Mistakes catalog
 · EcoEvents (provider data) · Academy content catalog · Monitoring thresholds (system)

External truth (never owned by Cosmoz):
 Broker-side account/position state (source of truth = provider; Cosmoz normalizes via
 adapters, V1 read-only) · Market prices (market-service providers) · News (omitted V1)
```

**Invariants (from `data-model.md` §15 + client comments, all currently unenforced):** every trading query scoped by token userId; cross-user access = 403 (IDOR test); server recomputes P&L/R/MFE; client `userId` never trusted; catalog seeding via migration tooling; tradingDate server-computed; quiz answers server-graded and stripped from public payloads.

**Consistency findings:** ownership modeling is *already consistent* across the frontend + mocks (single-user scoping behind `userKey` everywhere, per-user rooms `user:<id>`, per-user SIM positions seeded deterministically). No ownership inconsistencies found in the contract layer. Multi-tenancy (organizations/firms) is nowhere assumed — correct per product scope; revisit only if prop-firm team features are ever requested.

---

# P. API Strategy

## P.1 Existing conventions (verified — these become the law for NestJS)

- **Envelope**: none — domain-keyed plain JSON (`{trades, total}`, `{instruments}`, `{reviews, meta:{generatedAt}}`, `{session}`). No `{data}` wrapper, no JSON:API.
- **Errors**: `{ error: string, code?: string }`; Zod validation → `{ error: "ValidationError", issues }`; canonical machine codes exist for auth (`authErrorCodeSchema` — 15 codes) and should be extended per-context, not invented ad hoc.
- **Auth**: `Authorization: Bearer <access>`; refresh via HttpOnly cookie POST `/auth/refresh` (no header); 10 interceptor-exempt auth paths.
- **Idempotency/anti-cheat semantics already contractualized**: `POST /trades` (closed) → `{ id, awaitingDecision: true }` without P&L; only `/trades/:id/decision` returns `revealPayloadSchema`. CSV import → unique `externalRef` per account.
- **Pagination**: none (full arrays + `total`); documented V1 tolerance <10k trades/user. Future: add limit/offset (or cursor) to `/trades` and `/nofy/notes` lists only when real data forces it — contract change is additive.
- **Realtime**: socket.io; handshake `auth:{token}`; events `prices` (global broadcast), `positions` (snapshot, owner room `user:<id>`), `auth-error` (`AUTH_REQUIRED|TOKEN_INVALID|TOKEN_EXPIRED`); client-side fallback polling — Nest must honor these exact event names/semantics.
- **URLs**: single registry (`apiPaths`) shared by client + mocks; base `NEXT_PUBLIC_API_URL ?? "/api"`.

## P.2 Future contract strategy

1. **`@cosmoz/shared` stays the single contract package** — consumed by web, mocks, and NestJS. NestJS binds via `ZodValidationPipe`/serializer; no DTO duplication; contract tests assert schema↔Prisma mapping.
2. **Versioning**: adopt `/api/v1` prefix at the Nest boundary (frontend base becomes configurable; additive fields only within v1; breaking → v2).
3. **OpenAPI generation** from Nest controllers for external documentation — Zod remains the runtime source of truth.
4. **Migration switch**: `NEXT_PUBLIC_API_MOCKED=false` + `NEXT_PUBLIC_API_URL` — designed since day one ("when the NestJS arrives: change one env var, nothing else" — AGENTS.md). The swap is the Phase acceptance test: run the existing 100+ Playwright verification scripts against the real API.
5. **Error-code registry** grows per context; the client already renders `code`-aware copy for auth.

---

# Q. Implementation Roadmap (recommended)

> Adjusted from the provisional Phase-0 order using the dependency evidence in §K. Each phase ends with: contract tests green + the frontend module(s) passing their existing Playwright suites against `NEXT_PUBLIC_API_MOCKED=false`.

| Phase | Content | Key acceptance evidence |
|---|---|---|
| **1 — Foundation** | `apps/api` NestJS scaffold · Postgres + Prisma (schema from `data-model.md`) · Zod pipe/serializer · `{error,code}` filter · health endpoints · docker-compose (web+api+db) · CI (lint, tsc, vitest) · contract-test harness | `pnpm build` green monorepo-wide; CI runs contract tests |
| **2 — Identity & Security + Profile/Prefs** | register/login/logout/refresh(rotation)/MFA/recovery/verify-email/password flows · sessions · security events · `/me` + preferences doc | verify-auth.js suite vs real API; cookies real HttpOnly |
| **3 — Reference & Accounts** | instruments (incl. synthetics), accounts (+prop config), strategies/tags catalogs | trades unblocked; calculators get real specs |
| **4 — Trading Journal (CORE)** | trades CRUD, close→awaitingDecision, decision reveal, TradeEvent, exits, screenshots (storage), trade-views, bulk, CSV import idempotent, skipped/ghosts | verify-trades* suites; P&L recompute parity tests |
| **5 — Discipline Engine (CORE)** | rules, event-driven evaluation, violations (frozen context), alerts, mistakes ledger, score | trade writes generate violations; cron rules |
| **6 — Session Live** | sessions, timeline, notes, saved analyses, key levels | session suites vs real API |
| **7 — Playbook (CORE)** | strategies+versions, setups, checklists, rules, templates | playbook suites |
| **8 — Analytics & Reviews & Goals (CORE)** | overview, suite, DailyStat nightly job, what-if, reviews/lessons/goals (progress server-computed) | analytics/review suites |
| **9 — Calendar & Eco** | blocks, calendar-view, eco import | calendar suites |
| **10 — Nofy** | notes/folders/tags/templates/versions/search/refs | nofy suites |
| **11 — Academy** | catalog, grading, practice, exams, certifications | academy suites |
| **12 — Connectivity (READ-ONLY)** | integrations providers, BrokerConnection (encrypted), real import batches | hub suites; zero execution capability audit |
| **13 — System & Backup** | monitoring real probes/jobs/incidents, backup export/import | monitoring suites |
| **14 — FastAPI services** | OCR/screenshot recognition, quant extensions, AI coach (per §M) | per-capability contracts |

**Stack decisions to lock in Phase 1** (not implemented now): NestJS 11 + Fastify adapter, Prisma + PostgreSQL 16, `nest-pino` logging, `@nestjs/throttler`, socket.io gateway, vitest, GitHub Actions (or equivalent), docker-compose for dev parity.

---

# R. Architectural Risk Register

| # | Risk | Evidence | Impact | Severity | Recommended mitigation (later phase) |
|---|---|---|---|---|---|
| 1 | Backend built against MSW internals instead of the Zod contract → drift | 188 handlers/7 engines encode behaviors; contract lives elsewhere | High | **HIGH** | Contract-first rule: bind Nest to `@cosmoz/shared` + `apiPaths`; port engine *test vectors*, not code |
| 2 | Hardcoded `MOCK_ACCESS_SECRET` token gate in market-service | `mini-services/market-service/auth.ts` | Auth bypass in any non-sandbox deployment | **HIGH** | Replace with JWT/JWKS verification from Nest identity (file documents the plan) |
| 3 | All security currently simulated (rotation, rate limits, MFA, re-auth) | §N.2 | Zero real posture today | **HIGH** | Phase 2 = identity first; integration tests for cookie semantics |
| 4 | No CI, no test runner, no Docker — DoD not machine-enforced | repo-wide globs | Regression risk during backend build | **HIGH** | Phase 1 deliverable: CI + vitest + compose; adopt existing Playwright suites as e2e |
| 5 | Dual lockfiles (pnpm authoritative + stale root `bun.lock`) | root files | Tooling confusion, phantom installs | Medium | Delete `bun.lock` at root; keep market-service's own |
| 6 | Stale root `.env` with dead `DATABASE_URL` artifact | root `.env` | Confusion at DB setup time | Low | Remove when Prisma lands |
| 7 | No pagination on list endpoints; analytics whole-dataset | `api.ts` trades list; suite payload | Latency/memory at scale | Medium | Documented <10k tolerance; add paging to `/trades` + notes first |
| 8 | MSW cookie no-op → refresh-rotation semantics never exercised | auth-engine header | Rotation/reuse-detection bugs ship late | Medium | Phase 2 integration tests + reuse-detection unit tests |
| 9 | `verificationToken` in mock register response (mock-only leak) | `schemas/auth.ts:105` | Temptation to rely on it server-side | Low | Keep schema comment; contract test forbids field in prod response |
| 10 | localStorage carries prefs/drafts (13 keys) — data-of-record is volatile mocks | §P0-B inventory | Users perceive data loss in dev; migration expectations | Medium | Keep prefs local (fine), migrate everything else in Phases 2–11 |
| 11 | Provider-specific shapes leaking into core trading domain | mandate §18; adapters don't exist yet | Coupling to MT5/Deriv/Binance | Medium | ACL adapters in `connectivity`; normalized shared schemas only |
| 12 | FastAPI temptation as second backend (CRUD creep) | mandate §9 | Duplicated domain logic | Medium | §M boundary table; Nest owns persistence, FastAPI stateless |
| 13 | Excessive DDD ceremony (over-abstraction) | 15 contexts identified | Velocity loss | Medium | Rich domain layers only in 5 core contexts (§L rule) |
| 14 | Discipline engine evaluated only synchronously → time-based rules need cron from day 1 | `data-model.md` "Evaluated on every trade mutation + cron" | Tilt/cooldown/risk-budget rules silently never fire | Medium | Phase 5 includes rule-cron + tests |
| 15 | WS room scoping = IDOR over WebSocket if guard sloppy | `user:<id>` rooms + snapshot semantics | Cross-user data leak | Medium | Gateway guard tests: subscribe-spoof attempts must fail |
| 16 | Dead code & orphan artifacts accumulate | `system/integrations-view.tsx`, `page-placeholder.tsx`, `/theme-test` | Noise, confusion | Low | Cleanup task in Phase 1 |
| 17 | `z-ai-web-dev-sdk` declared in web deps but unused in `src` | package.json:27 | Accidental client-side LLM usage | Low | Remove or pin to server-only usage when coach returns |

---

# S. Open Questions (genuinely blocking or phase-relevant only)

1. **Email delivery** — provider (SMTP/Resend/SES) for verification, password reset, and (later) backup emails? Blocks Phase 2 acceptance.
2. **Deployment topology** — where will Postgres + NestJS + market-service run (the sandbox gateway `XTransformPort` pattern is dev-only)? Affects Phase 1 compose/CI targets.
3. **Realtime ownership** — should the Nest gateway *own* private streams (positions) and *relay* market `prices`, or relay everything to market-service? (Recommendation drafted in §L; confirm.)
4. **File storage** for trade screenshots — MinIO is named in `data-model.md`; confirm S3-compatible target + bucket strategy.
5. **Connectivity scope for V1** — which providers must be real first (MT5 local bridge? Deriv API? Binance read?), and are credentials available to develop against?
6. **Soft-delete policy for Accounts** — deleting an account with trades: cascade, archive, or forbid? (Affects FK design in Phase 3.)
7. **Single operator vs multi-user SaaS** — `PRODUCT.md` says one operator; the mandate says SaaS and the data model is multi-user-ready. Confirm multi-user from day 1 (recommended — schema already assumes it).
8. **Server-generated copy i18n** — alerts/insights/violations: should the API return i18n *keys* (client renders) or localized strings? (Current mocks lean keys+payload; confirm.)
9. **Analytics payload size** — keep whole-dataset suite responses in v1, or split `analytics-suite` into per-block endpoints when real data lands?

---

# 28. Engineering Principles — compliance check (mandate §28)

All 25 principles were applied during this audit; the notable ones: no production file was modified (only `docs/backend/` + `worklog.md` + this audit's scratch checks); reuse-before-create is the report's spine (§G: the contract package is lifted verbatim); trading-provider logic is adapter-bound (§J/§L); read-only V1 connectivity is enforced as an invariant with no execution schema in existence (§N.1); no microservice beyond the existing market sidecar and the justified FastAPI boundary (§M); security treated as architecture (§N); STOP before Phase 1 (below).

---

## STOP — awaiting approval

Per mandate §27: **no Phase 1 implementation has begun.** The next phase (Foundation) will be provided separately. This report is the complete evidence base for that decision.
