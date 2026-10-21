/* Isolated M1 probe: same drag as the suite, with console + drag event capture. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const { ensureLogin } = require("/home/z/my-project/apps/web/scripts/helpers/login.js");

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning" || msg.text().includes("[dbg]")) {
      console.log(`[console.${msg.type()}]`, msg.text().slice(0, 300));
    }
  });
  page.on("pageerror", (err) => console.log("[pageerror]", String(err).slice(0, 300)));

  await page.goto(`${BASE}/login`);
  await ensureLogin(page);
  await page.goto(`${BASE}/tasky`);
  await page.waitForTimeout(900);

  await page.evaluate(() => {
    window.__dragLog = [];
    ["dragstart", "dragover", "drop", "dragend"].forEach((type) => {
      document.addEventListener(
        type,
        (e) => {
          window.__dragLog.push(
            `${type} tgt=${e.target?.dataset?.taskId || e.target?.tagName || "?"} y=${Math.round(e.clientY)}`,
          );
        },
        true,
      );
    });
  });

  const sBox = await page.locator('[data-testid="tasky-card-t-oauth"]').boundingBox();
  const tBox = await page.locator('[data-testid="tasky-card-t-csv"]').boundingBox();
  const sx = sBox.x + sBox.width / 2;
  const sy = sBox.y + sBox.height / 2;
  const tx = tBox.x + 100;
  const ty = tBox.y + 120;
  console.log("from", sx, sy, "to", tx, ty);

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 12, sy + 8, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 18 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(500);

  console.log("first card:", await page
    .locator('[data-testid="tasky-dropzone-backlog"] [data-task-id]')
    .first()
    .getAttribute("data-task-id"));
  const log = await page.evaluate(() => (window.__dragLog || []).slice(-10));
  console.log("[draglog]", log.join(" || "));

  await browser.close();
})();
