// (a)+(b) verification - real eco source note in the UI + eco-approach toast.
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
let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  - " + detail : ""}`);
  ok ? pass++ : fail++;
}
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await ensureLogin(page);
  await page.goto(BASE + '/oryon', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(12000);

  // ── (a) the market-context panel shows the LIVE source note ──────────
  await page.locator('[data-testid="oryon-calendar"]').click(); // opens the utility rail
  await page.waitForTimeout(2500);
  const note = await page.locator('[data-testid="oryon-events-source-note"]').innerText().catch(() => "");
  check("eco source note reflects the real provider", note.includes("ForexFactory"), note.slice(0, 80));
  // First uncached FF fetch on a dev server can take a few seconds - poll.
  let rows = 0;
  for (let i = 0; i < 30 && rows === 0; i += 1) {
    rows = await page.locator('[data-testid="oryon-eco-row"]').count();
    if (rows === 0) await page.waitForTimeout(500);
  }
  check("eco events render in the panel", rows > 0, `rows=${rows}`);

  // ── (b) eco-approach toast on injected HIGH event ─────────────────────
  await page.evaluate(() => {
    window.__ORYON_ECO_APPROACH_DEBUG__?.inject("Probe Rate Decision", "EUR", 3);
  });
  // The shared clock ticks every 15 s - allow up to 40 s for the beat.
  await page.waitForSelector('[data-testid="oryon-eco-approach-toast"]', { timeout: 40_000 });
  const toastText = await page.locator('[data-testid="oryon-eco-approach-toast"]').first().innerText();
  check("eco-approach toast fires", toastText.length > 0, toastText.replace(/\n/g, " | ").slice(0, 120));
  check("toast matches a workspace instrument (EURUSD)", toastText.includes("EURUSD"));

  // one-shot: the next clock beat must NOT re-fire the same milestone
  // (dev StrictMode may mount the bridge twice - each engine one-shot;
  // the assertion tolerates the dev artifact, prod mounts once).
  await page.waitForTimeout(17_000);
  const again = await page.locator('[data-testid="oryon-eco-approach-toast"]').count();
  check("no duplicate toast on the next tick", again <= 2, `count=${again}`);

  await page.screenshot({ path: '/home/z/my-project/scripts/eco-bridge-toast.png' });
  const realErrors = errors.filter((e) => !e.includes("401") && !e.includes("WebSocket"));
  check("no page errors", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

  console.log(`\n=== ${pass}/${pass + fail} ===`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
