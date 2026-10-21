# COSMOZ — BACKEND PHASE 21
## OCR Confirmation → Trading Core Bridge — Final Report

| | |
|---|---|
| **Date** | 2026-10-07 |
| **Base** | Phase 19 OCR (`20261004015123`) + Trading Core (journal) + Accounts/Identity/Security/Monitoring |
| **Scope** | The ONE deferred Phase 19 item: the sanctioned **confirmation → canonical Trade** path. NO ML, NO LLM, NO broker execution, NO second Trade pipeline. |
| **Verification** | tsc 0 · lint 0 · api **480/482** (2 pre-existing failures on HEAD, unrelated) · sidecar pytest **27/27** · web build + probes **24/24** + **17/17** · **PHASE 21 RUNTIME VERIFICATION: ALL CHECKS PASSED** (real sidecar + real Tesseract + compiled API + dev DB) |

---

## 1. Executive Summary

The Phase 19 audit found the OCR backend complete with ONE documented
deferral: *« Trade-creation flow after confirmation is DEFERRED until
Trading Core exists server-side »*. Trading Core now exists. This phase
closes the deferral with the smallest possible surface: an orchestration
bridge that runs **after** the confirmation commit and creates the
canonical Trade through `TradesService.createTrade` — the existing
application service. The confirmation contract, its idempotency and the
human-in-the-loop guarantee are unchanged; an import problem can never
fail a confirmed recognition (§126 failure isolation — it becomes a
stable warning + an audit fact instead).

## 2. Repository Audit (§8–§26)

- **Existing OCR**: full Phase 19 bounded context (`modules/ocr/` —
  controller/service/repository/logic/rate-limiter/image-validation/
  storage port/engine ports) — REUSED, not rebuilt.
- **FastAPI**: `mini-services/ocr-service` (Tesseract + deterministic
  heuristics, `x-internal-token`, stateless, no DB) — REUSED untouched;
  27/27 pytest re-verified.
- **Trading Core**: `TradesService.createTrade` (account ownership check,
  contract-size sizing, server-computed P&L, `externalRef` dedup) +
  `importTrades` (persisted-default-account convention, symbol→catalog
  lookup) — REUSED as the only creation path.
- **Storage / queue / monitoring / auth**: existing ports untouched.
- **Frontend**: the rebuilt Import & Recognition workspace already
  consumes the Phase 19 contract 1:1 — untouched except two additive
  type-compat adjustments (`tradeId: null` in MSW seeds, 2 audit labels).
- **SPEC-3**: the backend master prompt matches the repository spec
  `docs/specs-recovered/SPEC-3-ocr-backend-nestjs-fastapi.md` (same doc).

## 3. FastAPI / Python Audit (§11–§17)

Python runtime + Tesseract binary verified live (sidecar booted, engine
version reported on every recognition). NO new Python dependency; NO
system dependency added. Dependencies intentionally NOT added: any ML/LLM
stack (§4/§5/§119).

## 4. Frontend Audit (§7/§10)

Routes/components/hooks/MSW handlers = the Phase 19 contract verbatim.
Compatibility decisions: `OcrRecognition.tradeId` is additive-nullable —
existing views ignore it; the mock backend keeps NEVER creating trades
(mock = the ApiRecognitionService's honest mirror, not a second product).

## 5–6. Architecture (unchanged shape, one bridge added)

```text
Browser ── JWT ──► NestJS OcrController (unchanged surface)
                     confirm = validate → canonicalize → persist → audit
                     └─► OcrTradeImportService (Phase 21 — orchestration ONLY)
                           ├─ account: persisted default (importTrades convention, §81)
                           ├─ instrument: catalog lookup only (§50 — no invented alias)
                           ├─ duplicate: externalRef `ocr:<recognitionId>` (§79)
                           └─► TradesService.createTrade (§77 — canonical path)
                                 └─► PostgreSQL (Trading Core owns the row)
FastAPI sidecar (:3004, x-internal-token) — UNCHANGED, no DB, no identity
```

The bridge never writes a Trade row (no `prisma.trade` in OCR code), and
the trade never depends on the recognition.

## 7–12. Pipeline / Recognition / Confidence

Untouched (Phase 19 owns them). The bridge consumes the MERGED fields
(user corrections authoritative, confidence 1 after review — §21).

**Import floor** (deterministic, documented): a decimal participates only
when finite and > 0; review-layer statuses (AMBIGUOUS/LOW_CONFIDENCE/
INVALID) stay review signals the user already saw. Core set
(symbol+direction+entryPrice+volume) must resolve → else the import
SKIPS (`TRADE_IMPORT_SKIPPED_INCOMPLETE`) — never fabricates (§44/§54).

**Variant rule**: CLOSED only when BOTH exitPrice and closeTime are
confirmed (exitReason MANUAL, like the CSV import); otherwise OPEN. P&L
is NEVER copied from OCR — Trading Core recomputes it (§55/§15).

## 13. OCR Job Lifecycle — unchanged; 14. RecognitionResult

+ `tradeId` (nullable) — additive contract/Prisma/migration
  `20261007010000_ocr_trade_link` (FK ON DELETE SET NULL + index).
Provenance (§82): `source: "IMPORT"` on the trade (capture input gained
an optional `source`, default MANUAL) + `Imported from screenshot
recognition (recognition <id>)` in the trade notes.

## 15–17. Draft / Confirmation / Trading Core

The draft remains the review UI's view of the merged fields; confirmation
stays: authenticate → authorize → load → own → validate (§76) → persist
→ audit → **then** the bridge resolves account/instrument/duplicate and
creates the Trade. Idempotent replay returns the linked row.

## 18–23. Storage / Queue / Security / IDOR / Monitoring / DB

All reused unchanged (local-disk port, request-scoped processing,
ThrottlerGuard + OCR limiters, SecurityEvent ledger). New audit facts:
`OCR_TRADE_IMPORTED`, `OCR_TRADE_IMPORT_SKIPPED` (additive enum values).
DB: one additive migration; `prisma migrate deploy` applied to the dev
DB; test DB applies via global-setup.

## 24–26. Tests

- **Unit** `ocr-trade-import.spec.ts` (11): eligibility floors, variant
  rules, optional-field drops, provenance, no profit passthrough.
- **e2e** `ocr.e2e.spec.ts` +7 (Phase 21): real AppModule/DB/engine —
  confirm creates the trade and mirrors merged values; replay never
  duplicates; unknown symbol → honest skip; no account → honest skip;
  recognition delete keeps the trade; IDOR; **§102** no-confirm-no-trade
  (Phase 19 suites still assert the boundary).
- **Regression (runtime-found)**: replay in RAW user form must 200 — the
  canonicalization now precedes the replay comparison (§51).
- **Contract**: shared schemas updated additively; e2e parses through them.

## 27–28. Runtime + Build Verification

`scripts/phase21-runtime-verify.sh` — **ALL CHECKS PASSED** (real sidecar
+ compiled API + dev DB): account connect → real screenshot → Tesseract
extraction → confirm → trade linked → journal asserts (source IMPORT,
SL/TP/quantity mirrored, §54 honest OPEN when exit unreadable) → replay
×1 trade → recognition delete keeps the trade. Web build green; probes
24/24 (recognition) + 17/17 (rebrand) with zero pageerrors.

## 29. Files Changed

`packages/shared/src/schemas/{ocr,security,trade}.ts` ·
`apps/api/prisma/schema.prisma` + migration ·
`apps/api/src/modules/ocr/{trade-import.logic,ocr-trade-import.service,
ocr.service,ocr.repository,ocr.module}.ts` ·
`apps/api/src/modules/trades/trades.service.ts` (+3 lines: source
passthrough) · `apps/api/test/{unit/ocr-trade-import,e2e/ocr,e2e/
integrations.e2e}.spec.ts` · `apps/web/src/mocks/handlers/ocr.ts` +
`security-primitives.tsx` (type-compat only) ·
`scripts/phase21-runtime-verify.sh` (new).

## 30. Dependencies Added

NONE (Python or Node). Intentionally not added: ML/LLM/vision stacks.

## 31. Issues Fixed

1. **§51 replay bug (runtime-found)**: raw-form retries 409'd — fixed +
   regression test.
2. **Typecheck gate restored**: 7 pre-existing `noUncheckedIndexedAccess`
   errors in `integrations.e2e.spec.ts` (on HEAD) fixed — `tsc` is 0 again.

## 32. Issues Not Fixed (pre-existing, out of scope)

2 e2e failures fail IDENTICALLY on HEAD without this change:
`discipline B4 tradesToday` (count returns 0) and `session B5 timeline`
— unrelated modules, documented for their owners. 480/482 = everything
else green including all 33 OCR-bridge tests.

## 33. Known Limitations

1. Wall-clock timestamps (TIMEZONE_UNKNOWN) are written via the capture
   path's server-time interpretation — timezone attribution remains the
   documented Phase 19 deferral.
2. Broker-suffixed symbols (XAUUSDM) are honest `UNKNOWN_SYMBOL` skips —
   the user corrects the symbol in review (no invented alias tables, §50).
3. Recognition delete never deletes the linked trade (one-way
   provenance) — by design (§77).

## 34. Deferred Features

Account picker in the review UI (the bridge accepts the persisted default
today; an explicit verified `accountId` can extend the confirm contract
when the UI ships) · object-storage adapter · external queue.

## 35. Verification Commands

```bash
cd apps/api && npx tsc -p tsconfig.json --noEmit && npx vitest run
cd mini-services/ocr-service && python3 -m pytest tests/ -q
bash scripts/phase21-runtime-verify.sh
cd apps/web && npx next build && node scripts/verify-recognition.js && node scripts/verify-rebrand.js
```

## 36. Final Status

**FINALIZED** — every acceptance criterion of §139 that Phase 19 left
open (Canonical Trade integration, Existing Trading Core reused,
confirmation-gated creation) is implemented AND verified by execution;
everything Phase 19 already verified remains green. The 2 unrelated
pre-existing e2e failures are reported, not hidden (§144: they do not
belong to this feature's surface).

**STOP** — no ML, no LLM, no Chart Intelligence, no backtesting, no
broker execution (§148). Screenshot → Recognition → Proposal → Human
review → Confirmation → Canonical Trade.
