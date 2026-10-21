/**
 * Prove the playbook stagger: poll for the first strategy card to mount,
 * then sample its wrapper opacity immediately (stagger → opacity < 1 early).
 * Usage: node scripts/probe-stagger.js
 */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/playbook");
  await page.waitForLoadState("domcontentloaded");

  // Poll every 30ms: as soon as the grid mounts, record first item opacity.
  const samples = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const seen = [];
        const timer = setInterval(() => {
          const grid = document.querySelector(".grid.gap-4");
          const item = grid?.children?.[0];
          if (item) {
            const style = getComputedStyle(item);
            seen.push({
              t: seen.length * 30,
              opacity: Number(style.opacity).toFixed(2),
              transform: style.transform === "none" ? "none" : "translated",
            });
            if (seen.length >= 10) {
              clearInterval(timer);
              resolve(seen);
            }
          }
        }, 30);
        setTimeout(() => {
          clearInterval(timer);
          resolve(seen);
        }, 8000);
      }),
  );
  console.table(samples);
  const rose = samples.some((s) => Number(s.opacity) < 1);
  console.log(`stagger animation observed: ${rose ? "YES" : "NO (may have finished before first poll)"}`);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
