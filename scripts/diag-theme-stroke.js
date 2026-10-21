/** Diagnose theme switch → sparkline stroke chain. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const demo = page.locator('[data-testid="fill-demo"]');
  if (await demo.isVisible().catch(() => false)) await demo.click();
  else {
    await page.locator("#login-email").fill("alex@cosmoz.app");
    await page.locator("#login-password").fill("cosmoz123");
  }
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForFunction(() => window.location.pathname === "/");
  await page.locator('section[aria-label="Key performance indicators"]').waitFor();
  await page.waitForTimeout(800);

  const dump = () =>
    page.evaluate(() => {
      const cell = document.querySelector(
        'section[aria-label="Key performance indicators"] .stat-cell:nth-child(3)',
      );
      const polyline = cell ? cell.querySelector("svg polyline") : null;
      return {
        dataTheme: document.documentElement.getAttribute("data-theme"),
        htmlClass: document.documentElement.className,
        chart2: getComputedStyle(document.documentElement).getPropertyValue("--chart-2").trim(),
        stroke: polyline ? polyline.getAttribute("stroke") : null,
        cellFound: Boolean(cell),
      };
    });

  console.log("BEFORE:", JSON.stringify(await dump()));
  const canvasBefore = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return canvas ? canvas.toDataURL().slice(-120) : null;
  });

  await page.locator('button:has(svg.lucide-sun), button:has(svg.lucide-moon), [aria-label*="heme"]').first().click();
  await page.waitForTimeout(400);
  await page.getByRole("menuitem", { name: "Light" }).click();
  await page.waitForTimeout(2000);

  console.log("AFTER :", JSON.stringify(await dump()));
  const canvasAfter = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return canvas ? canvas.toDataURL().slice(-120) : null;
  });
  console.log("CANVAS CHANGED:", canvasBefore !== canvasAfter);

  // Does the toggle itself see the new theme? (Check mark position)
  await page.locator('button[aria-label="Change theme"]').click();
  await page.waitForTimeout(500);
  const checkedLabel = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
    const checked = items.find((el) => el.querySelector("svg.lucide-check"));
    return checked ? checked.textContent?.trim() : "none";
  });
  console.log("CHECKED MENU ITEM:", checkedLabel);
  console.log("LOCALSTORAGE theme:", await page.evaluate(() => window.localStorage.getItem("theme")));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
