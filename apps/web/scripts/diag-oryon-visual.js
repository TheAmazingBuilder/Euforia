/**
 * diag-oryon-visual.js — step-by-step screenshots + geometry dump to find
 * where the candlestick viewport collapses (fit/zoom corruption hunt).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node diagnostic helper */
const { chromium } = require("playwright");
const { ensureLogin } = require("./helpers/login");

const BASE = "http://localhost:3000";
const OUT = "/home/z/my-project/download";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await ensureLogin(page);
  await page.goto(`${BASE}/oryon`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('[data-testid="oryon-legend"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1_500);

  const geometry = async (label) => {
    const info = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="oryon-chart-canvas"]');
      const canvas = container?.querySelector("canvas");
      const rect = container?.getBoundingClientRect();
      return {
        container: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : "none",
        canvasAttr: canvas ? `${canvas.width}x${canvas.height}` : "none",
        canvasCss: canvas ? `${canvas.style.width} / ${canvas.style.height}` : "none",
      };
    });
    console.log(`[${label}]`, JSON.stringify(info));
  };

  await geometry("initial-load");
  await page.screenshot({ path: `${OUT}/diag-1-initial.png` });

  await page.locator('[data-testid="oryon-tf-1m"]').click();
  await page.waitForTimeout(1_200);
  await geometry("after-tf-1m");
  await page.screenshot({ path: `${OUT}/diag-2-tf1m.png` });

  await page.waitForTimeout(6_000); // ticks + possible refetch/backfill
  await geometry("after-6s-idle");
  await page.screenshot({ path: `${OUT}/diag-3-idle.png` });

  await page.locator('[data-testid="oryon-instrument-trigger"]').click();
  await page.locator('[data-testid="oryon-instrument-option-EURUSD"]').click();
  await page.waitForTimeout(2_000);
  await geometry("after-instrument-switch");
  await page.screenshot({ path: `${OUT}/diag-4-instrument.png` });

  await page.waitForTimeout(6_000);
  await geometry("after-6s-idle-2");
  await page.screenshot({ path: `${OUT}/diag-5-idle2.png` });

  await browser.close();
  console.log("DONE");
})().catch((error) => {
  console.error("CRASH:", error);
  process.exit(1);
});
