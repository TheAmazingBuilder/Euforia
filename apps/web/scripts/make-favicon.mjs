/**
 * make-favicon.mjs - regenerate the Cosmoz favicon set from src/app/icon.svg.
 *
 * Renders the SVG with headless Chromium at 16/32/48 px, packs the PNGs into
 * a multi-resolution `favicon.ico`, and renders a 180 px `apple-icon.png`.
 * Both files land in `apps/web/src/app/` (Next.js metadata conventions).
 *
 * Usage: node scripts/make-favicon.mjs   (from apps/web)
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "src", "app");
const svg = readFileSync(join(appDir, "icon.svg"), "utf8");

const SIZES = [16, 32, 48];
const APPLE = 180;

function svgAt(size) {
  return svg.replace(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">`,
  );
}

/** Pack PNG blobs into a multi-image .ico (PNG-in-ICO, valid since Vista). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  const blobs = [];
  let offset = 6 + 16 * images.length;
  for (const { size, buf } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit depth
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(buf);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 256, height: 256 },
  deviceScaleFactor: 1,
});

const shots = [];
for (const size of SIZES) {
  await page.setContent(
    `<body style="margin:0"><div id="m" style="width:${size}px;height:${size}px">${svgAt(size)}</div></body>`,
  );
  const raw = await page.locator("#m").screenshot({ type: "png" });
  // ICO decoders require RGBA - Chromium screenshots come out RGB.
  const buf = await sharp(raw).ensureAlpha().png().toBuffer();
  shots.push({ size, buf });
  console.log(`rendered ${size}px (${buf.length} bytes)`);
}

await page.setContent(
  `<body style="margin:0"><div id="m" style="width:${APPLE}px;height:${APPLE}px">${svgAt(APPLE)}</div></body>`,
);
const rawApple = await page.locator("#m").screenshot({ type: "png" });
const apple = await sharp(rawApple).ensureAlpha().png().toBuffer();
console.log(`rendered ${APPLE}px apple-icon (${apple.length} bytes)`);

await browser.close();

const ico = buildIco(shots);
writeFileSync(join(appDir, "favicon.ico"), ico);
writeFileSync(join(appDir, "apple-icon.png"), apple);
console.log(
  `wrote favicon.ico (${ico.length} bytes) + apple-icon.png (${apple.length} bytes)`,
);
