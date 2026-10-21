/**
 * Shared Playwright helper — authenticated session bootstrap.
 *
 * The AUTH-1 increment wrapped the (app) group in the AuthGate, so every
 * pre-auth verification script now lands on /login in a fresh context.
 * `ensureLogin` restores the SPA flow each script was written against:
 * it logs the demo account in ONLY when the shell is not already visible,
 * then waits for the sidebar so scripts can click their SPA routes.
 *
 * Boot note: a fresh context's silent boot restore fires ONE expected
 * /api/auth/me + /api/auth/refresh 401 pair (documented in AUTH-1) — add
 * `/\/api\/auth\/(me|refresh)\b/` to the script's NOISE filter.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification helper */

const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";

async function ensureLogin(page, { email = DEMO_EMAIL, password = DEMO_PASSWORD } = {}) {
  const sidebar = page.locator('nav[aria-label="Main navigation"]');
  if ((await sidebar.count()) > 0 && (await sidebar.isVisible().catch(() => false))) {
    return; // Already authenticated — nothing to do.
  }
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator('[data-testid="login-submit"]').click();
  await sidebar.waitFor({ state: "visible", timeout: 20_000 });
}

module.exports = { ensureLogin, DEMO_EMAIL, DEMO_PASSWORD };
