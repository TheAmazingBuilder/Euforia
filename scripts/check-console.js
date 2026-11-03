/**
 * Console health-check - visits every main route, collects console errors
 * and page errors, reports per route. Exit 1 when any error is found.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const ROUTES = ["/", "/playbook", "/analytics", "/calendar", "/trades", "/journal", "/discipline", "/coach", "/goals", "/settings"];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  let total = 0;
  for (const route of ROUTES) {
    const errors = [];
    const onConsole = (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    };
    const onPageError = (err) => errors.push(String(err));
    page.on("console", onConsole);
    page.on("pageerror", onPageError);

    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    page.off("console", onConsole);
    page.off("pageerror", onPageError);

    const status = errors.length === 0 ? "CLEAN" : `ERRORS (${errors.length})`;
    console.log(`${route.padEnd(12)} ${status}`);
    errors.slice(0, 3).forEach((e) => console.log(`   - ${e.slice(0, 160)}`));
    total += errors.length;
  }

  await browser.close();
  console.log(`\nTOTAL console errors: ${total}`);
  process.exit(total === 0 ? 0 : 1);
})();
