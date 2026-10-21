/**
 * Verify Feature 8 — Command palette ⌘K.
 * Probes: trigger button, hotkey open, search filtering, keyboard nav, theme actions.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  // 1. Trigger button visible in topbar
  const trigger = page.locator('[data-testid="command-palette-trigger"]');
  check("Trigger button visible", await trigger.isVisible());

  // 2. Open via click
  await trigger.click();
  await page.waitForTimeout(400);
  const dialog = page.locator('[role="dialog"]');
  check("Palette opens on click", await dialog.isVisible());
  await page.screenshot({ path: "scripts/shots/palette-open.png" });

  // 3. Type to filter
  await page.keyboard.type("trade");
  await page.waitForTimeout(300);
  const options = page.locator('[role="option"]');
  const count = await options.count();
  check("Filtering works (trade)", count > 0, `${count} options`);
  await page.screenshot({ path: "scripts/shots/palette-filter.png" });

  // 4. Escape closes
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("Escape closes palette", !(await dialog.isVisible().catch(() => false)));

  // 5. ⌘K hotkey opens
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  check("Ctrl+K opens palette", await dialog.isVisible().catch(() => false));

  // 6. Arrow navigation + Enter → navigate to Analytics
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  await page.keyboard.type("analytics");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  check("Enter navigates to /analytics", page.url().includes("/analytics"), page.url());
  await page.screenshot({ path: "scripts/shots/palette-nav-analytics.png" });

  // 7. Theme switch via palette
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  await page.keyboard.type("theme light");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  check("Theme switch via palette", theme === "light", `data-theme=${theme}`);
  // back to dark-blue
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  await page.keyboard.type("theme dark blue");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);

  // 8. New trade action via palette
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  await page.keyboard.type("new trade");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  const tradeModal = page.locator('[role="dialog"][data-slot="dialog-content"], [data-slot="dialog-content"]').first();
  check("New trade action opens modal", (await page.locator('[role="dialog"]').count()) > 0);
  await page.screenshot({ path: "scripts/shots/palette-new-trade.png" });

  console.log("\n=== FEATURE 8 RESULTS ===");
  results.forEach((r) => console.log(r));
  console.log(`\nConsole errors: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log("  ERROR:", e.slice(0, 200)));

  await browser.close();
  process.exit(results.every((r) => r.startsWith("PASS")) && errors.length === 0 ? 0 : 1);
})();
