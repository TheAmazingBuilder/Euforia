/* Quick /journal smoke probe - DOM assertions + console health. */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleIssues = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") consoleIssues.push(`[console.error] ${text.slice(0, 200)}`);
    if (msg.type() === "warning" && !/DevTools|React DevTools|mock|msw/i.test(text))
      consoleIssues.push(`[console.warn] ${text.slice(0, 200)}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) consoleIssues.push(`[http ${res.status()}] ${res.url().slice(0, 120)}`);
  });

  await page.goto("http://localhost:3000/journal", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);

  const probe = await page.evaluate(() => {
    const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
    return {
      title: text("h1") ?? document.title,
      hasEditor: document.body.innerText.includes("Day entry"),
      hasPreMarket: document.body.innerText.includes("Pre-market"),
      hasPostMarket: document.body.innerText.includes("Post-market"),
      hasRecent: document.body.innerText.includes("Recent entries"),
      bodySnippet: document.body.innerText.slice(0, 400),
    };
  });
  console.log("PROBE:", JSON.stringify(probe, null, 2));

  // Try switching to a recent entry via the list and check editor hydrates.
  const listButtons = page.locator('ul[aria-label="Journal entries"] button');
  const count = await listButtons.count();
  console.log("entry list buttons:", count);
  if (count > 1) {
    await listButtons.nth(1).click();
    await page.waitForTimeout(600);
    const afterSwitch = await page.evaluate(() => document.body.innerText.includes("Saved page"));
    console.log("switched entry hydrates as saved:", afterSwitch);
  }

  // Save-flow smoke: type a lesson on today, save, expect toast.
  await page.locator('ul[aria-label="Journal entries"] button').first().click();
  await page.waitForTimeout(400);
  const lessonBox = page.locator("#journal-lessons");
  if (await lessonBox.count()) {
    await lessonBox.fill("Probe lesson - phase 10 smoke test.");
    await page.getByRole("button", { name: /save entry/i }).click();
    await page.waitForTimeout(1600);
    const toast = await page.evaluate(() => document.body.innerText);
    console.log("save toast visible:", toast.includes("Journal entry saved"));
  }

  await page.screenshot({ path: "scripts/phase10-journal-smoke.png", fullPage: true });
  console.log("CONSOLE ISSUES:", consoleIssues.length === 0 ? "NONE" : consoleIssues.join("\n"));
  await browser.close();
})().catch((error) => {
  console.error("PROBE FAILED:", error.message);
  process.exit(1);
});
