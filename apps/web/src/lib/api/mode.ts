/**
 * Canonical API-mode check — the single source of truth for "is the mock
 * layer active". Mocking is the DEFAULT (the canonical preview needs zero
 * env); the two ways to leave mock mode:
 *   - NEXT_PUBLIC_API_MOCKED=false (explicit legacy switch)
 *   - NEXT_PUBLIC_API_LIVE=true (the live bridge — explicit opt-in)
 *
 * ⚠️ History: the demo affordances (login/register/forgot panels,
 * auth-gate, dev hooks) used to test `NEXT_PUBLIC_API_MOCKED === "true"`
 * while MockProvider defaulted to mocked-on-undefined — on the zero-env
 * canonical preview the mock layer was ACTIVE but every demo-credentials
 * panel was HIDDEN, leaving users a working mock login with no visible
 * way to sign in. Always import this constant instead of re-deriving.
 */
export const API_MOCKED =
  process.env.NEXT_PUBLIC_API_MOCKED !== "false" &&
  process.env.NEXT_PUBLIC_API_LIVE !== "true";
