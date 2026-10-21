# COSMOZ — TOOLS MODULE AUDIT REPORT (Lot Size + Compounding)

| | |
|---|---|
| **Date** | 2026-10-08 |
| **Head at audit time** | post `feat(ocr): collections in the result view + "by collection" history filter` |
| **Scope** | The TOOLS section end-to-end: shared calculation layer, frontend models, both calculator UIs, navigation, i18n, probe coverage. Frontend-only V1 — spec constraint: NO backend, NO Prisma, NO NestJS endpoints, NO FastAPI services, NO broker integration, NO persistence for this feature. |
| **Method** | Code-path audit executed against the real shared code (calculation vectors actually computed), greps for discipline violations, full verification suites re-run. |

---

## 1. Verdict — COMPLETE AND SPEC-COMPLIANT (8/9 checklist points PASS, minor housekeeping closed same day)

### 1.1 Frontend-only discipline — PASS

- Zero matches for `apiRequest | useQuery | useMutation | fetch( | axios | prisma | @nestjs | /api/ | /ocr` and zero `lib/api` imports across both page dirs (`app/(app)/tools/*`) and all of `components/calculators/`.
- Pages are thin server components composing dict + calculator components; all math flows client-side: UI → `calculator-model.ts` → `@cosmoz/shared` (`calculateCompounding`, `computeRR`, `toDecimalString`).
- **Scope observation (documented, not a violation of the TOOLS V1)**: a Phase-18 NestJS module exists at `apps/api/src/modules/calculators/` (POST `/calculators/lot-size`, `/calculators/compounding`). The TOOLS UI deliberately never calls it — the frontend-only constraint holds from the UI side; the pre-existing backend is a separate, earlier feature with its own tests (included in the 580 API pass).

### 1.2 Lot Size math — PASS (spec vectors executed)

Pure function: `calculator-model.ts` `calculateLotSize`; RR via shared `computeRR`.

- Risk Amount = Balance × Risk% — exact.
- perUnit = |entry − stop| × contractSize; raw = riskAmount / perUnit; 6-decimal float guard; **floor to the broker volume step** (never up); realized risk = size × perUnit ≤ budget by construction; explicit `BELOW_STEP` status (positionSize "0", realizedRisk "0") — **no silent clamping**.
- Direction rules enforced before math: BUY requires SL < entry, SELL requires SL > entry; direction never changes the size (symmetric distance).
- **Executed vector** ($10,000 / 1% / XAUUSD 2650 / SL 2640; preset specs XAUUSD pipSize 0.01, contractSize 100, volumeStep 0.01): risk amount **$100** ✓ · stop distance 10.00 = 1,000 pips ✓ · per-lot risk $1,000 ✓ · raw 0.1 → floored **0.10 lots**, realized **$100**, status VALID ✓ — pinned in `apps/api/test/unit/shared-compounding.spec.ts`.
- RR: reward/risk, signed, null without TP. **Documentation correction**: RR 1:2.35 corresponds to TP 2673.50 — which is exactly what the UI placeholder and the probe use; the earlier conversation's "TP 2660 → RR 2.35" pairing was internally inconsistent (2660 yields 1:1.00). The implementation is mathematically correct.

### 1.3 Compounding math — PASS (spec vectors executed)

Pure function: `packages/shared/src/utils/compounding.ts` `calculateCompounding`.

- Per-period loop `ending = starting × (1 + r)` — gain added back to the running balance each period; the annualized form `A = P(1+r/n)^(n·t)` is deliberately NOT used and documented as an extension seam.
- Total Profit = final − **initial**; Total Gain = ((final/initial) − 1) × 100 (cumulative, not per-period).
- **Executed vector** ($1,000 / 20 periods / 5%): final `2653.29770514` → **$2,653.30** ✓ · profit `1653.29770514` → **+$1,653.30** ✓ · gain `165.32977051` → **+165.33%** ✓. Row 2 starts at 1,050 (compounding on the running balance) ✓.
- Negative rates supported [−100 %, +10 000 %] for drawdown what-ifs (−2 % × 10 → 817.07; never a negative balance; −100 % floors at 0) — the shared layer deviates deliberately from the growth-only server contract and documents it.
- Full precision in the loop; `toDecimalString` (≤ 8 dp) only at emission — no intermediate rounding.

### 1.4 Validation — PASS

- Lot size: balance > 0, risk > 0 ∧ ≤ 100, entry > 0, SL > 0, TP > 0 when present, entry ≠ SL (`samePrice`), direction rules (`stopSideLong`/`stopSideShort`), instrument required; raw-string Zod layer rejects non-numeric junk.
- Compounding: balance > 0, integer periods 1..1000, gain ∈ [−100, 10 000] (deliberate, documented what-if range; server contract stays [0, 10 000]).
- All inline errors are **stable dict-keyed codes** — components never hardcode error copy; the dict renders the messages.

### 1.5 Presets — PASS

- Risk presets 0.25 / 0.5 / 1 / 1.5 / 2 %; balance presets 100 / 500 / 1,000 / 5,000 / 10,000; gain presets 1 / 2 / 3 / 5 / 10 % — convenience only, never presented as advice.
- Instruments EURUSD / GBPUSD / USDJPY / XAUUSD / NAS100 / **BTCUSDT** with explicit, EDITABLE specs (the `__custom__` sentinel reveals empty advanced fields); "specs vary by broker" warning present; header doc: never presented as universally correct. **Naming note**: the preset ships as BTCUSDT (the real quoted Binance pair) where the earlier spec prose said BTCUSD — accepted, documented here.

### 1.6 UI structure — PASS

- **Lot Size**: hero "Recommended position size" + giant mono figure; stat band (Risk amount / Realized risk / Stop distance / R:R) in the ruled 12-column ledger; Calculation Breakdown ledger with double-rule final row and micro/mini/standard equivalence; Advanced Parameters disclosure with broker-spec warning; Long·Buy / Short·Sell segmented control; currency selector; explicit Calculate gate, then live updates; disclaimer (specs vary by broker — verify before executing).
- **Compounding**: **live calculation on every keystroke** (useMemo over values — no Calculate button, per spec); summary band Initial / Final / Total Profit / Total Gain (+signs, profit/loss tokens); results table Period / Starting Balance / Ending Balance / Total Profit / Total Gain with sticky header; **Account Growth chart on the existing ECharts bridge** (single shared instance, theme from CSS variables — no second chart library); mobile per-period cards fallback; compact "How it works"; disclaimer "mathematical projection — not a performance promise".

### 1.7 Navigation — PASS

- Sidebar section titled **"Tools"** (not "Features") with both hrefs; icons Scale / TrendingUp from lucide; `/tools` → redirect `/tools/lot-size`.

### 1.8 Tests & probes — PASS

- `apps/api/test/unit/shared-compounding.spec.ts` — exactly 8 unit tests: single period; the 20-period vector pinned to `2653.29770514`; 0 % flat; negative rates (never below zero); decimal % + cap boundary; contract-cap boundary; invalid inputs / overflow → null (never Infinity); lot-size vector parity (0.10 lots / $100 / 1,000 pips).
- Probe `scripts/verify-tools.js` — **38 passed / 0 failed / 0 pageerrors** (re-run this audit after the housekeeping below): spec vector 0.10 lots + $100 + RR 1:2.35 (TP 2673.50), direction errors, same-price error, advanced disclosure, compounding vector $2,653.30 / +165.33 %, live recompute 10 % → $6,727.50, negative rate loss tokens, periods error, mobile 390 px, light theme, sidebar navigation.

---

## 2. Housekeeping closed during this audit (same-day)

1. **Probe tautology fixed** — the mobile lot-size check ended in `|| true` (could never fail); replaced with a real assertion: no horizontal overflow at 390 px (`scrollWidth − innerWidth ≤ 1` → 0 px).
2. **Dead dict keys removed** — `result.rrUnit`, `result.stopPips`, `breakdown.stopPips`, `breakdown.pipSize` (zero component usages; the `result.stopPips` references in components are the calculation object, not the dict).
3. **Dead export removed** — `parseFormField` in `calculator-model.ts` (zero importers) + the orphaned `parseDecimal` import.

## 3. Remaining documented (accepted, non-blocking)

1. **Clipboard payloads in English** — the "Copy result" / "Copy summary" text built in `lot-size-calculator.tsx` / `compounding-calculator.tsx` is not dict-keyed (also the literal "pips" and "micro/mini/standard" strings). English-only app today; route through the dict when the locale pack returns.
2. **No web-side unit test for `calculator-model.ts`** — the shared layer and the spec vectors are pinned by API-side unit tests and the probe covers the model E2E; a small vitest for the model (BELOW_STEP, direction errors) would tighten the net if `apps/web` gains a test runner.
3. **BTCUSDT vs BTCUSD naming** — see §1.5; kept as the honest market symbol.
4. **Phase-18 `/calculators/*` endpoints** — pre-existing backend, intentionally unused by the frontend-only TOOLS V1; a future phase may either wire the UI to it (server-authoritative specs) or retire it.

## 4. Verification evidence (this audit)

| Suite | Command | Result |
|---|---|---|
| NestJS API (full, incl. 8 shared-compounding unit tests) | `pnpm vitest run` | **580 passed / 51 files** (84 s) |
| FastAPI sidecar | `python -m pytest tests/ -q` | **79 passed** (31 s) |
| Web typecheck | `tsc --noEmit` | clean |
| Web lint | `eslint src` | 0 errors (4 pre-existing `_locale`/`_language` warnings) |
| Web build | `next build` | OK (30 static routes, 3 under /tools) |
| TOOLS probe | `node scripts/verify-tools.js` | **38/38, 0 pageerrors** |
| Recognition probe (module neighbor sanity) | `node scripts/verify-recognition.js` | **51/51, 0 pageerrors** |
| Rebrand probe | `node scripts/verify-rebrand.js` | **17/17, 0 pageerrors** |

## 5. Conclusion

The TOOLS section is **complete, correct, and disciplined**: deterministic client-side math verified against the spec vectors, honest broker-step behavior, dict-keyed validation, the Le Registre design system respected (zero raw hex, console classes only), the TOOLS navigation named and wired as required, and every calculation path covered by a unit test or the probe. The housekeeping items found during the audit were fixed the same day; what remains documented in §3 is accepted debt with a clear path.
