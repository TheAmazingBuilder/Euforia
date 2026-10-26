/**
 * Verify - Risk Command Center (/risk).
 * Checks: nav entry, status band, 3 loss-limit cards, exposure card,
 * engine linkage card, risk alerts; server-driven numbers present;
 * desktop + mobile 390px + light theme screenshots.
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
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Client-side nav to /risk via the sidebar entry.
  await page.click('nav[aria-label="Main navigation"] a[href="/risk"]');
  await page.waitForSelector('[data-testid="risk-status-band"]', { timeout: 15_000 });
  await page.waitForTimeout(800);

  check("Sidebar entry leads to /risk", page.url().endsWith("/risk"));
  check(
    "Header renders",
    await page.locator('h1:has-text("Risk Center")').isVisible(),
  );
  check(
    "Status band with balance",
    await page.locator('[data-testid="risk-status-band"]').isVisible(),
  );
  const daily = await page.locator('[data-testid="risk-limit-daily"]').isVisible();
  const weekly = await page.locator('[data-testid="risk-limit-weekly"]').isVisible();
  const monthly = await page.locator('[data-testid="risk-limit-monthly"]').isVisible();
  check("3 loss-limit cards render", daily && weekly && monthly);
  check(
    "Exposure card renders",
    await page.locator('[data-testid="risk-exposure-card"]').isVisible(),
  );
  check(
    "Engine linkage card renders",
    await page.locator('[data-testid="risk-engine-card"]').isVisible(),
  );
  check(
    "Risk alerts card renders",
    await page.locator('[data-testid="risk-alerts-card"]').isVisible(),
  );

  // Server-driven aggregate actually present: daily card shows a % figure.
  const dailyText = await page.locator('[data-testid="risk-limit-daily"]').innerText();
  check("Daily card carries server figures", /\d/.test(dailyText) && dailyText.includes("%"), dailyText.replace(/\n/g, " ").slice(0, 90));

  // Engine rows come from the seeded rules.
  const engineText = await page.locator('[data-testid="risk-engine-card"]').innerText();
  check(
    "Engine rows list the 3 seeded rules",
    engineText.includes("max trades per day") &&
      engineText.includes("max losses per day") &&
      engineText.includes("max risk pct per trade"),
  );

  await page.screenshot({ path: "scripts/shots/risk-center-desktop.png", fullPage: true });

  // Deep link from the engine card to Settings → Risk works.
  await page.click('[data-testid="risk-engine-card"] a[href="/settings#risk"]');
  await page.waitForURL(/\/settings#risk/, { timeout: 10_000 });
  await page.waitForSelector('[data-testid="settings-risk"]', { timeout: 15_000 });
  check("Edit-risk-defaults deep link opens Settings #risk", await page.locator('[data-testid="settings-risk"]').isVisible());

  // ── Mobile 390px ─────────────────────────────────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (err) => errors.push(String(err)));
  await mobile.goto(`${BASE}/risk`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1800);
  const mobileOk = await mobile.locator('[data-testid="risk-status-band"]').isVisible();
  check("Mobile 390px renders", mobileOk);
  await mobile.screenshot({ path: "scripts/shots/risk-center-mobile.png", fullPage: true });

  // ── Light theme ──────────────────────────────────────────────────────────
  const light = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  light.on("pageerror", (err) => errors.push(String(err)));
  await light.emulateMedia({ colorScheme: "light" });
  await light.goto(`${BASE}/risk`, { waitUntil: "networkidle" });
  await light.waitForTimeout(1200);
  await light.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    try { localStorage.setItem("theme", "light"); } catch {}
  });
  await light.waitForTimeout(600);
  await light.screenshot({ path: "scripts/shots/risk-center-light.png", fullPage: true });
  check("Light theme screenshot captured", true);

  // ── Console errors (socket.io 404 noise excluded) ────────────────────────
  const resource404s = errors.filter((e) => e.includes("Failed to load resource") && e.includes("404"));
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
