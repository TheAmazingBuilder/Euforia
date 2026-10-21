// Range-math verification on the DEV server (:3001) — __ORYON_PANELS_DEBUG__
// exposes the real visible range, so each preset's span is asserted.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
async function ensureLogin(page) {
  const sidebar = page.locator('nav[aria-label="Main navigation"]');
  if ((await sidebar.count()) > 0 && (await sidebar.isVisible().catch(() => false))) return;
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await sidebar.waitFor({ state: "visible", timeout: 30000 });
}
const DAY = 86400;
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await ensureLogin(page);
  await page.goto(BASE + '/oryon', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(12000); // dev compile + candles

  const read = () => page.evaluate(() => {
    const d = window.__ORYON_PANELS_DEBUG__?.();
    return d && d[0] ? d[0].visibleRange : null;
  });

  const full = await read();
  if (!full) { console.log('FAIL no visible range (chart not loaded)'); process.exit(1); }
  const fullSpan = full.to - full.from;
  console.log(`initial visible span: ${(fullSpan / DAY).toFixed(2)}d  (from=${full.from} to=${full.to})`);

  const cases = [
    ["1D", (s) => s > 0.5 * DAY && s <= 1.2 * DAY],
    ["5D", (s) => s > 4 * DAY && s <= 5.5 * DAY],
    ["1M", (s) => s > 26 * DAY && s <= 33 * DAY],
    ["YTD", null], // asserted separately below
    ["ALL", (s) => s >= fullSpan * 0.98],
  ];
  let pass = 0, fail = 0;
  for (const [id, spanOk] of cases) {
    await page.click(`[data-testid="oryon-range-${id}"]`);
    await page.waitForTimeout(900);
    const r = await read();
    if (!r) { console.log(`FAIL ${id} — no range after click`); fail++; continue; }
    const span = r.to - r.from;
    if (spanOk === null) {
      // YTD: from must be Jan 1 UTC of the last bar's year
      const jan1 = Date.UTC(new Date(r.to * 1000).getUTCFullYear(), 0, 1) / 1000;
      const ok = Math.abs(r.from - jan1) < DAY && span > fullSpan * 0.5;
      console.log(`${ok ? "PASS" : "FAIL"} ${id} from=${new Date(r.from * 1000).toISOString().slice(0, 10)} (jan1=${new Date(jan1 * 1000).toISOString().slice(0, 10)}) span=${(span / DAY).toFixed(1)}d`);
      ok ? pass++ : fail++;
    } else {
      const ok = spanOk(span);
      console.log(`${ok ? "PASS" : "FAIL"} ${id} span=${(span / DAY).toFixed(2)}d`);
      ok ? pass++ : fail++;
    }
  }

  // Calendar jump: click "Today" — range should END at the last bar.
  await page.click('[data-testid="oryon-range-calendar"]');
  await page.waitForSelector('[data-testid="oryon-range-calendar-popover"]', { timeout: 5000 });
  await page.click('[data-testid="oryon-range-calendar-today"]');
  await page.waitForTimeout(900);
  const r2 = await read();
  if (r2) {
    const fromIso = new Date(r2.from * 1000).toISOString().slice(0, 10);
    const lastIso = new Date(full.to * 1000).toISOString().slice(0, 10);
    const ok = Math.abs(r2.to - full.to) < 2 * DAY;
    console.log(`${ok ? "PASS" : "FAIL"} calendar Today from=${fromIso} to=${r2.to} (last bar=${lastIso})`);
    ok ? pass++ : fail++;
  } else { console.log("FAIL calendar Today — no range"); fail++; }

  console.log(`\n=== range math: ${pass}/${pass + fail} ===`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
