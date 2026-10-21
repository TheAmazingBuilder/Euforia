/** Probe — why doesn't the Reset button appear after the drag commit? */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (err) => console.log("PAGEERROR:", String(err).slice(0, 300)));
  page.on("response", (res) => {
    if (res.url().includes("/me/preferences")) console.log(`[net] ${res.request().method()} ${res.url().slice(-40)} → ${res.status()}`);
  });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.locator('[data-testid="dashboard-goals-pace"]').waitFor({ state: "visible", timeout: 20000 });

  const order = () =>
    page.$$eval('[data-page="dashboard"] section[data-widget]', (nodes) =>
      nodes.map((n) => n.getAttribute("data-widget")),
    );
  const fireDrag = (widget, type) =>
    page.$eval(`section[data-widget="${widget}"]`, (el, t) => {
      el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true }));
    }, type);

  await page.locator('[data-testid="dashboard-customize"]').click();
  await page.waitForTimeout(400);

  // Move down (known-good path)
  await page.locator('[data-testid="dashboard-widget-down-pnl_band"]').click();
  await page.waitForTimeout(900);
  console.log("after move:", await order());
  console.log("reset button after move:", await page.locator('[data-testid="dashboard-layout-reset"]').count());

  // Drag path
  await fireDrag("EQUITY_ROW", "dragstart");
  await page.waitForTimeout(200);
  await fireDrag("GOALS_PACE", "dragover");
  await page.waitForTimeout(200);
  console.log("during drag (dragOrder):", await order());
  await fireDrag("EQUITY_ROW", "dragend");
  await page.waitForTimeout(900);
  console.log("after dragend:", await order());
  console.log("tools count:", await page.locator('[data-testid^="dashboard-widget-tools-"]').count());
  console.log("reset button:", await page.locator('[data-testid="dashboard-layout-reset"]').count());
  const headerButtons = await page.$$eval('[data-page="dashboard"] header button', (btns) =>
    btns.map((b) => `${b.textContent?.trim()} [${b.getAttribute("data-testid")}]`),
  );
  console.log("header buttons:", headerButtons);

  await browser.close();
})();
