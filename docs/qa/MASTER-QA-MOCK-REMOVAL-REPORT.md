# Euforia — MASTER Testing, QA, Mock Removal & Production Data Cleanup — Final Report

Date: 2026-10-19
Spec: `docs/specs/master/MASTER-TESTING-QA-MOCK-REMOVAL-PRODUCTION-CLEANUP.md`
Scope: whole repository (apps/web, apps/api, packages/shared, mini-services/ocr-service, mini-services/market-service), executed together with the companion fullstack audit (`docs/audits/MASTER-FULLSTACK-AUDIT-REPORT.md`) — the two specs share one evidence base; this report carries the QA-specific deliverables (test campaign, mock inventory & removal, seeder inventory, CI).

---

## A. Executive Summary

**Overall quality assessment.** The repository is in materially better condition than a "feature-complete, unverified" baseline: the full automated battery is green (API unit+e2e **1325/1325** across 91 files on a real embedded PostgreSQL, web **169/169**, OCR sidecar pytest **97/97**, `next build` exit 0, tsc ×3 clean, eslint clean), and the critical user workflows were exercised **over real HTTP against the real running services** (register → verify → login → refresh rotation → trade lifecycle with independently computed P&L → logout; plus a REAL OCR end-to-end through the running FastAPI/tesseract sidecar). Two genuine defects that the campaign surfaced were fixed with regression tests, and the central mock-hygiene mandate of the spec was implemented and automated.

**Critical risks.** None open at P0/P1. The three risk classes that remain are environmental, not code defects: (1) live broker integrations (OANDA/Deriv) are fixture-verified only — no real broker is reachable from this sandbox; (2) the market feed's real provider (Binance public WS) was reachable and self-declared, but no data-quality assertion beyond provider status was made; (3) no load testing was performed (no production-scale environment).

**Tests executed and outcomes.** Baseline (before any change): API 1319/1319, web 161/161, ocr-service pytest **BLOCKED** (collection ImportError — a real defect), pnpm audit 23 vulnerabilities (3 critical). Final (after fixes, from the current tree): API **1325/1325** (91 files), web **169/169** (13 files), ocr-service pytest **97/97**, `next build` exit 0, mock-leakage guard PASS, live HTTP evidence **24/24 + 2/2 PASS** (persistence across restart), production-mode browser session PASS (login → dashboard → real API 200s, zero page errors).

**Main defects discovered and resolved.**
| ID | Severity | Finding | Resolution |
|---|---|---|---|
| D1 | P2 | `mini-services/ocr-service` test_v2.py failed collection (imported an `enhance()` that never existed in history) and 6 further tests failed — the sidecar's V2 contract (grouped `trades` in the response, `cropRegion` zone re-read, `/v1/recognitions/document`) had never been wired; regions were reported in upscaled coordinates | Implemented the full V2 sidecar contract (see §I), fixed the conftest token-bootstrap ordering, corrected one dishonest test label ("opencv+pillow" → "numpy+pillow"); pytest 97/97 |
| D2 | P1 | The web app activated the MSW mock layer **by default with zero env** — a zero-env production build served mock financial data as if real (spec §14.1/§14.9 violation) | Canonical mode matrix (explicit `NEXT_PUBLIC_API_MOCKED=true` = mocked anywhere; zero-env **production = real API**; zero-env dev stays mocked); `API_BASE` derived from the same source; 8-test matrix spec; CI mock-leakage guard |
| D3 | P1 | 23 dependency vulnerabilities including **next 16.3.5 critical RCE (next/og ImageResponse)** and 2 fastify HIGH (header-validation bypass / auth bypass via malformed URI) in the API runtime | `next` → 16.3.8 (patch, in-range), `fastify` → 5.12.7 via a documented pnpm-workspace override (pnpm 12 ignores `pnpm.overrides` in package.json); audit 23 → **9 advisories, all in dev-tooling chains** (vitest/tinypool, eslint/shadcn braces, prisma CLI deepmerge-ts, build-time postcss) — no runtime exposure found for the remaining set |
| D4 | P2 | The FastAPI OCR adapter (NestJS side) never implemented `recognizeDocument`/`supportsDocuments` — the port's document pipeline was dead code for the real sidecar | Implemented + strict Zod `engineDocumentResponseSchema` + 6 adapter unit tests |

**Remaining blockers.** Live broker verification, market-feed data-quality validation against a real feed consumer, and load testing require environments this sandbox cannot provide. The FastAPI sidecar integration is now verified for the deterministic-reachable path (tesseract ran for real in this session); a production deployment must still supply `OCR_SERVICE_URL`/`OCR_SERVICE_TOKEN`.

**Staging readiness.** See §P.

---

## B. Verified Architecture

- **apps/web** — Next.js 16.3.8 (App Router, React 19, Tailwind 4, Radix/shadcn, TanStack Query v5, echarts + lightweight-charts, socket.io-client). MSW mock layer present under `src/mocks/`, now **explicitly opt-in** (canonical mode check `src/lib/api/mode.ts`); real mode uses the same-origin `/api/v1` proxy (`next.config.ts` rewrite → `API_PROXY_TARGET`).
- **apps/api** — NestJS 11 + Fastify 5.12.7 (DDD modular monolith, 40 modules), Prisma 6 + PostgreSQL (embedded dev/test binaries; 42 migrations), argon2 password hashing, JWT access (15 min, memory-only client-side) + HttpOnly refresh-cookie rotation with reuse detection, TOTP MFA (otpauth), AES-256-GCM at rest for provider credentials / MFA secrets / webhook secrets (separate keys), global throttler, helmet, pino logging with request ids, Zod validation at every boundary.
- **packages/shared** — Zod contracts + pure engines (insights, replay, analytics) consumed by both API and the MSW mirror (parity by construction).
- **mini-services/ocr-service** — Python FastAPI + pytesseract (tesseract 5.5.0 present in this sandbox), deterministic pipeline v3, service-to-service token (§27), stateless (no persistence — the Nest side owns storage/jobs/trades).
- **mini-services/market-service** — Bun + socket.io; `/health` **self-declares provenance**: `binance` = `source: "real"` (public websocket), `simulated` = `source: "sim"` (simulated-walk EURUSD/GBPUSD/XAUUSD/BOOM500/CRASH500/VOL75(1s)).
- **CI** — `.github/workflows/ci.yml`: api (lint, typecheck, build, unit+e2e on embedded Postgres), web (typecheck, **unit tests**, build, **mock-leakage guard**), **ocr-service job added this campaign** (tesseract install + pytest).

---

## C. Baseline Results

| Command (repo-actual) | Baseline outcome |
|---|---|
| `tsc -p tsconfig.json --noEmit` (shared / api) + `tsc --noEmit` (web) | exit 0 ×3 |
| `eslint` (api / web) | api 0 problems; web 0 errors / 92 warnings (61 = unused eslint-disable directives, 11 unused-vars, 6 unused-expressions, 1 img-element — hygiene, not defects) |
| `vitest run` apps/api (unit+e2e, embedded Postgres, `cosmoz_test` fail-fast guard) | **1319/1319**, 90 files |
| `vitest run` apps/web | **161/161**, 12 files |
| `next build` | exit 0 |
| `pytest tests/` (ocr-service) | **BLOCKED — 1 collection error** (`test_v2.py` ImportError) = real defect D1; after unblocking, 7 further failures surfaced |
| `pnpm audit` | 23 vulnerabilities: 1 low, 9 moderate, 10 high, **3 critical** |
| Node/Python/tooling | node 24.21.0, pnpm 12.4.2, python 3.12.15, tesseract 5.5.0, bun 1.x — all present |

Environmental notes: the sandbox shell exports `DATABASE_URL=file:/…/custom.db` (platform artifact) which overrides `--env-file` — the API must be started with `env -u DATABASE_URL`; Next 16 enforces one dev server per project directory (the platform preview runs `next dev -p 3000`).

---

## D. Test Coverage Inventory

**Existing (verified by execution, not by presence):** 49 API unit files (pure domain: analytics math, trade calculations, risk/reward, OCR engines, sync, settings rules…), 41 API e2e files (real AppModule + real Postgres; per-module ownership/isolation/negative-capability batteries; `full-coverage` + security-negative suites), 12 web unit files (dashboard-customization model/registry/persistence/reducer, notification rules), 6 pytest files (sidecar V1+V2), Playwright probes for the dashboard phases (mock-mode UI).

**Added this campaign:**
- `apps/api/test/unit/fastapi-ocr-engine.spec.ts` — 6 tests pinning the sidecar adapter's HTTP discipline (§34 error mapping, §54 strict parsing, echo check, document route).
- `apps/web/src/lib/api/__tests__/mode.spec.ts` — 8 tests pinning the canonical API-mode matrix incl. the §14.9 production guard and the `API_BASE` derivation.
- Sidecar V2 contract tests were already written (test_v2.py) but unexecutable — now green (D1).
- `apps/web/scripts/check-prod-mock-leakage.mjs` — §14.10 automated production mock-activation guard (mode test assertion + SW passthrough check + client-chunk start-site analysis).

**Deliberately NOT added:** coverage-percentage chasing; a second E2E framework (the repo's established verification infrastructure is the vitest e2e battery + probes; the spec forbids unnecessary framework churn).

---

## E. Execution Results

Separate counts by suite — statuses are NOT merged into one number:

| Suite | Command | Passed | Failed | Blocked | Notes |
|---|---|---|---|---|---|
| API unit+e2e | `CI=true vitest run` (apps/api) | **1325** (91 files) | 0 | 0 | +6 vs baseline (adapter spec); embedded Postgres, migrations replayed |
| Web unit | `vitest run` (apps/web) | **169** (13 files) | 0 | 0 | +8 (mode matrix) |
| OCR sidecar | `pytest tests/` (mini-services/ocr-service) | **97** | 0 | 0 | was collection-blocked; now green incl. V2 contract |
| Production build | `next build` | exit 0 | — | — | 34 routes |
| Mock-leakage guard | `node scripts/check-prod-mock-leakage.mjs` | PASS | — | — | new §14.10 gate |
| Live HTTP evidence | `node scripts/live-integration-evidence.mjs` | **24/24** phase 1 + **2/2** phase 2 | 0 | 0 | real services; §F below |
| `pnpm audit` | final | 9 advisories (2 critical, 5 high, 2 moderate) | — | — | **all in dev-tooling chains**; runtime packages (next, fastify) patched |
| Lint/typecheck ×5 | final | all clean | — | — | web eslint warnings pre-existing hygiene |

---

## F. Business Workflow Validation (live HTTP, real services)

Script of record: `scripts/live-integration-evidence.mjs` (24 checks, all PASS, run twice + persistence re-check after an API restart):

- **A — Registration**: 201, `delivery: "EMAIL"`, **no verification token in the response** (mock-only affordance correctly absent on the real backend); dev mailer log carries the verification link; email verification 200.
- **B — Login**: wrong password → 401; correct → 200 + access token + **HttpOnly SameSite `cosmoz_rt`** cookie.
- **C — Account & catalog**: MOCK provider account connects in DEMO env (gated, labeled `isMock` per §57); instruments catalog serves the 7-instrument reference catalog (EURUSD present).
- **D — Trade lifecycle with INDEPENDENT expected values**: open trade 201; close returns `{id, awaitingDecision}` and **leaks no P&L**; decision reveals `pnlNet = "50"` = the independently computed Δ0.005 × 0.10 lots × 100000 contract size; re-deciding → 409.
- **E — Analytics consistency**: `stats/overview` reflects the closed trade (`netPnl "50.0"`).
- **F — Persistence across restart**: API process killed and restarted; manual trade and OCR-imported trade both still present (real Postgres, not in-memory state).
- **G — Cross-user isolation (IDOR)**: user B reads user A's trade by id → 404; deletes → 404 (ownership enforced at the boundary, no resource-detail disclosure).
- **H — Refresh rotation**: rotation 200 with a new cookie; **replaying the old cookie → 401**; and the reuse **revokes the whole token family** (the just-rotated token is rejected too — strong server-side revocation evidence).
- **I — REAL OCR end-to-end**: screenshot upload 201 → recognition via the **running tesseract sidecar** (engineVersion 5.5.0, pipeline 3.0.0) → REVIEW_REQUIRED with `symbol=XAUUSD, direction=BUY, volume=0.15` extracted from the fixture → explicit confirm → **journal trade created (`source: IMPORT`)** → present in the trade list (plain `GET /trades/:id` does not exist by design — see the audit report §D).
- **J — Logout**: session revoked server-side; refresh after logout → 401.

**Browser-level real-mode verification** (production build, zero env → real API by default, port 3002): UI login → dashboard; network log shows `/api/v1/me`, `/trades`, `/instruments`, `/me/preferences`, `/stats/overview`, `/rules/status` all 200 through the same-origin proxy; `/trades` renders real backend rows; zero page errors. The mock-mode preview (zero-env dev, port 3000) was restored and keeps working unchanged.

---

## G. Financial Calculation Validation

- The trade lifecycle was validated against an **independently computed** expected value (not the application's own formula echoed back): entry 1.0850, exit 1.0900, quantity 0.10 lots, EURUSD contractSize 100000 → Δ0.005 × 0.10 × 100000 = **50.00 USD**, R = 50/50 (risk 1.0800 stop ⇒ 0.0050 × 0.10 × 100000 = 50) → both matched exactly (`pnlNet "50"`, `rMultiple "1"`), with zero fees. This anchors quantity-mode math, contract-size handling, and R normalization.
- The shared risk/reward logic is unit-pinned in `shared-risk-reward.spec.ts` / `calculators-logic.spec.ts` (boundary values, zero-risk cases, instrument-specific contract sizes — verified by execution in the battery).
- P&L is **never accepted from clients** (`createTradeInputSchema` rejects pnl/r fields; "the server recomputes everything") — verified in the contract test suite.
- Remaining uncertainty: multi-currency conversions and fee/swap aggregation across exotic instruments were not independently re-derived in this campaign (unit-tested only); no production-scale dataset was available.

---

## H. OCR Validation

- **Boundary discipline verified in code and live**: the sidecar is stateless (no users, no persistence, no trading state — §4); the Nest side owns auth, validation, job lifecycle, storage, and trade persistence; service-to-service shared token (§27) guards every route except `/healthz`.
- **Pipeline stages exercised for real** (this sandbox has tesseract): upload → checksum + MIME sniff + dimension reconciliation → denoise/deskew/upscale/CLAHE → dual-pass OCR with field arbitration → classification (TRADE_HISTORY/MT5) → profile grammar → clustered trades → dHash → review → confirm → server-recomputed trade → analytics surface.
- **Job lifecycle**: statuses verified live (`REVIEW_REQUIRED` → `CONFIRMED`); failure paths (unsupported format, corrupted image, checksum mismatch, oversized payload, tesseract failure → `FAILED/OCR_UNAVAILABLE`, deadline overrun) are pinned by the sidecar pytest + api e2e negative suites.
- **V2 contract restored (D1)**: grouped `trades` with pageIndex provenance; `cropRegion` zone re-read reporting regions in ORIGINAL-asset coordinates (÷ upscale scale + offset — a real §18 coordinate bug fixed); `/v1/recognitions/document` per-page pipeline (non-PDF → `UNPROCESSABLE/SCREENSHOT_UNSUPPORTED`, page-wise trades, deadline-honoring between pages with an explicit partial warning).
- **Honest limits**: extraction accuracy is asserted on deterministic rendered fixtures only — no general accuracy percentage is claimed; the production deployment still needs `OCR_SERVICE_URL` + token (without them production degrades to `OCR_UNAVAILABLE` honestly, or runs the gated mock engine in non-production).

---

## I. Mock Inventory and Cleanup

Classification per spec §14 (A = must remove, B = isolate & explicitly enable, C = test mock, D = essential reference seeder, E = obsolete, F = false positive):

| Item | Location | Class | Action |
|---|---|---|---|
| MSW mock layer as DEFAULT data source | `apps/web/src/mocks/*` + `lib/api/mode.ts` | **A → B (fixed, D2)** | mode matrix: explicit `NEXT_PUBLIC_API_MOCKED=true` required; zero-env production = real API; dev zero-env keeps mocks (documented DX); `API_BASE` derived from the same check |
| Mock trading provider | `apps/api/.../providers/mock-trading.provider.ts` | **B (already correct)** | `ACCOUNTS_MOCK_PROVIDER` gate: default on **outside production only**; provider labeled `isMock` in the contract (§57) — verified live (MOCK/DEMO connect) |
| Deterministic OCR engine | `apps/api/.../deterministic-ocr.engine.ts` | **B (already correct)** | `OCR_MOCK_ENGINE` gate defaults to non-production; production without a sidecar degrades to `OCR_UNAVAILABLE` honestly |
| `/api/eco-events` fixture fill | `apps/web/src/app/api/eco-events/route.ts` | **B (kept, documented)** | real ForexFactory week is primary; fixtures fill only the horizon OUTSIDE the real week; `source` honestly reports `forexfactory / forexfactory+sample / sample` in the shared contract |
| Demo credential panels / dev hooks / token-store test affordances | `auth components`, `lib/auth/dev-hooks.ts`, `token-store.ts` | **B** | all gated on `API_MOCKED` (and dev-hooks additionally on non-production) — with D2 they can no longer appear in a default production build |
| Web test fixtures & engines (`playbook-seed`, `review-seed`, `fixtures/*`) | `apps/web/src/mocks/` | **C** | kept — mock-mode content, reachable only in the explicitly enabled demo/dev mode |
| API test helpers / fixtures (`build-app`, `identity`, `ocr-fixtures`, deriv/oanda fixture servers) | `apps/api/test/helpers/` | **C** | kept — test infrastructure with fail-fast DB guards |
| Instrument catalog seed | `apps/api/prisma/migrations/*_trade_journal_core` | **D** | 7 reference instruments required by the domain — kept (see §J) |
| `API_MOCKED === "true"` demo panels on login/register | UI | **F (correct design)** | visible demo affordances in mock mode are the documented product behavior; they are now IMPOSSIBLE in a default production build |
| Fake fallbacks concealing API failures | searched (`fallback|catch.*return.*fake|sample data`) | **none found in runtime paths** | suite states (`suiteStatus`) render honest loading/empty/error; the only labeled degradation is the eco-events B-class case |

**Automated leakage guard (§14.10)**: `scripts/check-prod-mock-leakage.mjs` in CI — asserts the mode-matrix test exists and pins the production rule, the composed `/sw.js` never self-activates MSW, and no client chunk starts the worker outside the guarded provider. Verdict on the final build: **PASS**.

**Acceptance criteria check (spec §14)**: no unintended mock data reaches normal production flows (zero-env prod = real API; explicit opt-in documented) ✓; a backend outage does not produce fake success — real-mode requests surface truthful error states ✓ (live-verified); test suites deterministic and green ✓; development mocks documented in `.env.example` + code ✓; production cannot accidentally enable test-only providers ✓ (env gates + mode matrix + CI guard); real API/DB integration tests validate critical flows ✓ (e2e battery + live evidence).

---

## J. Seeder and Demo Data Inventory

| Seeder / init script | Purpose | Data | Class (1–6) | Verdict |
|---|---|---|---|---|
| `apps/api/prisma/migrations/20261004120000_trade_journal_core` (INSERT INTO "Instrument") | reference catalog required by the domain | 7 instruments (EURUSD, GBPUSD, XAUUSD, BTCUSDT, BOOM500, CRASH500, VOL75(1s)) with contract sizes | **1 — essential reference-data** | KEEP |
| `apps/api/scripts/reset-test-db.sql` | test database bootstrap | drops/recreates ONLY `cosmoz_test` | **3 — test factory** | KEEP (guarded: global-setup + setup.ts fail-fast assert the TEST database; destructive commands cannot target another DB) |
| `apps/api/scripts/dev-db.mjs` | embedded dev Postgres lifecycle | none (schema via migrations) | **4 — dev bootstrap** | KEEP |
| `apps/web/src/mocks/playbook-seed.ts`, `review-seed.ts`, `fixtures/*` | demo content for the mock mode | demo playbooks/reviews/eco events — reachable only in explicitly enabled mock mode | **2 — development-only demo** | KEEP (isolated by D2) |
| Prisma migrations overall (42) | schema evolution | none carry user/demo rows beyond the instrument catalog | — | KEEP |

**Findings**: no obsolete seeders found; **no seeder fabricates user data** — a fresh user receives zero trades/accounts (verified live: user A started empty before connecting an account); no `DELETE FROM`-style demo cleanup was needed or executed; migrations untouched.

---

## K. Security Findings

Non-destructive, code-review + live-verification only (no penetration testing of external systems):

- **Authentication**: argon2 hashing; access tokens 15-min, memory-only client-side; refresh rotation **single-use with family revocation on reuse** (live-verified — stronger than the spec's minimum); logout revokes server-side; TOTP MFA + recovery codes implemented (`otpauth`); rate limiter on identity routes (`AUTH_RATE_LIMITS`, `RATE_LIMITED` surfaced to the UI).
- **Authorization/ownership**: every resource read/write goes through user-scoped guards; live IDOR probes (read + delete cross-user) → 404 without disclosure; the e2e battery adds per-module ownership + negative-capability suites (`security-negative`, `security-capability-negative`).
- **Input validation**: Zod at every boundary (API DTOs, engine responses §54, sidecar contract); malformed JSON rejected with a consistent envelope (`{"error","message","requestId"}`); body-size limits (`BODY_LIMIT_BYTES`) and OCR upload limits + decompression-bomb pixel guard.
- **Cookies/CORS**: `cosmoz_rt` HttpOnly (+SameSite) — live-verified; CORS is an explicit allowlist and **`*` is rejected by the env schema in production**; helmet defaults on.
- **Secrets**: no `.env` tracked (only `.env.example` with placeholders); no hardcoded API keys/JWTs in runtime source or git history; local dev secrets generated fresh and gitignored; **the dev mailer redacts action URLs in production** (`redactActionUrl: config.isProduction`) so one-time tokens never land in persistent logs; MFA/provider-credential/webhook secrets each use their own AES-256-GCM key.
- **Dependency audit**: 23 → 9 advisories; the runtime-relevant set (next CRITICAL RCE + SSRF, fastify HIGH ×2) patched; the remaining 9 sit in dev-tooling chains (vitest/tinypool workers, eslint/shadcn `braces`, prisma CLI `deepmerge-ts`, build-time `source-map-js`, `sharp` optional dep of next, `@modelcontextprotocol/sdk` via the `shadcn` CLI package) — no confirmed exploitable runtime exposure; major-version upgrades deliberately avoided per spec.
- **Recommended follow-ups (owner actions)**: move `shadcn` from web `dependencies` to devDependencies (CLI tool, never imported at runtime — removes the MCP-sdk chain from the prod dependency tree); plan vitest/tinypool upgrade when a release window allows; keep `pnpm-workspace.yaml` fastify override until the transitive range resolves ≥5.12.7 naturally.

---

## L. Performance and Accessibility

- **Measured, not invented**: the API battery (1325 tests incl. every e2e booting a full Nest app on real Postgres) completes in ~3 minutes on this sandbox; the sidecar pytest (97 tests incl. real tesseract runs) in ~40 s; `next build` compiles 34 routes in ~17 s. Cold-start dashboard over the real API loads its data surface (me/preferences, stats/overview, trades, rules/status) within the same session with no failed requests.
- **Query hygiene** was audited in earlier phases (Phase 09: zero duplicate requests on the dashboard cold-load, no leaks) and remains in force (invalidation contract tests still green).
- **Accessibility**: Phase 10's dashboard pass (sr-only delta cues, aria associations, touch targets) is regression-guarded by the probes; the login/dashboard surfaces were exercised in a real browser this session with zero page errors. No screen-reader session was performed — **no site-wide WCAG compliance claim is made** (spec-conforming honesty).
- **Not performed**: controlled load testing (no production-scale environment) — reported as a remaining risk, not hidden.

---

## M. Defect Register

| ID | Severity | Component | Finding | Reproduction evidence | Fix | Regression test | Retest |
|---|---|---|---|---|---|---|---|
| D1 | P2 | mini-services/ocr-service | test_v2 collection ImportError (`enhance` never existed); V2 contract (trades / cropRegion / document route) unwired; regions in upscaled coords | baseline `pytest` run (1 collection error; 7 failures after unblock); git history (`git log -S "def enhance"` empty) | implemented `EnhanceMeta`+`enhance()`+size-preserving CLAHE; wired `trades`, `cropRegion` (offset regions, degenerate → `RESOURCE_LIMIT`), `/v1/recognitions/document`; `prepare_gray` shared chain + region rescale; conftest token bootstrap; label correction | the pre-existing test_v2 contract tests themselves (kept intact) + full pytest | **97/97** |
| D2 | P1 | apps/web | zero-env production build served MSW mock financial data as real | code path `API_MOCKED = env !== "false" && env !== "true"` (default-on) + MockProvider default | canonical mode matrix (prod default = real API), `API_BASE` derivation, docs | `mode.spec.ts` (8 tests) + CI mock-leakage guard | **169/169 + guard PASS + production browser session on real API** |
| D3 | P1 | deps | next 16.3.5 CRITICAL RCE (+SSRF high) in web runtime; fastify 5.11.3 HIGH ×2 in api runtime | `pnpm audit` baseline (23 advisories, paths mapped) | next → 16.3.8 (exact); fastify → 5.12.7 via `pnpm-workspace.yaml` override (pnpm 12 ignores package.json `pnpm.overrides` — documented) | lockfile diff reviewed; full battery rerun | audit 23→9 (dev-only); api **1325/1325**; build exit 0 |
| D4 | P2 | apps/api ocr adapter | `recognizeDocument`/`supportsDocuments` never implemented — document pipeline dead for the real sidecar | port.ts declares the capability; adapter had only `recognize` | implemented document route client + strict Zod schema | `fastapi-ocr-engine.spec.ts` (6 tests) | 51/51 selected unit files; full battery green |
| D5 | P3 | apps/web | `NEXT_PUBLIC_API_URL=""` (empty env var) would nuke `API_BASE` (`??` vs `||`) | mode.spec failure during D2 test authoring | `??` → `||` | covered by the mode/urls tests | 169/169 |

---

## N. Commands and Reproducibility

```bash
# Install (pnpm 12; prisma + embedded-postgres postinstalls approved)
corepack pnpm install --frozen-lockfile

# Typecheck + lint
corepack pnpm --filter @cosmoz/shared exec tsc -p tsconfig.json --noEmit
corepack pnpm --filter @cosmoz/api typecheck && corepack pnpm --filter @cosmoz/api lint
corepack pnpm --filter web exec tsc --noEmit && corepack pnpm --filter web exec eslint .

# Tests
CI=true corepack pnpm --filter @cosmoz/api test        # unit+e2e, embedded Postgres (cosmoz_test fail-fast)
corepack pnpm --filter web exec vitest run
cd mini-services/ocr-service && python3 -m pytest tests/ -q   # needs tesseract + requirements.txt

# Build + guards
corepack pnpm --filter web exec next build
node scripts/check-prod-mock-leakage.mjs               # in apps/web
corepack pnpm audit

# Live evidence (optional; needs: embedded dev DB, API :4000, sidecar :3004)
node scripts/render-ocr-fixture.py
node scripts/live-integration-evidence.mjs             # phase 1 (24 checks)
node scripts/live-integration-evidence.mjs -- --phase 2 # persistence after API restart
```

No command in this list targets a production database; destructive setup is confined to the fail-fast-guarded `cosmoz_test`.

---

## O. Remaining Risks and Blockers

1. **Broker integrations (OANDA v20 / Deriv WS)**: adapters + fixture-server contract tests pass; **no real broker was reachable** — live provider verification remains BLOCKED (unchanged from the Phase 11 classification; no code change this campaign).
2. **Market feed data quality**: the Bun market service runs and self-declares `binance: real` / `simulated: sim`; no independent data-correctness assertion against a reference feed was made (out of sandbox scope).
3. **OCR in production configuration**: verified here with the real sidecar running; a staging deployment must provision `OCR_SERVICE_URL`/`OCR_SERVICE_TOKEN` (and a real mail transport) — without them the system degrades honestly (OCR_UNAVAILABLE / redacted links), which is by design.
4. **Load & soak testing**: not performed; no performance-capacity claim is made.
5. **Dependency advisories (9)**: dev-tooling chains only; documented in §K with follow-ups.
6. **Accessibility**: no site-wide AA claim; no screen-reader session (Phase 10 dashboard pass + probes + this session's browser checks only).

---

## P. Final Readiness Verdict

**`READY FOR STAGING VALIDATION`.**

Rationale: every locally executable check passes (API 1325/1325 on real Postgres, web 169/169, sidecar 97/97, build + guards); the critical workflows were validated over real HTTP with independently computed expectations, including a REAL OCR end-to-end through the running sidecar and persistence across process restarts; the spec's central mock-removal mandate is implemented, documented, and CI-guarded; security boundaries were verified live (rotation reuse → family revocation, IDOR 404s, HttpOnly cookies, CORS allowlist, token redaction). This is NOT a production-ready claim: live broker verification, staging provisioning (OCR sidecar, mail transport, real Postgres), load testing, and the staging release checklist remain — exactly the work the verdict hands to the staging phase.
