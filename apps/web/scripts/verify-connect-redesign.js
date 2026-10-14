/**
 * verify-connect-redesign.js — Connect Accounts modal redesign + dashboard welcome.
 *
 * Owner request (2026-10-15):
 *   1. "ameliorer le modal de connect accounts, il est trop long et ça déborde,
 *      on ne voit presque rien — redesign très bien" → the wizard is now a
 *      pinned-header / scrollable-body / pinned-footer shell capped at 92 dvh.
 *   2. "message de Bienvenue sur le dashboard quand on crée un compte et on se
 *      connecte, ex: Welcome Dev Trader" → the dashboard h1 greets the signed-in
 *      trader by name ("Welcome, X" for accounts < 48 h old, "Welcome back, X"
 *      otherwise — derived from the REAL signup timestamp).
 *
 * Probe plan:
 *   A. Desktop dashboard with the seeded demo account → "Welcome back, Dev Trader".
 *   B. THE OWNER SCENARIO end-to-end: register "Dev Trader" → mock email
 *      verification → login → dashboard shows "Welcome, Dev Trader".
 *   C. Connect dialog (desktop 1440×900): opens, never exceeds the viewport,
 *      header + footer actions stay visible, all three steps navigable,
 *      environment descriptions render, screenshots per step.
 *   D. Connect dialog (mobile 390×844): bottom Sheet, same containment checks.
 *
 * Run: bash scripts/verify-connect-redesign-run.sh
 * (or: node apps/web/scripts/verify-connect-redesign.js with :3000 listening)
 *
 * Probe conventions (verify-phase11/verify-accounts lessons): no networkidle
 * (socket.io keeps sockets open) — domcontentloaded + waits; nextjs-portal
 * removed so it cannot swallow clicks; demo login via the shared helper.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- Node verification helper */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const { ensureLogin, DEMO_EMAIL, DEMO_PASSWORD } = require(path.resolve(__dirname, "helpers/login.js"));

const BASE = process.env.PROBE_BASE || "http://localhost:3000";
const SHOT_DIR = process.env.PROBE_SHOTS || "/home/z/my-project/download/connect-modal-redesign";

const PROBE_NAME = "Dev Trader";
const PROBE_EMAIL = "dev.trader+probe@cosmoz.app";
const PROBE_PASSWORD = "euforia-probe-2026";

let passed = 0;
let failed = 0;
const softNotes = [];

function check(label, ok, extra = "") {
  const tag = ok ? "✓" : "✗";
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${tag} ${label}${extra ? ` — ${extra}` : ""}`);
}

function note(label) {
  softNotes.push(label);
  console.log(`  ℹ ${label}`);
}

async function clearDevOverlay(page) {
  await page
    .evaluate(() => {
      document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
    })
    .catch(() => {});
}

const CONSOLE_NOISE = [
  "socket.io",
  "XTransformPort",
  "Failed to load resource",
  "ERR_CONNECTION",
  "net::",
  "/api/auth/me",
  "/api/auth/refresh",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/email",
];

/** Containment assertions shared by the desktop Dialog and the mobile Sheet:
 * the shell must fit the viewport and header/footer must stay reachable. */
async function checkShellContained(page, surfaceLabel) {
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector(
      '[data-testid="connect-account-dialog"], [data-testid="connect-account-sheet"]',
    );
    if (!shell) return null;
    const rect = shell.getBoundingClientRect();
    const body = document.querySelector('[data-testid="connect-body"]');
    const footerButton = document.querySelector(
      '[data-testid="connect-next"], [data-testid="connect-submit"]',
    );
    const title = document.querySelector(
      '[data-testid="connect-account-dialog"] h2, [data-testid="connect-account-sheet"] h2',
    );
    const bodyRect = body ? body.getBoundingClientRect() : null;
    const footerRect = footerButton ? footerButton.getBoundingClientRect() : null;
    const titleRect = title ? title.getBoundingClientRect() : null;
    return {
      viewportH: window.innerHeight,
      viewportW: window.innerWidth,
      shellTop: rect.top,
      shellBottom: rect.bottom,
      shellHeight: rect.height,
      shellWidth: rect.width,
      bodyScrollable: body ? body.scrollHeight > body.clientHeight : null,
      bodyRect,
      footerRect,
      titleRect,
      stepRail: Boolean(document.querySelector('[data-testid="connect-steps"]')),
    };
  });
  if (!metrics) {
    check(`${surfaceLabel}: shell present`, false);
    return;
  }
  const eps = 2;
  check(
    `${surfaceLabel}: shell fits the viewport (no overflow)`,
    metrics.shellTop >= -eps &&
      metrics.shellBottom <= metrics.viewportH + eps &&
      metrics.shellHeight <= metrics.viewportH + eps,
    `top=${metrics.shellTop.toFixed(1)} bottom=${metrics.shellBottom.toFixed(1)} h=${metrics.shellHeight.toFixed(1)} viewport=${metrics.viewportH}`,
  );
  check(
    `${surfaceLabel}: step title visible`,
    metrics.titleRect !== null && metrics.titleRect.top >= 0 && metrics.titleRect.bottom <= metrics.viewportH,
  );
  check(
    `${surfaceLabel}: action button visible (pinned footer)`,
    metrics.footerRect !== null && metrics.footerRect.bottom <= metrics.viewportH + eps,
    `footerBottom=${metrics.footerRect ? metrics.footerRect.bottom.toFixed(1) : "none"}`,
  );
  check(`${surfaceLabel}: step rail visible`, metrics.stepRail);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();

  // ── A. Dashboard greeting — seeded demo account (created ~90 days ago) ────
  console.log("\n[A] Dashboard welcome — existing account");
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
      pageErrors.push(text);
    });

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2_000);
    await clearDevOverlay(page);
    await ensureLogin(page);
    await page.waitForTimeout(1_500);
    await clearDevOverlay(page);

    const welcome = page.locator('[data-testid="dashboard-welcome"]');
    await welcome.waitFor({ state: "visible", timeout: 15_000 });
    const greetingA = (await welcome.innerText()).trim();
    // The demo seed's display name is owned by the mock auth engine — assert
    // the SHAPE (welcome-back + non-empty name), not a hardcoded name.
    check(
      "existing account greets by name",
      greetingA.startsWith("Welcome back, ") && greetingA.length > "Welcome back, ".length,
      greetingA,
    );
    await page.screenshot({ path: `${SHOT_DIR}/dashboard-welcome-back.png`, fullPage: false });

    // ── C. Connect dialog — desktop (1440×900) ──────────────────────────────
    console.log("\n[C] Connect dialog — desktop");
    await page.locator('a[href="/accounts"]').first().click();
    await page.waitForFunction(
      () => document.querySelector("h1")?.textContent?.trim() === "Accounts",
      { timeout: 15_000 },
    );
    await clearDevOverlay(page);
    await page.waitForTimeout(800);

    const emptyAdd = page.locator('[data-testid="accounts-empty-add"]');
    if ((await emptyAdd.count()) > 0) {
      await emptyAdd.click();
    } else {
      await page.locator('[data-testid="accounts-add-button"]').click();
    }
    await page.waitForSelector('[data-testid="connect-account-dialog"]', { timeout: 10_000 });
    await page.waitForTimeout(600);
    check("connect dialog opens", true);
    await checkShellContained(page, "desktop/step1");
    await page.screenshot({ path: `${SHOT_DIR}/dialog-desktop-step1-provider.png` });

    // Step 1 → select the connectable mock provider.
    const mockRow = page.locator('[data-testid="connect-provider-MOCK"]');
    await mockRow.waitFor({ state: "visible", timeout: 10_000 });
    await mockRow.click();
    await page.screenshot({ path: `${SHOT_DIR}/dialog-desktop-step1-selected.png` });
    await page.locator('[data-testid="connect-next"]').click();
    await page.waitForTimeout(500);

    // Step 2 — environment cards carry icon + honest description.
    const envDemo = page.locator('[data-testid="connect-environment-DEMO"]');
    await envDemo.waitFor({ state: "visible", timeout: 8_000 });
    const envText = (await envDemo.innerText()).replace(/\n/g, " ");
    check(
      "environment card carries description",
      envText.includes("Practice account"),
      envText.slice(0, 90),
    );
    await checkShellContained(page, "desktop/step2");
    await page.screenshot({ path: `${SHOT_DIR}/dialog-desktop-step2-environment.png` });

    await envDemo.click();
    await page.locator('[data-testid="connect-next"]').click();
    await page.waitForTimeout(500);

    // Step 3 — identity fields.
    await page.locator('[data-testid="connect-external-id"]').waitFor({ state: "visible", timeout: 8_000 });
    check("identity fields reachable", await page.locator('[data-testid="connect-secret"]').isVisible());
    await checkShellContained(page, "desktop/step3");
    await page.screenshot({ path: `${SHOT_DIR}/dialog-desktop-step3-identity.png` });

    // Close without connecting — Part B does its own registration flow.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    check("desktop: no unexpected page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // ── B. THE OWNER SCENARIO — create an account, log in, see the welcome ────
  console.log("\n[B] Fresh account → Welcome, Dev Trader");
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
      pageErrors.push(text);
    });

    await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1_500);
    await clearDevOverlay(page);

    await page.locator("#register-name").fill(PROBE_NAME);
    await page.locator("#register-email").fill(PROBE_EMAIL);
    await page.locator("#register-password").fill(PROBE_PASSWORD);
    await page.locator("#register-confirm").fill(PROBE_PASSWORD);
    await page.locator('[data-testid="register-submit"]').click();

    // Mocked delivery: the pending screen offers a one-click verification link.
    await page.waitForSelector('[data-testid="register-pending"]', { timeout: 15_000 });
    check("registration accepted (verification pending)", true);
    const openVerification = page.locator('[data-testid="register-open-verification"]');
    if ((await openVerification.count()) > 0) {
      await openVerification.click();
    } else {
      note("mock verification button absent — falling back to email-less flow");
    }

    await page.waitForSelector('[data-testid="verify-state-success"]', { timeout: 15_000 });
    check("email verified (mock delivery)", true);
    await page.locator('[data-testid="verify-continue"]').click();
    await page.waitForTimeout(1_000);
    await clearDevOverlay(page);

    await page.locator("#login-email").fill(PROBE_EMAIL);
    await page.locator("#login-password").fill(PROBE_PASSWORD);
    await page.locator('[data-testid="login-submit"]').click();

    const welcome = page.locator('[data-testid="dashboard-welcome"]');
    await welcome.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(800);
    await clearDevOverlay(page);
    const greetingB = (await welcome.innerText()).trim();
    check(
      "fresh account shows the owner's example verbatim",
      greetingB === "Welcome, Dev Trader",
      greetingB,
    );
    await page.screenshot({ path: `${SHOT_DIR}/dashboard-welcome-fresh-account.png` });
    check("fresh-account flow: no unexpected page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // ── D. Connect dialog — mobile bottom Sheet (390×844) ─────────────────────
  console.log("\n[D] Connect dialog — mobile sheet");
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
      pageErrors.push(text);
    });

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2_000);
    await clearDevOverlay(page);

    // Mobile login — the sidebar nav lives in a drawer behind the topbar
    // burger, so the shared ensureLogin (which waits for a VISIBLE sidebar)
    // never resolves here. Wait for the topbar instead.
    const sidebar = page.locator('nav[aria-label="Main navigation"]');
    if ((await sidebar.count()) === 0 || !(await sidebar.isVisible().catch(() => false))) {
      await page.locator("#login-email").waitFor({ state: "visible", timeout: 20_000 });
      await page.locator("#login-email").fill(DEMO_EMAIL);
      await page.locator("#login-password").fill(DEMO_PASSWORD);
      await page.locator('[data-testid="login-submit"]').click();
      await page.locator('[aria-label="Open navigation menu"]').waitFor({ state: "visible", timeout: 20_000 });
    }
    await page.waitForTimeout(1_200);
    await clearDevOverlay(page);

    // Mobile dashboard greeting check on the way through.
    const mobileWelcome = page.locator('[data-testid="dashboard-welcome"]');
    if ((await mobileWelcome.count()) > 0) {
      const greetingD = (await mobileWelcome.innerText()).trim();
      check(
        "mobile dashboard greets by name",
        greetingD.startsWith("Welcome") && greetingD.length > "Welcome".length,
        greetingD,
      );
    } else {
      note("mobile dashboard welcome not present yet (slow hydrate)");
    }

    // Navigate straight to /accounts — the mobile drawer interaction is not
    // the subject here; the bottom Sheet containment is.
    await page.goto(`${BASE}/accounts`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2_000);
    await clearDevOverlay(page);
    await page.waitForFunction(
      () => document.querySelector("h1")?.textContent?.trim() === "Accounts",
      { timeout: 15_000 },
    );
    await clearDevOverlay(page);
    await page.waitForTimeout(800);

    const emptyAdd = page.locator('[data-testid="accounts-empty-add"]');
    if ((await emptyAdd.count()) > 0) {
      await emptyAdd.click();
    } else {
      await page.locator('[data-testid="accounts-add-button"]').click();
    }
    await page.waitForSelector('[data-testid="connect-account-sheet"]', { timeout: 10_000 });
    await page.waitForTimeout(600);
    check("mobile renders the bottom Sheet", true);
    await checkShellContained(page, "mobile/step1");
    await page.screenshot({ path: `${SHOT_DIR}/sheet-mobile-step1-provider.png` });

    const mockRow = page.locator('[data-testid="connect-provider-MOCK"]');
    await mockRow.click();
    await page.locator('[data-testid="connect-next"]').click();
    await page.waitForTimeout(500);
    await checkShellContained(page, "mobile/step2");
    await page.screenshot({ path: `${SHOT_DIR}/sheet-mobile-step2-environment.png` });

    check("mobile: no unexpected page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed${softNotes.length ? `, ${softNotes.length} notes` : ""}`);
  console.log(`Screenshots: ${SHOT_DIR}`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error("PROBE CRASHED:", error);
  process.exit(1);
});
