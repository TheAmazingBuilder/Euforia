/**
 * Verify — pnlDisplay wiring (dashboard) + notification preferences in the
 * alert engine.
 *
 * IMPORTANT: the MSW mock store lives in browser memory and RESEEDS on every
 * full page load — so this script does ONE page.goto and then navigates
 * CLIENT-SIDE (sidebar links) to keep the session (same trick as
 * verify-settings.js).
 *
 * pnlDisplay : Settings → Appearance → "P&L display" drives the dashboard
 *              Net P&L hero (CURRENCY → $, R_MULTIPLE → R, PERCENT → %),
 *              plus the open-positions header and the trades table cell.
 * Notifications: strategy category OFF suppresses NEW rule-violation alerts
 *              at engine level (GET /alerts count unchanged after a breaching
 *              trade), ON delivers them again. Seeded history stays.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  const socket404s = [];
  page.on("response", (res) => {
    if (res.status() === 404 && res.url().includes("socket.io")) socket404s.push(res.url());
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  const NAV = 'nav[aria-label="Main navigation"]';
  const gotoClient = async (href) => {
    await page.click(`${NAV} a[href="${href}"]`);
    await page.waitForTimeout(1100);
  };

  /** Open Settings and focus the Appearance category (client-side nav loses
   * the #appearance hash, so click the category in the rail instead). */
  const openAppearance = async () => {
    await gotoClient("/settings");
    await page.click('[data-testid="settings-nav-appearance"]');
    await page.waitForSelector('[data-testid="settings-appearance-pnl"]', { timeout: 15_000 });
    await page.waitForTimeout(300);
  };

  /** Read the dashboard Net P&L hero value (first stat-hero, first mono span). */
  const readHero = async () => {
    await page.waitForSelector('[aria-label="Key performance indicators"]', { timeout: 15_000 });
    await page.waitForTimeout(500);
    return page
      .locator('[aria-label="Key performance indicators"] .stat-hero')
      .first()
      .locator("span.font-mono")
      .first()
      .innerText();
  };

  /** Change the P&L display select on the Appearance card and save (card is
   * already mounted; the save button enables only when the draft is dirty). */
  const setPnlMode = async (mode) => {
    await page.waitForSelector('[data-testid="settings-appearance-pnl"]', { timeout: 15_000 });
    const current = await page.locator('[data-testid="settings-appearance-pnl"]').inputValue();
    if (current === mode) return;
    await page.selectOption('[data-testid="settings-appearance-pnl"]', mode);
    await page.waitForTimeout(250);
    await page.click('[data-testid="settings-appearance-save"]');
    await page.waitForTimeout(800);
  };

  // ── ONE full page load; everything below stays in this SPA session ───────
  await page.goto(`${BASE}/settings#appearance`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  // ── 1. Ensure CURRENCY default, read the hero ────────────────────────────
  await setPnlMode("CURRENCY");
  await gotoClient("/");
  const currencyHero = await readHero();
  check("CURRENCY hero shows $", currencyHero.includes("$"), currencyHero.trim());
  await page.screenshot({ path: "scripts/shots/pnl-currency.png" });

  // ── 2. R_MULTIPLE via the Settings UI ────────────────────────────────────
  await openAppearance();
  await page.waitForSelector('[data-testid="settings-appearance-pnl-preview"]', { timeout: 15_000 });
  await page.selectOption('[data-testid="settings-appearance-pnl"]', "R_MULTIPLE");
  await page.waitForTimeout(250);
  const previewR = await page.locator('[data-testid="settings-appearance-pnl-preview"]').innerText();
  check("Appearance preview follows R mode", previewR.includes("R"), previewR.slice(0, 60));
  await page.click('[data-testid="settings-appearance-save"]');
  await page.waitForTimeout(800);
  check("R_MULTIPLE save accepted (bar clean)", await page.locator('[data-testid="settings-appearance-save"]').isDisabled());

  await gotoClient("/");
  const rHero = await readHero();
  check("R_MULTIPLE hero shows R", /R\s*$/.test(rHero.trim()), rHero.trim());
  await page.screenshot({ path: "scripts/shots/pnl-r.png" });

  // ── 3. PERCENT ───────────────────────────────────────────────────────────
  await openAppearance();
  await setPnlMode("PERCENT");
  await gotoClient("/");
  const pctHero = await readHero();
  check("PERCENT hero shows %", pctHero.includes("%") && !pctHero.includes("$"), pctHero.trim());
  await page.screenshot({ path: "scripts/shots/pnl-percent.png" });

  const openTotal = await page.locator('[data-testid="open-positions-total"]').innerText().catch(() => "");
  check(
    "Open positions header follows mode (no $ in % mode)",
    openTotal === "" || !openTotal.includes("$"),
    openTotal.trim(),
  );

  await gotoClient("/trades");
  await page.waitForTimeout(700);
  const firstPnlCell = await page
    .locator('[data-testid="trades-row"] td.text-right.font-mono')
    .last()
    .innerText()
    .catch(() => "");
  check("Trades table P&L follows mode (no $ in % mode)", !firstPnlCell.includes("$"), firstPnlCell.trim());

  // Restore CURRENCY.
  await openAppearance();
  await setPnlMode("CURRENCY");

  // ── 4. Notification preferences gate the alert ENGINE ────────────────────
  const api = (path, options = {}) =>
    page.evaluate(
      async ({ path, options }) => {
        const res = await fetch(path, {
          headers: { "Content-Type": "application/json" },
          ...options,
        });
        return { status: res.status, body: await res.json().catch(() => null) };
      },
      { path, options },
    );

  const me = await api("/api/me/preferences");
  check("Preferences GET ok", me.status === 200);
  const instruments = (await api("/api/instruments")).body.instruments;
  const accounts = (await api("/api/accounts")).body.accounts;
  const instrumentId = (instruments.find((i) => i.assetClass === "FOREX") ?? instruments[0]).id;
  const accountId = (accounts.find((a) => a.isDefault) ?? accounts[0]).id;

  /** A closed trade sized at 5 % risk — always breaches MAX_RISK_PCT_PER_TRADE (2 %). */
  const breachingTrade = () => ({
    variant: "closed",
    accountId,
    instrumentId,
    direction: "BUY",
    entryPrice: "1.1000",
    exitPrice: "1.1050",
    exitAt: new Date().toISOString(),
    exitReason: "MANUAL",
    size: { mode: "risk_percent", riskPercent: "5" },
    outOfPlaybook: true,
  });

  const before = (await api("/api/alerts")).body.alerts.length;

  // 4a. strategy notifications OFF → engine suppresses the new alert.
  const prefsOff = structuredClone(me.body);
  prefsOff.notifications = { ...prefsOff.notifications, strategy: { ...prefsOff.notifications.strategy, enabled: false } };
  const patchOff = await api("/api/me/preferences/notifications", {
    method: "PATCH",
    body: JSON.stringify(prefsOff.notifications),
  });
  check("Notifications PATCH (strategy off) ok", patchOff.status === 200, `status=${patchOff.status}`);

  await api("/api/trades", { method: "POST", body: JSON.stringify(breachingTrade()) });
  await page.waitForTimeout(500);
  const during = (await api("/api/alerts")).body.alerts.length;
  check("GATED: no new in-app alert while strategy notifications are off", during === before, `${before} → ${during}`);

  // 4b. strategy notifications ON → the engine delivers again.
  const patchOn = await api("/api/me/preferences/notifications", {
    method: "PATCH",
    body: JSON.stringify(me.body.notifications),
  });
  check("Notifications PATCH (strategy on) ok", patchOn.status === 200, `status=${patchOn.status}`);

  await api("/api/trades", { method: "POST", body: JSON.stringify(breachingTrade()) });
  await page.waitForTimeout(500);
  const after = (await api("/api/alerts")).body.alerts.length;
  check("DELIVERED: new rule-violation alert arrives once re-enabled", after > during, `${during} → ${after}`);

  // ── 5. Console errors (socket.io 404s = market-service availability noise,
  // pre-existing — the dashboard degrades to the polling fallback by design;
  // Chrome strips the URL from the console message, so match by count) ──────
  const resource404s = errors.filter((e) =>
    e.includes("Failed to load resource") && e.includes("404"),
  );
  const realErrors = errors.filter(
    (e) =>
      !e.includes("favicon") &&
      !e.includes("Download the React DevTools") &&
      !(e.includes("Failed to load resource") && e.includes("404") && socket404s.length >= resource404s.length),
  );
  check("No console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);

  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exit(1);
});
