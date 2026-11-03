/* Probe - find the real scroll container + wheel behaviour in headless */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);

  await page.locator('nav[aria-label="Main navigation"] a[href="/nofy"]').click();
  await page.waitForTimeout(1400);
  await page.click('[data-testid="nofy-tab-notes"]');
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="nofy-note-row"]', { hasText: "XAUUSD London Breakout" }).click();
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Add a block" }).click();
  await page.waitForTimeout(400);
  const fresh = page.locator('[data-testid="nofy-block"] textarea').last();
  await fresh.type("/");
  await page.waitForTimeout(500);

  const probe1 = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollHeight > el.clientHeight + 30 && el.clientHeight > 100) {
        out.push({
          tag: el.tagName,
          cls: String(el.className).slice(0, 80),
          sh: el.scrollHeight,
          ch: el.clientHeight,
          st: el.scrollTop,
          canScroll: (() => { const s = el.scrollTop; el.scrollTop = s + 100; const moved = el.scrollTop > s; el.scrollTop = s; return moved; })(),
        });
      }
    }
    return { scrollers: out.slice(0, 6), winY: window.scrollY, docSH: document.documentElement.scrollHeight, docCH: document.documentElement.clientHeight };
  });
  console.log(JSON.stringify(probe1, null, 1));

  const menuBox = await page.locator('[data-testid="nofy-slash-menu"]').boundingBox();
  await page.mouse.move(menuBox.x + menuBox.width / 2, menuBox.y + 120);
  const atPoint = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName}.${String(el.className).slice(0, 60)}` : "none";
  }, [menuBox.x + menuBox.width / 2, menuBox.y + 120]);
  console.log("elementFromPoint(menu+120):", atPoint);

  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(500);
  const ulAfter = await page.evaluate(() => {
    const ul = document.querySelector('[data-testid="nofy-slash-menu"] ul');
    return { st: ul.scrollTop, sh: ul.scrollHeight, ch: ul.clientHeight, open: !!document.querySelector('[data-testid="nofy-slash-menu"]') };
  });
  console.log("ul after wheel:", JSON.stringify(ulAfter));

  await page.evaluate(() => {
    const ul = document.querySelector('[data-testid="nofy-slash-menu"] ul');
    ul.scrollTop = 80;
  });
  await page.waitForTimeout(300);
  const ulManual = await page.evaluate(() => ({
    st: document.querySelector('[data-testid="nofy-slash-menu"] ul').scrollTop,
    open: !!document.querySelector('[data-testid="nofy-slash-menu"]'),
  }));
  console.log("ul after manual scrollTop=80:", JSON.stringify(ulManual));

  await browser.close();
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
