# Dashboard Customization — Phase 11 Report
## Integration & E2E Validation

Date: 2026-10-19

> **Honest scope note.** The original Phase 11 spec was lost with the
> 2026-10-19 sandbox restore (worklog task 14) — it was only received in
> conversation. This phase was executed from the CONDENSED spec preserved in
> the session summary: validate integration (never rebuild), take the
> REPOSITORY as the sole authority (never assume unimplemented phases),
> classify 12 feature areas honestly (implemented / partial / mock-only),
> map the cross-module scenarios A–K to real evidence, run the full battery
> in the prescribed order, and never report mock-served behavior as verified
> production integration. If the owner re-uploads the original spec, a
> conformance pass is required.

---

## A. Repository & test-infrastructure audit

- **Test infrastructure**: API tests run against a REAL NestJS `AppModule`
  on Fastify + embedded PostgreSQL (`test/global-setup.ts`, dedicated
  `cosmoz_test` DB, migration replay; worker-safe). Web tests are pure
  model tests (vitest, node env). UI behavior is verified by Playwright
  probes against the zero-env mock preview (MSW) — persistence is proven
  server-side, never in mock memory.
- **Battery inventory at validation time**: API unit 49 files / 812 tests;
  API e2e 41 files / 507 tests (total 1319); web vitest 12 files / 161
  tests; UI probes: dashboard-workspaces (16), dashboard-insights (21),
  dashboard-filters (28) — all zero page errors.

## B. Feature classification (12 areas, evidence-based)

| # | Feature area | Status | Evidence |
|---|---|---|---|
| 1 | Dashboard customization core (01) | **Implemented** | commit `81513e1`; customization-reducer/layout-model suites; probes |
| 2 | Widget customization & per-instance configs (02) | **Implemented** | `e3b773a`; widget-configs.spec; settings e2e |
| 3 | Global filters & saved analytical views (03) | **Implemented** | `7b83374`; filters/saved-views specs; settings e2e (wholesale merge, isolation, reset); probe 28/28 |
| 4 | Goals engine (04, pre-existing) | **Implemented** | `review.e2e.spec.ts` + `trade-reviews.e2e.spec.ts`; goal progress consumed by GOALS_PACE widget + alert GOAL rules |
| 5 | Performance insights & behavioral analytics (05) | **Implemented** | this rebuild (`141a247`+`a2da651`); engine unit 17/17; analytics e2e sections test; probe 21/21 |
| 6 | Workspaces & user templates (06) | **Implemented** | this rebuild (`9d2e2de`); workspaces.spec; settings e2e (round-trip, caps, isolation); probe 16/16 |
| 7 | Metric alert rules (07) | **Implemented** | `1da3d75`; `metric-alerts.e2e.spec.ts` (unit + e2e battery); discipline inbox bridge |
| 8 | Analytics suite backend (Phase-8 engine) | **Implemented** | `analytics.e2e.spec.ts` contract + determinism + filter battery + security isolation |
| 9 | MT5 terminal bridge & broker connectivity (accounts) | **Partial** | backend + EA + UI implemented and sim-verified (`bridge` e2e suite, oanda/deriv fixture adapters); NO real broker/terminal is reachable from this environment — production integration remains UNPROVEN here |
| 10 | OCR / trade recognition (backend + FastAPI) | **Partial** | NestJS pipeline + e2e battery (ocr*.e2e) with deterministic engines; vision-quality path depends on the FastAPI sidecar, not exercisable end-to-end in this environment |
| 11 | Oryon market feed / real-time market data | **Mock-only (client) / Implemented (analyses API)** | MSW `stats.ts` market feed; live bridge is an explicit opt-in (`NEXT_PUBLIC_API_LIVE`, next.config proxy) and was NOT validated against a real feed here; `/oryon/analyses` API has its own e2e (`oryon-analyses.e2e.spec.ts`) |
| 12 | Backup export/import | **Implemented** | `backup/backup.controller.ts` (`/backup/export`, `/backup/import`); `backup.e2e.spec.ts` + full-coverage e2e |

**Never reported as production-verified**: items 9/10/11's external
integrations. The default web mode is the MSW mock backend; the live bridge
exists and is tested at the unit/fixture level only.

## C. Cross-module scenario matrix (A–K)

| Scenario | Verdict | Evidence (all green at validation time) |
|---|---|---|
| A. Global filter consistency | **PASS** | `analytics.e2e` filter battery (period/custom/direction/session/exitReason/account/instrument/assetClass/strategy-none narrow the SAME dataset; emotion/tag honest empties); web suite query key IS the serialized filter string (`queries/stats.ts`, `keys.ts`) — different filters can never cross key boundaries; server is stateless per request |
| B. Saved views | **PASS** | settings e2e: round-trip, malformed rejected with domain untouched, per-user isolation, reset; divergence badge + "apply again" interaction probe-covered (filters probe) |
| C. Workspace isolation | **PASS** | settings e2e: `defaultLayoutId`/`userTemplates` per-user isolation; layout cross-talk guards (both save halves always travel — Phase 03 fix, pinned by e2e); unit fallback-chain tests |
| D. Widget customization | **PASS** | widget-configs resolve/validate/repair suites (invalid version/unknown metrics/kind mismatch → safe defaults); per-instance configs live inside workspace documents (Phase 06 e2e + clone independence tests) |
| E. Goals | **PASS** | review e2e (CRUD, computed progress, pacing, discipline ingredient); GOALS_PACE widget + GOAL alert rules consume the same authoritative engine (metric-alerts e2e) |
| F. Insights | **PASS** | insights-engine unit (17): suppression thresholds, reliability bands, determinism, multi-currency money gates; analytics e2e ships the sections in-payload; probe renders findings or honest empty state |
| G. Alerts | **PASS** | metric-alerts e2e (threshold + GOAL rules, transition engine, dismiss, per-user isolation); events land in the discipline inbox (discipline e2e) |
| H. Exports | **PASS** | backup e2e (export/import round-trip); the dashboard domain (layouts/views/filters/templates) survives the backup/restore path via the wholesale preferences document (full-coverage e2e) |
| I. Snapshot immutability | **PASS** | suite determinism e2e (identical requests → identical payloads, incl. Monte Carlo seed); user templates are frozen structuredClones (unit tests: edits never leak either direction) |
| J. Cache/refresh consistency + fast filter-switch races | **PASS (by architecture + evidence)** | React Query keys embed the full serialized filter set — a stale response cannot land under a newer key (v5 structural sharing; no `keepPreviousData` on the suite); server requests are stateless; the wholesale-merge guards prevent a layout save from clobbering views/filters (e2e-pinned both directions); concurrent-mutation CAS exists for alert evaluation (metric-alerts unit) |
| K. Theme / responsive / a11y regression | **PASS** | three themes token-driven (globals.css; zero hard-coded dashboard colors — Phase 10 audit); probes assert zero horizontal overflow at 390px and zero page errors (all three probes); a11y cues verified in DOM (sr-only directions, aria-labels, aria-invalid/describedby) |

## D. Deterministic fixtures

The suite e2e seeds canonical CLOSED trades directly via Prisma with
deterministic canonical values (fnv1a-seeded identities, fixed R/P&L) and
verifies exact metrics — fixtures are explicit test inputs, never confused
with user data (seed demo data is a separate, idempotent, labeled flow).

## E. Security & data isolation

- Authorization is API-authoritative: every preferences/dashboard mutation
  validates the domain schema server-side and scopes to the authenticated
  user; e2e batteries prove cross-user invisibility for suite data,
  saved views, workspace data, alert rules, analyses (security-negative +
  security-capability-negative suites exist for the auth surface).
- Client-side filters are presentation, never authorization (the engine
  filters `userId`-scoped rows server-side; verified by the user-isolation
  e2e on the suite endpoint).

## F. Defects found & fixed during this phase

No NEW defects were reproduced by the Phase 11 battery. Defects found and
fixed earlier in THIS validation cycle (recorded where they happened):
- Phase 05 probe exposed the §10 wiring gap (suite-fed widgets ignoring the
  global filter context) — fixed in `a2da651`.
- Settings e2e oversized-order generator no longer exceeded the bound after
  the widget canon grew to 15 — test fixed in `a2da651` (bound itself was
  correct).
- Phase 06 probe exposed the dialog-session/confirm-dialog interaction
  assumptions — probe fixed (product behavior was correct).

## G. Execution order & results (as prescribed)

1. Unit/utilities: API unit **812/812** (49 files); web pure model
   **161/161** (12 files).
2. Integration/e2e: API e2e **507/507** (41 files, real Postgres).
3. UI regression probes: workspaces **16/16**, insights **21/21**,
   filters **28/28** (zero page errors, 390px overflow-free).
4. tsc: shared / api / web — all clean.
5. eslint: api (`src test --quiet`) and all changed web files — clean.
6. `next build`: exit 0 (compiled successfully, 34 static pages).

## H. Limitations

- Broker/OCR/market-feed production integrations are classified PARTIAL /
  mock-only (§B) — this environment cannot reach MT5, broker APIs, or the
  FastAPI vision sidecar; no simulated test may be read as a production
  integration claim.
- No screen-reader session was available; a11y cues are DOM-verified.
- Client race scenario J is proven by architecture (query-key identity +
  stateless server) and existing e2e, not by a dedicated Playwright timing
  race harness — noted honestly rather than claimed as a timed test.

## I. Phase status

**COMPLETE as an integration-validation pass**: every in-repo feature area
of the dashboard series is integrated, tested and green end-to-end; the
scenario matrix is PASS across A–K with the stated evidence; the feature
classification is honest about the three externally-bound areas (§B).

## J. Phase 12 readiness

Per the preserved boundary, Phase 12 was NOT started. Nothing in this
report constitutes readiness evidence for it.
