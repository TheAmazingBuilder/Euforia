/**
 * Render the corrected Euforia SVGs and build a side-by-side against the
 * user's reference image (playwright rasterization — no sharp available).
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BRAND = "/home/z/my-project/apps/web/public/brand";
const OUT = "/home/z/my-project/scripts/shots";
const REF = "/home/z/my-project/upload/pasted_image_1791318148190.png";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  async function svgPng(svgFile, width, height, out) {
    const svg = fs.readFileSync(path.join(BRAND, svgFile), "utf8");
    const html = `<!doctype html><body style="margin:0;background:#020617">
      <div style="width:${width}px;height:${height}px">${svg
        .replace("<svg ", `<svg width="${width}" height="${height}" `)}
      </div></body>`;
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(html);
    await page.waitForTimeout(250);
    await page.screenshot({ path: out });
    await page.close();
    console.log("rendered", out);
  }

  // mark + icon renders for inspection
  await svgPng("euforia-mark.svg", 335, 409, `${OUT}/new-mark.png`);
  await svgPng("euforia-icon.svg", 256, 256, `${OUT}/new-icon.png`);

  await browser.close();

  // side-by-side: reference crop | new mark render
  const { execSync } = require("child_process");
  execSync(`python3 - << 'EOF'
from PIL import Image
ref = Image.open("${REF}").convert("RGBA").crop((185, 435, 455, 770)).resize((335, 409), Image.LANCZOS)
new = Image.open("${OUT}/new-mark.png").convert("RGBA")
canvas = Image.new("RGBA", (700, 409), (2, 6, 23, 255))
canvas.paste(ref, (5, 0), ref)
canvas.paste(new, (360, 0), new)
canvas.save("${OUT}/e-compare-v2.png")
print("saved ${OUT}/e-compare-v2.png — LEFT reference | RIGHT new")
EOF`);
  await browser.close();
})();
