/**
 * Render an Euforia brand SVG at its native viewBox size on a transparent
 * background — alignment frame for the depth-extraction pipeline.
 * Usage: node render-mark-frame.js <svgFile> <outPng> <width> <height>
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BRAND = "/home/z/my-project/apps/web/public/brand";

(async () => {
  const [svgFile, outPng, w, h] = process.argv.slice(2);
  const svg = fs.readFileSync(path.join(BRAND, svgFile), "utf8");
  const html = `<!doctype html><body style="margin:0;background:transparent">
    <div style="width:${w}px;height:${h}px">${svg.replace(
      "<svg ",
      `<svg width="${w}" height="${h}" `,
    )}</div></body>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: Number(w), height: Number(h) },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.waitForTimeout(200);
  await page.screenshot({ path: outPng, omitBackground: true });
  await browser.close();
  console.log(`rendered ${svgFile} → ${outPng} (${w}x${h})`);
})();
