/** One-off probe: does /login render #login-email on the live build? */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
  const errs = [];
  page.on("console", (m) => errs.push(`${m.type()}: ${m.text().slice(0, 180)}`));
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + String(e).slice(0, 300)));
  await page.goto("http://localhost:3001/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(6000);
  const hasField = await page.locator("#login-email").count();
  console.log("login-email count:", hasField);
  console.log("URL:", page.url());
  console.log("BODY:", (await page.locator("body").innerText().catch(() => "<no body>")).slice(0, 300).replace(/\n+/g, " | "));
  console.log("CONSOLE:", errs.slice(0, 12).join("\n  "));
  await browser.close();
})().catch((e) => { console.error("PROBE FAIL:", e); process.exit(1); });
