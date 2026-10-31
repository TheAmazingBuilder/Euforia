/**
 * Verify - real authentication system.
 * Context A: guard redirect, login page anatomy, zod field errors, wrong
 *   password, demo login, session persisted across reload, /login redirect
 *   when signed in, logout, guard ?next= round-trip.
 * Context B: registration → auto sign-in → profile identity + change
 *   password → sign out → sign in with the new password; duplicate email 409.
 * Context C: forgot password → mock dev-code → reset confirm → signed in;
 *   old password rejected, new one accepted.
 * Plus: light theme + mobile 390px render of the login page.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "alex@cosmoz.app";
const DEMO_PASSWORD = "cosmoz123";

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const check = (name, ok, extra = "") => {
    const line = `${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`;
    results.push(line);
    console.log(line);
  };
  const waitForLoginPage = (page, timeout = 15000) =>
    page.waitForFunction(() => window.location.pathname === "/login", null, { timeout });
  const waitForPath = (page, expected, timeout = 15000) =>
    page.waitForFunction(
      (exp) => window.location.pathname + window.location.search === exp,
      expected,
      { timeout },
    );
  const collectErrors = (page) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      // Negative-path probes (wrong password, duplicate email) make the
      // browser log the 4xx as a resource error - that noise is expected.
      if (/Failed to load resource.*\b(400|401|409)\b/.test(text)) return;
      errors.push(text);
    });
    page.on("pageerror", (err) => errors.push(String(err)));
    return errors;
  };

  // ── Context A - main flow ────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = collectErrors(page);

    // 1. Guard: unauthenticated visit to / is redirected to /login
    await page.goto(BASE, { waitUntil: "networkidle" });
    await waitForLoginPage(page, 15000);
    check("Guard redirects / → /login", page.url().includes("/login"), page.url());

    // 2. Login page anatomy
    await page.waitForTimeout(600);
    check("Demo chip visible", await page.locator('[data-testid="fill-demo"]').isVisible());
    check(
      "Google button disabled (OAuth later)",
      !(await page.locator('[data-testid="oauth-google"]').isEnabled()),
    );
    check("Forgot-password link present", (await page.locator('a[href="/forgot-password"]').count()) === 1);
    check("Register link present", (await page.locator('a[href="/register"]').count()) === 1);
    await page.screenshot({ path: "scripts/shots/auth/login-dark-blue.png" });

    // 3. Zod field errors on empty submit
    await page.getByRole("button", { name: /Sign in/ }).click();
    await page.waitForTimeout(300);
    const emailInvalid = await page.locator("#login-email").getAttribute("aria-invalid");
    check("Empty submit flags fields (zod)", emailInvalid === "true");

    // 4. Wrong password → server error surfaced inline
    await page.locator("#login-email").fill(DEMO_EMAIL);
    await page.locator("#login-password").fill("wrong-password");
    await page.getByRole("button", { name: /Sign in/ }).click();
    await page.locator('[data-testid="login-error"]').waitFor({ timeout: 8000 });
    check(
      "Wrong password shows inline alert",
      (await page.locator('[data-testid="login-error"]').textContent())?.includes("Incorrect email or password") ?? false,
    );
    await page.screenshot({ path: "scripts/shots/auth/login-error.png" });

    // 5. Demo login succeeds → dashboard
    await page.locator('[data-testid="fill-demo"]').click();
    await page.getByRole("button", { name: /Sign in/ }).click();
    await waitForPath(page, "/", 15000);
    await page.waitForTimeout(1200);
    check("Demo login lands on dashboard", page.url() === `${BASE}/` || page.url() === `${BASE}/login`.replace("/login", ""), page.url());
    check("Sidebar shows Sign out", await page.locator('[data-testid="sidebar-sign-out"]').isVisible());
    await page.screenshot({ path: "scripts/shots/auth/dashboard-after-login.png" });

    // 6. Session persisted across reload
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    check("Session survives reload", page.url().replace(/\/$/, "") === BASE, page.url());

    // 7. /login while authenticated → back to app
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    check("Signed-in visit to /login bounces to app", page.url().replace(/\/$/, "") === BASE, page.url());

    // 8. Logout via sidebar
    await page.locator('[data-testid="sidebar-sign-out"]').click();
    await waitForLoginPage(page, 15000);
    check("Sidebar sign-out returns to /login", page.url().includes("/login"));

    // 9+10. Guard carries ?next and honors it after sign-in
    await page.goto(`${BASE}/analytics`, { waitUntil: "networkidle" });
    await waitForPath(page, "/login?next=%2Fanalytics", 15000);
    check("Guard carries ?next=", page.url().includes("next=%2Fanalytics"), page.url());
    await page.waitForTimeout(600);
    await page.locator('[data-testid="fill-demo"]').click();
    await page.getByRole("button", { name: /Sign in/ }).click();
    await waitForPath(page, "/analytics", 15000);
    check("After sign-in lands on the intended route", page.url().includes("/analytics"), page.url());

    check(`Context A console errors = 0`, errors.length === 0, errors.slice(0, 2).join(" | "));
    await page.close();
  }

  // ── Context B - registration + profile ──────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = collectErrors(page);
    const EMAIL = `trader+${Date.now()}@cosmoz.app`;
    const PASSWORD = "Testpass1";

    // 11. Register → auto sign-in
    await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.locator("#register-name").fill("Jordan Verify");
    await page.locator("#register-email").fill(EMAIL);
    await page.locator("#register-password").fill(PASSWORD);
    await page.locator("#register-confirm").fill(PASSWORD);
    await page.screenshot({ path: "scripts/shots/auth/register.png" });
    await page.getByRole("button", { name: /Create account/ }).click();
    await waitForPath(page, "/", 15000);
    check("Register signs in and lands on dashboard", page.url().replace(/\/$/, "") === BASE, page.url());

    // 12. Profile reflects the account identity
    await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    check(
      "Profile email comes from the session",
      (await page.locator('[data-testid="profile-email"]').inputValue()) === EMAIL,
      await page.locator('[data-testid="profile-email"]').inputValue(),
    );
    check("Password change card present", await page.locator('[data-testid="password-change-card"]').isVisible());
    check("Session card shows the email", (await page.locator('[data-testid="session-card"]').textContent())?.includes(EMAIL) ?? false);

    // 13. Change password from the profile
    await page.locator('[data-testid="password-change-toggle"]').click();
    await page.locator("#password-current").fill(PASSWORD);
    await page.locator("#password-new").fill("Newpass99");
    await page.locator("#password-confirm").fill("Newpass99");
    await page.getByRole("button", { name: /Update password/ }).click();
    await page.waitForTimeout(800);
    check("Password change succeeded", await page.getByText("Password changed").isVisible().catch(() => false));

    // 14. Sign out, old password rejected, new password accepted
    await page.locator('[data-testid="session-sign-out"]').click();
    await waitForLoginPage(page, 15000);
    await page.waitForTimeout(600);
    await page.locator("#login-email").fill(EMAIL);
    await page.locator("#login-password").fill(PASSWORD);
    await page.getByRole("button", { name: /Sign in/ }).click();
    await page.locator('[data-testid="login-error"]').waitFor({ timeout: 8000 });
    check("Old password rejected after change", (await page.locator('[data-testid="login-error"]').textContent())?.includes("Incorrect") ?? false);
    await page.locator("#login-password").fill("Newpass99");
    await page.getByRole("button", { name: /Sign in/ }).click();
    await waitForPath(page, "/", 15000);
    check("New password accepted", page.url().replace(/\/$/, "") === BASE);

    // 15. Duplicate email registration → 409 inline
    await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    // Signed in → bounced to app. Sign out through localStorage-free reload: use a fresh context instead.
    await page.close();

    const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors2 = collectErrors(page2);
    // Fresh context lost localStorage mock-auth users… register-dup needs the SAME storage, so reuse this context: sign out first via UI is impossible (signed out already).
    await page2.goto(`${BASE}/register`, { waitUntil: "networkidle" });
    await page2.waitForTimeout(600);
    await page2.locator("#register-name").fill("Dup Tester");
    await page2.locator("#register-email").fill(DEMO_EMAIL);
    await page2.locator("#register-password").fill("Whatever1");
    await page2.locator("#register-confirm").fill("Whatever1");
    await page2.getByRole("button", { name: /Create account/ }).click();
    await page2.locator('[data-testid="register-error"]').waitFor({ timeout: 8000 });
    check(
      "Duplicate email shows 409 inline error",
      (await page2.locator('[data-testid="register-error"]').textContent())?.includes("already exists") ?? false,
    );

    check(`Context B console errors = 0`, errors.length === 0 && errors2.length === 0, [...errors, ...errors2].slice(0, 2).join(" | "));
    await page2.close();
  }

  // ── Context C - password reset flow ─────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = collectErrors(page);

    await page.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.locator("#forgot-email").fill(DEMO_EMAIL);
    await page.getByRole("button", { name: /Send reset code/ }).click();
    await page.locator('[data-testid="dev-code"]').waitFor({ timeout: 8000 });
    const code = (await page.locator('[data-testid="dev-code"]').textContent() ?? "").replace(/\D/g, "").slice(-6);
    check("Mock reset code displayed", /^\d{6}$/.test(code), code);
    await page.screenshot({ path: "scripts/shots/auth/forgot-code.png" });

    await page.getByRole("button", { name: /Continue to reset/ }).click();
    await waitForPath(page, `/reset-password?email=${encodeURIComponent(DEMO_EMAIL)}`, 8000);
    check("Reset page carries the email", page.url().includes(`email=${encodeURIComponent(DEMO_EMAIL)}`));
    await page.waitForTimeout(400);

    await page.locator('[data-testid="code-slot-0"]').click();
    await page.keyboard.type(code, { delay: 40 });
    await page.locator("#reset-password").fill("Freshpass7");
    await page.locator("#reset-confirm").fill("Freshpass7");
    await page.screenshot({ path: "scripts/shots/auth/reset.png" });
    await page.getByRole("button", { name: /Reset password and sign in/ }).click();
    await waitForPath(page, "/", 15000);
    check("Reset confirms → signed in on dashboard", page.url().replace(/\/$/, "") === BASE, page.url());

    // Old password rejected, new accepted (proves the reset really persisted)
    await page.locator('[data-testid="sidebar-sign-out"]').click();
    await waitForLoginPage(page, 15000);
    await page.waitForTimeout(600);
    await page.locator("#login-email").fill(DEMO_EMAIL);
    await page.locator("#login-password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: /Sign in/ }).click();
    await page.locator('[data-testid="login-error"]').waitFor({ timeout: 8000 });
    check("Pre-reset password rejected", (await page.locator('[data-testid="login-error"]').textContent())?.includes("Incorrect") ?? false);
    await page.locator("#login-password").fill("Freshpass7");
    await page.getByRole("button", { name: /Sign in/ }).click();
    await waitForPath(page, "/", 15000);
    check("Post-reset password accepted", page.url().replace(/\/$/, "") === BASE);
    await page.screenshot({ path: "scripts/shots/auth/dashboard-reset-signin.png" });

    // Light theme login page
    await page.locator('[data-testid="sidebar-sign-out"]').click();
    await waitForLoginPage(page, 15000);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.waitForTimeout(400);
    await page.screenshot({ path: "scripts/shots/auth/login-light.png" });

    check(`Context C console errors = 0`, errors.length === 0, errors.slice(0, 2).join(" | "));
    await page.close();
  }

  // ── Mobile 390px ─────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("Mobile 390px - no horizontal overflow", overflow <= 0, `overflow=${overflow}px`);
    await page.screenshot({ path: "scripts/shots/auth/login-mobile-390.png" });
    await page.close();
  }

  console.log("\n=== AUTH RESULTS ===");
  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);

  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})();
