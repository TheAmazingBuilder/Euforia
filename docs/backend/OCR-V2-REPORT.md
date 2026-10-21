# OCR V2 — Complete Feature Expansion Report

Implements the V2 master specification (§1–§105) on top of the existing OCR
platform (V1 workspace + Phase 21 Trading Core bridge + engine-quality
phase). Methodology per §2/§8: **audit → reuse → extend → implement →
verify**. No ML/LLM (§5) — Tesseract ×2 passes, keyword classification,
deterministic fusion and validation only. Five commits: `fbb70b0` →
`54cd294` → `c7cc521` → `81746de` → `aa18738`.

## 1. Audit findings

Already existed and was REUSED (never rebuilt): single-image pipeline
(validation → dHash → preprocessing → dual-pass OCR → templates →
extraction → arbitration → multi-trade candidates → PDF → recrop), NestJS
job lifecycle with guarded transitions + idempotent confirmations, grouped
confirmation, Trading Core bridge, SSE, retention, analytics funnel,
corrections memory, rate limiting, pHash screenshot duplicates, IDOR/audit
coverage, the full review workspace, cross-field SL/TP validation
(`applyDomainValidation` already implemented BUY: SL<entry<TP).

Genuinely new: everything listed in §2–§7 below.

## 2. Backend — sidecar (pipeline v3.0.0)

- **Platform detection (§18)**: MT5/MT4/TRADINGVIEW/CTRADER/NINJATRADER/
  INTERACTIVE_BROKERS/DERIV — weighted keyword sums, UNKNOWN explicit below
  0.2 (`classification.py`).
- **Screenshot types (§19)**: TRADE_HISTORY / OPEN_POSITION / ORDER /
  TRADE_DETAIL / ACCOUNT_SUMMARY / CHART / POSITION_DETAIL (+ legacy values
  kept valid). Documented structural rules (direction counts, trade labels).
- **Checksum verification (§20)**: declared SHA-256 recomputed and compared
  (images AND PDFs) — mismatch → UNPROCESSABLE/VALIDATION_FAILED.
- **exitPrice (§11)**: explicit label shapes only ("Exit price", "Closed:");
  the bare history-row word "close" never captures volume. Labeled followers
  must be whole-token decimals (fixes a latent null-valued field bug).
- **LONG/SHORT** are first-class direction words (§11).
- **Honest observability**: pass label `block_psm3` (the old `block_psm6`
  claimed a config that was never passed); recrop degrades to single-pass
  with SECOND_PASS_UNAVAILABLE instead of failing.
- **Manifest fix (§10)**: numpy + pypdfium2 declared in requirements.txt.
- Tests: **67/67 pytest** (was 46).

## 3. Backend — NestJS

- **Decision layer** (`ocr.logic.ts`, pure): structured issues
  (`deriveRecognitionIssues`, 12 codes §16), quality score
  (`computeQualityScore`, documented weights 0.4/0.25/0.2/0.15 §15),
  timeline (`buildRecognitionTimeline` §23), trade-duplicate evidence
  (`tradeDuplicateEvidence` §4). Timestamp order rule close≥open (§17).
  Issues/quality/timeline are DERIVED at read time — confirmed rows never
  mutate (§33).
- **Trade duplicate detection (§4)**: content match against existing Trades
  (instrument+direction prerequisites, ENTRY_PRICE exact-decimal or
  ENTRY_TIME ±48h evidence) at processing time; advisory on the result.
- **Duplicate acknowledgment gates (§58)**: confirmation is blocked (409
  OCR_DUPLICATE_UNACKNOWLEDGED / OCR_TRADE_DUPLICATE_UNACKNOWLEDGED) until
  the matching flag is explicitly acknowledged.
- **Multi-screenshot sets (§1/§2/§18)**: OcrSet + OcrSetItem (migration
  `20261007031808`); members run the FULL single pipeline through
  OcrService; `fusion.logic.ts` combines evidence (agreement boost capped
  0.99, conflicts recorded with both values + provenance, single-source
  honest, coherent = symbol+direction correlation §14); fused confirm
  imports through the SAME bridge with set-scoped ref `ocr:set:<id>`;
  deleting a set keeps every member (§15).
- **Reprocess (§32/§39)**: fresh, independent recognition from the same
  asset (`reprocessedFrom` provenance), revision-scoped idempotency,
  purged asset → 409; original never mutated (§33).
- **Collections (§28)**: OcrCollection/OcrCollectionItem
  (migration `20261007031836`) — named, owner-scoped, unique names, idempotent
  membership, deletions keep recognitions.
- **Analytics (§30)**: correction rate (null when no basis), platform/type
  distributions from the classification jsonb.
- **History (§62)**: server-side platform/screenshotType jsonb path filters.
- Tests: **558/558 vitest** (24 decision-layer unit + 9 fusion unit + 14 new
  e2e incl. IDOR + acks + sets lifecycle).

## 4. Frontend (Le Registre preserved — stamps, ledger rules, one accent)

- Source-region **overlay** with letterbox mapping + field↔region
  bidirectional highlight (§10/§55); quality score block (§15); issues panel
  with per-code explanations (§16); timeline (§23).
- Duplicate banners upgraded to the **3-affordance flow** (§58) with
  evidence stamps; server-enforced acknowledgments.
- **Confirmation dialog** (§60 triad) showing USER_CORRECTED rows (§59).
- **SetWorkspace**: multi-file pick → fused draft review (member strip,
  per-member confidence, conflict resolution) → fused confirm.
- History: keyset **Load more** (`useInfiniteQuery` — no cascading
  effects), corrected/flagged filters, per-row reprocess, corrected marker.
- LIVE storage/retention indicator (was dead code); analytics card carries
  correction rate, avg duration, platform/type distribution stamps (§30).
- Trade Review prefill (§24): satisfied BY REUSE — the reflect form already
  hydrates from the canonical Trade the bridge created (§8 rule).
- Evidence: tsc 0, eslint 0 errors, build green, recognition probe **24/24**,
  rebrand probe **17/17**, pageerrors=0.

## 5. Contracts

Shared `packages/shared/src/schemas/ocr.ts` extended additively only (old
persisted rows keep parsing): platform enum, screenshot types, issues,
quality score, timeline entries, possible trade duplicate + evidence,
sets, collections, reprocess, confirm ack flags, analytics extensions,
`reprocessedFrom`. Security events: OCR_REPROCESSED,
OCR_COLLECTION_CREATED/DELETED.

## 6. Security

No new surface without ownership checks: sets/collections/reprocess are
owner-scoped (404, never 403 leaks), reprocess rides the upload rate limit,
foreign recognitions cannot join a collection, the sidecar token is
unchanged, no image data in logs (§36). Absent confirm bodies behave as the
valid no-correction payload — never a 500 (§76).

## 7. Commands executed (evidence)

- `pytest tests/ -q` (sidecar) → 67 passed
- `vitest run` (api) → 558 passed (43 files)
- `tsc --noEmit` api + web → clean; `eslint` touched files → clean
- `next build` → green; recognition probe 24/24; rebrand probe 17/17
- `python3 scripts/ocr-engine-quality-verify.py` on the real Tesseract
  5.5.0 stack → **ALL CHECKS PASSED** (16 checks, 5.3s)

## 8. Remaining limitations (honest, §104.10)

- MT4/cTrader/NinjaTrader/IBKR/Deriv are DETECTED (platform label +
  per-platform layout templates remain MT5-only; non-MT5 platforms use the
  GENERIC template — extraction quality for their layouts is unverified
  against real screenshots).
- Set fusion requires the members' engine evidence; there is no
  cross-set "possible group" proposal yet — grouping is user-explicit.
- Reprocess idempotency is revision-scoped (a retried POST can produce two
  runs; bounded by the upload rate limit).
- Collections expose no per-collection page in Analytics (funnel stays
  global).
