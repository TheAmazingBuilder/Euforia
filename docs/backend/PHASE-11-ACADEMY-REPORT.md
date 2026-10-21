# COSMOZ — PHASE 11 REPORT: Academy & Trading Education Platform

Status: **DONE — Phase 9 (Backtesting) remains DEFERRED.** This report follows the
Phase 11 §94 return contract (13 sections). No next phase was started.

---

## 1. Academy functionality implemented

The education bounded context lives at `apps/api/src/modules/academy/` and serves the
product's full learner surface — **28 routes** under `/api/v1/academy`, all
authenticated (global JwtAuthGuard), all route vocabulary verbatim from the audited
frontend (`lib/api/endpoints.ts` — nothing invented):

| Group | Routes | Behaviour |
|---|---|---|
| Catalog / guidance | `GET /catalog`, `/overview`, `/progress` | Authored catalog + derived per-user progress, continue-learning/resume, weekly habit loop, rule-based recommendations, recent completions |
| Courses / lessons | `GET /courses/:courseId`, `GET /lessons/:lessonId`, `POST /lessons/:lessonId/complete`, `POST /lessons/:lessonId/checkpoint`, `PUT /lessons/:lessonId/notes` | Course detail with lesson list; full lesson body (visual blocks) + answer-stripped inline checkpoint; idempotent completion; server-graded checkpoint; personal note (empty text clears) |
| Quizzes | `GET /quizzes/:quizId`, `POST /quizzes/:quizId/attempts` | Public questions (answers stripped); server-side grading with previousBest tracking |
| Glossary / search | `GET /glossary?q=`, `/search?q=`, `/scenarios` | In-memory search over authored content; scenario library served verbatim |
| Bookmarks | `GET /bookmarks`, `POST /bookmarks` | Toggle semantics (kind+refId unique), references validated against authored content, titles resolved server-side |
| Practice | `POST /practice/log`, `GET /practice/{pattern,sr,position,zone}-drill`, `GET /practice/stats` | Ledger of drill attempts; engine-generated SR/position/zone drills; pattern drill with weakness-bank resurfacing; per-drill accuracy |
| Flashcards | `GET /flashcards`, `POST /flashcards/review` | Leitner SRS ([1,2,4,8,15] days), 10/day cap, free-practice queue when nothing is due |
| Certifications | `GET /certifications`, `GET /exams/:categoryId`, `POST /exams/:categoryId/attempts` | Exam papers over category pools (≤20 public questions); server grading; BRONZE ≥50 / SILVER ≥70 / GOLD ≥90; best/attempts derived |
| Achievements | `GET /milestones` | 13 milestones computed from real ledger state |
| Journal bridge | `GET /suggestions` | Evidence-based course suggestions from CLOSED trades (see §2) |

Out of scope, enforced structurally (§89/§90): no AI/LLM anywhere, no backtesting,
no trade execution/broker path, no community, no enrollment, no content CMS.

## 2. Existing functionality reused (audit-first, no duplicates)

- **Authored content**: the product's catalog (12 categories, 21 courses, quizzes,
  glossary, 20+ pattern exemplars, scenarios — ~3.7k lines) was **ported verbatim**
  from the authoring layer into `modules/academy/content/` (Phase 7
  `playbook-templates.data.ts` precedent). Zero content re-authoring, zero drift.
- **Backend conventions**: Fastify `/api/v1`, global guard, `ZodValidationPipe` → 400
  `{error:"ValidationError",issues}`, `AppError` taxonomy (honest-404 IDOR), flat
  module (single Prisma repository), thin controllers, vitest+embedded-postgres
  harness (`buildTestApp`/`authenticatedUser`) — all reused unchanged.
- **Journal integration**: suggestions consume ONLY public repository contracts —
  `TradingRepository.listClosedJournalRows` (Phase 8), `TradeReviewRepository.listActiveReviewSummaries`
  (Phase 6/8 additive select), `TradePlanRepository.listPlanAttributionRows` (Phase 8).
  The attribution chain Trade → review.originTradePlanId → plan.strategyId and the
  frozen planned-RR rule (snapshot first, then live plan) are the Phase 8 decisions,
  re-consumed — not re-implemented.
- **Shared contracts**: `@cosmoz/shared` academy schemas consumed verbatim; ZERO
  shared-package changes, ZERO frontend changes, ZERO FastAPI changes.
- **Deferral respected**: Phase 9 Backtesting untouched; no unrelated domain modified.

## 3. New bounded-context components

- `content/` — the authoring port (catalog, glossary, patterns, scenarios + builder types).
- `domain/` (pure, framework-free, unit-tested):
  - `grading.ts` — the ONE evaluator shared by quizzes/checkpoints/exams + `stripQuestion`;
  - `catalog.ts` — content read layer (deterministic ordering, projections, checkpoint pick,
    glossary/search, flashcard deck derivation);
  - `learning-state.ts` — streak (UTC day walk), weekly plan (Monday-anchored), progress
    aggregation (best-per-quiz averaging), 13 milestones;
  - `guidance.ts` — continueLearning/resumeLearning/recommendations (mock-parity rules);
  - `flashcards.ts` — Leitner transitions + capped due queue;
  - `drills.ts` — pattern/SR/position/zone generators (rng **injected** for determinism),
    practice-stats aggregation, weakness bank (latest-miss-per-pattern, cap 12);
  - `exams.ts` — papers, tiers, cross-pool-safe grading;
  - `suggestions.ts` — journal rules (≥2 evidence threshold, weight ranking).
- `academy.repository.ts` — the only Prisma touchpoint; `academy.service.ts` — orchestration;
  `academy.controller.ts` — the 28-route boundary; `academy.module.ts` — closed context.

## 4. Database changes

Migration `20261003185226_academy` (applied dev + test). **9 per-user ledger tables +
2 enums**, all `userId`-scoped with `onDelete: Cascade` to `User`:

`AcademyLessonCompletion` (unique userId+lessonId, first-timestamp-wins), `AcademyQuizAttempt`
(append-only: quizId/score/total/createdAt), `AcademyExamAttempt` (+percent),
`AcademyBookmark` (unique userId+kind+refId), `AcademyLessonNote` (unique userId+lessonId,
text ≤4000), `AcademyLessonView` (Resume-Reading stamp), `AcademyActivityDay` (unique
userId+day — the streak clock), `AcademyPracticeAttempt` (ledger: drill/correct/refId),
`AcademyFlashcardState` (unique userId+cardId: box/due/reviews/lastReviewedAt).
Enums `AcademyBookmarkKind` (LESSON|GLOSSARY) and `AcademyDrill` (the shared contract's
closed 9-value vocabulary). Indexes follow real query patterns (userId+entity,
userId+createdAt, userId+drill). **NO content tables, NO stored progress counters.**

## 5. API / shared contracts

- **API**: 28 routes exactly matching `apiPaths.academy*`; POST responses are 200
  computation/toggle results (MSW contract, Session Live end/cancel precedent).
- **Shared**: consumed verbatim (Zod input schemas drive the 400 battery). The one
  wire shape absent from the shared package (`{id, courseId, courseTitle, questions}`)
  mirrors the frontend's local `AcademyQuizResponse` type — no shared edit required.

## 6. Content architecture

Code-owned authored content (§24: system/admin-managed is sufficient — the product has
NO CMS, no draft/publish UI, no runtime editing). Therefore: **no `Lesson`/`Course`
tables, no versioning machinery** (§21 "do not create versioning merely for theoretical
completeness"); historical integrity is provided by stable authored ids referenced from
the ledgers (a completion is never re-attributed to different content). Lesson bodies
are the shared `AcademyBlock` discriminated union (visual SVG variants) — **no raw
HTML is ever stored or served, so the XSS/sanitization surface of §17/§82 does not
exist by construction**; e2e asserts the serving shapes stay answer-free. External
embeds/media (§19/§20/§73): N/A — the authored blocks carry no media URLs; if media
ever arrives it must ride the existing storage architecture, not a new provider.

## 7. Progress architecture

Everything user-specific is a ledger; **all derived values are computed on read**
(§27/§29/§30 — no counters that can go stale, no percentage columns):

- course/category/overall percent = completed authored lessons ÷ eligible lessons;
- quiz best/previousBest/average = derived from the attempt ledger (best PER quiz,
  averaged over the whole authored question pool, capped 100 — mock parity);
- course progress formula is THE definition (single formula, documented);
- streak = consecutive UTC activity days (survives through yesterday), longest run
  derived from the same day ledger; weekly plan = Monday-anchored UTC week over three
  ledgers (completions/practice/attempts) with the product targets {3,3,1};
- milestones derive from the same ledgers (first-lesson carries its true completion
  timestamp). Concurrency (§61): every write is an idempotent upsert keyed by
  (userId, entityId); completion+activity and attempt+activity pairs run in one
  transaction, so multi-tab/mobile updates converge without corruption.

## 8. Quiz architecture

One evaluator (`gradeAnswer`) for the three server-graded surfaces — MC/SCENARIO
(option index), TF (boolean), NUMERIC (relative tolerance with a 1e-9 floor, default 2%).
Serving = `stripQuestion` (id/kind/prompt/options/unit only). Grading iterates ONLY the
owned question list, so foreign `questionId`s cannot earn credit and a checkpoint pick
is bound to lessonId+UTC day (same deterministic pick for serving and grading). Retries
are unlimited with per-quiz best tracking and `previousBest` in every result (the
product's rule, mock-audited — nothing hardcoded beyond that). Exams grade only
questions belonging to the category pool; tier = f(percent of the graded attempt),
best percent tracked per category. Practice drills remain client-graded BY CONTRACT
(see §12) — their ledger is informational and never feeds certifications/milestones
except through the honest practice counters.

## 9. Security verification

E2E-asserted (academy.e2e.spec.ts, green):

- **Answer-key leakage (§81)**: a recursive JSON scanner runs over `GET quiz`, `GET
  exam paper`, every `GET lesson` (checkpoint included), catalog/overview/progress/
  certifications — `answer`/`explanation`/`tolerance`/`correctOptionId`/`correct`/
  `passed`/`score` may not appear; the correct answer exists only in post-submission
  results (unit tests assert `stripQuestion` drops every carrier).
- **IDOR (§51)**: user B sees zero completions/notes/bookmarks/practice/quiz history
  of user A; A's data is simply not found inside B's scope (no 403 oracle); B's
  `previousBest` is null despite A's attempts. The userId comes from the auth
  principal only — no route accepts a user/owner parameter.
- **Draft protection (§52)**: N/A by construction (no draft state exists); content
  access control = authenticated learner content, uniformly.
- **Authorization (§50)**: no new roles invented — the Academy is learner-scoped and
  uses the existing global guard; content management does not exist (no admin surface
  to authorize).
- **Validation**: malformed payloads (empty answers, unknown drill/kind/grade,
  >4000-char note) → 400 ValidationError from the shared Zod schemas; unknown
  references (course/lesson/quiz/exam/bookmark/card) → 404.
- **Logging (§85)**: id-scoped events only (`academy.lesson_completed`,
  `quiz_submitted`, `exam_submitted`, `bookmark_toggled`, `practice_logged`) — never
  answer keys, never note contents, never personal payloads.

## 10. Tests executed

Full suite: **577/577 passed, 34 files** (was 522/522 pre-phase — zero regressions
across Phases 1–10). New: 33 unit (grading/tolerance edges, streak walk, weekly
anchors, best-per-quiz averaging, milestone timestamps, Leitner transitions/caps,
weakness bank, drill generators with deterministic rng, tier ladder, cross-pool exam
grading, suggestion thresholds/ranking) + 22 e2e (28-route 401 battery, recursive
anti-leak scan, full lesson lifecycle incl. idempotent completion, checkpoint binding,
notes save/clear, quiz parity semantics incl. forged questionIds, bookmarks toggle,
practice stats, flashcard cap/review, exam ladder with tier transitions, milestones,
suggestions with the REAL attribution chain, per-user isolation, 400 battery).
Fresh-run verification: api `tsc` ✓, `eslint` ✓, `build` ✓; shared `tsc` ✓; web
`tsc` ✓; `prisma migrate status` "Database schema is up to date" (dev+test).
Committed as `feat(api): Phase 11 — Academy bounded context`.

## 11. Performance findings

- **No N+1**: content reads are in-process constants; user-state reads are narrow
  projections (2–6 parallel queries per endpoint); ledger aggregation happens in a
  single fetch + pure reduction. Suggestion generation is 3 parallel reads + joins.
- **Payload hygiene**: quiz/exam serving strips answers; lesson bodies are the product's
  block format (bounded by authoring); search caps results (6 courses / 10 lessons /
  8 terms) as the mock did; glossary is a single filtered list (authored scale ~100
  terms — in-memory search is the right tool, §43: no external search engine).
- **No cache introduced** (§62 decision): the "content cache" already exists as process
  memory; progress/quiz/attempt responses are user-scoped and mutation-sensitive — an
  HTTP cache would risk §63/§64 violations for zero measured need. Flashcard deck
  derivation is deterministic and cheap (<1ms scale).
- E2E timing: the full 22-test Academy e2e suite (real AppModule + embedded Postgres)
  runs in ~6s including fixture creation; no hotspot surfaced.
- Watch item (future-phase note): `GET /academy/practice/stats` aggregates the whole
  practice ledger; at journal-scale personal volumes this is trivial, but a
  monthly-partitioned or windowed read is the first lever if the ledger ever grows.

## 12. Known limitations

1. **Practice drills are client-graded BY CONTRACT** (pattern/SR/position/zone carry
   `answer`+`explanation` for immediate in-lesson feedback; `/practice/log` is
   self-reported). The shared contract is consumed verbatim (frontend untouched), so
   the backend cannot verify drill outcomes. Bounded impact: drills feed only
   practice stats/weakness bank — never certifications, milestones-grade progress or
   quiz averages. Server-graded surfaces (quizzes/checkpoints/exams) have full
   anti-cheat semantics. Recommendation recorded in §13.
2. **Suggestion seams (honest zeros)**: the mock's "winners given back" (mfeR) and
   "emotional exits" (emotionAfter) rules cannot run — Trade has NO excursion or
   emotion columns (Phase 8 gap, unchanged). They activate automatically when those
   columns exist; documented in `domain/suggestions.ts` next to the seam.
3. **No admin/authoring surface**: content ships with the code. Editing content =
   code change + deploy (acceptable for a fixed curriculum; contradicts nothing).
4. **Flashcard `reviewedToday` counts states touched today** (correct for cap
   purposes; multiple reviews of the SAME card on one day count once toward the cap —
   a deliberate simplification over the mock's never-incrementing counter).
5. **UTC learning calendar**: streak/weekly-plan use UTC days (mock parity). A
   user-timezone learning calendar (User.timezone exists) is a possible refinement.
6. **Drill randomness is not reproducible** (Math.random at runtime; rng injectable
   only at the unit level). Reproducible rounds were never a product requirement.

## 13. Recommended next phase

1. **Nofy backend** (personal knowledge/notes — the last major product module without
   a backend; Academy↔Nofy stays a loose "source reference" integration, §70).
2. **Discipline backend** (violations/mistake ledger — also closes the Analytics
   `mistakes` honest-empty block from Phase 8).
3. **Trade.strategyId attribution evolution** (Phase 8/11 recommendation repeat: a
   real Trade→Strategy column would simplify Analytics + Academy suggestion rules AND
   unlock client-side drill verification if the practice contract ever evolves).
4. **Eco Calendar backend** (Phase 10 §75 recommendation; closes Analytics `events`).
5. **Frontend mock-switch verification** (point the web app at the real API and run
   the Academy E2E parity pass — the 28 routes are now live behind the same
   contracts).
6. Not recommended next: Backtesting remains **DEFERRED** (Phase 9); AI/LLM anything
   stays out per §89/§90.
