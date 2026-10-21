# Audit record — t22: Auth improvement — split layout, two-step verification, reset flow, password confirmation

- **Date**: 2026-09-26
- **Verdict**: RE-APPLIED — PASS
- **Commit**: `cc3b69d`

## Scope
- lib/auth/demo.ts: simulateLatency, maskEmail, emailIssue, passwordIssue (min 8), passwordsMatch — shared rules, honest 'demo build' framing.
- Split layout (auth)/layout + auth-brand.tsx: aside bg-surface border-r with CosmozMark + wordmark + ThemeToggle, eyebrow 'Le Registre', headline, 3 feature rows (token icons), SVG decor with named tokens + accent equity curve; AuthMobileHeader lg:hidden; form column centered max-w-sm. All tokens — adapts to all 3 themes.
- Login: email + password (reveal eye via PasswordInput), forgot link, inline validation with clearError on edit, submit → toast + /two-step?mode=verify&email=.
- Register: name/email/password + CONFIRM with MatchIndicator aria-live ('Passwords match' profit / 'don't match' loss), 'Good password' hint from 8 chars, invalid submits blocked, → /two-step?mode=setup.
- Two-step: 6-box OTP (auto-advance, backspace to previous box, arrows, paste-fill, select-on-focus), disabled until complete, verify/setup modes (copy + masked email), resend cooldown 30s with cleaned timer, demo hint 'any 6-digit code accepted', → dashboard. Anti-overflow: grid-cols-6 minmax(0,1fr) + size={1} + w-full min-w-0 inputs.
- Forgot-password: email → 'Check your inbox' state (MailCheck, email shown) → 'Open the reset link' (honest simulation) → /reset-password?token=demo-reset-token + 'Use a different email'.
- Reset-password: no token → 'This link has expired' (Link2Off, warning); with token → new password + confirm → 'Password updated' (KeyRound, profit) → sign in.
- 5 routes (login, register rewritten; two-step, forgot-password, reset-password created); useSearchParams under Suspense; getPageTitle extended.

## Ritual results
tsc 0, eslint 0 · Desktop 1440: split layout dark + light, login→2FA(verify)→dashboard (keyboard auto-advance), register mismatch → correction → 'Passwords match' → 2FA setup, forgot→inbox→reset→updated, tokenless link → 'expired', resend 30s→29s · Mobile 390 all pages sw=iw · console clean.

## Evidence
- `apps/web/scripts/shots/t22/ (10 PNG)`

## Notes
Re-application of the lost commit 1a8447f. File of re-applications completed here.
