# COSMOZ — PHASE 12 REPORT: Nofy — Personal Knowledge & Notes Management

Status: **DONE — Phase 9 (Backtesting) remains DEFERRED.** This report follows the
Phase 12 §53 return contract. No next phase was started (§53.6 — STOP after Phase 12).

---

## 1. Nofy functionality implemented

The personal-knowledge bounded context lives at `apps/api/src/modules/nofy/` and serves
the workspace's full surface — **23 routes** under `/api/v1/nofy`, all authenticated
(global JwtAuthGuard, no `@Public`), all route vocabulary verbatim from the audited
frontend (`lib/api/endpoints.ts` + MSW handlers — nothing invented):

| Group | Routes | Behaviour |
|---|---|---|
| Overview | `GET /overview` | Totals (notes/createdThisWeek/favorites/folders/tags/trashed), recentEdited(6), recentViewed(5), favorites(5), folders+counts, topTags(8), 8 weekly activity buckets (Monday-UTC), templates(4) |
| Notes | `GET /notes` (`view/folderId/tagId/q/sort`), `POST /notes`, `GET·PATCH·DELETE /notes/:id`, `POST /duplicate`, `POST /restore`, `DELETE /permanent` | Filtered lists (all/favorites/trash/recent/folder/tag + ILIKE filter + 4 deterministic sorts), template instantiation on create, autosave PATCH (partial, view-touch without content clock), soft delete → Trash → Restore → permanent Purge, duplicate with fresh block ids |
| Versions | `GET /versions`, `GET /versions/:id`, `POST /versions/:id/restore` | Immutable snapshots (3-min throttle, 12 cap, taken BEFORE the mutation), lossless restore with fresh block ids and pre-restore snapshot |
| Folders | `GET·POST /folders`, `PATCH·DELETE /folders/:id` | Case-insensitive uniqueness (409), rename with live noteCount, delete detaches notes ("No folder" — SetNull) |
| Tags | `GET·POST /tags` | Create-or-return idempotent by normalized name (`#`-strip + trim), live counts, noteCount-desc ordering |
| Templates | `GET·POST /templates`, `POST /templates/instantiate` | 5 built-in (code-owned) + user templates; capture from note (personal refs stripped); instantiate keeps icon/body |
| Search | `GET /search?q=` | User-scoped ILIKE over title + searchText projection + tag names (PostgreSQL capabilities — no external engine), snippet centered on first text hit, 30-result bound |
| References | `GET /refs?q=&kind=`, `GET /notes?refKind=&refId=` | Entity picker (TRADE/STRATEGY/SETUP/RULE/LESSON/SYMBOL/NOTE, bounded scans) + the linked-notes integration surface consumed by Playbook / Trade Review |

Out of scope, enforced structurally (§31/§50): no AI/LLM/RAG/embeddings, no backtesting
(Phase 9 DEFERRED), no public sharing/community/comments/collaboration, no multi-user
editing, no broker execution, no analytics computation inside Nofy, no Academy content
management.

## 2. Existing functionality reused (audit-first, no duplicates)

- **Shared contracts**: `@cosmoz/shared` `schemas/nofy.ts` consumed VERBATIM (23 wire
  shapes + 7 input schemas). ZERO shared-package changes, ZERO frontend changes.
- **Auth/ownership**: Phase 2 identity — global JwtAuthGuard, `@CurrentUser` principal,
  userId-in-every-where-clause, honest-404 IDOR convention. No second auth mechanism.
- **Backend conventions**: Fastify `/api/v1` versioning, `ZodValidationPipe` → 400
  `{error:"ValidationError",issues}`, `AppError` taxonomy (NotFoundError 404 /
  ConflictError 409 / ValidationError 400), flat module + single Prisma repository +
  thin controller, vitest + embedded-postgres harness (`buildTestApp`,
  `authenticatedUser`, MOCK-account FNV seeding from the Academy spec).
- **Editor infrastructure**: the frontend block editor (`nofy-editor.tsx`,
  `nofy-blocks.tsx`) and its shared `NofyBlock` contract were audited and kept as THE
  content representation — the backend stores and validates exactly that shape. No new
  editor abstraction, no HTML pipeline, no generic CMS.
- **Cross-domain reads** (public contracts only, §41): `TradingRepository`
  (trade resolution), `PlaybookRepository` (strategy/setup/rule resolution),
  `INSTRUMENT_SPECIFICATION_PROVIDER` (symbol resolution), Academy content catalog
  (code-owned lesson data — the Phase 7/11 code-owned-content precedent). Nofy writes
  NOTHING outside its own tables; consumers link via their own pointers.
- **Deferral respected**: Phase 9 Backtesting untouched; no unrelated domain modified;
  FastAPI/mini-services untouched.

## 3. New bounded-context components

```
apps/api/src/modules/nofy/
├── domain/                        PURE, framework-free, unit-tested
│   ├── nofy-content.ts            text projection (mock-parity textOfBlocks),
│   │                              excerpt/wordCount/openTodos, search snippet,
│   │                              block normalization (ref display strip),
│   │                              defensive JSON parser, image-protocol gate,
│   │                              nameKey/tag normalization, block-id minting
│   ├── nofy-versioning.ts         snapshot throttle (3 min) + retention cap (12)
│   └── nofy-templates.data.ts     5 built-in templates ported VERBATIM from the
│                                  mock engine (code-owned content precedent)
├── nofy.repository.ts             the ONLY Prisma touch — narrow projections,
│                                  ownership in every where-clause, tx-aware writes
├── nofy.service.ts                use cases: overview/notes/versions/folders/
│                                  tags/templates/search/refs; transactions for
│                                  every multi-step write
├── nofy-reference-resolver.ts     relational pointers → fresh label/meta/href
│                                  (read-time resolution, per-call cache, graceful
│                                  degradation for unresolvable pointers)
├── nofy.mappers.ts                rows → shared contracts (list projection with
│                                  excerpt/wordCount/blockCount/refCount/todoOpen)
├── nofy.controller.ts             thin HTTP boundary — 23 routes, Zod validation
└── nofy.module.ts                 context wiring (READ-ONLY cross-context imports)
```

## 4. Database changes

Migration `20261003193122_nofy_knowledge` (Prisma, deterministic, reviewable):

| Model | Role |
|---|---|
| `NofyFolder` | user folders; case-insensitive uniqueness via normalized `nameKey` + `@@unique([userId, nameKey])` |
| `NofyTag` | user tags; same normalized uniqueness |
| `NofyTemplate` | user-captured templates (`blocks` JSONB, `builtIn` false) |
| `NofyNote` | the aggregate: title/icon/folder(FK, SetNull)/favorite/templateId/lessonRef(JSON)/blocks(JSONB)/searchText/lastViewedAt/deletedAt + (userId,updatedAt)/(userId,createdAt)/(userId,favorite)/(userId,deletedAt)/folderId indexes |
| `NofyNoteTag` | normalized join table, `@@unique([noteId, tagId])`, cascades both ways |
| `NofyVersion` | immutable snapshots, `(noteId, savedAt DESC)` index, cascade purge |

Content model decision (§10/§26): blocks are the flexible payload → JSONB column;
CORE relationships (folder, tags, versions) are relational. `searchText` is the
server-maintained plain-text projection (mock-parity `textOfBlocks`) refreshed on
every block write — search stays in PostgreSQL (§17/§33). `User` gained the four
Nofy relations (cascade on delete). Migrations applied to dev and to the dedicated
`cosmoz_test` database by the global-setup (never the same DB).

## 5. API / shared contracts

- Request validation: shared Zod schemas (`nofyNoteCreateInputSchema`,
  `nofyNoteUpdateInputSchema`, `nofyFolderCreate/UpdateInputSchema`,
  `nofyTemplateCreateInputSchema`, `nofyTemplateInstantiateInputSchema`,
  `nofyNoteDuplicateInputSchema`) through the global `ZodValidationPipe`.
  Query vocabulary (`view/folderId/tagId/q/sort/refKind/kind`) is normalized with
  mock-parity fallbacks; `refKind`/`kind` are validated against `nofyRefKindSchema`
  (unknown kind → 400).
- Status codes follow the MSW contract exactly: creations 201, mutations 200,
  trash/restore/purge/deleteFolder → `{ ok: true }`.
- Response discipline (§44): no Prisma internals, no userIds other than the note's
  owner (the principal), no storage credentials, no other-user identifiers.
- Contract-first preserved: `@cosmoz/shared` is still the single source; the API
  added ZERO new shared shapes.

## 6. Content architecture (what Nofy is NOT)

```
Academy (Phase 11)          Nofy (Phase 12)
code-owned education        user-owned personal knowledge
     │                            │
     │                      Notes · Folders · Tags · Templates
     │                      Versions · Ref blocks (kind + id pointers)
     │                            │
     └──── shared infra ──────────┘
   (block contract vocabulary, Zod pipe, guards — never domain ownership)
```

- `NofyNote ≠ AcademyLesson` — lessons resolve as REFERENCE targets only.
- `NofyNote ≠ TradeReview / TradePlan / PlaybookStrategy / TradingSession` — those
  contexts stay authoritative; a note may POINT at their entities (resolved fresh at
  read), never copy them (§41).
- Nofy computes NO trading metrics — P&L/R/risk values inside notes are user text.

## 7. Reference resolution architecture

Stored pointer `{ kind, id }` → read-time resolution (per-call cache) →
`{ label, meta, href }`:

| Kind | Source (public contract) | Resolution |
|---|---|---|
| TRADE | `TradingRepository.findTradeForUser` | `Trade EURUSD BUY` · status + signed R · `/trades?trade=id` |
| STRATEGY / SETUP / RULE | `PlaybookRepository.list*` | name/title · Playbook meta · SPA href |
| LESSON | Academy content catalog (code-owned data) | lesson title · course · `/academy?...` |
| SYMBOL | `INSTRUMENT_SPECIFICATION_PROVIDER.listSpecifications` | symbol · assetClass · `/session` |
| NOTE | own repository (non-deleted, owned) | title · Nofy meta · `/nofy?...` |
| EVENT | — none yet (audited: no Calendar backend exists) | graceful degradation: stored label kept, meta/href null, picker emits no EVENT hits. No speculative table invented (§50). |

Unresolvable pointers (unknown/foreign/purged targets) degrade to the client's stored
label + "Unresolved reference" fallback — never 500, never a data leak (§42).

## 8. Security verification

Battery executed in `test/e2e/nofy.e2e.spec.ts` (17 e2e tests) + matrix from §49:

| Capability | Expected | Verified |
|---|---|---|
| Unauthenticated access to any /nofy route | 401 | ✓ (23 routes) |
| User A reads User B note / versions / version | DENIED → honest 404 | ✓ |
| User A edits / deletes / archives / restores User B note | DENIED → 404 | ✓ |
| User A duplicates User B note | DENIED → 404 | ✓ |
| User A renames / deletes User B folder | DENIED → 404 | ✓ |
| Cross-user folderId in a create/update payload | 400 ValidationError | ✓ |
| Cross-user tagId assignment | silently filtered (empty) | ✓ |
| Cross-user search / list leak | none (0 results) | ✓ |
| Cross-user entity resolution (TRADE/NOTE via foreign id) | unresolved → no data | ✓ |
| Linked-notes surface against a foreign entity | 0 results | ✓ |
| `javascript:` / `data:text/html` image src | 400 before storage | ✓ |
| Safe `data:image/png;base64` / https src | accepted | ✓ |
| XSS payloads stored | AS TEXT verbatim, inert (no HTML pipeline) | ✓ |
| 501 blocks / 20k-char text / 201-char title / unknown block type | 400 | ✓ |
| Empty folder/tag name | 400 | ✓ |
| Duplicate folder name (case-insensitive) | 409 Conflict | ✓ |

Ownership model (§12): every repository where-clause carries `userId` — foreign ids
are simply not found; ownership is never inferred from client payloads.

## 9. Concurrency & transactional integrity

- Multi-step writes run in ONE Prisma transaction (§27): update+snapshot+tags,
  version restore (snapshot-first), duplicate+tag-links, folder delete+detach.
- Version snapshots are taken BEFORE the mutation (throttled 3 min, capped 12) —
  autosave storms never corrupt history; restore snapshots the current state first
  (nothing is ever lost).
- `touchViewed` (GET note) and trash deliberately do NOT move the `updatedAt`
  content clock (re-stamped before write) — view tracking cannot pollute
  "recently edited" surfaces.
- Idempotency: tag create-or-return; `skipDuplicates` on tag links; unique
  constraints at the DB layer as the final defense.
- Bounded reads everywhere (§43): list take 500, search take 30, picker scans
  60 trades / 40-result cap — no unbounded note/revision retrieval, no N+1 in
  resolution (grouped bulk lookups + per-call cache).

## 10. Tests executed

- **Unit** (`test/unit/nofy-content.spec.ts`, 14 tests): text projections,
  excerpt/word/snippet boundaries, ref-display stripping, defensive block parsing,
  image-protocol gate (incl. `data:image/svg+xml` non-base64 rejection), name/tag
  normalization, snapshot throttle/cap.
- **E2E** (`test/e2e/nofy.e2e.spec.ts`, 17 tests, REAL AppModule + real database):
  auth battery, full note lifecycle (create/autosave/list/touchViewed clock,
  trash/restore/purge state machine, duplicate), folders (409 + detach), tags
  (idempotent + cross-user filtering), templates (built-in list, instantiate,
  from-note capture with ref strip), version history (snapshot/throttle/restore),
  search isolation + snippets, overview aggregates, cross-domain reference
  resolution (6 kinds + fallback), entity picker (kind filter + q + EVENT absence),
  linked-notes surface, IDOR battery, validation + content security.
- **Full backend suite**: **608/608 tests green (36 files)** — zero regressions
  across Phases 0–11.
- **Smoke (production build)**: boot → /health 200 → register 201 → verify 200 →
  login 200 → create note 201 → overview 200 (correct totals, 4 templates, 8
  weeks) → trash 200. All 23 `/nofy` routes mapped; unauthenticated probes 401;
  invalid config still aborts the boot with a controlled, secret-free error.

## 11. Performance findings

- Search/linked-notes use bounded, user-scoped reads (500-cap) — well within
  journal scale; `searchText` avoids JSON parsing for title/content matches.
- Overview is a fixed set of 7 parallel queries + one narrow activity fetch.
- Ref resolution groups by pointer with a per-call cache — reading a note with
  many refs costs one query per unique (kind,id), never per block.
- No premature optimization (§43): GIN/jsonb expression indexes and a dedicated
  trigram search are the documented upgrade paths when real volumes justify them.

## 12. Known limitations

1. **EVENT references are unresolvable**: the Calendar/eco-events domain has no
   backend home yet (audited — no module, no table). Stored EVENT pointers degrade
   gracefully; `/nofy/refs?kind=EVENT` returns no hits. Resolution activates when
   that context ships — the resolver is the single seam.
2. **Autosave concurrency is last-write-wins** at the request level (the frontend
   serializes its own autosave); version snapshots preserve overwritten content.
   No optimistic-locking protocol was invented — the frontend does not speak one
   (§20 parity decision).
3. **Search is ILIKE-based** (case-insensitive containment) — no stemming, no
   ranking. PostgreSQL full-text/trigram is the documented evolution (§17).
4. **Attachments/mime validation** are scoped to what the editor actually supports:
   image blocks only (protocol-gated). Nofy does not own a media system (§34) —
   the existing storage infrastructure, when it lands, plugs into the image block
   without a second storage platform.
5. **No hierarchy beyond folders** (audited frontend: folders only, no nested
   pages) — no parentId/self-parent/cycle surface exists to harden (§9).

## 13. Recommended next phase

- Wire the **Calendar / eco-events bounded context** — it unlocks EVENT resolution
  (the resolver seam is ready) and closes the last `/nofy/refs` gap.
- When real usage data exists: PostgreSQL trigram/full-text search upgrade and a
  GIN index on the block payload if linked-note volumes grow.
- Optional Phase 13+ candidates (from the architecture roadmap): CSV/import hardening
  surfaces, notification dispatch, or the deferred Phase 9 (Backtesting) — by
  explicit instruction only.

**Phase 9 — Backtesting remains DEFERRED. Nothing beyond Phase 12 was started.**
