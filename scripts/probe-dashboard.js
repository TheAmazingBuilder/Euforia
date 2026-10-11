/**
 * Probe — bounding boxes of dashboard cards to diagnose the overlap.
 * Usage: node scripts/probe-dashboard.js
 */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => {
    const out = [];
    const cards = document.querySelectorAll("[data-slot='card']");
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const title = c.querySelector("[data-slot='card-title']")?.textContent?.trim() ?? "?";
      const style = getComputedStyle(c);
      out.push({
        i,
        title: title.slice(0, 30),
        x: Math.round(r.x),
        y: Math.round(r.y + window.scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height),
        z: style.zIndex,
        transform: style.transform !== "none" ? style.transform.slice(0, 40) : "none",
      });
    });
    return out;
  });
  console.table(info);

  // Check specific overlap: coach insights vs heatmap
  const overlap = await page.evaluate(() => {
    const find = (t) =>
      [...document.querySelectorAll("[data-slot='card']")].find((c) =>
        (c.querySelector("[data-slot='card-title']")?.textContent ?? "").includes(t),
      );
    const a = find("Coach insights");
    const b = find("Performance heatmap");
    if (!a || !b) return { found: false };
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return {
      found: true,
      coach: { top: Math.round(ra.top + scrollY), bottom: Math.round(ra.bottom + scrollY) },
      heat: { top: Math.round(rb.top + scrollY), bottom: Math.round(rb.bottom + scrollY) },
      overlapping: ra.top < rb.bottom && rb.top < ra.bottom,
    };
  });
  console.log(JSON.stringify(overlap, null, 2));

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
