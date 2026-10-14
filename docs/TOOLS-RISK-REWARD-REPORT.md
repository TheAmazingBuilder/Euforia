# Risk/Reward Calculator & Win Rate Cheat Sheet — Final Implementation Report

Module: TOOLS › Risk Reward (`/tools/risk-reward`) · Date: 2026-10-14 · Commit: `e50d429`
Specification: client-supplied 18-section spec (audit → constraints → calculator → matrix → tests A–L → DoD §17 → report §18).

## A. Audit findings

- **Architecture**: pnpm + Turborepo monorepo — `apps/web` (Next.js 16 App Router, React 19, Tailwind v4 CSS-first), `apps/api` (NestJS/Fastify), `packages/shared` (pure utils + Zod schemas consumed by both sides).
- **Reusable pieces identified and reused**: `CalculatorField`, `PresetChips`, `BreakdownLedger` primitives, `CopyButton`, `ToolCard` (`calculator-shared.tsx`); money/percent formatters (`formatMoney`, `formatSignedMoney`, `formatPercent`, `formatNumber`) from `@cosmoz/shared`; the Zod-over-raw-strings + stable-error-codes pattern of `calculator-model.ts`; the page pattern (server component + `getNavItem` metadata + `font-heading` h1); shadcn `Select` and Radix `Tooltip` (no new dependencies, no charting library).
- **Integration decisions**: frontend-only deterministic math (spec §3 MVP, §16 explicitly excludes backend services for this calculator — none built, no DB writes). Auth/route protection inherited automatically from the `(app)` route-group `AuthGate`. i18n: EN-only product — all copy in a new `tools.riskReward` dictionary namespace; nav labels auto-derive from `SIDEBAR_ITEMS`.

## B. Implementation summary

**Shared engine — `packages/shared/src/utils/risk-reward.ts`** (exported via barrel):
- `computeRiskPerTrade` (percent: B×q/100; fixed: F — both validated, caps documented), `computeRewardAmount` (G=L×R), `computeRewardMultiple` (R=TP/SL, division-by-zero reported), `computeBreakEvenWinRate` (1/(1+R)), `computePercentOfBalance`, `computeExpectancy` (the matrix-cell engine), `buildRiskRewardMatrix` (rows × columns, every cell computed independently).
- Product caps (never silent clamps): balance ≤ 1e12, risk ≤ 1e12, R ≤ 1000, N ≤ 1,000,000, |net| ≤ 1e15; documented tolerance `RR_BREAK_EVEN_TOLERANCE = 1e-9` scaled by gross magnitude.
- Defaults: win-rate columns `20–100%` (10), ratio rows `1:1–1:5`, extras `1:6/1:8/1:10`.

**Web model — `risk-reward-model.ts`**: Zod validation of raw form strings with 9 stable error codes mapping 1:1 to dictionary keys; mode switching preserves values; fixed risk > balance rejected (non-compounding model, spec §5.1.B); derives risk amount, reward amount, break-even, % of balance, and the full matrix (default rows + user-toggled extras).

**Web UI — `risk-reward-calculator.tsx`** (client component):
- Section A: balance + currency, segmented risk-mode toggle (percent / fixed) with presets, segmented ratio-mode toggle (R multiple / monetary SL-TP amounts), trade count with presets, Reset. **No Calculate button — every value recomputes on every keystroke** via pure `validateRiskRewardForm` in `useMemo`.
- Live summary (`stat-strip`): risk per losing trade, reward per winning trade (heroes) + break-even win rate, R:R, risk % of balance, reward % of balance (KPIs) + Copy summary.
- Section B: `Win Rate Cheat Sheet` matrix — semantic `<table>` (caption, `th scope=col/row`), sticky ratio column, horizontal scroll on narrow viewports, extra-row toggles; each cell renders classification (LOSS / BREAK EVEN / PROFIT) + exact signed monetary result, and a Radix tooltip (keyboard-focusable, portaled) with expected wins/losses, gross profit/loss, net, break-even threshold and the margin-vs-threshold delta.
- How-it-works ledger + disclaimer (theoretical expected values, fixed risk, no compounding, no costs).

**Navigation**: `NavItem` `Risk Reward` (Target icon) + `Tools` section href; command palette, topbar title/breadcrumb and mobile coverage follow automatically.

**CSS**: `.rr-*` primitives in `globals.css` — outcome tints built with `color-mix` from the semantic tokens (`--loss`, `--profit`, `--warning`) so all three themes re-tint with zero hardcoded hex in TSX; classification always carried by text, never color alone.

## C. Calculation verification

- Primary formula (spec §6): **P = N × L × [p·R − (1 − p)]**, computed as `W×G − D×L` with `W = N×p` kept as the exact expected value (spec §11.1 — never pre-rounded), `D = N − W`.
- Risk: L = B×q/100 (percent) or fixed amount; Reward: G = L×R; Break-even: 1/(1+R) — R=1→50%, R=2→33.33%, R=3→25%, R=4→20%, R=5→16.67% (unit-asserted).
- **Spec §13.1 Test E discrepancy, documented**: the spec prints "Reward multiple: 2" but its amounts ($1,200 gross / −$400 net) correspond to R=3; the primary formula gives −$800 for R=2. Mathematical correctness was kept (per the spec's Final Instruction): Test E asserts −$800 for R=2 and a companion Test E' reproduces the spec's literal −$400 vector with R=3.
- Classification uses the unrounded result with the documented tolerance; zero renders as neutral `$0.00` (no sign), negatives keep their class — never rounded into break-even. Formatting goes through `Intl.NumberFormat` via the shared formatters; every emitted decimal passes through `toDecimalString` (≤ 8 dp, float artifacts stripped).
- Every matrix cell is computed independently from its own (R, p) pair over the shared L and N — verified by the matrix-completeness test (each default cell's outcome re-derived from its break-even threshold) and by the null-propagation test (an invalid column surfaces as null, never a fabricated value).

## D. Testing results

| Check | Command | Result |
|---|---|---|
| Engine unit tests (spec A–L + edges) | `vitest run test/unit/shared-risk-reward.spec.ts` | **28/28 PASS** |
| Full API unit suite | `vitest run test/unit` | **765/765 PASS (47 files)** |
| Shared typecheck | `tsc --noEmit` (packages/shared) | PASS |
| Web typecheck | `tsc --noEmit` (apps/web) | PASS |
| Production build | `next build` | PASS — `/tools/risk-reward` prerendered |
| Lint | eslint api + web | 0 errors (pre-existing warnings only) |
| Runtime probe | `node scripts/verify-risk-reward.js` | **ALL PASS (23/23)** — nav, live math, spec vectors E'/F/G, tooltip, live recompute, mode switches, extra row, reset, invalid inputs |

Test-infrastructure repair (committed alongside): the `cosmoz_test` database was in a dirty P3018 state, and a from-scratch `migrate deploy` is order-inverted (20261003145823_trade_review references `Trade`, created by 20261004120000_trade_journal_core — a recovery-session artifact). Fix: `scripts/baseline-test-db.js` recreates the test DB, pushes the current schema (`prisma db push`) and marks all 39 migrations applied — the standard Prisma baselining procedure; no migration files were touched, dev DB untouched, future migrations apply normally on top.

## E. Design and UX

- References informed: dark educational cheat-sheet (explanatory panel + red/yellow/green matrix) and the large win-rate grid — reproduced functionally (classification + exact amounts per cell, break-even neutral state) with Euforia's ledger design system: `ToolCard` frames, mono tabular numbers, `ledger-label` annotations, token-driven tints instead of the references' solid fills (theme-safe, light-mode-safe).
- Responsive: two-column desktop (inputs 5 / summary 7), matrix full width with horizontal scroll + sticky ratio labels; controls stack on mobile; touch targets ≥ input height.
- Accessibility: labelled inputs with `aria-invalid` + inline `role=alert` errors; `aria-pressed` segmented toggles; semantic table markup; cells are focusable buttons whose tooltips open on keyboard focus with full detail; text classification never relies on color; `aria-live=polite` summary.

## F. Remaining limitations

- Fixed-risk, non-compounding, cost-free model only (per spec §6/§11/§16) — no commissions/spread/slippage/swaps, no instrument-specific pip/tick sizing, no account compounding, no backend persistence of calculator state (spec §16 explicitly excludes all of these for the MVP).
- Win-rate columns are the 10 defaults; custom column sets would be a small extension of `RiskRewardDerived.winRates`.
- No component-test runner exists in `apps/web` (repo-wide reality) — interaction coverage is provided by the Playwright probe instead; the pure layers (engine + model) carry the unit-test weight.

## G. Final status

**COMPLETE** for the MVP scope defined by the specification: all 17 Definition-of-Done items satisfied (integration, conventions, reactive calculator, both risk modes, both ratio modes, break-even, configured matrix, per-cell classification + exact amounts, accessible color states, cell details, invalid-input handling, responsive layout, automated tests, executed checks, no unrelated breakage — verified by the full suite and the runtime probe).
