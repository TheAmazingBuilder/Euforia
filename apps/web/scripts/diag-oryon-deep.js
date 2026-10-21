/**
 * diag-oryon-deep.js — capture the /candles payloads THE BROWSER receives,
 * dump the engine's internal series state, and trace setBars calls.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node diagnostic helper */
const { chromium } = require("playwright");
const { ensureLogin } = require("./helpers/login");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 200));
  });

  // Every /candles response AS THE BROWSER SEES IT.
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/candles")) return;
    try {
      const data = await response.json();
      const candles = Array.isArray(data?.candles) ? data.candles : null;
      console.log(
        `[net] ${url.slice(url.length - 90)} → ${response.status()} symbol=${data?.symbol} interval=${data?.interval} n=${candles?.length}`,
      );
      if (candles && candles.length > 0) {
        const bad = candles.filter(
          (c) => c.h < Math.max(c.o, c.c) || c.l > Math.min(c.o, c.c) || c.h < c.l,
        );
        console.log(`[net]   sanity-fails=${bad.length} first.t=${new Date(candles[0].t).toISOString()} last.t=${new Date(candles[candles.length - 1].t).toISOString()}`);
      }
    } catch {
      console.log(`[net] ${url.slice(url.length - 90)} → ${response.status()} (non-JSON)`);
    }
  });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await ensureLogin(page);
  await page.goto(`${BASE}/oryon`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('[data-testid="oryon-legend"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(4_000);

  const engineState = await page.evaluate(() => {
    const engine = window.__oryonEngine;
    if (!engine) return "NO ENGINE HANDLE";
    const bars = engine.bars;
    const range = engine.chart.timeScale().getVisibleLogicalRange();
    return {
      barsLength: bars.length,
      firstT: bars[0] ? new Date(bars[0].t).toISOString() : null,
      lastT: bars[bars.length - 1] ? new Date(bars[bars.length - 1].t).toISOString() : null,
      visibleRange: range ? { from: Math.round(range.from * 10) / 10, to: Math.round(range.to * 10) / 10 } : null,
    };
  });
  console.log("[engine]", JSON.stringify(engineState, null, 2));

  await browser.close();
  console.log("DONE");
})().catch((error) => {
  console.error("CRASH:", error);
  process.exit(1);
});
