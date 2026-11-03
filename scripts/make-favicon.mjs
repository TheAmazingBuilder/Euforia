// make-favicon.mjs - génère favicon.ico + apple-icon.png depuis app/icon.svg
// Usage : node /home/z/my-project/scripts/make-favicon.mjs
// Prérequis : playwright + chromium installés (node require('playwright') OK)
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const SVG_PATH = "/home/z/my-project/apps/web/src/app/icon.svg";
const OUT_DIR = "/home/z/my-project/apps/web/src/app";
const ICO_SIZES = [16, 32, 48];
const APPLE_SIZE = 180;

const svgDataUrl = `data:image/svg+xml;base64,${readFileSync(SVG_PATH).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function renderPng(size) {
  await page.setContent(
    `<body style="margin:0;background:transparent"><img id="target" src="${svgDataUrl}" style="display:block;width:${size}px;height:${size}px" /></body>`,
    { waitUntil: "networkidle" },
  );
  return page.locator("#target").screenshot({ omitBackground: true });
}

const pngs = [];
for (const size of ICO_SIZES) {
  const buf = await renderPng(size);
  pngs.push({ size, buf });
  console.log(`PNG ${size}x${size} : ${buf.length} octets`);
}

const apple = await renderPng(APPLE_SIZE);
await browser.close();

// --- Assemblage ICO (images PNG embarquées, format "PNG-in-ICO" officiel) ---
function makeIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o); // width
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1); // height
    dir.writeUInt8(0, o + 2); // palette
    dir.writeUInt8(0, o + 3); // reserved
    dir.writeUInt16LE(1, o + 4); // color planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(e.buf.length, o + 8); // data size
    dir.writeUInt32LE(offset, o + 12); // data offset
    offset += e.buf.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.buf)]);
}

writeFileSync(`${OUT_DIR}/favicon.ico`, makeIco(pngs));
writeFileSync(`${OUT_DIR}/apple-icon.png`, apple);
console.log(`favicon.ico : ${ICO_SIZES.join("/")} - ${pngs.reduce((n, e) => n + e.buf.length, 0)} octets de données`);
console.log(`apple-icon.png : ${APPLE_SIZE}x${APPLE_SIZE}`);
console.log("OK");
