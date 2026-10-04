# COSMOZ — BACKEND PHASE 19
## OCR & Trade Screenshot Recognition — Final Report

| | |
|---|---|
| **Date** | 2026-10-04 |
| **Base** | Phase 0 audit (`78e30ac`) + Phase 1 Foundation (`865945f`) + Phase 2 Identity (`f7516cf`) + Phase 3 Accounts (`69247a7`) + Phase 16 Security + Phase 17 Monitoring + Phase 18 Calculators (`1f3f54d`) |
| **Scope** | OCR bounded context ONLY — screenshot upload, validation, recognition, human review & confirmation. NO trade creation, NO broker execution, NO LLM (§4/§22/§28). |
| **Verification** | typecheck ✅ · lint ✅ · build ✅ · **310/310 API tests ✅** (68 new OCR: 28 logic + 12 image + 18 e2e + 10 negative-e2e) · **27/27 sidecar pytest ✅** · Prisma valid ✅ · migration `20261004015123_ocr_screenshot_recognition` ✅ · **runtime verification: ALL CHECKS PASSED** (real sidecar + real Tesseract + compiled API) |

---

## 1. Audit Findings & Handoff State

The repository audit found Phase 19 in an **interrupted hand-off state**: the full
implementation existed (NestJS module, FastAPI sidecar, migration, shared contract,
test suites, runtime script) but had never been finished, verified or reported:

- **3 tests red** in `test/unit/ocr-logic.spec.ts` + 1 e2e assertion mismatch — all
  pointing at ONE root cause: the correction-semantics disagreement described in §2.
- **11 lint errors** (`no-explicit-any`) in `test/e2e/ocr.e2e.spec.ts`.
- The runtime script `scripts/phase19-runtime-verify.sh` still encoded the OLD
  (pre-test-authority) correction policy in two assertions.
- No `PHASE-19-OCR-REPORT.md`, no worklog entry, no commit message (the code sat in
  an anonymous auto-checkpoint).

This report closes that gap: the fix was completed, every gate re-run, the runtime
flow re-proven, and the phase documented.

## 2. The Correction-Semantics Fix (the one real defect)

The test suite is the executable specification, and it demands (§14/§21):

1. **Ambiguity is rejected even in canonical form** — `"1.234"` (one separator +
   exactly three fraction digits) must be a 422 for USER corrections, because
   "the user can retype it clearly" (`"1.2340"`). The previous implementation had a
   canonical fast-path that silently accepted it.
2. **The corrections record stores the user's VALIDATED DECLARATION** — separators
   canonicalized to plain dot form, declared precision PRESERVED (`"2345,60"` →
   `"2345.60"`, `"1.0850"` stays `"1.0850"`), so a confirmation replay is idempotent
   against the exact statement the user confirmed.
3. **The merged fields carry the normalized wire form** — `"1.0850"` → `"1.085"`
   (toFixed), exactly as the e2e asserts.

Fixed in `ocr.logic.ts`:

- `normalizeDecimal` refactored to share `resolveDecimalText` (separator/currency
  resolution WITHOUT digit mutation) between the machine and user paths.
- `parseCorrectedDecimal` now applies `AMBIGUOUS_CORRECTION_PATTERN`
  (`/^-?\d+[.,]\d{3}$/`) BEFORE anything else, then returns the normalized (toFixed)
  form — `"1.234"` → null, `"1234"` → `"1234"`, `"-5.50"` (signed) → `"-5.5"`.
- New `parseCorrectedStoredDecimal` + `validateCorrectionStored`: same validation,
  but returns the separator-canonicalized literal with the user's declared precision.
- `ocr.service.ts` `canonicalizeCorrections` now stores the validated declaration.

**Consequence for idempotency**: a stored correction can never be a 3-fraction
canonical literal (such input is rejected at the door), so the ambiguity guard can
never break a replay of a stored declaration.

The runtime script's two stale assertions were updated to the same policy
(`"XAUUSDM"` per the §15 symbol normalizer, `"2345.60"` declared precision).

## 3. Existing Functionality Reused (nothing rebuilt)

| Capability | Owner (unchanged) |
|---|---|
| JWT guard, `@CurrentUser` principal, ZodValidationPipe, error envelope | `shared/*` (Phase 1) |
| Global ThrottlerGuard + per-user sliding-window limiter class | Phase 1 + identity/accounts pattern (OCR adds vectors, NOT a limiter) |
| Append-only SecurityEvent ledger (`OCR_UPLOAD`, `OCR_RESULT_CONFIRMED`, `OCR_RESULT_DELETED`, `OCR_PROCESSING_FAILED`) | `SecurityEventModule` (Phase 16 port — §48) |
| Kernel errors (`ValidationError`/`BusinessRuleError`/`ConflictError`/`NotFoundError`/`RateLimitError`) | `shared/errors` (Phase 1) |
| Exact-decimal discipline (`Prisma.Decimal`, decimal strings on the wire) | Phase 18 house standard |
| Keyset pagination + opaque base64url cursor (`INVALID_CURSOR` on garbage) | Phase 16 house pattern |
| Request-scoped processing (no external queue) | Phase 3 sync-run pattern |

## 4. New Functionality Implemented

1. **OCR bounded context** (`modules/ocr/`) — upload → validation → storage →
   recognition → strict contract validation → domain validation → persistence →
   review → confirmation; request-scoped lifecycle (`QUEUED → PROCESSING →
   REVIEW_REQUIRED → CONFIRMED`, plus `FAILED`).
2. **Image validation gate** (`image/image-validation.service.ts`) — data-URL
   envelope parsing, decoded-size bound, magic-byte sniffing (MIME/extension
   mismatch rejected), pixel-count ceiling parsed from the binary header WITHOUT
   decoding (decompression-bomb guard), SHA-256 checksum = asset identity.
3. **Storage port + local-disk adapter** (`storage/`) — keys derived ONLY from the
   validated userId uuid + hex checksum (client filenames never reach the
   filesystem), path-traversal re-validation on every read, atomic writes
   (tmp+rename), best-effort binary removal AFTER the DB commit.
4. **Engine port + two adapters** (`engine/`) — `fastapi-ocr.engine.ts` (HTTP client,
   shared-token, transient-vs-permanent failure taxonomy) and
   `deterministic-ocr.engine.ts` (dev/test only, config-gated, pure function of the
   checksum, FNV-1a scenario buckets — production cannot register it, §57).
5. **FastAPI sidecar** (`mini-services/ocr-service/`) — stateless, NO users, NO
   persistence, NO trading state (§4); Tesseract OCR + keyword classification;
   strict pydantic request schema; per-image failures answer 200 with
   `processingStatus UNPROCESSABLE/FAILED` (request-level problems are HTTP errors);
   never logs image bytes or secrets (§36).
6. **Human-in-the-loop confirmation** — user corrections validated with the SAME
   domain rules, authoritative (confidence 1), merged once inside the confirmation
   transaction; idempotent replay of the SAME corrections, 409 for a DIFFERENT
   payload after confirmation (§21/§51).
7. **Owner-scoped reads + deletion** — keyset listing (`limit` 1–50, `status`
   filter), image bytes route (`private, no-store`), one-transaction delete of
   recognition + last-referenced asset with post-commit binary removal (§31/§50).

## 5. Final Domain Boundary

```text
  Browser ── JWT ──► NestJS API (authoritative: auth, ownership, persistence,
                                audit, rate limiting, user-facing errors)
                        │  OcrModule (this phase)
                        │    ├─ image validation · storage port · lifecycle
                        │    ├─ domain logic (pure, Prisma.Decimal)
                        │    └─ audit via SecurityEventModule (Phase 16 port)
                        │  engine port (contract v1)
                        ▼
              FastAPI sidecar (:3004, x-internal-token)
                stateless image/OCR processing ONLY — Tesseract,
                classification, normalization; NO auth, NO DB,
                NO trade state; never sees user identity
```

**OCR is NOT** (documented in code headers): a second Trade entity (Trading Core
owns the canonical Trade — confirmation does NOT create one), a second storage
system, a second rate limiter, an authorization surface, or a queue/scheduler.
There is no browser → sidecar path (the token never leaves the server).

## 6. Database Changes

One migration: `20261004015123_ocr_screenshot_recognition`

- **`OcrAsset`** — one stored image per (userId, checksumSha256) unique;
  `storageKey` unique; `(userId, createdAt DESC)` index. Metadata only — the binary
  lives behind the storage port.
- **`OcrRecognition`** — `status`, `extractionProfile`, `pipelineVersion`,
  `idempotencyKey` (unique per `(userId, idempotencyKey)` — the §32 anchor),
  `result` JSONB (classification/fields/warnings/engine), `failureCategory` /
  `failureMessage` / `attempt`, `requestId`, processing timestamps, `corrections`
  JSONB + `confirmedAt`; indexes `(userId, createdAt DESC)` + `(userId, status)`.
- Both tables cascade on user delete. `prisma validate` ✅.

## 7. API Contracts

```text
POST   /api/v1/ocr/recognitions             upload (data URL ≤ 8 000 000 chars) → recognition
GET    /api/v1/ocr/recognitions             keyset page (limit 1–50, cursor, status filter)
GET    /api/v1/ocr/recognitions/:id         one (owner-scoped)
GET    /api/v1/ocr/recognitions/:id/image   raw screenshot bytes (private, no-store)
POST   /api/v1/ocr/recognitions/:id/confirm corrections (200 idempotent — NOT a 201)
DELETE /api/v1/ocr/recognitions/:id         delete (metadata + binary)
```

Shared contract `packages/shared/src/schemas/ocr.ts` (280 lines): lifecycle states,
extraction profile (`TRADE_SUMMARY` only), 10 field keys, confidence bands
(HIGH/MEDIUM/LOW/UNKNOWN), validation statuses (VALID/MISSING/AMBIGUOUS/
LOW_CONFIDENCE/INVALID), source regions (original-image pixel coordinates),
classification (MT5_TRADE / TRADINGVIEW_CHART / UNKNOWN + alternatives),
failure taxonomy (7 stable categories), correction records, page schemas.
Financial values travel as decimal strings — never numbers (§14).

## 8. Security Controls

- **Untrusted-input gate**: magic-byte sniffing beats declared MIME/filename;
  decoded-size and pixel-ceiling bounds BEFORE any decode; no client-controlled
  string ever reaches the filesystem (§7).
- **Sidecar auth**: shared secret via `x-internal-token` on every route except
  `/healthz`; contract-version pinning rejects unknown versions (§27).
- **Engine output is UNTRUSTED**: zod-parsed then re-validated by the domain before
  persistence (§54/§19); malformed engine payloads are a stable FAILED category,
  never a 500.
- **Rate limiting** (§37/§38): upload 10/15 min, confirm 30/15 min (identity limiter
  class, per-user vectors), global IP ThrottlerGuard underneath. Failed
  recognitions do NOT refund the upload budget beyond the idempotency replay.
- **Audit**: uploads, confirmations, deletions and processing failures land in the
  shared append-only SecurityEvent ledger as facts — never the image, never secrets
  (§36/§48).
- **No LLM anywhere** (§28) — deterministic Tesseract + keyword heuristics only.

## 9. IDOR / Negative Tests

- `ocr.e2e.spec.ts` — anonymous 401 across all 6 routes; IDOR: User A's read /
  image / confirm / delete / list can never touch User B's recognition (including
  forged list filters); B's page never contains A's ids; injected filename
  metadata is ignored (the wire carries NO filename); pixel bomb →
  `IMAGE_DIMENSIONS_INVALID` with NO persisted recognition; mass-assignment: the
  contract strips unknown fields.
- `ocr-negative.e2e.spec.ts` (real HTTP engine) — hanging engine → FAILED
  `PROCESSING_TIMEOUT` within the deadline; unreachable engine → FAILED
  `OCR_UNAVAILABLE` (honest degradation); malformed engine payload → contract
  violation mapping (retry can never fix a malformed response).
- `ocr.e2e.spec.ts` §53 probes — NO trade-creation surface: 6 trade/execute/retry
  routes × 404, PATCH-variant of confirm × 404. OCR cannot bypass Trading Core.

## 10. Runtime Verification (real stack, real image)

`scripts/phase19-runtime-verify.sh` — ALL CHECKS PASSED:

1. Real sidecar boot (`fastapi-tesseract`, engineVersion 5.5.0) ✅
2. Compiled NestJS API on the dev DB ✅
3. register → email verify (token from the mail log) → login ✅
4. REAL rendered MT5 screenshot (1150×420) + anonymous upload 401 ✅
5. `REVIEW_REQUIRED` with REAL Tesseract extraction — all 10 fields with
   confidences 0.80–0.92, source regions, `TIMEZONE_UNKNOWN` warnings on
   wall-clock timestamps, classification MT5_TRADE @ 0.795 ✅
6. Idempotent replay returns the SAME recognition id ✅
7. Confirm with corrections (`XAUUSD.m`, `2345,60`) → `CONFIRMED`; corrections
   record = validated declaration (`XAUUSDM`, `2345.60`); merged fields normalized
   (`2345.6`), confidence 1.0 ✅
8. Image bytes byte-identical to the upload; delete → 404 ✅
9. Trade-boundary probes: every trade/execute route 404 ✅

## 11. Verification Results

| Check | Command | Result |
|---|---|---|
| Typecheck (API, src+test) | `pnpm typecheck` | ✅ exit 0 |
| Lint (API) | `pnpm lint` | ✅ 0 errors (11 stale `no-explicit-any` fixed) |
| Build (API) | `pnpm build` | ✅ |
| Unit + e2e (API) | `pnpm test` | ✅ **310/310** (22 files) — zero regression |
| — new OCR tests | logic 28 · image 12 · e2e 18 · negative-e2e 10 | ✅ 68 |
| Sidecar suite | `pytest tests/` | ✅ **27/27** |
| Prisma | `npx prisma validate` | ✅ valid |
| Runtime | `phase19-runtime-verify.sh` | ✅ ALL CHECKS PASSED |

## 12. Known Limitations

1. **No consumer UI yet** — the frontend has no OCR page; this is the documented V1
   contract the future review UI will call (§2 smallest coherent foundation).
2. **Confirmation does NOT create a Trade** — Trading Core does not exist
   server-side; the post-confirmation flow is deferred until it does (§22/§42).
3. **In-memory rate-limit + request-scoped processing** — correct for the
   single-instance monolith (same tradeoff as identity/accounts); no external queue
   (QUEUED/PROCESSING are persisted transitional states for observability).
4. **Retry route does not exist** — a FAILED recognition is terminal in V1; the
   idempotency key makes a fresh upload of the same image return the FAILED row
   (documented §24 semantics).
5. **Local-disk storage only** — the port accepts object storage adapters; retention
   beyond explicit user delete is not enforced (Phase 2 J.6 discipline).
6. **`TIMEZONE_UNKNOWN` is a warning, not an assumption** — wall-clock timestamps
   are stored without an offset; timezone attribution belongs to the future
   Trading Core integration with the user's trading-timezone setting.

## 13. Deferred Work

- Trading Core backend → then a user-approved "create Trade from CONFIRMED
  recognition" flow (the only sanctioned bridge — OCR itself stays write-off).
- Frontend review UI consuming this contract.
- Object-storage adapter (S3/GCS) behind the existing port.
- External queue + worker if throughput ever demands it (the engine port already
  isolates the call).
- Confidence-threshold tuning knobs per user (deterministic bands only for now).

---

**Status legend**: Implemented ✅ · Verified ✅ (310/310 + 27/27 + runtime, nothing claimed without execution) · Not verified: web `next build` (pre-existing `/login` Suspense issue, untouched) · Deferred: list above.

**STOP** — Phase 19 complete and verified. No Backtesting, no AI/LLM, no Trade
creation, no infrastructure work beyond the documented boundary. The interrupted
hand-off is closed: fix landed, gates green, runtime proven, report written.
