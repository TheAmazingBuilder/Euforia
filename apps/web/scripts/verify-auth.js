/**
 * Verify — Complete authentication system (P0 + MFA challenge).
 *
 * Covers:
 *   A. Unauthenticated gate: / redirects to /login?returnTo=%2F (splash, no
 *      private flash). Reason banners (session-expired rendered via URL).
 *   B. Invalid credentials → generic anti-enumeration error.
 *   C. Rate limiting: 5 bad attempts on a throwaway email → 429 message.
 *   D. Registration: shared-Zod validation (short password + mismatch),
 *      successful register → verification-pending state with mocked
 *      delivery link.
 *   E. Email verification: open link → success state → continue to login.
 *   F. Login as the registered user → protected dashboard (SPA), sidebar
 *      navigation works authenticated (trades), logout returns to login.
 *   G. Demo login → MFA enrollment via Security (re-auth password) →
 *      logout → login triggers MFA challenge → wrong code rejected →
 *      demo-code accepted → dashboard.
 *   H. Recovery-code login path (unused code from enrollment).
 *   I. Token lifecycle: expire access token (dev hook) → protected API call
 *      auto-refreshes (single refresh request for 3 parallel queries) and
 *      the page keeps working — no logout.
 *   J. Session revocation: Security → logout all → real local logout.
 *   K. Forgot/reset password: generic success, mocked reset link, new
 *      password works on the next login.
 *   L. Console/network cleanliness + visual shots (desktop + mobile, dark).
 *
 * SPA-only navigation once authenticated (MSW store lives in the tab);
 * page.goto is allowed only for the initial entry and scenario resets
 * (auth pages are public; the engine re-seeds per load).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const SHOTS = "/home/z/my-project/scripts/shots/auth";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";

const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
  console.log(results[results.length - 1]);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loginAs(page, email, password) {
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator('[data-testid="login-submit"]').click();
  await wait(1500);
}

/** Track /auth/refresh requests to assert single-flight behavior. */
function trackRefreshes(page) {
  const urls = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/auth/refresh")) urls.push(req.url());
  });
  page.on("response", async (resp) => {
    if (resp.url().includes("/api/auth/refresh")) {
      let body = "";
      try {
        body = JSON.stringify(await resp.json());
      } catch {}
      console.log("   [refresh]", resp.status(), body.slice(0, 120));
    }
  });
  return urls;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const errors = [];
  const NOISE = [/socket\.io/i, /candles/i, /market-service/i, /favicon/i, /net::ERR/i, /X-TransformPort/i];
  let expectGuarded401s = false; // true during the single-flight diagnostic window
  page.on("response", (resp) => {
    if (resp.status() >= 400 && !NOISE.some((re) => re.test(resp.url()))) {
      // Auth-domain 4xx are expected flows (invalid creds, rate limits,
      // unauthenticated /auth/me) — do not pollute the error report.
      if (resp.url().includes("/api/auth/")) return;
      // The single-flight test intentionally triggers guarded 401s.
      if (expectGuarded401s && resp.status() === 401) return;
      errors.push(`${resp.status()} ${resp.url()}`);
    }
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  // ══ A. Unauthenticated gate ══════════════════════════════════════════════
  console.log("— A. Unauthenticated gate");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('[data-testid="auth-splash"]').waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  await page.waitForURL(/\/login\?returnTo=%2F/, { timeout: 20_000 });
  check("Gate redirects / → /login?returnTo=%2F", page.url().includes("/login?returnTo=%2F"));

  await page.locator("#login-email").waitFor({ state: "visible", timeout: 15_000 });
  await page.screenshot({ path: `${SHOTS}/A-login-desktop.png` });
  check("Login form visible (premium split shell)", await page.locator('[data-testid="login-form"]').isVisible());

  // ══ B. Invalid credentials ═══════════════════════════════════════════════
  console.log("— B. Invalid credentials");
  await loginAs(page, DEMO_EMAIL, "wrong-password-123");
  await page.locator('[data-testid="login-error"]').waitFor({ state: "visible", timeout: 8_000 });
  const errText = await page.locator('[data-testid="login-error"]').innerText();
  check("Invalid credentials → generic error", /incorrect email or password/i.test(errText));
  await page.screenshot({ path: `${SHOTS}/B-invalid-credentials.png` });

  // ══ C. Rate limiting (throwaway email keeps the demo account clean) ══════
  console.log("— C. Rate limiting");
  for (let i = 0; i < 6; i += 1) {
    await loginAs(page, "ratelimit@cosmoz.app", "wrong-password-123");
    await wait(350);
  }
  await page.locator('[data-testid="login-error"]').waitFor({ state: "visible", timeout: 8_000 });
  const rlText = await page.locator('[data-testid="login-error"]').innerText();
  check("6th attempt → rate limited", /too many attempts/i.test(rlText), rlText.slice(0, 60));
  await page.screenshot({ path: `${SHOTS}/C-rate-limited.png` });

  // ══ D. Registration (validation + success) ═══════════════════════════════
  console.log("— D. Registration");
  await page.locator('[data-testid="login-to-register"]').click();
  await page.locator('[data-testid="register-form"]').waitFor({ state: "visible", timeout: 10_000 });

  // Shared-Zod: weak password + mismatch
  await page.locator("#register-name").fill("Nina Trader");
  await page.locator("#register-email").fill("nina@cosmoz.app");
  await page.locator("#register-password").first().fill("short");
  await page.locator("#register-confirm").first().fill("different");
  await page.locator('[data-testid="register-submit"]').click();
  await wait(400);
  const weak = await page.locator("#register-password-error").isVisible().catch(() => false);
  const mismatch = await page.locator("#register-confirm-error").isVisible().catch(() => false);
  check("Weak password rejected (shared Zod)", weak);
  check("Password mismatch rejected", mismatch);

  // Valid registration
  const REGISTERED_PASSWORD = "nina-strong-pass-2026";
  await page.locator("#register-password").first().fill(REGISTERED_PASSWORD);
  await page.locator("#register-confirm").first().fill(REGISTERED_PASSWORD);
  await page.locator('[data-testid="register-submit"]').click();
  await page.locator('[data-testid="register-pending"]').waitFor({ state: "visible", timeout: 10_000 });
  check("Registration → verification pending", true);
  await page.screenshot({ path: `${SHOTS}/D-register-pending.png` });

  // ══ E. Email verification ════════════════════════════════════════════════
  console.log("— E. Email verification");
  await page.locator('[data-testid="register-open-verification"]').click();
  await page.locator('[data-testid="verify-email"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('[data-testid="verify-state-success"], [data-testid="verify-state-verifying"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('[data-testid="verify-continue"]').waitFor({ state: "visible", timeout: 10_000 });
  check("Verification link → success state", true);
  await page.screenshot({ path: `${SHOTS}/E-verify-success.png` });

  // ══ F. Login as registered user → protected app → logout ═════════════════
  console.log("— F. Registered login + protected navigation");
  await page.locator('[data-testid="verify-continue"]').click();
  await page.locator('[data-testid="login-form"]').waitFor({ state: "visible", timeout: 10_000 });

  // Unverified → verified banner on login (reason=verified)
  const verifiedBanner = await page.locator('[data-testid="login-reason-verified"]').isVisible().catch(() => false);
  check("Login carries reason=verified banner", verifiedBanner);

  await loginAs(page, "nina@cosmoz.app", REGISTERED_PASSWORD);
  await page.waitForURL(/\/($|\?)/, { timeout: 15_000 });
  await page.locator('[data-testid="topbar"]').waitFor({ state: "visible", timeout: 20_000 });
  check("Registered user lands on protected dashboard", page.url() !== "" && !page.url().includes("/login"));
  await page.screenshot({ path: `${SHOTS}/F-dashboard-registered.png` });

  // Sidebar SPA navigation authenticated
  await page.locator('a[href="/trades"]').first().click();
  await wait(1600);
  check("SPA navigation to Trades (authenticated)", page.url().includes("/trades"));

  // Reload → refresh cookie restores... engine state dies with the page; the
  // honest contract behavior: back to login (documented mock seam).
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  check("Reload with dead mock engine → clean login redirect (no crash)", true);

  // ══ G. Demo login → MFA enrollment → MFA challenge ═══════════════════════
  console.log("— G. MFA enrollment + challenge");
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('[data-testid="login-demo-hint"] button').click();
  // The Fill handler awaits a dynamic import — wait for the fields to populate.
  await page.waitForFunction(
    () => (document.querySelector("#login-email")?.value ?? "").length > 0,
    { timeout: 10_000 },
  );
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('[data-testid="topbar"]').waitFor({ state: "visible", timeout: 20_000 });
  check("Demo login works (hint fill)", true);

  // Security center via SPA (sidebar SYSTEM section)
  await page.locator('a[href="/security"]').first().click();
  await page.locator('[data-testid="security-tablist"]').waitFor({ state: "visible", timeout: 20_000 });
  await wait(1200);

  // Enable 2FA: Two-Factor tab → switch → re-auth → enrollment dialog.
  await page.locator('[data-testid="security-tab-two-factor"]').click();
  await page.locator('[data-testid="tfa-switch"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('[data-testid="tfa-switch"]').click();
  await page.locator('[data-testid="reauth-dialog-password"]').waitFor({ state: "visible", timeout: 8_000 });
  await page.locator('[data-testid="reauth-dialog-password"]').fill(DEMO_PASSWORD);
  await page.locator('[data-testid="reauth-dialog-submit"]').click();
  await page.locator('[data-testid="tfa-enroll-dialog"]').waitFor({ state: "visible", timeout: 8_000 });

  const enrollText = await page.locator('[data-testid="tfa-enroll-dialog"]').innerText();
  const demoCode = (enrollText.match(/\b\d{6}\b/) || [])[0] ?? "";
  check("2FA enrollment exposes mock authenticator code", /^\d{6}$/.test(demoCode));

  const recoveryCodesText = await page.locator('[data-testid="tfa-recovery-codes"]').innerText();
  const recoveryCode = (recoveryCodesText.match(/[0-9A-F]{4}-[0-9A-F]{4}/) || [])[0] ?? "";
  check("Recovery codes shown once at enrollment", recoveryCode !== "");

  await page.locator('[data-testid="tfa-saved"]').check();
  await page.locator('[data-testid="tfa-code"]').fill(demoCode);
  await page.locator('[data-testid="tfa-verify"]').click();
  await wait(1800);
  const switchChecked = await page
    .locator('[data-testid="tfa-switch"]')
    .getAttribute("aria-checked");
  check("2FA enabled (switch active)", switchChecked === "true");
  await page.screenshot({ path: `${SHOTS}/G-2fa-enabled.png` });

  // Logout → login → MFA challenge
  await page.locator('[data-testid="sidebar-logout"]').click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  check("Sidebar logout → /login", true);

  await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);
  await page.locator('[data-testid="login-mfa-code"]').waitFor({ state: "visible", timeout: 10_000 });
  check("Login with 2FA → MFA challenge step", true);

  // Wrong code first (rejected, stays on challenge)
  await page.locator('[data-testid="login-mfa-code"]').fill("000000");
  await page.locator('[data-testid="login-mfa-submit"]').click();
  await page.locator('[data-testid="login-error"]').waitFor({ state: "visible", timeout: 8_000 });
  check("Invalid MFA code rejected", await page.locator('[data-testid="login-mfa-code"]').isVisible());

  // Correct code (mock authenticator hint rides on the challenge response)
  const challengeHint = await page.locator('[data-testid="login-mfa-demo-hint"]').innerText().catch(() => "");
  const hintCode = (challengeHint.match(/\d{6}/) || [])[0] ?? "";
  check("Challenge shows mock authenticator hint", /^\d{6}$/.test(hintCode));
  await page.locator('[data-testid="login-mfa-code"]').fill(hintCode);
  await page.locator('[data-testid="login-mfa-submit"]').click();
  await page.locator('[data-testid="topbar"]').waitFor({ state: "visible", timeout: 20_000 });
  check("Correct MFA code → dashboard", !page.url().includes("/login"));
  await page.screenshot({ path: `${SHOTS}/G-mfa-login.png` });

  // ══ H. Recovery-code login path ══════════════════════════════════════════
  console.log("— H. Recovery-code login");
  await page.locator('[data-testid="sidebar-logout"]').click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);
  await page.locator('[data-testid="login-mfa-code"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('button:has-text("Use a recovery code instead")').click();
  if (recoveryCode) {
    await page.locator('[data-testid="login-mfa-code"]').fill(recoveryCode);
    await page.locator('[data-testid="login-mfa-submit"]').click();
    await page.locator('[data-testid="topbar"]').waitFor({ state: "visible", timeout: 20_000 });
    check("Recovery code completes login", !page.url().includes("/login"));
  } else {
    check("Recovery code captured during enrollment", false, "no code found");
  }

  // ══ I. Token lifecycle — single-flight refresh ═══════════════════════════
  console.log("— I. Access-token refresh (single flight)");
  // Let the recovery-login navigation fully settle first.
  await wait(2500);
  const refreshUrls = trackRefreshes(page);
  const hookState = await page.evaluate(() => ({
    hasHook: typeof window.__cosmoz_auth,
    keys: Object.keys(window.__cosmoz_auth ?? {}),
    cookie: document.cookie.includes("cosmoz_rt"),
  }));
  console.log("   [diag]", JSON.stringify(hookState));
  const api401s = [];
  const allApi = [];
  const on401 = (resp) => {
    if (resp.url().includes("/api/")) {
      allApi.push(`${resp.status()} ${resp.url().replace(BASE, "")}`);
      if (resp.status() === 401) api401s.push(resp.url().replace(BASE, ""));
    }
  };
  page.on("response", on401);
  expectGuarded401s = true;
  await page.evaluate(() => window.__cosmoz_auth?.expireAccessToken());
  // Re-fetch the guarded queries (profile + trades) in PARALLEL through the
  // real queryClient — both 401, both retried after ONE shared refresh.
  await page.evaluate(() => window.__cosmoz_auth?.refetchGuarded());
  await wait(3000);
  expectGuarded401s = false;
  page.off("response", on401);
  console.log("   [diag] api calls:", allApi.slice(0, 10).join(" | ") || "(none)");
  console.log("   [diag] 401s:", api401s.join(", ") || "(none)");
  check("Protected calls keep working after token expiry", refreshUrls.length >= 1, `${refreshUrls.length} refresh call(s)`);
  check("Single-flight: exactly ONE refresh for parallel 401s", refreshUrls.length === 1, `${refreshUrls.length}`);
  check("Still authenticated after refresh cycle", await page.locator('[data-testid="topbar"]').isVisible());

  // ══ J. Session revocation → real logout ═════════════════════════════════
  console.log("— J. Session revocation");
  await page.locator('a[href="/security"]').first().click();
  await page.locator('[data-testid="security-tablist"]').waitFor({ state: "visible", timeout: 20_000 });
  await page.locator('[data-testid="security-tab-sessions"]').click();
  await page.locator('[data-testid="sessions-logout-all"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('[data-testid="sessions-logout-all"]').click();
  await wait(400);
  await page.locator('[data-testid="sessions-confirm-confirm"]').click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  check("Revoke all sessions → real local logout", page.url().includes("/login"));
  await page.screenshot({ path: `${SHOTS}/J-revoked-login.png` });

  // ══ K. Forgot / reset password ═══════════════════════════════════════════
  console.log("— K. Forgot + reset password");
  // Fresh engine (goto a public auth page) — demo password back to default.
  await page.goto(`${BASE}/forgot-password`, { waitUntil: "domcontentloaded" });
  await page.locator("#forgot-email").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("#forgot-email").fill(DEMO_EMAIL);
  await page.locator('[data-testid="forgot-submit"]').click();
  await page.locator('[data-testid="forgot-sent"]').waitFor({ state: "visible", timeout: 10_000 });
  const sentText = await page.locator('[data-testid="forgot-sent"]').innerText();
  check("Forgot password → generic success", /check your inbox/i.test(sentText));
  await page.screenshot({ path: `${SHOTS}/K-forgot-sent.png` });

  await page.locator('[data-testid="forgot-open-reset"]').click();
  await page.locator('[data-testid="reset-password"]').waitFor({ state: "visible", timeout: 10_000 });
  const NEW_PASSWORD = "cosmoz-demo-2026-reset";
  await page.locator("#reset-password").first().fill(NEW_PASSWORD);
  await page.locator("#reset-confirm").first().fill(NEW_PASSWORD);
  await page.locator('[data-testid="reset-submit"]').click();
  await page.locator('[data-testid="reset-continue"]').waitFor({ state: "visible", timeout: 10_000 });
  check("Reset with token → success", true);
  await page.screenshot({ path: `${SHOTS}/K-reset-success.png` });

  await page.locator('[data-testid="reset-continue"]').click();
  await wait(1500);
  // The demo user's stateless refresh cookie may restore the session on a
  // fresh engine — sign out first so the credential checks are clean.
  if (!page.url().includes("/login")) {
    await page.locator('[data-testid="sidebar-logout"]').click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  }
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 15_000 });
  // Old password no longer works
  await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);
  const oldRejected = await page.locator('[data-testid="login-error"]').isVisible().catch(() => false);
  check("Old password rejected after reset", oldRejected);
  // New password works
  await loginAs(page, DEMO_EMAIL, NEW_PASSWORD);
  await page.locator('[data-testid="topbar"]').waitFor({ state: "visible", timeout: 20_000 });
  check("New password signs in", !page.url().includes("/login"));

  // ══ L. Visual QA — mobile login + MFA ════════════════════════════════════
  console.log("— L. Visual QA");
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await mobile.locator("#login-email").waitFor({ state: "visible", timeout: 20_000 });
  await mobile.screenshot({ path: `${SHOTS}/L-login-mobile.png` });
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  check("Mobile login — no horizontal overflow", !overflow);
  await mobile.close();

  // Session-expired reason banner (desktop, fresh public page)
  await page.goto(`${BASE}/login?reason=session-expired`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="login-reason-session-expired"]').waitFor({ state: "visible", timeout: 15_000 });
  check("Session-expired reason banner renders", true);
  await page.screenshot({ path: `${SHOTS}/L-session-expired-banner.png` });

  // ══ Report ═══════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════");
  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`TOTAL: ${results.length} — FAILED: ${failed.length}`);
  if (errors.length) {
    console.log("\nUnexpected console/network errors:");
    for (const e of [...new Set(errors)].slice(0, 12)) console.log("  ", e);
  } else {
    console.log("No unexpected console/network errors.");
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
