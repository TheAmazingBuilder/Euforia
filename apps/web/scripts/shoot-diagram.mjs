// Screenshot the architecture diagram at 2x device scale for print quality (300dpi).
// Run from apps/web so `playwright` resolves: node scripts/shoot-diagram.mjs
import { chromium } from "playwright";
const html = "file:///home/z/my-project/scripts/audit-session-live/diagram.html";
const out = "/home/z/my-project/scripts/audit-session-live/diagram.png";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 940, height: 700 },
  deviceScaleFactor: 2,
});
await page.goto(html, { waitUntil: "networkidle" });
await page.locator("#diagram").screenshot({ path: out });
await browser.close();
console.log("diagram ->", out);
