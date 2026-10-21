/* eslint-disable @typescript-eslint/no-require-imports -- Node probe */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (msg) => {
    const text = msg.text();
    if (/\[recog\]|\[handler\]/.test(text)) console.log("PAGE:", text);
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });

  // Baseline trades list
  const before = await page.evaluate(async () => {
    const res = await fetch("/api/trades");
    const json = await res.json();
    return { total: json.total ?? json.trades?.length, ids: (json.trades ?? []).slice(0, 3).map((t) => t.id) };
  });
  console.log("BASELINE /api/trades:", JSON.stringify(before));

  // Full OCR happy path
  await page.locator('nav[aria-label="Main navigation"] a[href="/import"]').click();
  await page.locator('[data-testid="import-view"]').waitFor({ timeout: 30_000 });
  await page.locator('[data-testid="import-header-cta"]').click();
  await page.locator('[data-testid="import-dropzone"]').waitFor({ timeout: 10_000 });
  await page.locator('[data-testid="import-file-input"]').setInputFiles({ name: "probe_xau.png", mimeType: "image/png", buffer: TINY_PNG });
  await page.locator('[data-testid="import-preview-card"]').waitFor({ timeout: 10_000 });
  await page.locator('[data-testid="import-continue-settings"]').click();
  await page.locator('[data-testid="import-start"]').click();
  await page.locator('[data-testid="import-result"]').waitFor({ timeout: 30_000 });
  await page.locator('[data-testid="import-draft-open"]').click();
  await page.locator('[data-testid="import-draft"]').waitFor({ timeout: 10_000 });
  await page.locator('[data-testid="import-draft-confirm"]').click();
  await page.locator('[data-testid="import-confirmation"]').waitFor({ timeout: 10_000 });
  await page.locator('[data-testid="import-confirm-import"]').click();
  await page.locator('[data-testid="import-success"]').waitFor({ timeout: 15_000 });
  const shortId = (await page.locator('[data-testid="import-success"]').innerText()).match(/#([0-9a-f]{8})/)?.[1];
  console.log("SUCCESS short trade id:", shortId);

  // Now query the API from the same page context
  const after = await page.evaluate(async (short) => {
    const res = await fetch("/api/trades");
    const json = await res.json();
    const trades = json.trades ?? [];
    const match = trades.find((t) => t.id.startsWith(short));
    return {
      total: json.total ?? trades.length,
      matchFound: Boolean(match),
      matchInstrument: match?.instrumentId,
      matchEntry: match?.entryPrice,
      top3: trades.slice(0, 3).map((t) => t.id.slice(0, 8)),
    };
  }, shortId);
  console.log("AFTER /api/trades:", JSON.stringify(after));

  // SPA navigate to /trades?trade=<full id> via click simulation of View Trade
  await page.locator('[data-testid="import-success-view-trade"]').click();
  await page.waitForTimeout(3500);
  console.log("URL after View Trade:", page.url());
  const dialogCount = await page.locator('[role="dialog"]').count();
  const drawerCount = await page.locator('[data-testid="trade-detail-drawer"]').count();
  const rowCount = await page.locator('[data-testid="trades-row"]').count();
  const rowIds = await page.locator('[data-testid^="trades-row-checkbox-"]').evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-testid")?.replace("trades-row-checkbox-", "").slice(0, 8)),
  );
  console.log("dialog count:", dialogCount, "drawer testid count:", drawerCount);
  console.log("rows rendered:", rowCount, "first row ids:", JSON.stringify(rowIds.slice(0, 5)));
  console.log("match in rendered rows:", rowIds.includes(shortId));

  await browser.close();
})().catch((err) => {
  console.error("PROBE ERROR:", err);
  process.exit(2);
});
