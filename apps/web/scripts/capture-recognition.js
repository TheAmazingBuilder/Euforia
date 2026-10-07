/**
 * BEFORE/AFTER capture — the visual baseline for the premium redesign.
 * Logs in, walks the main recognition surfaces and saves full-page shots
 * to scripts/shots/redesign-{before,after}-*.png depending on PREFIX.
 *
 * Run: node scripts/capture-recognition.js  (server on :3000, mock mode)
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const PREFIX = process.env.PREFIX || "redesign-before";

async function makeScreenshotPng(page, width = 1280, height = 720, withText = true, tint = 0) {
  const dataUrl = await page.evaluate(
    ([w, h, text, t]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = `rgb(${14 + t}, ${17 + t}, ${22 + t * 2})`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#141920";
      ctx.fillRect(0, 0, w, 28);
      ctx.strokeStyle = "#262E3A";
      for (let x = 20; x < w; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 34);
        ctx.lineTo(x, h - 10);
        ctx.stroke();
      }
      if (text) {
        ctx.fillStyle = "#E9ECEF";
        ctx.font = "20px monospace";
        ctx.fillText("Trade  Symbol     Volume   Entry      S/L        T/P        Profit", 24, 64);
        ctx.fillText("#4213  XAUUSD     0.10     2645.32    2638.50    2660.00    +146.80", 24, 96);
      }
      return canvas.toDataURL("image/png");
    },
    [width, height, withText, tint],
  );
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.fill('input[type="email"]', "trader@cosmoz.app");
  await page.fill('input[type="password"]', "cosmoz-demo-2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // Overview (empty state — fresh session has items; capture as-is)
  await page.goto(`${BASE}/recognition`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="recognition-overview"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `scripts/shots/${PREFIX}-overview.png`, fullPage: true });

  // History
  await page.click('[data-testid="recognition-tab-history"]');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `scripts/shots/${PREFIX}-history.png`, fullPage: true });

  // Configure step (upload → profile cards)
  await page.click('[data-testid="recognition-tab-overview"]');
  await page.waitForTimeout(600);
  const png = await makeScreenshotPng(page);
  await page.setInputFiles('input[type="file"]', { name: "xauusd-mt5.png", mimeType: "image/png", buffer: png });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `scripts/shots/${PREFIX}-configure.png`, fullPage: true });

  // Result (trade summary)
  await page.click('[data-testid="recognition-start"]');
  await page.waitForSelector('[data-testid="recognition-result"]', { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `scripts/shots/${PREFIX}-result-trade.png`, fullPage: true });

  // Account profile result — go back to overview, upload, pick profile.
  await page.goto(`${BASE}/recognition`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="recognition-overview"]', { timeout: 30000 });
  await page.waitForTimeout(600);
  const accountShot = await makeScreenshotPng(page, 1280, 720, false, 0);
  await page.setInputFiles('input[type="file"]', { name: "account-snapshot.png", mimeType: "image/png", buffer: accountShot });
  await page.waitForSelector('[data-testid="recognition-profile-account_position"]', { timeout: 15000 });
  await page.click('[data-testid="recognition-profile-account_position"]');
  await page.click('[data-testid="recognition-start"]');
  await page.waitForSelector('[data-testid="recognition-account-view"]', { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `scripts/shots/${PREFIX}-result-account.png`, fullPage: true });

  // Chart profile result
  await page.goto(`${BASE}/recognition`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="recognition-overview"]', { timeout: 30000 });
  await page.waitForTimeout(600);
  const chartShot = await makeScreenshotPng(page, 1280, 720, false, 24);
  await page.setInputFiles('input[type="file"]', { name: "chart-xauusd.png", mimeType: "image/png", buffer: chartShot });
  await page.waitForSelector('[data-testid="recognition-profile-chart_analysis"]', { timeout: 15000 });
  await page.click('[data-testid="recognition-profile-chart_analysis"]');
  await page.click('[data-testid="recognition-start"]');
  await page.waitForSelector('[data-testid="recognition-chart-view"]', { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `scripts/shots/${PREFIX}-result-chart.png`, fullPage: true });

  await browser.close();
  console.log(`CAPTURED: ${PREFIX} — overview, history, configure, result-trade, result-account, result-chart`);
})().catch((error) => {
  console.error(`CAPTURE FAILED: ${error.message}`);
  process.exit(1);
});
