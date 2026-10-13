# PHASE 02 REPORT — Accounts Module: Premium Frontend UX/UI and Hygiene

**Date:** 2026-10-13 · **Repository HEAD at start:** `1685ac6` · **Mode:** frontend implementation + scoped hygiene, no schema change, no dependency install.

Evidence labels used throughout: **IMPLEMENTED** (built this phase), **REUSED** (existing functionality consumed), **MOCK-ONLY** (behavior that exists only in the MSW layer), **UI-ONLY**, **MISSING BACKEND CAPABILITY** (documented dependency, not worked around), **VERIFIED BY TEST**, **UNVERIFIED**.

---

## 1. Executive Summary

Phase 02 is **COMPLETE**. The Accounts module now has a polished, honest, read-only frontend: a `/accounts` page (App Router `(app)` group, sidebar entry, breadcrumb, metadata), an overview with per-account cards and a four-metric summary strip, a connect wizard gated by the real provider registry, a detail drawer (Dialog desktop / Sheet mobile) with overview + three SEPARATE activity tabs (positions / orders / deals), and the full connection lifecycle — rename (PATCH), connection test (4 named checks), reconnect with fresh credentials, disconnect with `requireTyped` confirmation, manual sync. Every action maps 1:1 onto a real backend route; no execution control exists anywhere.

Acceptance criterion 1 is verified **over both transports**: the full connect → sync → inspect lifecycle passes over MSW (probe 25/25) **and** over the live bridge against the real NestJS API on `:4000` (probe 14/14) — real JWT, real AES-GCM credential vault, real zod re-validation. The Phase 00 hygiene register is cleared: the monitoring `SUCCESS` filter bug (fix + regression test), the `TradingAccountsController` register-or-delete decision (registered + latent PATCH bug found and fixed by its first-ever tests), the two dead `/accounts` links (now live), and the demo-marker rule (condition-on-mode chip on all three HIGH-risk fixture surfaces).

**Honesty posture preserved end-to-end:** the only connectable provider is the backend's `MOCK` adapter (`isMock: true`) and it is stamped "Simulated provider" on every surface that renders its data; planned providers render explicit "Planned — not connectable yet" states; `null` metrics render "—" never `0`; `LIVE` freshness reads "Fresh" and is footnoted as poll-based, never real-time; mock-mode fixtures carry a "Demo data" chip that disappears in live mode.

## 2. Phase 00 and Phase 01 Inputs Reviewed

- `docs/audits/PHASE-00-ACCOUNTS-CONNECTIVITY-AUDIT.md` — read in full. Load-bearing inputs: §4 (zero Accounts UI; design-system reuse map §4.4; the three fixture chains A/B/C), §5 (backend surface + rate limits), §12 classification, §16 defect register with path:line anchors.
- `docs/architecture/*` (Phase 01, all five deliverables) — read in full. Binding decisions consumed: doc B §3.1 state machines (connection vs sync axes, ERROR only on auth-class failures), §4.3 outcome table, §6 five value states (zero ≠ missing ≠ unsupported ≠ stale), §9 freshness semantics, §10 error mapping; doc C §2 canonical route surface + §2.2 register-or-delete decision + §8 execution red line; doc E Phase 02 scope + acceptance criteria + standing invariants.
- No contradiction between the spec (pasted Phase 02 mandate) and docs C/E was found; where the mandate's §7 IA differs in detail from doc E's scope list, the superset was implemented (every doc E item plus honest provider discovery).

## 3. Initial Accounts Frontend Audit (Stage A)

Conducted per spec §6 via two parallel evidence-gathering passes + direct source verification of every claim used by the implementation. Key verified facts:

- **No Accounts UI existed**: zero `apiPaths`/hooks/MSW handlers for trading connectivity; the only account surfaces were the journal catalog (`GET /accounts` → AccountSwitcher, sizer balance chain A), the simulated Integration Hub (monitoring chain B), and the honest `NOT_CONFIGURED` broker-session row (chain C — preserved untouched).
- **Route conflict resolved by reading source**: `GET /accounts` serves the journal identity list (comment "the exact contract the existing frontend consumes", `accounts.controller.ts:62-66`); the connectivity list (`listDetails`) and PATCH rename existed only on the unregistered `TradingAccountsController`. The UI therefore consumes the `/trading-accounts` surface; `GET /accounts` keeps serving the switcher.
- **Design system**: "Le Registre" tokens (dark navy, single cobalt accent, JetBrains Mono numerals, hairline borders, no nested cards); reusable primitives confirmed at exact paths: `ConfirmDialog(requireTyped)` + `SettingsCardSkeleton` (settings-primitives), `ageFromIso`/`NowClockContext`/`MetricLine` (monitoring-primitives), shadcn kit incl. Sheet/Tabs/Dialog, `formatMoney`/`formatSignedMoney`/`parseDecimal` (`@cosmoz/shared` money.ts — null-safe placeholder "—").
- **Conventions**: page = metadata + Suspense + one view component; nav registry `lib/navigation.ts` (getNavItem throws on unknown href); flat `apiPaths`/`queryKeys`; MSW utils `requireAuth/endpoint/latency/parseBody/toErrorResponse/pathParam`; typed EN-only dict namespaces; web "unit tests" = plain-TS assertion scripts run with bun (no vitest in web); Playwright probes with `domcontentloaded` + dev-overlay removal + `trader@cosmoz.app` demo login.
- **Backend truths verified before wiring**: providerId is `"MOCK"` (uppercase, case-sensitive); environments DEMO/LIVE only (PROP_FIRM → 502 `UNSUPPORTED_ACCOUNT`); failure-scenario secret prefixes; rate limits connect 5/reconnect 5/sync 20 per 15 min; wire shapes of positions/orders/deals are the Session-Live broker schemas verbatim (`direction`, `unrealizedPnl`, no `status`/`positionId` on the wire — the doc B prose mentions adapter fields, the code is authoritative).
- **Blockers found during audit**: none — backend complete, contracts UI-ready (Phase 01 verdict confirmed).

## 4. Existing Components Reused

| Reused | Source | Where consumed |
|---|---|---|
| `ConfirmDialog` (requireTyped) | `components/settings/settings-primitives.tsx` | Disconnect confirmation |
| `SettingsCardSkeleton` pattern | same | `AccountCardSkeleton` (same shape, account fields) |
| `ageFromIso`, `NowClockContext`, `useNowMs` | `components/monitoring/monitoring-primitives.tsx`, `lib/realtime/use-now.ts` | Freshness lines ("Synced 2 min ago") |
| shadcn `Dialog`/`Sheet`/`Tabs`/`Badge`/`Button`/`Input`/`Label`/`Card`/`Skeleton` | `components/ui/*` | Drawer (desktop dialog ↔ mobile sheet, established `useIsDesktop` switch), wizard, tables |
| `useIsDesktop` (1024px) | `lib/hooks/use-media-query.ts` | Drawer responsive switch |
| `formatMoney`, `formatSignedMoney` | `@cosmoz/shared/utils/money` | All monetary rendering; `null` → "—" via the shared placeholder rule |
| `apiRequest`/`ApiError`/`apiErrorCode`/`apiErrorMessage` | `lib/api/client.ts` | All data access; code-based error branching identical over MSW and live |
| MSW utils | `mocks/handlers/utils.ts` | Trading handlers (plus a local `requireUserId` mirroring `@CurrentUser`) |
| `zod` input schemas verbatim | `@cosmoz/shared/schemas/trading-account.ts` | Wizard + handlers parse the exact contract objects (no re-declared shapes) |
| `ACCOUNTS_MOCKED` mode check (`API_MOCKED`) | `lib/api/mode.ts` | The DemoDataChip renders only in mock mode |
| Dict/i18n patterns, `useDict()` | `i18n/*` | New `dict.accounts.*` namespace, typed from the canonical EN pack |

**Zero new dependencies**, zero new design tokens, no second API client, no new state library — verified in the final diff.

## 5. Information Architecture Implemented

```
/accounts (App Router (app) group — AuthGate + AppShell inherited)
└── AccountsView
    ├── Header: title, read-only subtitle, primary "Connect account"
    ├── Summary strip (stat-strip): Accounts / Connected / Needs attention /
    │   Open positions — per-account counts only; NO cross-currency total
    │   (mixed-currency note rendered when ≥2 currencies present, spec §9.2)
    ├── Account collection (cards, 2-col ≥md): identity + env stamp + mock
    │   stamp + provider/broker/external-id/currency line, balance + equity,
    │   connection badge, sync badge + age, positions count, Sync + Details
    ├── Empty state: explains the module, lists CONNECTABLE providers from
    │   the registry (+ honest "rolling out phase by phase" note)
    ├── Error state: retry, never a fake empty list
    ├── ConnectAccountDialog (wizard: provider → environment → identity)
    └── AccountDetailDrawer (Dialog ↔ Sheet by useIsDesktop)
        ├── Overview tab: snapshot panel (6 metrics + snapshot-time footnote),
        │   connection panel (identity, method, masked hint, permissions,
        │   lastError), connection-test panel (4 checks), sync panel (last
        │   run status/trigger/duration/counts/errorCode)
        ├── Positions tab · Orders tab · Deals tab — three SEPARATE read-only
        │   tables (never merged; each with its own empty/unsupported copy)
        └── Footer actions: Sync now · Reconnect · Rename · Disconnect
```

Navigation: `/accounts` added to `SIDEBAR_ITEMS` (Trading section, `Landmark` icon) + `NAV_SECTIONS`; breadcrumb/title derive automatically (`getPageTitle` reads SIDEBAR_ITEMS). Both Phase 00 dead links (`oryon-lower-panel.tsx:396`, `recognition-success.tsx:85`) now resolve — **IMPLEMENTED + VERIFIED BY TEST** (probe navigates both directions).

## 6. UI/UX and Design Decisions

- **Le Registre discipline respected**: one surface wrapper (`max-w-6xl`), hairline `border-border` panels (no cards-in-cards), one accent reserved for interaction, semantic inks only on P&L values (sign + color together — never color alone), all numerals `font-mono tabular-nums`, `.ledger-label` headers, `.stat-strip` summary. No gradients behind data, no glow.
- **Financial readability**: monetary values via shared formatters (decimal-string in, currency-true out — an EUR account renders €, a USD account $; **no implicit conversion, no aggregated total**); precision preserved (formatter default; values never rounded client-side before display); unavailable metrics render "—" with an explicit "Not reported" meaning, never `$0.00` (spec §7.2 "do not show unavailable metrics as zero" — IMPLEMENTED, unit-tested).
- **Status system**: two-axis presentation mapping (`connectionStatusMeta`/`syncStatusMeta`) — icon + text + tone for CONNECTED/CONNECTING/DISCONNECTED/ERROR and SYNCING/LIVE→"Fresh"/DELAYED/STALE/ERROR/UNKNOWN; unknown future statuses degrade to a muted "Disconnected"/"Never synced" label, never a fake success. `LIVE` is labeled "Fresh" and footnoted ("last successful sync within the freshness window — polling providers are never real-time") per doc B §9.4.
- **Honesty markers**: `SimulatedProviderBadge` ("Simulated provider", warning tone) wherever `provider.isMock` data renders (cards, drawer, wizard); `DemoDataChip` ("Demo data") conditionally rendered on API_MOCKED for the three fixture chains (sizer balance, monitoring brokers, account switcher) — invisible in live mode so real data is never falsely demarked.
- **Copy**: full `dict.accounts.*` namespace (~90 strings), honest voice throughout — the subtitle states the read-only contract; the wizard says what is connectable today; the drawer footnotes snapshot age ("values are the last synced state, not live"); disconnect explains credentials-destroyed/history-kept (the contract's `historyPreserved: true`).

## 7. Accounts Overview Implementation

- Header + add action + count summary — IMPLEMENTED.
- Summary metrics: counts only (accounts/connected/attention/positions-from-last-runs). Aggregate balance/equity deliberately NOT rendered: accounts can differ in currency and no verified conversion exists (spec §9.2 rule 2; doc B §11.3). Mixed-currency state explains this in a visible note.
- Account collection: stable React keys (`account.id`), per-card `data-account-id`; no positions/orders/deals fetched on the overview (drawer loads them on demand) — performance rule §17 respected.
- Empty / loading (skeletons) / error (retry) / partial states — IMPLEMENTED; `useTradingAccounts` errors surface the retry card, never a fabricated empty success (spec §9.5).

## 8. Account Detail and Activity Implementation

- Overview tab — IMPLEMENTED (see §5). Freshness sits next to the financial data it qualifies; snapshot time rendered explicitly.
- Positions/Orders/Deals — three separate tables, columns adapted to the ACTUAL wire schemas: positions show direction/volume/entry/current/SL/TP/unrealizedPnl/opened; orders show type/price/volume/SL/TP/created (provider verb `type` verbatim, no cancel/modify actions); deals show external ref/symbol (nullable → "balance op." label)/side/volume/price/profit/commission/swap/executed. No close-position control exists (red line).
- Unsupported/absent activity: distinct copy per state — "no records returned" vs "positions appear after the first successful synchronization" (never-synced) vs the empty-string errors; a provider without the capability would show the unsupported note (mock serves all capabilities, so the code path is UI-only here — labeled honestly).
- Lifecycle actions — rename (PATCH), test (checklist renderer: PASS/FAIL per check with detail text), reconnect (fresh credentials in a password input, nothing stored client-side), disconnect (`requireTyped` = account name), sync (409 `SYNC_ALREADY_RUNNING` and `INVALID_CREDENTIALS` mapped to dict messages via `apiErrorCode`). All **IMPLEMENTED and VERIFIED BY TEST over both transports**.

## 9. Provider Discovery and Connection Entry Point

- Discovery list from the REAL registry (`GET /trading-accounts/providers`): the MOCK descriptor renders selectable with its `isMock` stamp + "Development provider — simulates a read-only MT5-style broker" note; five planned providers (OANDA, cTrader, MT5, Deriv, TradingView) render dashed "Planned — not connectable yet" rows with per-provider notes. TradingView's note is the strongest: "No account-data interface exists — not plannable" (doc D verdict). **IMPLEMENTED** (planned list is a UI-side constant — labeled; it never renders a connect path).
- Environment step is capability-driven: only `provider.supportedEnvironments` are offered (DEMO/LIVE for the mock); PROP_FIRM is impossible to select, and the backend would refuse it anyway (502 `UNSUPPORTED_ACCOUNT` — unit-tested).
- Workflow boundaries respected: no OAuth, no discovery, no credential entry beyond the connect/reconnect secret fields — secrets go to the backend only (password inputs, `autoComplete="new-password"`, never logged, never in URLs, no client persistence). No simulated success screens: the wizard closes on the backend 201.
- No credential-return surface: the only secret artifact displayed is the masked `credentialsHint` from the contract (`••••abcd`).

## 10. API and State Management

- **REUSED** `apiRequest` + `queryKeys` + `apiPaths` conventions; new hooks (`queries/trading-accounts.ts`): 6 queries + 6 mutations, typed exclusively from `@cosmoz/shared` inferred types.
- Query keys: `tradingAccounts` root prefix-matches detail/positions/orders/deals — one coarse invalidation per mutation (plus `brokerSession`, whose NOT_CONFIGURED → CONNECTED state depends on the same data). No unrelated module invalidated.
- Refresh semantics: explicit user-triggered invalidation only; **no new polling loop, no WebSocket** (spec §13.4; doc C §7 — the 15 s broker-session poll is pre-existing and untouched). The freshness line updates via the shared 1 s clock context (display only, not refetch).
- Error handling: every mutation maps stable `TRADING_ERROR_CODES` through `apiErrorCode` to dict copy (INVALID_CREDENTIALS / UNSUPPORTED_PROVIDER / UNSUPPORTED_ACCOUNT / DUPLICATE_ACCOUNT / ALREADY_CONNECTED / SYNC_ALREADY_RUNNING / RATE_LIMITED / NOT_CONNECTED), falling back to `apiErrorMessage`; unknown codes degrade to the generic message (documented forward-compatibility rule, doc C §6).
- **MISSING BACKEND CAPABILITY (documented, not worked around)**: sync-run history list (only the latest run is embedded — Phase 04 `runs?limit`); deal/order pagination windows (Phase 04); capability V2 gating (Phase 03, when a real adapter consumes it). None is silently faked in the UI.

## 11. Loading, Error, Empty, and Freshness States

Connection states (per doc B §3.1 vocabulary only): empty, connected, connecting (spinner), disconnected, error (+ `lastError` text, sanitized) — all rendered. Data states: initial loading, refreshing (button spinners), empty-per-table, never-synced, stale (badge), failure (retry card / toast). Interaction states: add disabled-if-no-registry, submit gated per step, sync disabled unless CONNECTED, reconnect disabled while CONNECTED, test rerun, disconnect requireTyped + pending. A failed refresh never replaces visible data with an empty success (react-query keeps the last good payload; errors surface as toasts/retry card) — spec §9.5 honored.

## 12. Responsive and Accessibility Verification

- Dialog ↔ Sheet switch at 1024px via the established `useIsDesktop` — VERIFIED BY TEST at 1440×900 (dialog path; sheet path shares the same tree and was code-reviewed; the mobile bottom-nav intentionally excludes Accounts, consistent with its 4-slot design).
- No horizontal overflow: activity tables wrapped in `overflow-x-auto` with `min-w-[560px]` (dense financial tables scroll rather than hide columns — spec §17: never hide critical financial info).
- Accessibility: semantic headings (one h1), real `<table>`/`<th scope>`/`<dl>` semantics, `role="radiogroup"/"radio"` + `aria-checked` in wizard steps, labeled inputs (`htmlFor`), `aria-live="polite"` on test results and async statuses, visible focus (global `:focus-visible` ring), icon+text (never color-only) status badges, destructive confirm gated by typed phrase. Keyboard: Radix primitives (Tab/Escape/arrow navigation inherited); probe exercised Escape-closes flows.

## 13. Tests Executed and Results

| Suite | Scope | Result |
|---|---|---|
| `apps/web/scripts/accounts-tests.ts` (bun) — NEW | Presentation mapping (status/freshness/stamp), apiPaths parity, engine honesty rules: registry isMock-only, UNSUPPORTED_PROVIDER/UNSUPPORTED_ACCOUNT, duplicates 409, ownership 404, idempotent sync, disconnect history preservation, NOT_CONNECTED, reconnect atomicity, ALREADY_CONNECTED, auth-failure → ERROR + sanitized lastError + sync axis stays LIVE, outage keeps CONNECTED, rename invariants, 4 named checks | **74/74 VERIFIED BY TEST** |
| MSW probe `verify-accounts.js` (Playwright) — NEW | Full UI lifecycle over MSW: nav, empty state, wizard honesty (planned rows), guarded submit, connect → drawer, simulated stamp, balance ≠ "—", sync LIVE, 3 activity tabs, rename, 4-check panel, requireTyped disconnect, reconnect, card sync, demo markers (switcher/sizer), console discipline | **25/25 VERIFIED BY TEST** (`scripts/verify-accounts-run.sh`) |
| Live-bridge probe `verify-accounts-live.js` — NEW | Same lifecycle over NEXT_PUBLIC_API_LIVE=true → :4000 real API: JWT login, registry, connect 201 (real vault + initial sync), snapshot reads, deals, PATCH rename (newly registered route), manual sync, 4-check test, disconnect, reconnect | **14/14 VERIFIED BY TEST** |
| API standing suites (unit + e2e, 79 files) — extended by 2 tests | Monitoring-logic spec gained `toJobRunStatus` regression block; accounts e2e gained the registered rich-surface block (list shape, PATCH rename incl. identity preservation, 401/404 ownership) | **1056/1056 VERIFIED BY TEST** (was 1052) |
| Engine test-only hook disclosure | `_testRotateSecret` mirrors the backend e2e's direct DB re-encryption of a scenario secret — test infrastructure, never called by handlers | documented |

Mock-only behavior in tests (spec §15.3 distinction): MSW probe + engine tests exercise the mock parity layer; the live probe exercises the real backend with the backend's own mock adapter. **No test claims real provider connectivity** — none exists by design (Phase 03+).

## 14. Build and Static Verification Results

| Check | Command | Result |
|---|---|---|
| API typecheck | `corepack pnpm exec tsc --noEmit` (apps/api) | PASS |
| Web typecheck | `corepack pnpm exec tsc --noEmit` (apps/web) | PASS |
| Web lint (full `src`) | `corepack pnpm exec eslint src` | **0 errors**, 4 pre-existing `_locale` warnings (unchanged from Phase 11 — not introduced here) |
| Web production build | `corepack pnpm run build` | PASS — 33 static pages incl. `/accounts` |
| Runtime smoke | `next start` :3000 → `GET /` 200, `GET /accounts` 200 | PASS |

## 15. Known Limitations and Backend Dependencies

1. **Sync-run history**: only the latest run is visible (backend embeds one run) — dependency logged for Phase 04 (`runs?limit`).
2. **Pagination**: deals/orders load full current-state lists (V1 scale, honest per doc C §5) — Phase 04 windows.
3. **Freshness TTL** is the single 15-min derivation (backend mapper) — provider-aware thresholds are Phase 04; the UI's freshness copy never claims real-time regardless.
4. **Planned-provider list** is a UI constant (5 rows with honest notes); it will move to registry metadata when Phase 03 lands the capability model (doc B §4.2).
5. **Rate limits are not reproduced in MSW** (connect 5/reconnect 5/sync 20 per 15 min are server-side in-memory; documented in the engine header) — 429 handling is implemented and dict-mapped, exercised only over the live bridge if triggered.
6. **Monitoring chain-B marker** is conditional on telemetry being present (empty hub → no brokers panel → nothing to mark); the chip code path is unit-verifiable and renders when brokers render.
7. **`apiErrorMessage` over the live bridge** prefers the error category field (`"BusinessRule"`) for coded errors — a pre-existing client-wide envelope quirk, out of scope here; the Accounts UI avoids it by branching on `apiErrorCode` first (dict copy), so no user-facing impact from this module.

## 16. Files Created

```text
apps/web/src/app/(app)/accounts/page.tsx
apps/web/src/components/accounts/accounts-view.tsx
apps/web/src/components/accounts/account-card.tsx
apps/web/src/components/accounts/account-badges.tsx
apps/web/src/components/accounts/account-detail-drawer.tsx
apps/web/src/components/accounts/connect-account-dialog.tsx
apps/web/src/components/accounts/external-activity-tables.tsx
apps/web/src/components/demo-data-chip.tsx
apps/web/src/lib/api/queries/trading-accounts.ts
apps/web/src/mocks/trading-accounts-engine.ts
apps/web/src/mocks/handlers/trading-accounts.ts
apps/web/src/i18n/dictionaries/en/accounts.ts
apps/web/scripts/accounts-tests.ts
apps/web/scripts/verify-accounts.js
apps/web/scripts/verify-accounts-live.js
docs/backend/PHASE-02-ACCOUNTS-UI-REPORT.md   (this report)
```

## 17. Files Modified

```text
apps/web/src/lib/api/endpoints.ts                       (+11 trading-accounts paths)
apps/web/src/lib/api/keys.ts                            (+6 trading keys)
apps/web/src/lib/api/queries/index.ts                   (+barrel exports)
apps/web/src/lib/navigation.ts                          (+/accounts sidebar entry + section)
apps/web/src/i18n/dictionaries/en.ts                    (+accounts namespace registration)
apps/web/src/mocks/handlers/index.ts                    (+tradingAccountsHandlers)
apps/web/src/components/layout/account-switcher.tsx     (+demo marker footer)
apps/web/src/components/trades/position-sizer.tsx       (+demo marker, chain A)
apps/web/src/components/monitoring/monitoring-panels.tsx(+demo marker, chain B)
apps/api/src/modules/accounts/accounts.module.ts        (+register TradingAccountsController, documented decision)
apps/api/src/modules/accounts/trading-accounts.controller.ts (PATCH envelope fix — latent bug)
apps/api/src/modules/monitoring/monitoring.logic.ts     (+toJobRunStatus pure mapping)
apps/api/src/modules/monitoring/monitoring.service.ts   (3× SUCCESS→COMPLETED/mapped, Phase 00 defect)
apps/api/test/unit/monitoring-logic.spec.ts             (+2 regression tests)
apps/api/test/e2e/accounts.e2e.spec.ts                  (+import +2 rich-surface e2e tests)
```

Deleted: none. Migrations: none. Dependencies: none. Provider credentials touched: none.

## 18. Commands Executed and Results

| Command | Result |
|---|---|
| `vitest run` (apps/api, full) | 79 files, **1056/1056 pass** (114 s) |
| `vitest run test/e2e/accounts.e2e.spec.ts` (focused iterations) | 37/37 pass (35 pre-existing + 2 new) |
| `bun run scripts/accounts-tests.ts` | **74/74 pass** |
| `bash scripts/verify-accounts-run.sh` | **25/25 pass** (MSW probe; dev server :3000) |
| `node apps/web/scripts/verify-accounts-live.js` | **14/14 pass** (live bridge; web dev :3000 with NEXT_PUBLIC_API_LIVE=true + API :4000 rebuilt & restarted) |
| `tsc --noEmit` (api, web) | pass ×2 |
| `eslint src` (web, full) | 0 errors / 4 pre-existing warnings |
| `pnpm run build` (web) | pass, 33 pages |
| Operational notes | The boot-time `next start` served the pre-Phase-02 build (probe 1 crashed on the missing sidebar link) — replaced by a dev server for probing, then rebuilt and restored. The API restart exposed the documented shell-env trap: a stale `DATABASE_URL=file:` exported at boot defeats `--env-file-if-exists` — relaunched with an explicit `DATABASE_URL=postgresql://…` override. Both facts recorded for SAVEPOINT.md. |

## 19. Out-of-Scope Items Confirmed

No OAuth flows, no credential storage/encryption changes (the existing AES-256-GCM vault consumed as-is), no provider adapters, no real MT5/IC Markets/OANDA/cTrader/TradingView integration, no scheduler/polling workers, no WebSocket/SSE, no Prisma schema change or migration, no automatic historical imports, no auto-creation of journal trades, **no order execution / position closure / order modification / cancellation controls anywhere in the UI** (verified: no such handler, route, or button exists in the new code), no new dependency, no unrelated redesign (the three demo-marker insertions are the only touches outside the Accounts module, each mandated by the Phase 00 defect register / acceptance criterion 3).

## 20. Phase 02 Acceptance Checklist

| # | Criterion (doc E) | Status | Evidence |
|---|---|---|---|
| 1 | Connect → sync → inspect passes over MSW **and** over the live bridge (:4000, mock adapter) | ✅ | MSW probe 25/25; live probe 14/14 (§13) |
| 2 | All Phase 00 hygiene defects fixed or explicitly dispositioned | ✅ | monitoring literals fixed + regression tests; controller registered (register decision per doc C §2.2) + latent PATCH bug fixed; both dead links live; AccountSwitcher stays on the journal contract + carries the demo marker (§16-17) |
| 3 | No fixture balance/telemetry renders without a visible demo marker | ✅ | DemoDataChip on chains A/B + switcher (mode-conditional); SimulatedProviderBadge on every isMock surface; MSW probe asserts two of three markers live |
| 4 | Unit (hooks/logic), MSW-handler tests, Playwright probes green; tsc/eslint/build clean; standing API suites untouched and green | ✅ | 74/74 + 25/25 + 14/14; tsc ×2; eslint 0 errors; build 33 pages; API 1056/1056 |

Spec-mandate (§21 Definition of Done) spot-checks: unsupported metrics never rendered as zero (unit-tested); currencies displayed per-account with no false totals; connection status never derived from account existence (rendered from `connection.status` only); provider discovery honest (planned rows + mock stamp); no execution controls (code-inspected + red line untouched in e2e); mock data unmistakable (double marking); the final diff contains only scoped changes (§16-17).

## 21. Phase 03 Readiness Assessment

**READY.** Phase 03 (First Real Adapter — OANDA + Capability Model) can start immediately:

- The UI consumes the frozen contracts verbatim and renders every state the capability model will introduce (`UNKNOWN` capability → muted label path exists; `UNSUPPORTED_CAPABILITY` (422) will map through the existing `apiErrorCode` branch — one dict entry to add).
- The backend surface is registered and exercised end-to-end by the live probe; the OANDA adapter plugs into the unchanged registry factory (`accounts.module.ts`).
- What Phase 03 adds consumer-side: per-provider freshness TTLs (the UI reads `synchronization.status` — no UI change), capability-gated tabs (the "unsupported activity" copy already exists), and discovery flow only if U3 resolves.
- Carried user blockers (unchanged from Phase 01): U2/U3 OANDA practice token + discovery depth at validation time; provider priority confirmation.

**STOP after Phase 02 honored** — no Phase 03 work was started; no connection lifecycle beyond the existing backend surface was implemented; no schema or dependency changed.
