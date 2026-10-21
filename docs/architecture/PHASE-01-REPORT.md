# PHASE 01 REPORT — Accounts & Trading Connectivity: Target Architecture and Domain Contracts

**Date:** 2026-10-13 · **Repository HEAD at completion:** `3d25c29` (working tree: 6 new files, uncommitted at report time, committed immediately after) · **Mode:** architecture & contract design, **no runtime code changed**.

---

## 1. Executive Summary

Phase 01 is **COMPLETE** (verdict per §23; evidence in §21 and throughout). The target architecture for Accounts & Trading Connectivity is documented as an **extension of the verified existing implementation — not a rebuild**: a complete, honestly read-only Accounts backend (port, registry, mock adapter, AES-256-GCM vault, transactional idempotent sync, 13 stable error codes, e2e 35/35 + unit 81/81) gains frozen extension seams — a three-state capability model, partial-run semantics, provider-aware freshness, per-provider adapter decisions, and a phase-by-phase roadmap — with every design decision anchored to Phase 00 evidence or current source.

Five deliverables were produced in `docs/architecture/` (A: target architecture + diagrams; B: domain contracts; C: API proposal; D: provider feasibility; E: phase roadmap), cross-checked for consistency, plus this report. **No shared-contract code was implemented** (mandate §19 decision — rationale in §16): the existing `trading-account.ts` contract already provides 12 of the 14 mandated contract roles, and the two real extensions are frozen in design (doc B) to land with the first real adapter that consumes them, preserving the repository's "documented, not speculative" discipline.

## 2. Phase 00 Audit Inputs

- Source: `docs/audits/PHASE-00-ACCOUNTS-CONNECTIVITY-AUDIT.md` (398 lines, HEAD `5f82266` at audit time) — found and used as the primary evidence base (§5 STEP ZERO of the mandate: report located, no invention required).
- Key inputs: §2 dependency/connectivity inventory; §3 accounts implementation; §4 frontend (zero Accounts UI); §5-§6 backend/DB audits; §8 provider feasibility matrix; §9 real-time audit; §10 security; §11 test evidence; §12 KEEP/REUSE/IMPROVE/MISSING/MOCKED/UNSUPPORTED/DEFER classification; §13 risks; §16-§17 roadmap + open questions.
- All mandate STEP-ZERO requirements met: repo inspected, git status read (clean at start), workspace conventions identified (pnpm, NestJS 11/Fastify, Next.js 16, Prisma 6, embedded PG 17.5, zod shared package source-exported).

## 3. Repository Evidence and Existing Components

Reconciled this phase against working tree HEAD `3d25c29` (doc A §2.3): **100% of re-verified claims matched** — adapter port (`provider.types.ts:136-161`), module registrations (`accounts.module.ts:58` — `TradingAccountsController` still unregistered), sync-status derivation (`mappers.ts:92-96`, 15-min TTL), shared contract completeness (367 lines, zero web imports), normalization boundary, Prisma models. Full classified inventory (REUSE/EXTEND/REFACTOR/CREATE/DEFER/UNSUPPORTED/UNKNOWN) in doc A §3 (backend 15 rows, frontend 6 rows, infrastructure 7 rows).

## 4. Architecture Decisions (decision · evidence · alternatives · rationale · impact)

| # | Decision | Evidence | Alternatives considered | Rationale | Impact on later phases |
|---|---|---|---|---|---|
| D1 | Connection remains a **separate aggregate** from `TradingAccount` (1:1) | `schema.prisma:286-364`; disconnect wipes credentials, keeps history (`trading-account.ts:266-271`) | Single aggregate incl. credentials | Preserves "disconnect ≠ delete" and the two-axis separation at zero cost | Phases 02+ reuse the existing rows; no migration |
| D2 | Adapter port stays **read-only, 6 methods**; capability-specific behavior via optional interfaces | `provider.types.ts:9-19` red-line; e2e red-line test | Universal interface with streaming/discovery/session for all | Mandate §9.4 forbids forcing unsupported methods; smallest viable interface | OANDA (P03) implements as-is; cTrader streaming (P05) adds an optional interface only if needed |
| D3 | Capability model becomes **three-state with metadata** (SUPPORTED/UNSUPPORTED/UNKNOWN) | Current 6 booleans cannot express UNKNOWN (mandate §7.3); declared but never enforced | Keep booleans; implement envelope now | Booleans would force false claims for partial providers; implementation deferred until consumed (§16) | P03 lands capability V2 + `UNSUPPORTED_CAPABILITY` + capability-poor test adapter |
| D4 | **No result envelope** (`NormalizedProviderResult`) — return-data/throw-sanitized-`ProviderError` stays | Tested pattern (error-mapper 19/19); envelope = second competing error mechanism | Envelope type | Honesty preserved via the normative outcome table (doc B §4.3) instead of a type | Implementers follow doc B §4.3 table |
| D5 | **No universal external↔journal mapping table** | `Trade @@unique([accountId, externalRef/externalPositionId])`, `TradeExecution @@unique([accountId, externalDealId])` already express the links | Dedicated mapping entity | Mandate §8.10: not introduced without demonstrated requirement | P03+ reconciliation keeps using existing keys |
| D6 | **Raw provider payloads not persisted** | Data minimization (mandate §9.6); normalized+validated records suffice | Debug retention mode | Speculative retention policy = risk without need | Debug mode designed only if a real need appears |
| D7 | Monolith stays the home; **no Accounts microservice** | ADR-0001; all flows in-process; no deployment evidence | Separate service | Mandate §3.5 | Adapters are ordinary modules |
| D8 | **Documentation-only phase** (no shared-contract code) | 12/14 contract roles already exist; extensions unconsumed today | Implement capability V2 now | Mandate §19 "do not implement just to produce code"; repo discipline "documented, not speculative" (`provider.types.ts:13-19`) | P03 implements exactly the frozen shapes |

## 5. Domain Boundaries and Ownership

Doc A §6.1 contains the mandate's required boundary table (12 concepts × 8 columns: owner, source of truth, lifecycle, invariants, relationships, existing implementation, decision). Ownership rules (§6.2): lifecycle transitions + ownership checks → `modules/accounts`; auth/session → `modules/identity`; journal semantics → `modules/trading`; Monitoring = consumer only; web = presentation only. The Hub remains a separate simulated bounded context.

## 6. Provider Capability Model

Doc B §4: three-state support levels with per-capability metadata (retrieval strategy, required permissions, evidence anchor, limitation text), connection-scoped conditional overrides, `UNKNOWN` never coerced, `TEMPORARILY_UNAVAILABLE` as an operational sync-state (not a capability), enforcement via `UNSUPPORTED_CAPABILITY`. Frozen zod design included; **connection-method enum** extension points (`OAUTH_AUTHORIZATION_CODE` P05, `PLATFORM_BRIDGE` P06) documented (doc B §4.4).

## 7. Normalized Domain Contracts

Doc B maps all 14 mandated contract roles: 12 **[EXISTS]** verbatim (`ProviderDescriptor`, `ProviderCapabilities`→V2 designed, `ConnectionSummary`/`ConnectionStatus`, `ExternalAccountSummary`/`Snapshot`, `ExternalPosition`/`Order`/`Deal`, `SyncStatus`/`SyncRunSummary`, `ProviderError`, plus freshness derivation), 2 **[PROPOSED as design]**: capability V2 (§4.2) and the outcome-semantics table replacing a result envelope (§4.3). Eight synthetic JSONC examples validated programmatically (8/8 parse). Identity/idempotency rules, decimal-string money discipline, UTC ISO 8601 timestamps, null-semantics (zero ≠ missing ≠ unsupported ≠ stale) all frozen (doc B §11-§12, §6).

## 8. Connection and Synchronization State Models

Doc B §3: connection `DISCONNECTED/CONNECTING/CONNECTED/ERROR` with permitted transitions (mermaid); mandate's extra states **not adopted** where existing semantics cover them (`PENDING`/`VALIDATING`→transient phases of an atomic connect; `DEGRADED`→sync axis; `REAUTH_REQUIRED`→`ERROR`+`INVALID_CREDENTIALS` view concern). Sync axis: `UNKNOWN/SYNCING/LIVE/DELAYED/STALE/ERROR` (derivation verified, unit-tested 9/9); run `RUNNING/COMPLETED/PARTIAL/FAILED`; PARTIAL semantics defined (P03), DELAYED (P04, scheduler-gated), cursors conditional (P04), crashed-run reaper gap identified and scheduled (doc B §8.4).

## 9. API Proposal

Doc C: the existing 14-route surface inventoried (`VERIFIED IN SOURCE`); exactly **four** additions proposed (PATCH rename — via the register-or-delete decision on `TradingAccountsController`; conditional discovery; windowed history; OAuth callback), each with method/route/purpose/auth/ownership/contracts/validation/idempotency/errors/pagination documented. §8 lists the **permanently excluded** execution endpoints (red line).

## 10. Persistence Design

Doc A §12 rows + doc B §12: 7 existing tables cover all durable needs for P02-P04. Candidate disposition: provider definitions → code (registry, not DB); connections/accounts/positions/orders/deals/sync-runs → **existing entities**; credentials → existing `credentialsEnc`; snapshots → existing latest-only (history = deferred product decision R3); cursors → deferred until a provider requires delta sync; mapping table → not introduced (D5); raw payloads → not persisted (D6). Uniqueness, indexes, retention, sensitive-field handling, transaction boundaries, and concurrency are all documented against the verified schema. **No migration generated or applied** (mandate §13).

## 11. Security and Read-Only Boundaries

Doc A §7: tenant isolation (ownership-in-WHERE everywhere, principal-only connect), AES-256-GCM vault with domain-separated keys (rotation designed as P06+ task), READ_*-only permissions derived server-side, architectural read-only enforcement (port + schema absence + standing e2e red-line test), SecurityEvent audit ledger, pino redaction. **Focused threat model included** (10 threats × mitigation × implementation phase), covering every threat class the mandate §14.6 lists.

## 12. Real-Time Architecture

Doc A §8: no new event system (ADR-0002 respected); first delivery mechanism = react-query cache invalidation on sync completion; polling vs streaming expressed through capabilities; optional streaming adapter interface designed but deferred to a real streaming phase; event names reserved (`connection.status_changed`, `external_account.snapshot_updated`, `external_deal.ingested`, `sync.completed`, `sync.failed`) with the explicit rule that nothing is emitted from imaginary code; any future push channel is per-user-scoped server-side (threat-model gate).

## 13. Provider-Specific Decisions

Doc D: per-provider identity/mechanism distinctions; capability tables (evidence-labeled); verified official-documentation references; auth/permission requirements incl. the honest MT5 credential-exposure limitation; streaming-vs-polling per provider; infrastructure fit; **TradingView account sync = UNSUPPORTED** (no scraping/credential-sharing paths), IC Markets = via platforms only, MT5 direct-HTTP = UNSUPPORTED; 7 honest UNKNOWNs (U1-U7) with resolution paths; implementation order: OANDA → cTrader → Deriv → MT5(decision-gated) → IC Markets(riders) — TradingView never.

## 14. Rejected Alternatives and Rationale

Doc A §9 (9 alternatives with reasons): microservice; single aggregate; universal adapter interface; result envelope; universal mapping table; raw-payload persistence; premature capability code; UI in this phase; Hub-state reuse. Each rejected with evidence-based rationale and impact analysis.

## 15. Documentation Created or Updated

| File | Content |
|---|---|
| `docs/architecture/accounts-connectivity-target-architecture.md` (doc A, ~380 lines) | 16 mandated sections + 2 mermaid diagrams + boundary table + threat model |
| `docs/architecture/accounts-connectivity-domain-contracts.md` (doc B, ~388 lines) | 14 mandated sections, [EXISTS]/[PROPOSED] contract mapping, state machines, 8 validated examples, non-goals |
| `docs/architecture/accounts-connectivity-api-proposal.md` (doc C, ~100 lines) | 8 mandated sections; existing-surface inventory + 4 additions + exclusions |
| `docs/architecture/accounts-connectivity-provider-feasibility.md` (doc D, ~141 lines) | 9 mandated sections; per-provider decisions, unknowns U1-U7, order |
| `docs/architecture/accounts-connectivity-phase-roadmap.md` (doc E, ~152 lines) | Phases 02-07: scope/dependencies/acceptance criteria/verification; blockers requiring user input |
| `docs/architecture/PHASE-01-REPORT.md` | This report (mandate §18 allows reporting actual paths — placed beside docs A-E for cohesion; `docs/backend/PHASE-N-REPORT.md` convention retained for implementation phases) |
| `scripts/validate-phase01-docs.py` | Documentation-validation helper (JSONC example parsing) |

Location note: `docs/architecture/` is a new focused directory — `docs/backend/` holds implementation-phase reports, `docs/specs/` product specs, `docs/audits/` audits; the five architecture artifacts + phase report form one cohesive set (mandate §18: "propose a focused documentation structure instead of creating an excessive number of files").

## 16. Shared Contracts Implemented, If Any

**None — phase kept documentation-only.** Rationale (mandate §19): (1) the existing `packages/shared/src/schemas/trading-account.ts` already implements 12 of the 14 mandated contract roles and is complete, tested (unit+e2e), and UI-ready — implementing more would duplicate it; (2) the two genuine extensions (capability V2, error-code additions) have **no consumer until the first real adapter exists** — landing them now would create unconsumed code, which this repository's own discipline rejects ("documented, not speculative", `provider.types.ts:13-19`; the audit classifies an authored-but-unconsumed contract, `schemas/portfolio.ts`, as DEFER debt); (3) the mandate itself: "Do not implement the shared contracts just to produce code. If documentation alone is the appropriate result, keep the phase documentation-only and explain why." The designs are frozen in doc B §4 with exact zod shapes so Phase 03 implements them mechanically. No schema change was made or needed; nothing unsafe or premature blocks the next phase.

## 17. Tests and Verification Evidence

**No runtime code was changed in Phase 01 — therefore no runtime-test claim is made for the architecture** (mandate §21). Documentation validation performed and reported separately:

| Check | Method | Result |
|---|---|---|
| Phase 00 reconciliation (6 load-bearing claims) | Direct source re-reads at HEAD `3d25c29` | 6/6 match (doc A §2.3) |
| Inter-document consistency | Phase-numbering cross-check across docs A-E (grep + manual review of every `Phase 0N` reference) | Aligned; 2 residual inconsistencies found and fixed during review |
| JSONC contract examples | `scripts/validate-phase01-docs.py` (parse-after-comment-strip, array-coercion) | **8/8 objects valid** |
| Mermaid diagrams | 3 blocks (flowchart, sequenceDiagram, stateDiagram-v2), standard syntax | Present in docs A/B |
| Standing suites | Not executed this phase (no code touched); last verified state: unit 81/81, e2e 35/35 (Phase 00, `VERIFIED BY TEST`) | Reported as inherited evidence, not new evidence |

## 18. Unresolved Questions and Risks

Blockers requiring **user input** (also in doc E): **U1** MT5 path (terminal bridge / MetaApi / defer) — blocks Phase 06 only; **U2/U3** OANDA practice token + discovery depth — needed at Phase 03 validation time; **provider priority confirmation** (OANDA-first assumed). Engineering-resolvable risks tracked in doc A §10 (R1-R8): capability gating unexercised until P03 (mitigated by a mandated capability-poor test adapter), reserved-but-unproduced `PARTIAL`/`DELAYED` statuses (scheduled P03/P04), hygiene defects (assigned Phase 02), in-memory rate limiters (accepted), snapshot-history decision (open, reversible).

## 19. Files Modified

```text
Created (documentation only — zero source/runtime files touched):
  docs/architecture/accounts-connectivity-target-architecture.md
  docs/architecture/accounts-connectivity-domain-contracts.md
  docs/architecture/accounts-connectivity-api-proposal.md
  docs/architecture/accounts-connectivity-provider-feasibility.md
  docs/architecture/accounts-connectivity-phase-roadmap.md
  docs/architecture/PHASE-01-REPORT.md
  scripts/validate-phase01-docs.py
Modified: none
Deleted: none
Migrations: none · Dependencies installed: none · Provider credentials touched: none
```

## 20. Commands Executed and Results

| Command | Result |
|---|---|
| `git log --oneline -3`, `git status --short` | HEAD `3d25c29`; tree clean at phase start |
| Read tool: `provider.types.ts`, `trading-account.ts`, `normalization.ts`, `schema.prisma:286-332,485-504`, Phase 00 audit (all 399 lines) | Evidence base verified |
| `rg` targeted checks (module registrations, mappers, docs conventions) | §2.3 reconciliation facts confirmed |
| `python3 scripts/validate-phase01-docs.py` | 8/8 JSONC example objects valid |
| `rg -n "Phase 0[0-9]" docs/architecture/*.md` + manual review | Inter-doc phase numbering aligned (2 fixes applied) |
| Write tool ×7 | Docs A-E + report + validation script created |

**Not executed (by mandate):** any source edit, migration, dependency install, commit of unrelated work, provider authentication, execution operation, or live-connection test.

## 21. Phase 01 Acceptance Checklist (mandate §23)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Phase 00 findings reviewed (or absence documented) | ✅ | §2 here; audit integrated throughout |
| 2 | Current repository inspected | ✅ | §2.3 doc A; §3 here |
| 3 | Target architecture documented | ✅ | Doc A (16 sections + diagrams) |
| 4 | Domain ownership and boundaries explicit | ✅ | Doc A §6.1 table + §6.2 |
| 5 | Provider-neutral contracts and lifecycle semantics defined | ✅ | Doc B (§3-§12); 12 reused, 2 designed |
| 6 | Security and read-only reflected in architecture | ✅ | Doc A §7 + threat model; doc C §8 exclusions; doc B §14 |
| 7 | Provider feasibility limitations visible | ✅ | Doc D §7-§8 (UNSUPPORTED + UNKNOWN registers) |
| 8 | Documentation consistent, no contradictory models | ✅ | Cross-check §17 here; consistency note doc A §10 |
| 9 | Optional shared-contract implementation verified **if present** | ✅ N/A | None implemented (§16 rationale); examples validated 8/8 |
| 10 | Final report identifies outstanding blockers + decisions for Phase 02 | ✅ | §18 here; doc E blockers section |

## 22. Phase 02 Readiness Assessment

**READY.** Phase 02 (Accounts UI + Hygiene, doc E) can start immediately: the backend is complete and tested, the shared contract is UI-ready and frozen as the single consumption surface, the API surface is documented (doc C), the hygiene defect list is precise with path:line anchors, the design-system reuse map exists (audit §4.4), and acceptance criteria are executable. No Phase 02 task depends on an unresolved question. Phases 03+ readiness: capability V2 + PARTIAL designs are frozen (doc B) and their implementation is scheduled **with** the OANDA adapter so every new contract is consumed as it lands; the only external blockers (U1-U3) gate Phases 03/06 validation steps, not their design work.

**STOP after Phase 01 honored** — no Phase 02 work, UI, provider connections, or backend implementation was started.
