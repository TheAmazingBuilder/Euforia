# Audit record — t31: System → Security — password rotation, 2FA, sessions, login history, hardening checklist

- **Date**: 2026-09-26
- **Verdict**: PASS
- **Commit**: `0b284c0`

## Scope
- Contract security.ts: SecurityOverview (2FA + passwordLastChangedAt + sessions[current] + logins[outcome success|failed] + recommendations), ChangePasswordInput min 8, toggle/revoke responses.
- Mock: store.security (2FA off, password changed 21d ago, 3 sessions incl. current, 5 logins incl. 1 failed Frankfurt); getSecurityOverview() with computed recommendations (2FA, rotation <90d, remaining sessions ≤1); changePassword (honest: no credential stored, re-stamped clock, 422 if <8), toggleTwoFactor, revokeSession (404, 400 if current); MSW GET /security/overview + POST /security/password, /security/two-factor, /security/sessions/:id/revoke; endpoints, keys, hooks (invalidating overview).
- Nav: SECURITY (KeyRound) in System after Integrations — System complete: Settings / Monitoring / Integrations / Security.
- UI: security-view.tsx ruled Sections — Password (current/new/confirm, global reveal, inline passwordIssue from lib/auth/demo, aria-live match indicator, save disabled when invalid); Two-step (ShieldCheck profit / ShieldAlert warning pill + Enable/Disable); Active sessions (CURRENT accent badge, Revoke disabled on current); Login history (SIGNED IN profit / FAILED loss); Hardening checklist (CheckCircle2 profit / Circle, struck title when done); demo footnote.

## Ritual results
tsc shared 0, tsc app 0, eslint 0 · Desktop 1440 dark: 2FA off → Enable → 'is on' + rec-2fa checklist item passes (profit icon + struck title) · Revoke laptop → 3 → 2 sessions · password mismatch → 'Passwords don't match' + save disabled · corrected → 'Passwords match' → save → 'Password changed' toast + fields reset · light captured · Mobile 390 light+dark sw=iw · console clean.

## Evidence
- `apps/web/scripts/shots/t31/ (4 PNG)`

## Notes
The account's locks delivered; System section complete: Settings / Monitoring / Integrations / Security.
