/**
 * Regenerates apps/web/src/app/favicon.ico from the Cosmoz constellation
 * icon.svg (deep-space tile + star pentagon). Renders the SVG with
 * Playwright (transparent outside corners) and packs sizes with PIL.
 */
const path = require("path");
const { chromium } = require("playwright");

const ICON = path.resolve(__dirname, "../apps/web/public/icon.svg");
const OUT_PNG = path.resolve(__dirname, "shots/favicon-256.png");
const OUT_ICO = path.resolve(__dirname, "../apps/web/src/app/favicon.ico");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 300, height: 300 },
    deviceScaleFactor: 1,
  });
  const svg = require("fs").readFileSync(ICON, "utf8");
  await page.setContent(
    `<body style="margin:0;background:transparent">${svg.replace(
      "<svg ",
      '<svg width="256" height="256" '
    )}</body>`
  );
  await page.locator("svg").screenshot({ path: OUT_PNG, omitBackground: true });
  await browser.close();
  console.log("PNG written:", OUT_PNG);
})();
