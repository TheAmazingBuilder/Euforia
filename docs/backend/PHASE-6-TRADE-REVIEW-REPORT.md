# COSMOZ — BACKEND PHASE 6 REPORT

## Trade Review, Post-Trade Analysis & Journal Documentation

Status: **COMPLETE** — all Definition-of-Done items (§79) verified fresh; STOP per §83.

---

## 1. Audit Findings (§4)

Conducted before any code change:

- **Phases 0–5 verified present** (commits `78e30ac` → `7c34175`; 295/295 tests green at Phase 5 baseline): Foundation, Identity (JWT/MFA/sessions), Accounts (provider-agnostic read-only sync), Trading Core (`Trade` + `TradeExecution`, authoritative aggregation, `/api/v1/trades`), Trade Planning (`TradePlan` + risk engine + instrument catalog, `/api/v1/trade-plans`).
- **Frontend discovery (§71)**: `packages/shared/src/schemas/tradeReview.ts` is a complete MSW-mocked **Review-workspace contract** — review upsert (one per trade) with `executionGrade` A–F, `followedPlan`, `playbookMatch` (MATCHED/PARTIAL/OFF_PLAYBOOK), `checklistResults` (≤24), 1–5 quality scores, required `lessons`, `improvementNote`; derived PENDING/REVIEWED rows joined with trades; lessons library (REVIEW/TRADE_NOTE/JOURNAL sources); overview aggregate with a freeze-aware streak (1 grace day per Mon–Sun week), weekly grade trend (A=5…F=1, max 8 weeks), pending queue preview, `lastImprovementNote`, `goalsSummary`. Expected endpoints: `GET /reviews/overview`, `GET /reviews`, `PUT /reviews/:tradeId` (URL authoritative), `DELETE /reviews/:tradeId`, `GET /reviews/lessons`.
- **Second frontend surface, out of scope**: the trade-detail "Act 3" screen (`GET/PATCH /trades/:id/review` — MFE/MAE prices/lesson/tags written ONTO the Trade) and `/trades/:id/mistakes` belong to Trading Core capture + the Discipline domain (violations ledger, emotion matrix). Not implemented here (documented mismatch, no unsafe shortcut).
- **Backend gaps found**: no tag system, no attachment/file infrastructure, no generic audit table (`SecurityEvent` is identity-only), no event bus, no goals/daily-journal contexts. `Trade` has NO decisionGrade/strategyId/setupId/lessons/followedPlan/checklistSnap columns. The TradePlan↔Trade link was deliberately absent (Phase 5 schema note: "EXECUTED is the reserved seam").
- **Mock divergence noted**: the mock writes `trade.lessons`/`trade.followedPlan` back onto the trade on upsert — the real backend must NOT (§31/§66 red lines). The lessons library derives TRADE_NOTE entries from `Trade.notes` instead (read-only).

## 2. Existing Infrastructure Reused (§5)

- **Foundation**: `AppError` taxonomy (404-honest IDOR, 409, 422), `ZodValidationPipe`, global `JwtAuthGuard` + `@CurrentUser` principal, ROOT_LOGGER (pino, redacting), request-id correlation, Fastify + `/api/v1` URI versioning.
- **Identity**: `IdentityRepository.findUserById` → user timezone for streak/trend day-bucketing (same rule as Trade `tradingDate`); `tradingDateKey` (Trading Core) reused for tz-safe day keys — no second implementation.
- **Trading Core**: `TradingRepository` now exported (additive) as the context's public contract — read-only consumption of canonical trades. Write methods remain Trading-Core-internal discipline.
- **Trade Planning**: `TradePlanRepository` + `INSTRUMENT_SPECIFICATION_PROVIDER` exported (additive) — plan reads for linkage; the Phase 5 instrument catalog supplies pip sizes for pips-space deviations. **No plan is ever written by the review.**
- **Shared package**: the frontend's `tradeReview.ts` workspace schemas reused verbatim (§38 — no duplicate schemas); `decimal.js` (already a dependency) for exact decimal math; test harness (`buildTestApp`, `authenticatedUser`, embedded Postgres).

## 3. Files / Modules Changed

**Created — `apps/api/src/modules/trade-review/`** (bounded context, flat structure per Phase 0 §I):

| File | Responsibility |
|---|---|
| `domain/review-lifecycle.ts` | Explicit COMPLETED/ARCHIVED transition table + operation gates (pure) |
| `domain/plan-vs-actual.ts` | Plan-vs-actual comparison engine — objective deviations only (pure, Decimal) |
| `domain/plan-snapshot.ts` | Origin-plan snapshot freezer + defensive re-validation (pure) |
| `domain/review-streak.ts` | Freeze-aware streak + weekly grade trend + day-key helpers (pure) |
| `trade-review.repository.ts` | The ONLY Prisma touchpoint: narrow rows, joined workspace read models, conditional updates, P2002 create-race handling |
| `trade-review.service.ts` | Use cases: upsert / patch / archive / detail+comparison / list / overview / lessons |
| `trade-review.mappers.ts` | Rows → wire DTOs (the only persistence→contract translation) |
| `trade-review.controller.ts` | 7 thin routes under `/api/v1/reviews` |
| `trade-review.module.ts` | Wiring; imports Identity/Trading/TradePlanning public contracts |

**Modified (additive only)**: `packages/shared/src/schemas/tradeReview.ts` (Phase 6 backend contracts appended; `upsertReviewInputSchema` += optional `originTradePlanId`; reviews `meta` += optional pagination keys; **contract-bug fix**: `lessonEntrySchema.id` widened to opaque string — the product's `note-<tradeId>` TRADE_NOTE keys are not uuids, mock-established vocabulary); `prisma/schema.prisma`; `app.module.ts`; `trading.module.ts` (+export); `trade-planning.module.ts` (+exports).

**Tests**: `test/unit/review-lifecycle.spec.ts` (6), `test/unit/plan-vs-actual.spec.ts` (15), `test/unit/review-streak.spec.ts` (9), `test/e2e/trade-reviews.e2e.spec.ts` (27).

**Docs**: this report. Commit: `feat(backend): Phase 6 — trade review, post-trade analysis & journal documentation`.

## 4. Database Changes (§39–§42)

- **New enums**: `TradeReviewStatus` (COMPLETED | ARCHIVED), `ExecutionGrade` (A–F), `PlaybookMatch` (MATCHED | PARTIAL | OFF_PLAYBOOK) — DB-level enum constraints (§41).
- **New model `TradeReview`**: 1:1 with `Trade` (`tradeId @unique` backs the upsert and the create/create race); user FK cascade; status default COMPLETED; user-reported payload (executionGrade, followedPlan, playbookMatch, checklistResults JSONB, three 1–5 qualities, lessons, improvementNote); plan linkage (`originTradePlanId` FK, `planSnapshot` JSONB with **decimal strings** — json numbers lose precision, §40); `reviewedAt` (the streak/trend clock), `archivedAt` (soft-undo), timestamps.
- **Indexes (real access patterns only, §42)**: `tradeId` unique (1:1 + point lookup); `(userId, status)` (workspace scans); `(userId, reviewedAt DESC)` (streak/trend/last-improvement queries). No index on `originTradePlanId` — no such query pattern yet.
- **No changes** to Trade, TradeExecution, TradePlan, Accounts or Identity tables. Relation additions are declaration-only (`User.tradeReviews`, `Trade.review`).
- Migration `20261003145823_trade_review` applied to dev; test DB applies via the global setup.

## 5. API Contracts (§34/§35/§37/§70)

All routes require authentication (global guard). Errors use the stable envelope `{error, code?, message?, issues?, requestId?}`.

| Route | Semantics |
|---|---|
| `GET /api/v1/reviews/overview` | Workspace aggregate: stats (closed/reviewed/pending, reviewRatePct, grade distribution, quality averages, lessonsCaptured, streak, followedPlanPct, offPlaybookCount), goalsSummary (honest zeros — deferred), weeklyGradeTrend, recentLessons (≤6), pendingQueuePreview (≤5), streak breakdown, lastImprovementNote |
| `GET /api/v1/reviews` | REVIEWED ⊕ PENDING rows, newest trading day first, reviewed-first on ties; `page`/`limit` (default 200, max 500); meta `{generatedAt, total, page, limit, hasMore}` (extra keys zod-strip-safe for the current frontend) |
| `GET /api/v1/reviews/lessons` | Lessons library: REVIEW ∪ TRADE_NOTE, newest first (JOURNAL source deferred) |
| `GET /api/v1/reviews/:tradeId` | Detail: `{review, tradeSummary, planSummary, comparison}` — canonical trade summary + frozen plan context + computed comparison (§70 response shape) |
| `PUT /api/v1/reviews/:tradeId` | Upsert (create / edit / reactivate). URL tradeId authoritative — a body tradeId is ignored (never trusted, §24). Returns the workspace row |
| `PATCH /api/v1/reviews/:tradeId` | Partial edit, merge semantics; archived rows are honest 404s |
| `DELETE /api/v1/reviews/:tradeId` | Archive (undo): `{ok: true}`; trade returns to PENDING; row preserved |

Error codes (`TRADE_REVIEW_ERROR_CODES`): `TRADE_REVIEW_TRADE_NOT_FOUND` (404), `TRADE_REVIEW_NOT_FOUND` (404), `TRADE_REVIEW_TRADE_NOT_REVIEWABLE` (422), `TRADE_REVIEW_PLAN_NOT_FOUND` (404), `TRADE_REVIEW_PLAN_MISMATCH` (422), `TRADE_REVIEW_CONCURRENT_MODIFICATION` (409), `TRADE_REVIEW_INVALID_STATE` (422).

## 6. TradeReview Lifecycle (§10/§31/§32/§33)

- **States actually justified by the product**: `COMPLETED` (active; workspace "REVIEWED") and `ARCHIVED` (the soft-undo behind DELETE). **No DRAFT** — the product's upsert flow creates completed reviews directly (§10: "only implement states that are actually justified").
- **Transitions** (explicit table, enforced by conditional updates): `COMPLETED → ARCHIVED` (DELETE), `ARCHIVED → COMPLETED` (a fresh PUT re-review). Editing (PUT/PATCH) does not move status; `updatedAt` + structured logs are the audit trail (§33: no revision history).
- **Reactivation is a FRESH completion**: missing optional fields reset to null (never silently revived from the archived row) and `reviewedAt` advances — the streak/trend clock starts a new day.
- **Completion flow (§31)**: authenticate (guard) → verify trade ownership → verify eligibility (CLOSED, not soft-deleted) → validate payload (Zod) → validate referenced plan (ownership + symbol) → persist → structured audit log → (comparison derived on read).
- **Merge semantics (mock parity)**: on edits, omitted AND explicit-null optional fields keep their stored values; required fields (grade/followedPlan/playbookMatch/lessons) are always overwritten.

## 7. Plan-vs-Actual Comparison Implementation (§12/§26/§27/§28/§54/§55)

- **Linkage**: the review owns `originTradePlanId` (not the Trade — Phase 4 schema stays untouched). The client links an existing plan explicitly (`originTradePlanId` in the save payload); the backend validates plan **ownership** (IDOR → 404) and **symbol consistency** (422 mismatch), then **freezes** a snapshot of the comparison-relevant plan values (entry/stop/TP/sizeMode/sizeValue/riskAmount/riskPercent/positionSize/rrRatio/status + instant) at save time. Plans stay mutable in DRAFT/PLANNED — the snapshot preserves what the review actually compared against (§26 historical integrity, tested). `null` detaches.
- **Engine** (pure domain function): dimensions = direction (match), entry, stop, target, risk (money), size (lots), R. Output per leg: `{planned, actual, deviation (signed actual−planned), deviationPips, available}`. Deviations are exact `Decimal` arithmetic on decimal strings; pips are computed only for price-space legs via the instrument catalog (unknown symbol → null pips) at 0.1-pip resolution.
- **R semantics (§28)**: planned = the plan's canonical `rrRatio` (Phase 5 engine), actual = the canonical `rMultiple` (Trading Core aggregation). No new risk math anywhere.
- **No judgments (§55/§56)**: no tolerance labels, no quality scores, no `profit → good trade` rule. Process quality stays user-reported (`followedPlan`, `playbookMatch`, `checklistResults`, A–F grade) — the e2e proves an F grade can coexist with a profitable outcome.
- **No-plan trades (§67)**: the review fully functions; `comparison.basedOn = "NONE"`, plan legs unavailable, actual legs still echo canonical trade facts.
- **Derived on read**: comparison output is never persisted (§26 — prefer references; the only denormalization is the justified snapshot).

## 8. Review Data Model (§59/§60)

Strongly modeled columns for everything queryable or invariant-bearing (status, grade, followedPlan, playbookMatch, qualities, lessons, plan linkage, clock columns). JSONB only for: `checklistResults` (bounded ≤24 pass/fail items — a frozen user-reported list, not a domain invariant) and `planSnapshot` (frozen values as decimal strings). No opaque "giant JSON blob" — the core aggregate remains queryable (§59).

## 9. Security Protections (§36/§61/§62/§73)

- **Ownership chain** on every route: authenticated principal → trade ownership (Trading Core repository, userId-in-query) → review ownership (userId in every review query). Client-supplied `userId`/`tradeId`/`accountId`/`planId` are never trusted: the body `tradeId` is ignored in favor of the URL (proven by test).
- **IDOR resistance** (§65): user A ↔ user B battery — read/edit/complete/archive/detail/list/overview/lessons all scoped; foreign trades and foreign plans are honest 404s (`TRADE_REVIEW_TRADE_NOT_FOUND` / `TRADE_REVIEW_PLAN_NOT_FOUND`).
- **Input validation**: Zod schemas at the boundary (grades A–F, qualities 1–5, checklist ≤24, lessons 3–4000 chars, uuid params); invalid payloads → 400 with issue lists.
- **Privacy (§62)**: reviews are strictly private — workspace list/overview/lessons/detail are per-user; structured logs carry ids only (userId/tradeId/reviewId/requestId), never reflection content; leakage scans assert no `prisma`/`password`/`select`/SQL fragments in responses.
- **No new file/attachment surface** — therefore no storage-credential or path-traversal exposure (§23/§61 deferred with attachments).
- **State-transition validation**: lifecycle gates + conditional updates; archived rows are invisible (404), never resurrectable through PATCH.

## 10. Immutability Protections (§11/§66)

- **Architecture**: the review context has NO write path to `Trade`, `TradeExecution` or `TradePlan` — the service consumes Trading Core's repository for reads only, and nothing in the module can persist to those tables.
- **The critical test** (§66): a full review lifecycle (create with plan linkage → edit → detail/list/overview/lessons reads → archive → reactivate) is bracketed by byte-stable snapshots of the raw `Trade` + `TradeExecution` + `TradePlan` rows — **all identical before/after** (provider ids, prices, quantities, commissions, swaps, fees, timestamps, P&L, plan configuration unchanged).
- **Financial truth (§29/§15)**: review payloads echo canonical values; the review has NO user-writable P&L/R fields, so `profit → good trade` cannot be claimed (process grade F on a profitable trade is expressible and tested).
- **Duration** (§30): canonical `durationSeconds` is computed from execution timestamps (`entryAt → exitAt`); reviews add only qualitative fields, never numeric overrides.

## 11. Tests Executed (§64–§69)

**Unit (30)**: lifecycle transitions/gates (6); comparison engine — exact adherence, entry/stop/risk/size deviations, pips, R gap, direction mismatch, missing legs both sides, no-plan, null pips, decimal integrity incl. 0.00005 exactness (15); streak — grace-freeze rules, week caps, longest pure run, day-key math, weekly trend windows (9).

**e2e over the real stack (27)**: authentication boundary (401 on all 7 routes); eligibility (OPEN → 422, unknown/soft-deleted → 404, invalid uuid → 400); upsert create with contract-validated rows; merge semantics (re-PUT, explicit-null keeps, PATCH partial, at-least-one-field); archive + invisibility + fresh reactivation; workspace list ordering/ties/pagination meta; overview stats incl. streak/trend/preview and the empty-user honesty case; lessons union incl. `note-` ids; detail + NONE comparison; SNAPSHOT comparison across all six dimensions incl. unavailable realized-R; **snapshot freeze under later plan edits**; linkage validation (foreign 404 / symbol 422 / detach); IDOR battery; workspace privacy; forged body tradeId ignored; leakage scans; **immutability battery** (byte-stable canonical rows across the whole lifecycle).

## 12. Verification Results (§80)

Fresh runs at completion:

| Check | Result |
|---|---|
| api typecheck (`tsc --noEmit`) | ✓ |
| api lint (eslint src + test) | ✓ 0 problems |
| api build (`tsc -p tsconfig.build.json`) | ✓ |
| shared typecheck | ✓ |
| web typecheck (frontend untouched) | ✓ |
| prisma validate + migrate (dev DB) | ✓ |
| **full test suite** | ✓ **352/352** (23 files — Phase 1–5 regression incl.) |

Failures encountered during development were fixed in scope (repository DI decorator, enum casts, merge semantics, pips on price-space legs only, contract `lessonEntry.id` widening); the two test bugs the engine caught (pip arithmetic, decimal-string normalization) were fixed in the tests.

## 13. Known Limitations

1. **Goals engine deferred**: `goalsSummary` returns honest zeros and `/goals` endpoints remain MSW-only. Goal progress (win-rate/R-earned/discipline %…) is cross-trade aggregation — the Analytics boundary (§47) — recommended as its own phase.
2. **Realized R is fixture-scarce**: manual closes and imports carry no computed P&L (Phase 4 canonical rule — profits come from provider deals), and the mock provider's deal stream currently produces only OPEN positions; the R leg's actual side therefore stays null in e2e fixtures and lights up with real closed provider history (engine fully unit-tested).
3. **Tags / attachments / screenshots** (§22/§23): no backend tagging or file infrastructure exists — nothing duplicated, nothing built ahead of a product decision; the frontend's Act-3 tag flow stays mocked.
4. **JOURNAL lesson source** deferred (no daily-journal backend context).
5. **Frontend sync divergence**: the mock writes `trade.lessons`/`trade.followedPlan` back to the trade; the real backend keeps lessons in the review and derives TRADE_NOTE entries from `Trade.notes` (read-only). Contract shapes are unaffected.
6. **Act-3 endpoints** (`GET/PATCH /trades/:id/review`, mistakes confirm/dismiss) remain mock-only — they belong to Trading Core capture + a future Discipline context.
7. **Concurrency**: upsert/edit races are guarded by conditional updates + the unique constraint (409 on lost races); true multi-tab simultaneous-write conflict signalling (version field) is not in the product contract.

## 14. Architectural Decisions

1. **Three-layer integrity (§2/§3/§77)**: `TradePlan → Trade → TradeReview` with strict ownership — the review is an interpretation layer that reads plans and trades and owns only interpretation.
2. **Review-owned plan linkage**: `originTradePlanId` lives on TradeReview (Trade schema untouched — Phase 4 territory stays closed), with a frozen snapshot justified by §26 because plans are mutable in DRAFT/PLANNED.
3. **Lifecycle minimalism**: COMPLETED/ARCHIVED only — DRAFT rejected as product-unsupported; DELETE = archive (journal-history-never-deleted philosophy, Phase 4 §57 precedent) with reactivation via fresh PUT.
4. **Public-contract consumption**: additive exports of `TradingRepository` and `TradePlanRepository` + the spec-provider token (mirrors the Phase 4 `AccountsRepository` precedent); zero changes to other contexts' internals.
5. **Workspace read models owned by the review context**: the REVIEWED ⊕ PENDING join projection lives in the review repository (review-owned read model, not an ownership transfer; Trading Core remains the exclusive writer).
6. **Contract-first reuse**: the frontend's `tradeReview.ts` is the contract — extended additively (originTradePlanId, pagination meta, Phase 6 response schemas, error codes) rather than duplicated; one contract bug fixed (lesson id opacity).
7. **Objective facts vs subjective interpretation**: the engine emits deviations only; adherence stays user-reported — no tolerance constants, no composite scores (§55/§56).
8. **Observability as audit (§46/§63)**: structured events `trade_review.{created,updated,archived,comparison_generated}` with safe ids; no new audit system invented (§5).

## 15. Recommended Next Phase

**Goals & Review Analytics** — the natural continuation inside the established boundaries:

1. **Goals bounded context**: goal CRUD + the server-side progress engine (WIN_RATE, R_EARNED, AVG_R, PROFIT_TARGET, FOLLOWED_PLAN_PCT, MAX_TRADES_PER_DAY, MAX_DAILY_LOSS_R, DISCIPLINE_SCORE) computed over closed trades + daily stats; the review workspace's `goalsSummary` and `/goals*` endpoints light up without contract changes.
2. **Generic tagging context** (shared by trades, reviews, playbooks) — unlocks the Act-3 tag flow and review tag filters.
3. **Attachment/file infrastructure** for review screenshots (entry/exit/chart annotations) behind ownership-validated references.
4. **Discipline context** (rule engine, violations, Mistake Ledger, emotions) — consumes review observations as inputs; auto-detection joins live on trades.
5. **Provider history backfill** for closed-position P&L so realized R (and the R-deviation leg) becomes data-populated for synced accounts.

STOP — per §83, Phase 7 is not started.
