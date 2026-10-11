/**
 * Verify trades loading skeleton + first-class empty state.
 * MSW answers inside the service worker, so network-layer interception never
 * sees those calls. Instead this harness patches window.fetch in the page
 * (addInitScript runs before any bundle code): requests for /api/trades are
 * answered synthetically and never reach the worker; everything else keeps
 * flowing through MSW.
 * Usage: node scripts/verify-trades-states.js
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = "/home/z/my-project/scripts/audit";

function fetchPatch(mode) {
  return `
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      if (url.includes("/api/trades")) {
        const body = JSON.stringify(${JSON.stringify({ trades: [], total: 0 })});
        return new Promise((resolve) => {
          setTimeout(
            () => resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/json" } })),
            ${mode === "delay" ? 3000 : 0},
          );
        });
      }
      return originalFetch(input, init);
    };
  `;
}

(async () => {
  const browser = await chromium.launch();

  // --- 1. Skeleton: 3s-delayed trades response.
  const ctxDelayed = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxDelayed.addInitScript(fetchPatch("delay"));
  const page1 = await ctxDelayed.newPage();
  await page1.goto(`${BASE}/trades`);
  await page1.waitForTimeout(1400);
  await page1.screenshot({ path: `${OUT}/adj-trades-skeleton.png` });
  console.log("adj-trades-skeleton.png");
  await ctxDelayed.close();

  // --- 2. Empty state: instant empty list.
  const ctxEmpty = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxEmpty.addInitScript(fetchPatch("instant"));
  const page2 = await ctxEmpty.newPage();
  await page2.goto(`${BASE}/trades`);
  await page2.waitForLoadState("networkidle");
  await page2.waitForTimeout(1000);
  await page2.screenshot({ path: `${OUT}/adj-trades-empty.png` });
  console.log("adj-trades-empty.png");
  await ctxEmpty.close();

  await browser.close();
  console.log("DONE");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
