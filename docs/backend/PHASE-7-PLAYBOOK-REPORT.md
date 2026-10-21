# COSMOZ — BACKEND PHASE 7 REPORT
## Playbook: Strategies, Setups, Rules, Checklists & Trading Framework

Verification stamp: **398/398 tests green (26 files) · api typecheck ✓ lint ✓ build ✓ · shared tsc ✓ · web tsc ✓ · migration applied (dev + test DBs) · commit after `41ad710`**. No FastAPI change, no frontend change, no shared-contract change.

---

## 1. Audit findings

The mandatory audit (§5) was performed before any code was written.

**Backend state.** Phases 0–6 were confirmed complete in the repository (reports in `docs/backend/`, 352/352 tests at Phase 6, worklog corroborated). Conventions binding this phase, extracted from the existing contexts: Fastify + `/api/v1`, global `JwtAuthGuard` + `@CurrentUser`, `ZodValidationPipe` → `400 { error: "ValidationError", issues }`, `AppError` taxonomy (404 honest IDOR, 409 Conflict, 422 BusinessRule), flat bounded-context module (ONE repository = only Prisma touchpoint, narrow rows, application service, thin controllers, mappers), vitest + embedded-postgres (`cosmoz_test`) with `buildTestApp`/`authenticatedUser` helpers.

**Cross-context seams found.** `TradePlan.strategyId` exists as a deliberately plain-uuid, non-FK column ("Playbook backend does not exist yet" — Phase 5 note). The `Trade` model carries NO playbook attribution columns (`strategyId`, `setupId`, `strategyVersion`, `outOfPlaybook`, checklist snapshot) — the frontend MSW contract (`schemas/trade.ts`) expects them but the backend's Trading Core contract (`schemas/trading-core.ts`) never implemented them.

**Frontend state (§87).** The frontend already owns a COMPLETE Playbook surface: one page with 7 tabs (`/playbook?tab=…`), 18 components, 23 endpoints mocked in MSW, and the binding shared contracts (`schemas/playbook.ts`, `playbook-blocks.ts`, `strategy.ts`, `api.ts` StrategyStat). Critically, **the product model differs from the hierarchy suggested in the phase prompt** — per §4/§8 the audited product reality was followed, not the suggestion:

| Prompt suggestion | Product reality (audited) | Decision |
|---|---|---|
| `Playbook` container aggregate | No container entity — "Playbook" is the bounded context + UI page | Aggregate root = **Strategy** (§8 forbids a meaningless wrapper) |
| StrategyVersion lifecycle DRAFT→PUBLISHED→ARCHIVED (§11–13/§56) | Freeze-before-mutation: `version` counter + full-definition snapshot frozen BEFORE each definition edit | Implemented as the product does; publish workflow NOT created (not justified, documented) |
| Statuses DRAFT/ACTIVE/ARCHIVED (§10) | Product vocabulary **DRAFT / ACTIVE / PAUSED / RETIRED** (already in shared enums; RETIRED = archive semantic) | Existing vocabulary wins (Direction BUY\|SELL precedent) |
| Setup sub-hierarchy with server reordering (§44) | Flat setup rows; checklist item order = array order, client-managed | No reorder endpoints invented |

## 2. Existing functionality reused

- **Contracts verbatim, zero changes** (§51): `createStrategyInputSchema`/`updateStrategyInputSchema` (`strategy.ts`), `extendedStrategySchema`, `setupSchema` + inputs, `checklistTemplateSchema` + inputs, `playbookRuleSchema` + inputs, `playbookOverviewResponseSchema` (incl. `complianceSummarySchema`, `strategyHealthSchema`), `setupInsightsResponseSchema`, `strategyVersionsResponseSchema`, `playbookTemplatesResponseSchema`, `StrategiesStatsResponse` (`api.ts`), enums (`strategyStatusSchema`, `strategyGradeSchema`, `tradingStyleSchema`, `assetClassSchema`, `marketConditionSchema`…). No schema was added, altered, or duplicated.
- **Foundation**: error taxonomy, `ZodValidationPipe`, global guard, `CurrentUser`, ROOT_LOGGER, Prisma lifecycle, request-id.
- **Cross-context public contracts** (Phases 4–6 precedent): `TradingRepository.listTrades` (compliance window), `AccountsRepository.listAccountsByUser` (overview currency), `TradePlanRepository` (reference counting — one ADDITIVE method), `TradeReviewRepository` (ADDITIVE module export — the module previously exported `[]`).
- **checklistItem vocabulary**: the Phase-5-reused `{id,label,required}` shape is the canonical checklist item; checklist EVALUATION stays frozen in `TradePlan.checklist` (§23 boundary respected — no second checklist engine, §6).

## 3. Files / modules changed

**New — `apps/api/src/modules/playbook/`** (bounded context):
- `domain/strategy-versioning.ts` — the 13 definition fields, `touchesDefinition`, freeze reason (pure).
- `domain/strategy-health.ts` — completeness flags (pure, factual only).
- `domain/playbook-templates.data.ts` — 10-template reference library verbatim from the product.
- `playbook.repository.ts` — only Prisma touchpoint: 5 tables, narrow rows, ownership in every query, transactional freeze & delete.
- `playbook.mappers.ts` — rows → wire (ISO-Z timestamps, JSON columns → contract shapes).
- `playbook.service.ts` — 23 use cases, ownership from principal, versioning orchestration, honest-seam read models.
- `controllers/{strategy,setup,checklist,playbook}.controller.ts` — thin; static routes before `:id`.
- `playbook.module.ts` — imports Trading/TradeReview/TradePlanning/Accounts for READS through public contracts only.

**Modified (additive)**: `prisma/schema.prisma` (+5 models, User relations); `app.module.ts` (wiring); `trade-plan.repository.ts` (`countStrategyReferences`); `trade-review.module.ts` (`exports: [TradeReviewRepository]`).

**New tests**: `test/e2e/playbook.e2e.spec.ts` (34), `test/unit/strategy-versioning.spec.ts` (6), `test/unit/strategy-health.spec.ts` (6).

## 4. Database changes

Migration `20261003160138_playbook` (dev applied; test DB applied via global-setup). **No existing table or column was altered.**

- `Strategy` — typed columns for invariants (status/name/grade/version/color, markdown bodies), JSON columns for Zod-validated definition blocks (marketProfile, entryConditions, confirmations, risk, tradeManagement, exitPlan, tags, invalidations, marketConditions) — structured parameter definitions, NOT an untyped JSON domain (§32). Indexes `(userId, status)`, `(userId, updatedAt desc)`.
- `StrategyVersionSnapshot` — immutable full-definition freeze; `@@unique([strategyId, version])` (concurrency arbiter) + `(strategyId, version desc)` index; cascade on strategy delete.
- `Setup` — FK `strategyId` (cascade); indexes `(userId, strategyId)`, `(strategyId)`.
- `ChecklistTemplate` — nullable `strategyId` (null = global template); indexes `(userId)`, `(strategyId)`.
- `PlaybookRule` — scope/category typed columns; indexes `(userId, scope)`, `(strategyId)`.

## 5. Strategy model

Aggregate root (§8 decision documented). Properties: identity (id/userId), lifecycle (`status` DRAFT|ACTIVE|PAUSED|RETIRED — free PATCH transitions, no state machine invented), presentation (name, grade A_PLUS|A|B|C|null, color), definition (13 fields: description, markdown bodies ×3, detailedDescription, marketProfile, marketConditions, entryConditions, confirmations, invalidations, risk, tradeManagement, exitPlan), `version` counter. Grade is a teaching label, NEVER a profitability claim (§82). Multi-instrument and timeframe scope live in `marketProfile` (§28/§29 — existing product vocabulary, no second taxonomy).

## 6. Versioning model

Freeze-before-mutation (§17): a PATCH touching any of the 13 definition fields freezes the CURRENT full wire shape into `StrategyVersionSnapshot` (version = prior, reason "Edited in the Playbook") and bumps the counter — in ONE transaction, BEFORE the mutation. Lifecycle/presentation fields (name/status/grade/color/tags) mutate in place. Versions are created **implicitly on material definition change** (§13 answer documented); no manual/publish/activation model exists. Snapshots are immutable; `GET /strategies/:id/versions` resolves newest-first + `currentVersion` (§70). Concurrent definition edits arbitrate on the unique constraint → 409 (§91). **No TradePlan.strategyVersionId yet** — TradePlan carries the plain strategyId reference; version pinning of plans/trades is the documented Trading-Core seam (§12 note in report §17 below).

## 7. Setup model

Owned child of Strategy (ownership enforced at domain AND persistence: FK + ownership-scoped lookups; orphan setups impossible, §15). Fields per contract: name, status, description, context, marketCondition, trigger, confirmation, entryModel, stopModel, targetModel, **invalidation** (critical per product), notes, tags. List ordering alphabetical (product parity). Deletion: standalone delete + cascade with the parent strategy.

## 8. Rule model

`PlaybookRule` — portfolio (GLOBAL) or strategy-scoped (STRATEGY). Categories: RISK | SESSION | NEWS | BEHAVIOR | EXECUTION | CUSTOM (§17 taxonomy of the contract — no dozens of categories invented, §17 of prompt). Structure: title/detail (bounded text) + `evaluatable`/`evaluationHint` as INFORMATIONAL flags for a future engine. **No evaluation of any kind happens in this context** (§19/§20/§64): no expression language, no DSL, no indicator math, never any execution of user-provided code. Scope invariant enforced (STRATEGY ⇒ owned strategyId, 422; forged parent → 404).

## 9. Checklist model

`ChecklistTemplate` = the canonical DEFINITION owner (§22): global (strategyId null) or strategy-scoped, ≤24 items `{id,label,required}`, array order IS the order, items replaced WHOLESALE (product semantics). EVALUATION separation (§23): evaluations are frozen snapshots owned by consumers — `TradePlan.checklist` (Phase 5) and the future Trade checklist snapshot; template edits never rewrite history (e2e-asserted). Versioning of checklists rides the strategy snapshots for scoped templates; NO independent second versioning system was introduced (§24).

## 10. API contracts (23 endpoints, product-verbatim)

Strategies: `GET /strategies` · `POST /strategies` (201) · `PATCH /strategies/:id` · `DELETE /strategies/:id` ({ok:true}) · `POST /strategies/:id/duplicate` (201) · `GET /strategies/:id/versions` · `GET /strategies/stats` (declared BEFORE `:id`). Setups: `GET /setups` · `GET /setups/insights` (before `:id`) · `POST /setups` (201) · `PATCH /setups/:id` · `DELETE /setups/:id`. Checklists: `GET/POST /checklists`, `PATCH/DELETE /checklists/:id`. Playbook: `GET /playbook/overview` · `GET /playbook/templates` · `POST /playbook/templates/instantiate` (201, 404 unknown key) · `GET/POST /playbook/rules`, `PATCH/DELETE /playbook/rules/:ruleId`.

Responses are contract-direct (entities, `{strategies|setups|checklists|rules|templates}`) — no envelope (product/client convention, differs deliberately from Phase 5's `{tradePlan}` wrapper). Errors use the shared AppError envelope `{error, message?, issues?, requestId?}` — `body.error` is user-facing copy. POST creation answers 201; DELETE answers `{ok:true}`. Pagination was NOT added to playbook collections: the product has none (§66 satisfied by construction — these collections are small by nature; the prompt's "use existing pagination conventions" applies to large collections, which the auditor determined playbook lists are not).

## 11. Trade Planner integration

`TradePlan.strategyId` (Phase 5) now resolves against a real backend: plans reference Playbook strategies, and the reference is protected — deletion of a referenced strategy returns 409 (guard via `TradePlanRepository.countStrategyReferences`, ownership-scoped). The planner contract needs no change; no strategy data is copied into plans (§38); checklist evaluations in plans remain frozen Phase-5 snapshots independent of template edits.

## 12. Trade Review integration

`TradeReview.playbookMatch` (Phase 6) feeds the Playbook's live compliance read model: last-20-closed-trades window × review verdicts (through the two public repositories — no duplicated journal reading). `GET /playbook/overview.compliance` = `{windowSize:20, reviewed, matched, partial, offPlaybook, unreviewed, scorePct = matched/reviewed×100|null}` — MATCHED-only scoring, unreviewed reported not judged (product contract verbatim). Historical strategy references from reviews remain resolvable through the version snapshots (§72).

## 13. Historical integrity protections

- Freeze-before-mutation guarantees every past definition is resolvable forever (e2e: two edits → v1 AND v2 snapshots resolve exactly; re-read is byte-identical — immutability asserted).
- RETIRED (archive semantic) preserves all references; e2e: retire + edit cycles leave `TradePlan.strategyId` resolvable and snapshots intact.
- Deletion guard: referenced strategies are undeletable (409); unreferenced strategies delete WITH children (product semantics — snapshots cascade).
- No strategy name is used as identity anywhere — IDs only (§43). Contract §98's full v1→Trade→TradeReview scenario remains open on the Trade side pending the Trading Core attribution columns (below) — the Playbook-side resolution chain is fully tested.

## 14. Security protections

Global authentication on all 23 routes (no @Public); userId ALWAYS from the principal, never the client (§33/§68); every query ownership-scoped — foreign ids are honest 404s across strategies/setups/checklists/rules/versions/duplicate/delete (IDOR battery, e2e A↔B); forged parent references rejected (setup→strategy, checklist→strategy, rule→strategy: 404/422); rule scope invariant (STRATEGY without strategyId → 422); Zod validation on every body (400 with issues); no Prisma models, no stack/SQL/secrets in any payload (leakage scan e2e); 409 on concurrent definition edits (lost-update protection); templates/instantiate create private DRAFTs — strategy = private by default, NO sharing/marketplace (§34). **Rule-expression security (§63/§64)**: no evaluator exists; `evaluatable` is metadata.

## 15. Tests executed

- **Unit (12)**: `strategy-versioning.spec.ts` — 13-field freeze matrix, in-place fields, explicit-null semantics; `strategy-health.spec.ts` — every flag, 30-day recency boundary, risk-all-null rule, own-vs-global checklist logic.
- **E2E (34, real DB, real AppModule)**: auth boundary (7 surfaces); strategy CRUD + defaults + 400/422 validation; versioning freeze/immutable/history; duplicate (children new ids, history doesn't follow); deletion (cascade, 409 plan-referenced, retire path); setups CRUD + parent guards + ownership; checklists global/scoped/wholesale/ownership; rules scope invariant + forged parents; templates (10 cards, pre-filled DRAFT, name override, 404); overview (empty honest zeros, counts/health on real definitions, live compliance with a real closed trade + review via the REAL trading/review flows, currency from the real account); honest stats seam; historical integrity across the planner seam; leakage scan.
- **Regression**: full suite 26 files — all Phase 1–6 suites green alongside Phase 7.

## 16. Verification results (fresh runs)

| Gate | Command | Result |
|---|---|---|
| Unit + e2e | `vitest run` | **398/398 passed (26 files)** |
| Typecheck | `tsc -p tsconfig.json --noEmit` | ✓ (api, shared, web all clean) |
| Lint | `eslint src test` | ✓ |
| Build | `tsc -p tsconfig.build.json` | ✓ |
| Migration | `prisma migrate dev` + test global-setup | ✓ applied, schema up to date (7 migrations) |

Failures encountered during development were root-caused and fixed in-scope: Prisma JSON null sentinels (JsonNull for nullable columns), one missing route-ordering guard, blank-name guards added to create paths (422), test corrections after convention decisions (404 honest parent lookups vs MSW's 422; review PUT requires `tradeId` in body per shared schema; accounts rate-limiter → account reuse in tests).

## 17. Known limitations (documented seams — NOT silent gaps)

1. **Trading Core attribution**: `Trade` has no `strategyId`/`setupId`/`strategyVersion`/`outOfPlaybook`/checklist-snapshot columns. Consequence: `recentlyUsed` is honestly empty; `performanceSummary` is honest zeros (real account currency); `SetupInsights` are real rows with honest empty metrics (`smallSample: true`); `GET /strategies/stats` returns `[]`/`null` (product skips strategies with zero attributable trades — equivalent honest result). Trade-side version pinning (`Trade.strategyVersion` freeze, §21 of the contract) and the full §98 Trade-level scenario land with the Trading Core evolution phase.
2. **MSW mismatch (§87 documented)**: the mock answers 422 for unknown parent strategies; the backend answers the safer honest 404 (IDOR convention) — the client renders `body.error` either way. The mock's "trades attached" 409 on strategy deletion is implemented as the plan-referenced 409 (the only enforceable backend-truth today); it strengthens to include trades when attribution columns exist.
3. **Template library duplication**: the template content currently lives in the backend domain file AND the frontend mock seed; the mock keeps its copy because the frontend was not to be touched (§87). Converge onto a shared source when the frontend is wired.
4. `TradePlan.strategyVersionId` pinning: deferred with the Trading Core seam (§38 note); today plans reference the strategy id, history is resolvable via snapshots.

## 18. Architectural decisions

1. Aggregate = **Strategy**; "Playbook" is the bounded context, not an entity (§8).
2. **Freeze-before-mutation versioning** over a publish lifecycle — product-driven (§13/§56 answered: implicit on definition change; no publish workflow).
3. Existing product vocabulary over prompt suggestions (status enum; Direction precedent).
4. JSON columns ONLY for Zod-validated structured blocks; invariants stay typed columns (§32).
5. Cross-context access strictly through public repositories (one additive method, one additive export — no ownership transfer, §104).
6. Honest read models over fabricated data (Phase 6 goalsSummary precedent).
7. No pagination on small owned collections; no caching (§101); no events without consumers (§74 — structured logs instead: `playbook.strategy.{created,version.frozen,duplicated,deleted}`, `playbook.setup.*`, `playbook.checklist.*`, `playbook.rule.*`, `playbook.template.instantiated` — ids only, never content, §75).
8. Dependency flow non-circular: Playbook → (reads) Trading, TradeReview, TradePlanning, Accounts; nothing depends on Playbook yet (§105).

## 19. Recommended next phase

**Phase 8 — Trading Core attribution evolution**: add `Trade.strategyId / setupId / strategyVersion / outOfPlaybook / checklistSnap` (additive migration + `trading-core.ts` contract evolution + manual-capture paths), then light up the dormant Playbook read models (recentlyUsed, performanceSummary, insights, stats, full §98 Trade-level scenario). This is the smallest change that unlocks the largest product value (Analytics-grade playbook performance), and every consumer is already built and waiting behind the honest seams. Alternative: Session Live context (consumes active strategies/setups — public contract already clean for it).
