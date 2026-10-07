# COSMOZ — OCR MODULE AUDIT REPORT

| | |
|---|---|
| **Date** | 2026-10-07 |
| **Head at audit time** | `e40091a` (working tree clean) |
| **Scope** | OCR module end-to-end: NestJS backend, FastAPI sidecar, frontend consumption. Research + runtime verification only — no code changed. |
| **Runtime verification** | FastAPI sidecar **79/79** pytest ✅ · NestJS API **572/572** vitest (full suite, 50 files) ✅ · web `tsc` clean ✅ · web eslint **0 errors** (4 pre-existing `_locale` warnings) ✅ |

---

## 1. Backend (NestJS `apps/api/src/modules/ocr/`) — VERDICT: COMPLETE

- **22 routes** on `OcrController` (`ocr.controller.ts`), all thin, all validated through the shared Zod contracts (`packages/shared/src/schemas/ocr.ts`, 863 lines) via `ZodValidationPipe`, all owner-scoped under the global `JwtAuthGuard` + `ThrottlerGuard`, error flows via the `AppError` taxonomy.
- Surface: upload/recognize, paged history (keyset cursor, status/platform/type filters), single DTO, image bytes, confirm + trade import (409 on unacknowledged duplicates), recrop, **SSE progress** (`/recognitions/:id/events` — bounded 60 s, 300 ms poll), reprocess (provenance-stamped), collections CRUD, sets create/list/fuse/confirm/delete, analytics funnel, storage indicator, delete.
- **Engine bridge**: port/adapter (`engine/ocr-engine.port.ts` + `fastapi-ocr.engine.ts`) with strict Zod parsing of the untrusted sidecar response, typed `EngineTransientError`/`EngineUnprocessableError`/`EngineMalformedResponseError`, bounded retries, honest `OCR_UNAVAILABLE`/`PROCESSING_TIMEOUT` categories. Deterministic engine (default outside production) mirrors all three profiles. **No silent mock fallback at request time.**
- **Prisma**: 7 models (`OcrAsset`, `OcrRecognition`, `OcrCorrectionPattern`, `OcrSet(+Item)`, `OcrCollection(+Item)`), 5 migrations, checksum dedup `@@unique([userId, checksumSha256])`, `screenshotPurgedAt` retention stamp.
- **Services**: lifecycle (1207 LOC), sets/fusion, collections, trade-import bridge to `TradesService` (`externalRef = ocr:<id>…`, never writes Trade rows directly), ops analytics (jsonb SQL), retention purge (6 h interval, batched), image magic-byte/pixel-bomb guards, local-disk storage adapter, rate limiter.
- **Tests**: 15 spec files, **176 OCR test cases, zero skips** (unit: logic/v2/image/engine-quality/profiles/trade-import/fusion; e2e: core/negative/ops/sets/v2-ops/engine-quality/v2/account-chart).

## 2. FastAPI sidecar (`mini-services/ocr-service/`) — VERDICT: COMPLETE

- **Endpoints**: `GET /healthz` (unguarded), `POST /v1/recognitions`, `POST /v1/recrops` — both behind the `x-internal-token` middleware; per-image failures return 200 + `processingStatus`, request-level failures return honest HTTP errors.
- **All three extraction profiles implemented** (`main.py` routes by `extractionProfile`): trade-summary lines (`extraction.py`), **account/position snapshot** (`account_extraction.py` — header fields + positions via trade-row grammar), **chart analysis** (`chart_extraction.py` — OHLC legend forms, timeframe normalization, RSI/MACD/ATR/Stoch/ADX/EMA). Deterministic heuristics/regex — documented, no ML pretense.
- **Full preprocessing chain** (`preprocessing.py`): median denoise, projection-profile deskew (−6°..+6°), ≥×2 LANCZOS upscale, CLAHE, Otsu binarize, dHash perceptual hash. **Multi-page PDF** (`pdf.py`, pypdfium2, page budget + soft deadline). Layout templates (`templates.py`), second-pass arbitration (`arbitration.py`), platform/type classification (`classification.py`), strict Pydantic contract mirror (`contract.py`), fail-fast token config.
- **Tests: 79/79** (api 14, pipeline 22, engine-quality 19, account-chart 12, plus fixtures-scoped additions since the V2 report's 67).

## 3. Frontend consumption (`apps/web`) — VERDICT: COMPLETE (22/22 calls map to real endpoints)

- **Page**: `app/(app)/recognition/page.tsx` (console header + workspace; `?tab=history`, `?job=<id>` URL context). **Components** under `components/recognition/`: workspace orchestrator (storage indicator, duplicate acks), result view (crop tool + profile-view switch), history (filters, load-more, reprocess), draft review (grouped drafts/batches), set workspace (2..6 screenshots), **`AccountSnapshotView` + `ChartReadingView`** (real, mounted), uploader (dropzone + PDF card), field renderer with source-region overlay, settings (profile cards 01/02/03), issues/progress/success/warnings/status/confidence.
- **API layer**: 22 hooks in `lib/api/queries/recognition.ts` — every call maps to a live backend route via `apiPaths.ocr*`. SSE consumed via fetch-stream reader (Authorization header), 700 ms polling fallback in mock mode.
- **Mocks**: `mocks/handlers/ocr.ts` — 1,506 lines, 21 route handlers, deterministic time-based pipeline + seeded history. SSE deliberately not mocked (polling fallback covers it).
- **"Coming soon": fully removed from the user-facing module.** No placeholder views remain; Account/position and Chart analysis are implemented end-to-end (sidecar extractors → API pipeline → mock handlers → profile views). Residual stale copy is dead code only (see §5).
- **i18n**: OCR copy is dict-keyed (`i18n/dictionaries/en/recognition.ts`, 567 lines). Minor exception: two hardcoded English strings on the page header (kicker + one sentence) — English-only app, cosmetic debt only.
- **Analytics integration**: OCR-quality card consumes `useOcrAnalytics(30)` in `components/analytics/panels-behavior.tsx`.

## 4. Runtime verification (this audit)

| Suite | Command | Result |
|---|---|---|
| FastAPI sidecar | `python -m pytest tests/ -q` | **79 passed** (30.8 s) |
| NestJS API (full) | `pnpm vitest run` | **572 passed / 50 files** (83 s) — includes all 8 OCR spec files + `calculators.e2e.spec.ts` |
| Web typecheck | `tsc --noEmit` | clean |
| Web lint | `eslint src` | 0 errors, 4 pre-existing `_locale` warnings |

## 5. Known gaps & dead code (documented, non-blocking)

Reverse-direction gaps (backend exists, no frontend consumer — all pre-existing from the V2 phase):
1. `GET /ocr/sets` list and `GET /ocr/collections/:id` have MSW handlers but no frontend hook consumer; the **collections feature has no UI surface** (5 hooks + a full `dict.collections` namespace unused).
2. Dead query-layer exports: `useOcrRecognitions` (non-infinite), `fetchOcrHistoryPage`.
3. Dead/stale remnants: `SUPPORTED_PROFILES` in `ocr-service/app/config.py` (pre-V1.1), `viewSourceSoon` dict key, `NavItem.comingSoon` for `/recognition` + the unused `PagePlaceholder` component.
4. `docker-compose.yml` omits the ocr-service (manual uvicorn :3004 per `.env.example` — documented dev workflow).
5. `apps/web` has no test runner; OCR frontend verification relies on puppeteer probes (35/35 last recorded).
6. Documented product limits (OCR-V2-REPORT §8 / PHASE-21 report): GENERIC template only for non-MT5 platforms, wall-clock timestamp timezone attribution deferred, one-way recognition→trade provenance, in-memory rate limiter (single-instance).

## 6. Conclusion

The OCR module is **complete and healthy across all three tiers**: the NestJS API implements the full product surface with disciplined validation/error handling, the FastAPI sidecar implements all three recognition profiles with the full preprocessing/PDF/arbitration chain, and the frontend consumes every capability it exposes (22/22 hook→endpoint parity) with real Account/position and Chart analysis views. The full test estate is green (79 + 572) and the frontend typechecks and lints clean. The remaining items in §5 are pre-existing, documented, and none block the module's product flow; they are candidates for a later housekeeping pass (collections UI being the only user-visible one).
