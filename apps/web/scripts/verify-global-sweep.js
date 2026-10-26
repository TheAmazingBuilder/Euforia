/**
 * GLOBAL FRONTEND SWEEP - final pass over every route of the app.
 *
 * For each page (desktop 1440, then mobile 390, then light theme):
 *   - HTTP 200 / no unexpected 4xx-5xx responses (auth noise filtered)
 *   - no uncaught page errors, no console errors
 *   - an <h1> renders (page actually mounted)
 *   - mobile: 0px horizontal overflow
 *
 * SPA-per-page reload is fine here: each fresh boot re-seeds MSW.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");
const { ensureLogin } = require("./helpers/login");

const BASE = "http://localhost:3000";
const NOISE = [
  /socket\.io/i, /candles/i, /market-service/i, /favicon/i, /net::ERR/i,
  /\/api\/auth\/(me|refresh)\b/,
];

const PAGES = [
  { href: "/", label: "Dashboard" },
  { href: "/accounts", label: "Accounts" },
  { href: "/accounts/FIRST", label: "Account detail", dynamic: "account" },
  { href: "/session", label: "Session Live" },
  { href: "/trades", label: "Trades" },
  { href: "/journal", label: "Trade Review" },
  { href: "/goals", label: "Goals (redirect)" },
  { href: "/playbook", label: "Playbook" },
  { href: "/planner", label: "Trade Planner" },
  { href: "/import", label: "Recognition" },
  { href: "/analytics", label: "Analytics" },
  { href: "/calendar", label: "Calendar" },
  { href: "/discipline", label: "Discipline" },
  { href: "/academy", label: "Academy" },
  { href: "/events", label: "Events" },
  { href: "/tasky", label: "Tasky" },
  { href: "/nofy", label: "Nofy" },
  { href: "/features/lot-size", label: "Lot Size" },
  { href: "/features/compounding", label: "Compounding" },
  { href: "/features/pip-value", label: "Pips" },
  { href: "/monitoring", label: "Monitoring" },
  { href: "/integrations", label: "Integrations" },
  { href: "/security", label: "Security" },
  { href: "/settings", label: "Settings" },
  { href: "/profile", label: "Profile" },
];

const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);
  console.log(results[results.length - 1]);
};

async function sweepPage(page, href, label, opts = {}) {
  const errors = [];
  const onResp = (resp) => {
    if (resp.status() >= 400 && !NOISE.some((re) => re.test(resp.url()))) errors.push(`${resp.status()} ${resp.url()}`);
  };
  const onErr = (err) => errors.push(`pageerror ${String(err).slice(0, 160)}`);
  const onConsole = (msg) => {
    // "Failed to load resource" echoes are already tracked by the response
    // listener (with URL filtering) - the console text itself has no URL.
    if (msg.type() === "error" && !/^Failed to load resource/.test(msg.text()) && !NOISE.some((re) => re.test(msg.text()))) errors.push(`console ${msg.text().slice(0, 160)}`);
  };
  page.on("response", onResp); page.on("pageerror", onErr); page.on("console", onConsole);

  try {
    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(opts.settle ?? 2500);
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    check(`${label}: h1 renders`, h1.trim().length > 0, `h1="${h1.trim().slice(0, 48)}"`);
    check(`${label}: no errors/4xx`, errors.length === 0, errors.slice(0, 2).join(" | "));
    if (opts.overflow) {
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement;
        return el ? el.scrollWidth - el.clientWidth : 0;
      });
      check(`${label}: 0px horizontal overflow`, overflow <= 0, `overflow=${overflow}px`);
    }
  } catch (e) {
    check(`${label}: page loads`, false, String(e).slice(0, 120));
  } finally {
    page.off("response", onResp); page.off("pageerror", onErr); page.off("console", onConsole);
  }
}

(async () => {
  const browser = await chromium.launch();
  // ONE explicit multi-page context: session (cookies/localStorage) survives
  // page recycling, and context.newPage() is allowed (browser.newPage() is a
  // single-page context that forbids it).
  const mainCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // ── 1. Desktop pass - mount + errors on every route ──────────────────────
  let page = await mainCtx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await ensureLogin(page);
  await page.waitForTimeout(1500);

  // Resolve an account id once for the dynamic detail route.
  // Cards are role=link divs (router.push) - not <a href>.
  // Retry once: dev-mode on-demand route compilation can exceed one wait.
  async function resolveAccountId(browserPage) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const card = browserPage.locator('[data-testid^="accounts-card-"] [role="link"]').first();
      try {
        await card.click({ timeout: 30_000 });
        await browserPage.waitForURL(/\/accounts\/.+/, { timeout: 30_000 });
        const id = browserPage.url().includes("/accounts/")
          ? browserPage.url().split("/accounts/")[1].split(/[?#]/)[0]
          : null;
        if (id) return id;
      } catch {
        // fall through to retry
      }
      await browserPage.goto(`${BASE}/accounts`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await browserPage.waitForTimeout(attempt === 0 ? 2500 : 5000);
    }
    return null;
  }

  // Chromium renderers OOM-crash after ~30 full reloads on one tab - recycle
  // pages every 8 routes. newPage() in the SAME context keeps the auth session.
  async function recycledPage(contextPage, viewport) {
    await contextPage.close().catch(() => {});
    const fresh = await contextPage.context().newPage();
    await fresh.setViewportSize(viewport);
    return fresh;
  }

  let accountId = null;
  await page.goto(`${BASE}/accounts`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  accountId = await resolveAccountId(page);
  check("Account detail route resolvable", Boolean(accountId), `id=${accountId}`);

  let desktopRecycled = 0;
  for (const p of PAGES) {
    const href = p.dynamic === "account" ? (accountId ? `/accounts/${accountId}` : null) : p.href;
    if (!href) { check(`${p.label}: page loads`, false, "no account id"); continue; }
    if (desktopRecycled >= 8) {
      page = await recycledPage(page, { width: 1440, height: 900 });
      desktopRecycled = 0;
    }
    desktopRecycled += 1;
    await sweepPage(page, href, p.label);
  }

  // ── 2. Mobile pass - 390px overflow on every route ────────────────────────
  // Own fresh context - the proven pattern: fresh boot → login form → login.
  const mobileCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let mobile = await mobileCtx.newPage();
  await mobile.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await ensureLogin(mobile);
  await mobile.setViewportSize({ width: 390, height: 844 }); // login first (sidebar hidden below lg)
  await mobile.waitForTimeout(1500);
  let mobileRecycled = 0;
  for (const p of PAGES) {
    if (mobileRecycled >= 8) {
      mobile = await recycledPage(mobile, { width: 390, height: 844 });
      mobileRecycled = 0;
    }
    mobileRecycled += 1;
    if (p.dynamic === "account") {
      // Resolve via card click (role=link divs, no <a href>).
      await mobile.goto(`${BASE}/accounts`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await mobile.waitForTimeout(2200);
      const mId = await resolveAccountId(mobile);
      if (!mId) { check(`${p.label}: mobile page loads`, false, "no account id"); continue; }
      await sweepPage(mobile, `/accounts/${mId}`, `${p.label} · mobile`, { overflow: true, settle: 2200 });
      continue;
    }
    await sweepPage(mobile, p.href, `${p.label} · mobile`, { overflow: true, settle: 2200 });
  }

  // ── 3. Light theme pass - every route renders under light ────────────────
  // NOTE: recycle the page every 6 routes - Chromium renderers crash (OOM)
  // after ~30 full reloads on the same tab. newPage() in the SAME context
  // keeps the auth session, so recycling is transparent.
  await page.setViewportSize({ width: 1440, height: 900 });
  let lightPage = page;
  let recycled = 0;
  for (const p of PAGES) {
    const href = p.dynamic === "account" ? (accountId ? `/accounts/${accountId}` : null) : p.href;
    if (!href) { continue; }
    if (recycled >= 6) {
      await lightPage.close().catch(() => {});
      lightPage = await page.context().newPage();
      await lightPage.setViewportSize({ width: 1440, height: 900 });
      recycled = 0;
    }
    recycled += 1;
    const errors = [];
    const onErr = (err) => errors.push(String(err).slice(0, 140));
    lightPage.on("pageerror", onErr);
    try {
      await lightPage.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await lightPage.waitForTimeout(2000);
      const themed = await lightPage.evaluate(() => document.documentElement.getAttribute("data-theme"));
      if (!themed) {
        await lightPage.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
        await lightPage.waitForTimeout(300);
      }
      const h1 = await lightPage.locator("h1").first().innerText().catch(() => "");
      check(`${p.label}: light theme h1`, h1.trim().length > 0, `h1="${h1.trim().slice(0, 40)}"`);
      check(`${p.label}: light theme errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
    } catch (e) {
      check(`${p.label}: light theme page loads`, false, String(e).slice(0, 120));
      // A crashed page must be replaced before the next route.
      lightPage = await page.context().newPage();
      await lightPage.setViewportSize({ width: 1440, height: 900 });
      recycled = 0;
    } finally {
      lightPage.off("pageerror", onErr);
    }
  }
  await lightPage.close().catch(() => {});

  // ── 4. Auth pages render (logged-out context) ──────────────────────────────
  const anon = await browser.newPage();
  for (const href of ["/login", "/register", "/forgot-password"]) {
    await sweepPage(anon, href, `${href} · anon`, { settle: 1800 });
  }
  await anon.close();

  console.log(results.join("\n"));
  const failed = results.filter((l) => l.startsWith("FAIL")).length;
  console.log(`\n=== SUMMARY ===\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
