/**
 * Regenerate the Euforia PNG set from the corrected (traced) SVGs.
 * Playwright rasterization with transparent backgrounds; sizes match the
 * original kit layout. Then stale old-E kit files are removed by the shell.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BRAND = "/home/z/my-project/apps/web/public/brand";
const PNG = path.join(BRAND, "png");

(async () => {
  fs.mkdirSync(PNG, { recursive: true });
  const browser = await chromium.launch();

  async function rasterize(svgFile, outPath, width, height) {
    const svg = fs.readFileSync(path.join(BRAND, svgFile), "utf8");
    const html = `<!doctype html><body style="margin:0;background:transparent">
      <div style="width:${width}px;height:${height}px">${svg.replace(
        "<svg ",
        `<svg width="${width}" height="${height}" `,
      )}</div></body>`;
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    await page.setContent(html);
    await page.waitForTimeout(200);
    await page.screenshot({ path: outPath, omitBackground: true });
    await page.close();
  }

  const tasks = [];
  // gradient mark (bare) - kit sizes
  for (const s of [64, 128, 256, 512, 1024]) {
    tasks.push(["euforia-mark.svg", `euforia-mark-${s}.png`, s, Math.round((s * 918) / 750)]);
  }
  // monochrome marks (bare)
  for (const s of [64, 128, 256, 512, 1024]) {
    tasks.push(["euforia-mark-white.svg", `euforia-mark-white-${s}.png`, s, Math.round((s * 918) / 750)]);
    tasks.push(["euforia-mark-black.svg", `euforia-mark-black-${s}.png`, s, Math.round((s * 918) / 750)]);
  }
  // squircle tile icons (square)
  for (const s of [16, 32, 48, 128, 192, 512]) {
    tasks.push(["euforia-icon.svg", `icon-${s}.png`, s, s]);
  }
  for (const [svg, out, w, h] of tasks) {
    await rasterize(svg, path.join(PNG, out), w, h);
  }
  console.log(`rasterized ${tasks.length} PNGs into brand/png/`);
  await browser.close();
})();
