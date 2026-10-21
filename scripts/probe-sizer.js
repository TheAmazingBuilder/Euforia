/** Probe: why does the sizer stay "—" in the capture modal? */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const apiLog = [];
  page.on("response", async (res) => {
    if (res.url().includes("/api/")) {
      let body = null;
      try { body = await res.json(); } catch {}
      apiLog.push({
        url: res.url().replace(/^https?:\/\/[^/]+/, ""),
        status: res.status(),
        keys: body && typeof body === "object" ? Object.keys(body).slice(0, 8) : null,
        netPnl: body?.netPnl ?? null,
        accounts: body?.accounts?.length ?? null,
      });
    }
  });

  await page.goto("http://localhost:3000/trades", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.__dbgBalance = true;
  });
  const dbgLines = [];
  page.on("console", (msg) => {
    if (msg.text().includes("[dbg balance]")) dbgLines.push(msg.text());
  });
  await page.keyboard.press("n");
  await page.waitForTimeout(900);

  const combobox = page.locator("[role=combobox]").first();
  await combobox.click();
  const opt = page.locator('[role="option"]').first();
  await opt.waitFor({ state: "visible", timeout: 5000 });
  await opt.click();
  await page.waitForTimeout(400);

  await page.locator("#trade-entry-price").fill("100");
  await page.locator("#trade-stop").fill("99");
  await page.locator("#trade-exit-price").fill("101");

  // Sample the sizer state over 4s
  for (let i = 0; i < 8; i += 1) {
    const state = await page.evaluate(() => {
      const form = document.querySelector("form");
      const sizeInput = form?.querySelector('input[aria-label*="auto"], input[id*="size"], input[name*="size"]');
      const calcBar = form?.querySelector(".font-mono");
      const trigger = document.querySelector("[role=combobox]");
      return {
        trigger: trigger?.textContent?.slice(0, 50) ?? null,
        calcBarText: Array.from(form?.querySelectorAll("p, span") ?? [])
          .map((el) => el.textContent ?? "")
          .filter((t) => /Risk/i.test(t))
          .slice(0, 4),
        missingHint: Array.from(form?.querySelectorAll("p") ?? [])
          .map((el) => el.textContent ?? "")
          .find((t) => t.startsWith("Add:")) ?? null,
        sizeValue: sizeInput ? (sizeInput).value : null,
      };
    });
    console.log(`t+${i * 0.5}s`, JSON.stringify(state));
    await page.waitForTimeout(500);
  }

  console.log("\nDBG balance lines (first 3 + last 2):");
  dbgLines.slice(0, 3).concat(dbgLines.slice(-2)).forEach((l) => console.log(" ", l));
  console.log("total dbg lines:", dbgLines.length);
  console.log("\nAPI calls:");
  apiLog.forEach((call) => console.log(" ", JSON.stringify(call)));

  await browser.close();
})();
