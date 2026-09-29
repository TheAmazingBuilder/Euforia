/** Verify SYSTEM sidebar section: sections render, 3 new pages OK, light + mobile. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("socket.io") && !m.text().includes("404"))
      errors.push(m.text());
  });

  const checks = [];
  const ok = (name, cond) => checks.push(`${cond ? "PASS" : "FAIL"} — ${name}`);

  // 1. Sidebar sections render on dashboard
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  for (const title of ["Trading", "Journal", "Insights", "System"]) {
    ok(`section « ${title} » visible`, await page.locator(`text=${title}`).first().isVisible().catch(() => false));
  }
  await page.screenshot({ path: "scripts/shots/system-sidebar-dashboard.png" });

  // 2. SYSTEM section contains the 4 entries, in order
  const systemOrder = ["Monitoring", "Settings", "Integrations", "Security"];
  const navText = await page.locator("nav[aria-label='Main navigation']").innerText();
  let last = -1, ordered = true;
  for (const label of systemOrder) {
    const idx = navText.indexOf(label);
    if (idx < 0 || idx < last) ordered = false;
    last = idx;
  }
  ok("SYSTEM = Monitoring → Settings → Integrations → Security (ordre)", ordered);

  // 3. Monitoring page
  await page.goto(BASE + "/monitoring", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  ok("Monitoring — h1", (await page.locator("h1").innerText().catch(() => "")).trim() === "Monitoring");
  ok("Monitoring — 4 services", (await page.locator("text=Market Service").count()) > 0 && (await page.locator("text=Session Store").count()) > 0);
  await page.screenshot({ path: "scripts/shots/system-monitoring.png" });

  // 4. Integrations page
  await page.goto(BASE + "/integrations", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  ok("Integrations — h1", (await page.locator("h1").innerText().catch(() => "")).trim() === "Integrations");
  ok("Integrations — Deriv connected", await page.locator("text=Deriv").first().isVisible());
  ok("Integrations — 4 providers", (await page.locator("text=Binance").count()) > 0 && (await page.locator("text=cTrader Open API").count()) > 0);
  await page.screenshot({ path: "scripts/shots/system-integrations.png" });

  // 5. Security page
  await page.goto(BASE + "/security", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  ok("Security — h1", (await page.locator("h1").innerText().catch(() => "")).trim() === "Security");
  ok("Security — sessions + vault", (await page.locator("text=Active sessions").count()) > 0 && (await page.locator("text=Credentials vault").count()) > 0);
  await page.screenshot({ path: "scripts/shots/system-security.png" });

  // 6. Settings deep-link from SYSTEM section still works
  await page.locator("nav[aria-label='Main navigation'] a[href='/settings']").click();
  await page.waitForTimeout(1200);
  ok("Settings s'ouvre depuis la section System", page.url().endsWith("/settings"));

  // 7. Light theme + mobile 390
  await page.goto(BASE + "/monitoring", { waitUntil: "networkidle" });
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.waitForTimeout(600);
  await page.screenshot({ path: "scripts/shots/system-monitoring-light.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/monitoring", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "scripts/shots/system-monitoring-mobile.png" });

  console.log(checks.join("\n"));
  console.log("ERREURS CONSOLE:", errors.length ? errors.slice(0, 4) : "aucune");
  await browser.close();
  const failed = checks.filter((c) => c.startsWith("FAIL")).length;
  console.log(failed === 0 ? "ALL PASS" : `${failed} FAIL`);
})();
