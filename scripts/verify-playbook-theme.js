/**
 * Verify playbook staggered entrance + theme-switch crossfade.
 * The crossfade class lives only ~280ms, so a MutationObserver (installed
 * before the click) records whether html.theme-fade was ever applied.
 * Usage: node scripts/verify-playbook-theme.js
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = "/home/z/my-project/scripts/audit";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // --- Playbook: capture mid-entrance (opacity/y offsets) then settled.
  await page.goto(`${BASE}/playbook`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/adj-playbook-entering.png` });
  console.log("adj-playbook-entering.png");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${OUT}/adj-playbook-settled.png` });
  console.log("adj-playbook-settled.png");

  // --- Theme crossfade with observer.
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__fadeSeen = false;
    new MutationObserver(() => {
      if (document.documentElement.classList.contains("theme-fade")) {
        window.__fadeSeen = true;
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  });
  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitem", { name: /Light/ }).click();
  await page.waitForTimeout(700);
  const fadeSeen = await page.evaluate(() => window.__fadeSeen);
  const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  console.log(`theme-fade seen=${fadeSeen} finalTheme=${theme}`);
  await page.screenshot({ path: `${OUT}/adj-dashboard-light.png` });
  console.log("adj-dashboard-light.png");

  await browser.close();
  console.log("DONE");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
