# COSMOZ — BACKEND PHASE 16
## Security, Security Center & Security Operations — Final Report

| | |
|---|---|
| **Date** | 2026-10-04 |
| **Base** | Phase 0 audit (`78e30ac`) + Phase 1 Foundation (`865945f`) + Phase 2 Identity (`f7516cf`) + Phase 3 Accounts (`69247a7`) |
| **Scope** | Security bounded context ONLY — posture, events, activity, visibility. No authentication/session/MFA/authorization rebuild (§1). |
| **Verification** | typecheck ✅ · lint ✅ · build ✅ · **182/182 tests ✅** (15 new security-events + capability-negative e2e) · Prisma schema valid ✅ · **no migration required** |

---

## 1. Repository / Security Audit Findings

The audit (§52 steps 1–5) established the ACTUAL state before any change:

- **Backend reality**: only Phases 0–3 were ever executed. Backend `Integrations` (Phase 14) and `Settings` (Phase 15) **do not exist server-side** — those prompts were lost by the delivery channel. Every capability they were supposed to own exists only as MSW mocks in the frontend.
- **The Security Center backend already existed at ~90%** inside `modules/identity/` (Phase 2): 10 `/security/*` routes 1:1 with the frontend contract, 7-check protection posture with a deterministic score, reauth-gated mutations, append-only event log, 19 security e2e + 9 negative e2e already green.
- **One latent contract drift (real bug)**: Phase 3 added 4 event types (`TRADING_ACCOUNT_*`) to the backend writer, but the shared catalog kept 19 values. The frontend registry `EVENT_TYPE_META: Record<SecurityEventType, {label}>` would evaluate to `undefined` for those types → the Events tab **crashes for any user with a connected trading account**. Fixed in this phase (catalog reconciled to 23 values, 4 labels added).
- **One mandate gap**: §28 pagination — no paginated activity reads existed (overview caps at 60 events / 15 logins).
- `connectedAccounts: []` was honest and stays: Security never invents an Integrations projection (§23/§24).
- The event model has NO severity field; the frontend displays `outcome` (SUCCESS/FAILURE) + type, never severity → per §9 ("if the frontend displays severity") severity levels are **not** introduced.

## 2. Existing Security Functionality Reused

Nothing security-related was re-implemented. Reused verbatim:

| Capability | Owner (unchanged) |
|---|---|
| Password hashing/verification (Argon2id) | `identity/password-hasher.service.ts` |
| Reauth single-use tokens (5-min, rate-limited) | `identity/reauth.service.ts` |
| MFA/TOTP lifecycle, recovery codes | `identity/mfa.service.ts` |
| Session persistence, revocation, rotation/reuse detection | `identity/identity.repository.ts`, `identity/token.service.ts` |
| JWT guard, `@CurrentUser` principal, ZodValidationPipe, error envelope | `shared/*` (Phase 1) |
| Global ThrottlerGuard, structured logging + redaction, correlation IDs | `infrastructure/*` (Phase 1) |
| Route shapes, error codes, e2e suites | Phase 2 — **all kept green, zero route changes** |

The extraction MOVED code (git-documented) rather than duplicating it: `identity/security.controller.ts` → `security/security-center.controller.ts`, `identity/security.service.ts` → `security/security-center.service.ts`, `identity/security-event.service.ts` → `security/security-event.service.ts`, and the event/login persistence methods of `identity.repository.ts` → `security/security-event.repository.ts`. The three old files are deleted; no second implementation of anything exists.

## 3. New Security Functionality Implemented

1. **`GET /security/events`** — keyset-paginated audit trail: `limit` (1–100, default 30), opaque cursor, filters `type` (validated against the 23-value catalog), `outcome`, `from`/`to` (§28/§29). Never unbounded.
2. **`GET /security/logins`** — same discipline for login history + `success` filter.
3. **`SecurityEventModule`** — the append-only ledger as a standalone write port: Identity and Accounts record facts WITHOUT depending on the Security center (§34).
4. **`SecurityModule`** — the Security bounded context: posture/overview, paginated activity reads, sensitive-action orchestration via identity's exported capabilities.
5. **Contract reconciliation** — shared catalog now matches what the backend actually emits; frontend labels added (crash fix).
6. **Malformed cursor → 400 `INVALID_CURSOR`** (never a 500, §27).

## 4. Final Security Domain Boundary

```text
IdentityModule            SecurityEventModule         SecurityModule (Phase 16)
  authentication   ──┐        (append-only ledger)        (center)
  sessions         ──┼── record ────────▲                  posture / overview
  MFA              ──┘                   │                  paginated events/logins
  authorization                          │                  orchestration ──┐
         ▲                               │ reads                            │ reuses
         └────────── exports (public contract, §33) ────────────────────────┘
```

Acyclic by construction: Identity → SecurityEventModule (writes); Accounts → SecurityEventModule + IdentityModule (repository + events); Security → SecurityEventModule + IdentityModule. No module imports Security internals.

**Security does NOT own** (documented in code headers): passwords, tokens, MFA secrets, roles, permissions, trading accounts, broker credentials, integrations, trades, analytics, economic events, or infrastructure monitoring (Monitoring remains a future phase — §49 boundary respected; the monitoring frontend module consumes its own mock, not Security).

## 5. Security Event Architecture

- **One model, one writer, one catalog** (§38): `SecurityEvent` (append-only, Prisma) + `LoginRecord`, written exclusively through `SecurityEventService.record/recordLogin`. There is no separate AuditEvent system to consolidate — SecurityEvent IS the audit trail; it is user-facing by contract and operational facts (sync runs) stay in their own observability tables (Phase 3 decision, kept).
- **Catalog**: 23 types — 19 product/auth events + 4 `TRADING_ACCOUNT_*` lifecycle facts. Sync success is deliberately NOT an event (signal density).
- **Fields**: `id, userId, at, type, actor, context, outcome` — no severity (not displayed, §9); metadata is the sanitized human `context` string; secrets are structurally impossible (§8/§30 — enforced by redaction list + tests).
- **Immutability**: append + reads only; e2e proves POST/PUT/PATCH/DELETE on the log → 404 (§10). Retention (365d/180d) stays declared-not-enforced (see §12).

## 6. Session / MFA / Auth Integrations

- **Sessions**: revocation scopes one/others/all orchestrate identity's repository; Security never touches refresh-token tables (§14). Password change revokes others, keeps current (§23) — unchanged, re-verified.
- **MFA**: status read via `MfaService.state()`; enable/disable/regenerate delegate with reauth; no second TOTP implementation; `demoCode` still never emitted (§15).
- **Reauth**: all sensitive mutations still consume single-use 5-min tokens; failures rate-limited 5/15m (§17).
- **Passwords**: Security orchestrates via hasher + repository; never stores or returns hash material (§16).

## 7. Database Changes

**None.** No migration, no schema change. The extraction moves code across module boundaries; the new paginated reads use the existing `@@index([userId, at(sort: Desc)])` indexes (keyset on `(at DESC, id DESC)` scans them efficiently). `prisma validate` ✅; test DB migrations unchanged.

## 8. API Contracts

Routes (all verified against the frontend client, zero breaking change):

```text
GET  /security/overview                    (unchanged — posture aggregate)
GET  /security/events                      (NEW — keyset page: items + nextCursor)
GET  /security/logins                      (NEW — keyset page: items + nextCursor)
POST /security/reauth                      (unchanged)
POST /security/password                    (unchanged)
POST /security/2fa/enable|confirm|disable|recovery/regenerate  (unchanged)
POST /security/api-keys, /api-keys/:id/revoke                  (unchanged)
POST /security/sessions/revoke             (unchanged)
```

New shared schemas (`packages/shared/src/schemas/security.ts`): `pageCursorSchema`, `securityEventPageQuerySchema`, `securityEventPageSchema`, `loginRecordPageQuerySchema`, `loginRecordPageSchema` — canonical shapes; the controller derives coerced wire variants (Fastify query strings) from them. `securityEventTypeSchema` extended 19 → 23. Response bodies expose only contract fields — never internal structures, token ids, hashes (§27).

## 9. Security Controls

- Authentication: every `/security/*` route behind the global JWT guard (401 for anonymous — tested).
- Ownership: all reads/writes scoped by the server-side principal; cursors are NOT authorization inputs (forged cross-user cursor pages into the caller's OWN log — tested).
- Input validation: Zod on every query/body; unknown `type` → 400; `limit` bounds 1–100; `success` strict "true"/"false" enum (§29).
- Rate limiting: existing Phase 1 global ThrottlerGuard covers the new read endpoints — no new limiter introduced (§39); per-vector limits unchanged.
- Mass assignment: Zod strips unknown keys; injection of `role`/`permissions`/`passwordHash`/`mfaSecretEnc` into mutations has zero effect (tested, §40).
- IP/location: masked at creation, never raw (unchanged, Phase 2 discipline, §11/§12).
- Time semantics: canonical UTC persistence; display timezone stays a frontend concern (§30).
- Fail-closed: missing/foreign reauth → 401 before any state change (§1.22).

## 10. IDOR / Negative Security Tests

New suites (23 assertions across 15 tests, all against the real AppModule + real PostgreSQL):

- `security-events.e2e.spec.ts` (7): anonymous 401 ×2 · full keyset walk == reference set, no duplicates, cursor pins the last row · filters (type/outcome/range/success) · future `from` → empty page · invalid cursor/limit → 400 with `INVALID_CURSOR` · **mutation surface of the append-only log = none (6 verbs × 404)** · User A never sees User B events (ids + email absence) · forged cross-user cursor cannot leak.
- `security-capability-negative.e2e.spec.ts` (8): overview/events/logins credential-free (regex: passwordHash, mfa secrets, refresh tokens, recovery codes, argon2, tokenHash, 6-digit code) · no role/permission/token-minting surface (6 routes × 404) · mass-assignment injection ignored, role stays TRADER · overview carries no authorization data · no trading/integration mutation surface (6 routes × 404) · `connectedAccounts` stays a credential-free projection slot · ownership scoping of aggregates · forged API-key revoke with foreign reauth → 401.

Negative-capability proof (§44): Security can neither change user role, grant permissions, read password hashes/refresh tokens/MFA secrets/integration credentials, nor modify trading accounts/trades/analytics/calendar — the surface provably does not exist (404) and injections are stripped.

## 11. Verification Results

| Check | Command | Result |
|---|---|---|
| Typecheck (API) | `pnpm typecheck` | ✅ clean |
| Typecheck (shared) | `pnpm build` (tsc --noEmit) | ✅ clean |
| Typecheck (web) | `npx tsc --noEmit` | ✅ exit 0 |
| Lint (API) | `pnpm lint` | ✅ clean |
| Lint (web, changed file) | `eslint security-primitives.tsx` | ✅ clean |
| Unit + e2e tests | `pnpm test` | ✅ **182/182** (14 files) |
| Regression | pre-existing 167 tests | ✅ all green (identity 16, security 19, accounts 35, app 23, negative 9, units 65) |
| Build (API) | `pnpm build` | ✅ |
| Prisma | `prisma validate` | ✅ valid — **no migration needed** |
| Runtime | e2e boots the real AppModule over Fastify + embedded PostgreSQL | ✅ (equivalent runtime coverage) |

**Not executed**: web `next build` (pre-existing `/login` Suspense prerender issue documented in Phases 1–2 — untouched, frontend work); web `pnpm lint` full run fails on pre-existing `scripts/probe-*.js` `require()` rules (verification scripts, not shipped code, untouched by this phase).

## 12. Known Limitations

1. **`connectedAccounts` is honestly empty** — the Integrations backend (Phase 14) was never executed; when it exists it will emit `INTEGRATION_*` events through the shared ledger and Security will read a projection from its public contract — never credentials (§23).
2. **Retention is declared, not enforced** (365d events / 180d logins; Phase 2 J.6) — enforcement belongs to an authorized system cron, still deferred.
3. **Security-alert push (2FA-off >7d reminder)** lives in the frontend mock engine writing into the Nofy alerts store; there is no Nofy backend, so no server-side alert table was created (§18 — no speculative alert system). The deterministic posture checks in `overview` already encode the same facts.
4. **No security score change**: the score stays the documented deterministic function of the 7 hard-fact checks (round(passed/total×100); STRONG ≥85 / FAIR ≥60) — no arbitrary 87/100 inventiveness (§20).
5. **In-memory reauth/MFA-challenge/rate-limit stores** remain correct only for the single-instance monolith (Phase 2 J.2, unchanged).
6. **API keys are still stored-but-not-accepted** as request credentials (Phase 2 J.5, unchanged — no consuming phase exists yet).
7. Wire timestamps truncate milliseconds (`isoDateTimeSchema`); keyset cursors keep full precision internally, so same-second ordering among events is not client-observable — the opaque cursor is the only stable walk handle (documented in the test suite).

## 13. Deferred Work

- **Phase 9 — Backtesting: DEFERRED** (unchanged — the product module does not exist).
- Integrations backend (Phase 14) → then `connectedAccounts` projection + `INTEGRATION_*` event wiring.
- Settings backend (Phase 15) → then any Settings-owned security display preferences.
- Nofy backend → server-side security alert projection (replacing the client mock bridge).
- Monitoring phase → operational observability; Security MUST NOT absorb it (§49).
- Retention cron; refresh-token shared store for horizontal scaling; email provider adapter; deletion purge job; API-key acceptance middleware.

---

**Status legend**: Implemented ✅ · Verified ✅ (182/182 executed, nothing claimed without execution) · Not verified: web `next build` (pre-existing issue) · Deferred: list above.

**STOP** — per mandate §56: Phase 16 complete and verified. No Monitoring, Backtesting, OCR, AI, or infrastructure work has begun. No unrelated module was refactored beyond the documented boundary extraction.
