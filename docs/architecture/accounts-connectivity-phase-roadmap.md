# Accounts & Trading Connectivity — Phase Roadmap

**Phase 01 deliverable (E of 5).** Defines the phases that follow this architecture phase: boundaries, dependencies, acceptance criteria, and verification requirements — detailed enough that each next phase can be executed without re-deciding architecture, and bounded enough that "STOP" lines stay enforceable (mandate §18.E, §23).

**Numbering frozen by this document** (supersedes the Phase 00 audit's provisional roadmap numbering; content unchanged where overlapping):

| Phase | Title | One-line objective |
|---|---|---|
| 01 *(this phase)* | Target Architecture & Domain Contracts | Architecture + contracts, documentation-only — done |
| 02 | **Accounts UI + Hygiene** | Make the existing backend visible and usable; clear confirmed defects |
| 03 | **First Real Adapter — OANDA + Capability Model** | Prove the port with reality; implement capability V2 + PARTIAL runs where consumed |
| 04 | **Scheduled Sync + Freshness Engine** | "Reliable updates" without user action; honest freshness |
| 05 | **cTrader Adapter (OAuth)** | Official OAuth path; covers IC Markets cTrader accounts |
| 06 | **MT5 Decision + Implementation (or documented defer)** | Resolve the flagship-provider open question |
| 07 | **Deriv Adapter + History Depth** | Broaden coverage; revisit snapshot history + key rotation |

Standing invariants for every phase (each ends with these verified): read-only red line green (e2e), no fabricated data anywhere, ownership/IDOR suite green, `tsc`/`lint`/tests actually executed and reported, **no dependency install / schema migration / commit beyond the phase's sanctioned scope without explicit note**, phase report in the `docs/backend/PHASE-N-*-REPORT.md` convention.

---

## Phase 02 — Accounts UI + Hygiene

**Objective.** Deliver the Accounts user surface against the already-complete backend, and clear the Phase 00 defect register. No new provider, no scheduler, no schema change.

**Scope — IN:**
- `/accounts` route (App Router `(app)` group) + sidebar entry (fix both dead links: `oryon-lower-panel.tsx:396`, `recognition-success.tsx:85`).
- Account list (cards with Demo/Live/Prop stamping), connect wizard (provider picker → environment → external id → credential show-once input), detail drawer (snapshot / positions / orders / deals / sync runs / capability + freshness badges), rename, connection test (4-check checklist renderer), reconnect, disconnect with `requireTyped` confirm.
- Hooks via react-query consuming `@cosmoz/shared` `trading-account.ts` verbatim; MSW parity handlers mirroring the same schemas; live bridge validated against `:4000`.
- `dict.accounts.*` i18n namespace (typed dictionaries, EN).
- Demo-data markers on every fixture-driven risk-relevant surface (audit HIGH risk: sizer balance chain A, monitoring telemetry chain B).
- Hygiene: Monitoring `SUCCESS`→`COMPLETED` literals (`monitoring.service.ts:325,383,389`) + test; register-or-delete `TradingAccountsController` (recommendation: register; document the canonical surface — doc C §2.2); `AccountSwitcher` wired to real data or explicitly marked demo.

**Scope — OUT:** real providers, OAuth, scheduler, schema/migrations, capability enforcement, WS/SSE, any execution surface.

**Dependencies:** none (backend complete; contracts exist).

**Acceptance criteria:**
1. Connect → sync → inspect detail flows pass over MSW **and** over the live bridge against `:4000` (mock adapter).
2. All Phase 00 hygiene defects either fixed or explicitly dispositioned in the phase report.
3. No fixture balance/telemetry renders without a visible demo marker.
4. Unit (hooks/logic), MSW-handler tests, Playwright probes green; `tsc`/eslint/build clean; standing API suites untouched and green.

---

## Phase 03 — First Real Adapter: OANDA + Capability Model

**Objective.** Prove the architecture with the cleanest official API; implement the capability-model extension **at the moment it becomes consumed** (mandate §19 discipline).

**Scope — IN:**
- `OandaAdapter` behind `TradingProviderAdapter` (REST v20, personal access token, read-only subset; practice + live environments), registered in the registry.
- Capability V2 implementation exactly per doc B §4.2 (`capabilitySupportSchema`, `providerCapabilitySchema`, connection-scoped overrides) + enforcement path (`UNSUPPORTED_CAPABILITY` error code, doc B §10) + capability-poor **test adapter** so gating is exercised without a real provider.
- `PARTIAL` run semantics per doc B §8.2 (segment-level success/failure representation).
- Symbol mapping with verbatim passthrough for unmapped symbols (doc A §4.5).
- Optional account discovery **only if** U3 resolves favorably (doc D §8).

**Scope — OUT:** scheduler/polling (04), OAuth (05), cursors unless OANDA pagination proves mandatory, discovery if U3 unresolved, any write operation.

**Dependencies:** user provides an OANDA **practice** token at validation time (runtime only, never committed — doc D U2); doc B [PROPOSED] contracts.

**Acceptance criteria:**
1. Practice-account connect → sync → snapshot/positions/deals visible through the Phase 02 UI on a real OANDA practice account.
2. Capability gating proven: an unsupported operation on the test adapter yields honest `UNSUPPORTED_CAPABILITY` (422), never silent emptiness.
3. Failure classes mapped and tested: 401 → `INVALID_CREDENTIALS` + connection ERROR, 429 → `RATE_LIMITED` + `Retry-After`, 5xx/timeouts → 502-class, malformed → `INVALID_PROVIDER_RESPONSE` (never persisted).
4. Idempotency: repeated syncs create no duplicate rows (existing constraints verified against a real provider's payload shapes).
5. Red-line, IDOR, secret-redaction suites green; normalization + error-mapping + capability + pagination contract tests green; red line test untouched.

---

## Phase 04 — Scheduled Sync + Freshness Engine

**Objective.** Deliver the "reliable updates" promise honestly: accounts refresh without user action; freshness reflects reality.

**Scope — IN:**
- Scheduler dependency (`@nestjs/schedule` or minimal interval worker — first background dep, documented install) with per-account interval config, per-provider concurrency caps, exponential backoff with jitter, 429-aware pacing.
- Run reaper: crashed `RUNNING` runs marked FAILED (doc B §8.4 gap closure).
- `DELAYED` status produced per doc B §3.2; provider-aware freshness TTLs (doc B §9) replacing the single hardcoded 15-min TTL.
- Client refresh via react-query invalidation on schedule-driven changes; monitoring wiring for scheduled runs (after the Phase 02 literal fix).
- Cursors **only if** a provider requires delta sync (doc B §8.3 — OANDA bounded pages likely make this unnecessary; decide with evidence, keep full-refresh default).

**Scope — OUT:** server push (WS/SSE) unless polling proves insufficient (decide with data; per-user scoping design gate applies — doc A §7 threat model), new providers, OAuth.

**Dependencies:** Phase 03 (real adapter exists; freshness becomes meaningful).

**Acceptance criteria:**
1. Accounts refresh without user action; `STALE` appears when the scheduler is paused; `DELAYED` appears on missed intervals within TTL.
2. No 429 storms (backoff verified under injected provider rate limits); double-run guard still enforced under concurrency (scheduler + manual).
3. Monitoring reports scheduled-run health correctly (the SUCCESS/COMPLETED fix verified end-to-end).
4. Unit (backoff/cadence math), integration (double-run), e2e green; red-line suite green.

---

## Phase 05 — cTrader Adapter (OAuth)

**Objective.** Official OAuth 2.0 path; one connector also covering IC Markets cTrader accounts.

**Scope — IN:**
- `OAUTH_AUTHORIZATION_CODE` connection method (doc B §4.4) + callback endpoint per doc C §2.2 with state validation + replay protection + secure token persistence (access + refresh, AES-256-GCM via the existing vault).
- `CTraderAdapter` (Open API; ProtoOA* read subset), token refresh lifecycle, reauth prompts surfaced via `ERROR` + `INVALID_CREDENTIALS` (no new state machine states — doc B §3.1).
- Connection-scoped capability overrides for account-type restrictions (doc B §4.2).

**Scope — OUT:** streaming subscriptions (capability declared `UNKNOWN` until U4 resolves and a product need exists), IC Markets-specific adapter (covered by this one).

**Dependencies:** Phase 03 (capability V2 in production use); user registers an OAuth app (Spotware developer portal); U4 resolved by docs deep-fetch + demo account.

**Acceptance criteria:**
1. cTrader demo account connect via OAuth → sync → visible data; refresh/reconnect path proven including expired-token recovery.
2. Callback hardening verified by tests: invalid state rejected, replay rejected, no tokens in logs/URLs/responses.
3. OAuth-specific failure classes mapped (doc B §4.3 table); red-line suite green; secrets never in any DTO (suite extended to token bundles).

---

## Phase 06 — MT5 Decision + Implementation (or documented defer)

**Objective.** Resolve U1 (user decision): (a) self-hosted terminal bridge, (b) third-party cloud bridge (MetaApi — vendor review, credential-exposure review, cost), or (c) documented defer.

**Scope — IN (path-dependent):** design note for the chosen mechanism; if bridge: `PLATFORM_BRIDGE` method + session semantics as a deliberate port extension (doc A §4.3); `Mt5BridgeAdapter` implementing the read subset; hosting/operations runbook; credential-exposure risk acceptance recorded.

**Scope — OUT:** designing around undocumented endpoints (never); execution methods despite the Python module exposing them (`order_send` — read-only discipline mandatory, doc D §3).

**Dependencies:** **user decision (U1)** — the only hard product blocker in the roadmap; spike against the chosen mechanism before adapter code.

**Acceptance criteria:** MT5 account visible in Euforia via the chosen path **or** a formal defer record (decision, rationale, revisit conditions) in the phase report; security review of credential path signed off; red-line suite green.

---

## Phase 07 — Deriv Adapter + History Depth

**Objective.** Broaden coverage; revisit two deferred product decisions with real usage data.

**Scope — IN:** `DerivAdapter` (official WS API, read-only subset; first WS client dependency — documented install); snapshot-history series decision (doc A §10 R3) — implement equity-curve persistence only if product confirms; key-rotation design if credential classes have multiplied (doc A §7).

**Scope — OUT:** streaming push to clients unless U6 resolves affirmatively with measured evidence.

**Dependencies:** Phases 03-04 patterns; U5 resolved.

**Acceptance criteria:** as Phase 03 (per-provider instantiation); snapshot-history decision recorded (implemented or explicitly deferred with rationale).

---

## Cross-phase verification requirements (mandate §17/§21 standing evidence)

1. **Contract conformance harness (created in Phase 03, reused after):** every adapter passes the same test battery — capability declarations honest, normalization valid against `normalization.ts`, error mapping per doc B §4.3, pagination idempotency, read-only behavior, secrets never in outputs. Mock/fixture evidence is always labeled and never presented as provider verification.
2. **Negative security tests** stay in the standing suites: cross-user 404s, IDOR, secret redaction, callback abuse (05), execution red line (every phase, permanently).
3. **Honesty gates:** no "live/real-time" claims for polling providers; `UNKNOWN` capabilities block rather than degrade silently; demo data always marked.
4. **Phase reports** in `docs/backend/PHASE-N-*-REPORT.md` with: commands actually executed + results, files modified, scope deviations, open questions carried forward.
5. **Architecture feedback loop:** any deviation from docs A-D discovered during implementation is either (a) reverted or (b) documented as an architecture amendment in the phase report — silent drift is forbidden (consistency rule, doc A §10).

## Current blockers requiring user input (carried from doc A §10 / doc D §8)

1. **U1 — MT5 path** (blocks Phase 06 only; answer can arrive anytime).
2. **U2/U3 — OANDA practice token + discovery depth** (needed at Phase 03 validation time).
3. **Provider priority confirmation** — OANDA-first assumed per doc D §9; reorder if the user's actual broker set argues otherwise (would swap Phase 03/05/07 order, not the architecture).
