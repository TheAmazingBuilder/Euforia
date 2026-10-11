/**
 * Design refonte verification:
 *  - full-page captures, all routes (dark-blue default)
 *  - dashboard on dark + light themes
 *  - equity range-chip interaction (30J) — differentiated curve
 *  - session toast artifact probe (viewport shot + DOM overlap check)
 *  - mobile 390 dashboard + sidebar collapsed state
 * Usage: node scripts/verify-refonte.js
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = "/home/z/my-project/scripts/refonte";

const ROUTES = [
  ["/", "dashboard"],
  ["/trades", "trades"],
  ["/session", "session"],
  ["/playbook", "playbook"],
  ["/discipline", "discipline"],
  ["/analytics", "analytics"],
  ["/goals", "goals"],
  ["/journal", "journal"],
];

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
}

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // 1) Desktop captures — dark-blue
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  for (const [route, name] of ROUTES) {
    await page.goto(BASE + route);
    await settle(page);
    await page.screenshot({ path: `${OUT}/rf-${name}.png`, fullPage: true });
    console.log("captured", name);
  }

  // 2) Equity range chips — click 30J, capture card only
  await page.goto(BASE + "/");
  await settle(page);
  const chip = page.getByRole("button", { name: "30J", exact: true });
  await chip.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/rf-equity-30d.png`, fullPage: false });
  const chartMeta = await page.evaluate(() => {
    const card = document.querySelector('[class*="card-sheen"]')?.closest("div");
    const canvas = document.querySelector("canvas");
    return { hasCanvas: !!canvas, canvasH: canvas?.clientHeight ?? 0 };
  });
  console.log("equity-30d", JSON.stringify(chartMeta));

  // 3) Themes — dashboard dark + light
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => {
      localStorage.setItem("theme", t);
      document.documentElement.setAttribute("data-theme", t);
    }, theme);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/rf-theme-${theme}.png`, fullPage: false });
    console.log("captured theme", theme);
  }
  await ctx.close();

  // 4) Session toast probe — VIEWPORT shot (fixed toasts land bottom-right)
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + "/session");
  await p2.waitForLoadState("networkidle");
  await p2.waitForTimeout(1800);
  const toastInfo = await p2.evaluate(() => {
    const region = document.querySelector("[data-sonner-toaster]");
    const toasts = region ? region.querySelectorAll("[data-sonner-toast]") : [];
    return {
      toasterPresent: !!region,
      toastCount: toasts.length,
      positions: Array.from(toasts).map((t) => {
        const r = t.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
      }),
    };
  });
  console.log("session-toasts", JSON.stringify(toastInfo));
  await p2.screenshot({ path: `${OUT}/rf-session-viewport.png`, fullPage: false });
  // Timeline DOM overlap check (real overlap vs screenshot artifact)
  const overlap = await p2.evaluate(() => {
    const items = document.querySelectorAll('ol[aria-label="Today\'s session timeline"] li');
    const rects = Array.from(items).map((el) => el.getBoundingClientRect());
    let overlapping = 0;
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i], b = rects[j];
        const intersects =
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        if (intersects) overlapping += 1;
      }
    }
    return { items: items.length, overlappingPairs: overlapping };
  });
  console.log("timeline-overlap", JSON.stringify(overlap));
  await ctx2.close();

  // 5) Mobile 390 — dashboard + collapsed sidebar desktop
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await ctx3.newPage();
  await p3.goto(BASE + "/");
  await settle(p3);
  await p3.screenshot({ path: `${OUT}/rf-mobile-dashboard.png`, fullPage: true });
  await p3.goto(BASE + "/goals");
  await settle(p3);
  await p3.screenshot({ path: `${OUT}/rf-mobile-goals.png`, fullPage: false });
  await ctx3.close();

  const ctx4 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p4 = await ctx4.newPage();
  await p4.goto(BASE + "/");
  await settle(p4);
  await p4.getByRole("button", { name: "Collapse sidebar" }).click();
  await p4.waitForTimeout(500);
  await p4.screenshot({ path: `${OUT}/rf-sidebar-collapsed.png`, fullPage: false });
  // glide indicator: click another nav item, indicator should move (layoutId)
  await p4.getByRole("link", { name: "Analytics" }).click();
  await p4.waitForTimeout(700);
  await p4.screenshot({ path: `${OUT}/rf-sidebar-glide.png`, fullPage: false });
  await ctx4.close();

  await browser.close();
  console.log("console-errors:", consoleErrors.length ? JSON.stringify(consoleErrors.slice(0, 5)) : "NONE");
  console.log("DONE");
})();
