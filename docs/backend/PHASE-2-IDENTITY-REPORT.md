# COSMOZ — BACKEND PHASE 2
## Identity, Authentication & Authorization — Final Report

| | |
|---|---|
| **Date** | 2026-10-03 |
| **Base** | Phase 0 report + Phase 1 Foundation (`865945f`) |
| **Scope** | Identity ONLY — users, auth, sessions, MFA, authorization foundation, security events, account protection. No trading/business domains (§58). |
| **Verification** | typecheck ✅ · lint ✅ · build ✅ · **106/106 tests ✅** (36 new identity/security e2e) · live runtime smoke ✅ |

---

# A. Implementation Summary

**11 auth + 10 security + 7 me endpoints** — the complete frontend auth/security/profile contract, mock-parity where the mock is right, production-correct where the mock documented its own seams:

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register · login · mfa/challenge · mfa/recover · refresh · logout · email/verify · email/resend · password/forgot · password/reset`, `GET /auth/me` |
| Security | `GET /security/overview`, `POST /security/reauth · password · 2fa/enable · 2fa/confirm · 2fa/disable · 2fa/recovery/regenerate · api-keys · api-keys/:id/revoke · sessions/revoke` |
| Me | `GET·PATCH /me`, `GET /me/preferences`, `PATCH /me/preferences/:domain`, `POST /me/preferences/reset · deactivate · delete` |

Everything binds to the shared Zod contracts (`schemas/auth.ts`, `schemas/security.ts`, `schemas/api.ts`, `schemas/settings.ts`) via the Phase 1 `ZodValidationPipe`/error envelope. The frontend swap remains a pure config change (`NEXT_PUBLIC_API_MOCKED=false` + `NEXT_PUBLIC_API_URL=…/api/v1`).

# B. Identity Architecture

```text
User (aggregate root; uuid, unique lowercased email)
├── status: ACTIVE | PENDING_VERIFICATION | SUSPENDED | DEACTIVATED  (+ role TRADER|ADMIN)
├── password: argon2id hash + passwordLastChangedAt
├── MFA state: encrypted secret (AES-256-GCM) + enabled/disabled/lastVerified timestamps
├── profile: name · timezone (single source of truth) · baseCurrency · username? · bio? · avatarUrl?
├── preferences: one JSON doc (shared userPreferencesSchema, 9 domains, defaults from shared)
├── deletionScheduledFor (grace period; purge job deferred)
├── Sessions[]   — refresh family per row (hash, generation, device/browser/os/ipMasked, TTL, revokedAt)
├── SecurityEvents[] (append-only)  · LoginRecords[] (§31 history)
├── AuthChallenges[] (EMAIL_VERIFICATION | PASSWORD_RESET — hashed, single-use, purpose-scoped)
├── RecoveryCodes[] (hashed, single-use, activated at 2FA confirm)
└── ApiKeys[] (prefix + fingerprint + hashed secret)
```

Deviations from `data-model.md` Domaine 1 (documented, contract-driven): Session carries generation + previous-hash (reuse detection) instead of `replacedById` chains; the shared `SecurityEvent` shape (typed enum + actor/context/outcome) is used instead of generic AuditLog; profile fields live on User (avoiding a 5-field join table) per "only entities that provide meaningful value" (§34).

# C. Authentication Architecture

- **Register**: validate → rate-limit (5/15m) → uniqueness (409 EMAIL_ALREADY_USED) → Argon2id → user `PENDING_VERIFICATION` → hashed 24h verification challenge → email via the MailTransport port → `201 {user, status, verificationSentAt, delivery:"EMAIL", verificationExpiresAt}`. **No `verificationToken` in any response** (mock-only affordance, per the schema's own comment).
- **Verify**: single-use + purpose-scoped; `400 INVALID_TOKEN / TOKEN_ALREADY_USED / EXPIRED_TOKEN` with the mock's exact copy; success → ACTIVE + `EMAIL_VERIFIED` event.
- **Login**: rate-limit → verify (Argon2id) → status gates (403 ACCOUNT_SUSPENDED / ACCOUNT_DEACTIVATED / EMAIL_NOT_VERIFIED) → MFA branch → `AUTHENTICATED` with session + cookie. **Anti-enumeration**: unknown email and wrong password produce identical 401 `INVALID_CREDENTIALS` (byte-identical modulo requestId — tested).
- **Tokens**: 15-min access JWT `{sub, sid}` (no roles/personal data) + rotating refresh (`<generation>.<random>`; only SHA-256 hashes stored; HttpOnly `cosmoz_rt`, SameSite=Lax, Secure in prod, Max-Age only when remember=true; refresh always re-issues 30-day cookie — mock parity).
- **Rotation & reuse**: rotation bumps the row's generation and keeps the previous hash; presenting ANY of {unknown hash, previous hash, stale generation, revoked, expired} → 401 — and reuse of a rotated-away token revokes **every** session of the user + `SESSION_REVOKED` event (§13; mock-parity blast radius).
- **Logout**: revokes the session server-side, clears the cookie, always `{loggedOut:true}`.
- **Password reset**: 202 always (anti-enumeration) → 30-min hashed challenge → reset + revoke-all-sessions + `PASSWORD_CHANGED`.

# D. MFA Architecture

- **Enable** (reauth-gated): TOTP secret (RFC 6238, SHA-1/6/30, ±1 step — Google/Microsoft Authenticator, 1Password, Authy compatible) → AES-256-GCM-encrypted at rest (pending) → 10 recovery codes hashed (inactive until confirm) → one-time enrollment response `{secret, recoveryCodes}` — **`demoCode` is never emitted** (made optional in the shared schema per its own mock-only comment).
- **Confirm**: live TOTP proof (no reauth needed — the code IS the proof) → activated + codes active + `TFA_ENABLED`; wrong code → `422 INVALID_CODE`.
- **Login challenge**: `MFA_REQUIRED {challengeToken, challengeExpiresAt, method}` → `mfa/challenge` (TOTP) or `mfa/recover` (single-use recovery code, consumed). Challenges are 5-min, single-use on success/expiry, survive wrong attempts (rate limiter bounds guessing: 5/15m) — mock parity.
- **Disable** (reauth-gated): wipes secret + codes, `TFA_DISABLED`; **regenerate** (reauth-gated): replaces the whole set, previous codes provably dead (tested).

# E. Authorization Architecture

- **Global `JwtAuthGuard`** (APP_GUARD, after the throttler): Bearer → verify JWT → live session (unrevoked, unexpired) → ACTIVE user; `@Public()` opt-out on credential/cookie routes. `/auth/me` is deliberately guarded — its 401 drives the frontend's silent cookie-refresh on boot.
- Status gates at the guard: live session + SUSPENDED/DEACTIVATED → 403 with contract codes; self-deactivation revokes sessions → dead session 401 (tested).
- **Roles**: `TRADER` (default) / `ADMIN` enum + fixed permission map (extensible — no RBAC matrix, §26). `authUserSchema.roles/permissions` filled server-side.
- **Ownership pattern**: session revocation and API-key revocation resolve resources through the caller's userId — foreign ids yield 404 (`SESSION_NOT_FOUND`, `KEY_NOT_FOUND`), never a leak or a cross-user mutation (IDOR-tested, §43).
- **Reauthentication**: `POST /security/reauth` (password) → single-use 5-min token consumed by password change, 2FA enable/disable, recovery regeneration, API-key create/revoke; missing → 401 `INVALID_REAUTH_TOKEN`, replayed → 401, failures rate-limited 5/15m with countdown copy.

# F. Database Changes

First real migration (`identity_auth`) + `session_previous_hash`:

```text
User            (identity/profile/MFA-state columns; unique email, unique username, status index)
Session         (unique refreshTokenHash, previousTokenHash, generation, device metadata,
                 revokedAt, expiresAt;  [userId, revokedAt] + [userId, expiresAt] indexes)
SecurityEvent   (append-only; [userId, at DESC])
LoginRecord     ([userId, at DESC])
AuthChallenge   (unique tokenHash; purpose-scoped; [userId, purpose])
RecoveryCode    (unique codeHash; active/usedAt; [userId, active])
ApiKey          (unique secretHash; prefix+fingerprint; [userId])
```

All FKs `onDelete: Cascade` (SecurityEvent `SetNull` — log survives users). Migrations are versioned + applied via `migrate deploy`; no non-test database was reset.

# G. Security Measures

Argon2id (OWASP 19 MiB/t=2/p=1) · HttpOnly+SameSite=Lax+Secure(prod) cookie, never in bodies · short access JWT with minimal claims · rotation + family-revoking reuse detection · per-vector sliding-window rate limits with Retry-After (login 5/15m, mfa 5/15m, register 5/15m, resend 3/15m, forgot 3/15m, reauth 5/15m) · single-use hashed challenges (24h verify / 30min reset / 5min MFA / 5min reauth) · AES-256-GCM MFA secrets · append-only security log · masked IPs (never stored whole) · honest "Unknown" location (no invented geo) · secrets/tokens/passwords redacted from logs (Phase 1 redaction list) and absent from error envelopes · confirmations typed as literals for destructive actions.

# H. Tests

106/106 green (71 pre-existing + 35 new — all Phase 1 suites still pass):

- **Unit (39)**: env schema (incl. new required auth vars + secret-safety), error mapping, request-id, contracts liftability.
- **e2e identity (16)**: register shape (no token leak, EMAIL delivery, no hash) · weak-password 400 · duplicate 409 · pre-verification gate · verify/replay/garbage · resend anti-enumeration · byte-identical 401s · cookie flags (HttpOnly/SameSite/Max-Age) · me guard · rotation + **reuse → family revocation** (old AND new cookies dead, access dead) · logout + clear-cookie · garbage cookies · forgot/reset flows · login rate-limit 429 + Retry-After · events + login history recorded, no secrets in payloads.
- **e2e security (19)**: overview aggregate (7 protection checks, score, rate-limit declarations, retention) · reauth success/failure-countdown/consumption · password change (others revoked, current alive, same-password 409, missing-reauth 401) · full MFA lifecycle (enrollment sans demoCode, 422 INVALID_CODE, real-TOTP confirm via `otpauth`, challenge login, rate-limited guessing, one-time recovery codes, regeneration invalidates old set, disable) · sessions list/revoke/one/others/all + **IDOR 404** · API keys (secret once, prefix/fingerprint, foreign revoke 404) · profile rename · email change → re-verification → login gate · preferences doc/patch/timezone write-through/reset · deactivation + scheduled deletion (confirmation-gated, sessions revoked).

# I. Frontend Compatibility

Zero frontend files changed. Contract parity verified against the extraction of `endpoints.ts`, `client.ts`/`refresh.ts` (exempt paths, single-flight semantics, `AuthSuccess` refresh body), the auth-engine (TTLs, vectors, cookie name, error codes/copy) and the security module (reauth body field, session/key shapes, TwoFactorState). Known intentional deltas (all production-correct, schema-comment-sanctioned): no `verificationToken`/`resetToken`/`demoCode` in responses (emails carry the links; dev transport logs them), true HttpOnly cookie, `scope:"all"` ends the current session, missing reauthToken → 401 at the handler, `/security/*` uniformly guarded (mock skipped `requireAuth` on overview).

# J. Risks / Limitations

1. **Email delivery** is a log-rendering dev transport — production provider (SMTP/Resend/SES) still an open question (Phase 0 #1); plug into `MailTransport`.
2. **In-memory** MFA challenges, reauth tokens and per-email rate buckets — correct for the single-instance monolith (all ≤ 15-min TTLs, fail-safe on restart); must move to a shared store if the API ever scales horizontally.
3. **No email-change reauth** — the shared `ProfileUpdateInput` has no reauth field; the security property (new address must verify before use) is enforced, but password re-confirmation for email change awaits a frontend contract addition.
4. **Deletion purge job** deferred: scheduling + status implemented; actual anonymization requires the data-owning domains (trades etc.) to exist.
5. **API keys are stored but not yet accepted** as request credentials — no resource endpoints exist to authorize; activate when a consuming phase arrives (fingerprint + lastUsedAt already modeled).
6. **Retention** (365d events / 180d logins) is declared but not yet enforced by a cron (Phase 0: plain cron first).
7. **JWT is HS256 with a shared secret** — symmetric signing is fine for the monolith; market-service verification should switch to JWKS/`AUTH_JWT_SECRET` sharing or an asymmetric key when its mock seam is replaced.
8. Pre-existing (from Phase 1 report): `next build` /login Suspense issue — untouched, frontend work.

# K. Deferred Work

Everything in §58: Trading Accounts/connectivity (broker identity stays a separate future context — never mixed with application identity), trading, Session Live, analytics, playbook, backtesting, OCR/AI, Academy, Nofy, Calendar. Plus: email provider adapter, retention cron, deletion purge job, refresh-token shared store (horizontal scale), social/OAuth login (§47–48: deliberately absent), admin tooling beyond the role enum (§49), WebSocket gateway auth.

---

**STOP** — per mandate §60: Phase 2 complete and verified; no Accounts/Trading/Connectivity work has begun.
