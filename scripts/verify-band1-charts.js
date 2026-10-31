/**
 * Verify - Dashboard Band 1 re-flow + chart vivacity pass.
 * Probes: band 1 = 6 cells in a 2-ledger strip (hero money row full halves,
 * ratio row 4-across at 1440), single-line labels (no wrap), sparkline in
 * EVERY cell with ≥ 4 distinct palette colors, delta riding the value row;
 * performance strip visuals (14-day MiniBars, R:R split meter, P&L-tinted
 * avg win/loss, drawdown gauge); product band (month-share meter, usage
 * bars, retention ring); discipline saved ghost-trend canvas + legend;
 * colored hero chips; light theme; 390px no overflow; 0 console errors.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const SHOTS = "scripts/shots/band1";

function localDayKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);

  // Seed 14 days of usage so the usage MiniBars have a real story.
  const usageRecord = {};
  [0, 1, 2, 4, 5, 7, 8, 11].forEach((off, i) => {
    usageRecord[localDayKey(off)] = [95, 42, 130, 18, 77, 61, 12, 105][i];
  });
  await page.addInitScript(
    ([key, payload]) => window.localStorage.setItem(key, payload),
    ["cosmoz:usage:v1", JSON.stringify(usageRecord)],
  );

  // ── Sign in (demo account) ────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const fillDemo = page.locator('[data-testid="fill-demo"]');
  if (await fillDemo.isVisible().catch(() => false)) {
    await fillDemo.click();
  } else {
    await page.locator("#login-email").fill("alex@cosmoz.app");
    await page.locator("#login-password").fill("cosmoz123");
  }
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForFunction(
    () => window.location.pathname === "/" || window.location.pathname === "/dashboard",
    { timeout: 15000 },
  );
  await page.locator('[data-testid="performance-strip"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);

  // ── 1. Band 1 - 2-ledger layout ───────────────────────────────────────────
  const kpiStrip = page.locator('section[aria-label="Key performance indicators"]');
  const kpiCells = kpiStrip.locator(".stat-cell");
  const kpiCount = await kpiCells.count();
  check("Band 1 has 6 cells", kpiCount === 6, `${kpiCount} cells`);

  const widths = [];
  for (let i = 0; i < kpiCount; i += 1) {
    widths.push(await kpiCells.nth(i).evaluate((el) => el.getBoundingClientRect().width));
  }
  const heroWidths = widths.slice(0, 2);
  const stdWidths = widths.slice(2);
  check(
    "Hero cells own the first row (≥ 480px at 1440)",
    heroWidths.every((w) => w >= 480),
    heroWidths.map((w) => Math.round(w)).join(" / "),
  );
  check(
    "Ratio cells share the second row (≥ 260px at 1440)",
    stdWidths.every((w) => w >= 260),
    stdWidths.map((w) => Math.round(w)).join(" / "),
  );

  // Single-line labels - the "trop serré" fix.
  let wrappedLabels = 0;
  for (let i = 0; i < kpiCount; i += 1) {
    const h = await kpiCells
      .nth(i)
      .locator(".ledger-label")
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
    if (h > 22) wrappedLabels += 1;
  }
  check("All band-1 labels stay on one line", wrappedLabels === 0, `${wrappedLabels} wrapped`);

  // Every cell carries a sparkline; palette variety ≥ 4 distinct colors.
  // NOTE: the delta arrow is also an svg - target the sparkline polyline.
  const strokeColors = [];
  for (let i = 0; i < kpiCount; i += 1) {
    const polyline = kpiCells.nth(i).locator("svg polyline").first();
    const stroke = (await polyline.count()) > 0 ? await polyline.getAttribute("stroke") : null;
    strokeColors.push(stroke);
  }
  check(
    "All 6 band-1 cells have a sparkline",
    strokeColors.every((c) => Boolean(c)),
    strokeColors.join(", "),
  );
  const distinct = new Set(strokeColors).size;
  check("Sparkline palette is varied (≥ 4 colors)", distinct >= 4, `${distinct} colors`);

  // Deltas ride the value row (arrow marks present in 5 delta cells).
  let deltaCells = 0;
  for (let i = 1; i < kpiCount; i += 1) {
    const arrows = await kpiCells.nth(i).locator("svg.lucide-arrow-up-right, svg.lucide-arrow-down-right, svg.lucide-minus").count();
    if (arrows > 0) deltaCells += 1;
  }
  check("5 delta marks render in band 1", deltaCells === 5, `${deltaCells}/5`);

  await page.screenshot({ path: `${SHOTS}/dark-blue-full.png`, fullPage: true });
  await kpiStrip.screenshot({ path: `${SHOTS}/dark-blue-band1.png` });

  // ── 2. Performance strip visuals ──────────────────────────────────────────
  const perfStrip = page.locator('[data-testid="performance-strip"]');
  const perfCells = perfStrip.locator(".stat-cell");

  const tradeBars = await perfCells.nth(0).locator("svg rect").count();
  check("Total trades shows 14-day activity bars", tradeBars >= 12, `${tradeBars} bars`);

  const rrMeter = await perfCells.nth(1).locator("div.rounded-full > div").count();
  check("Avg R:R shows win/loss split meter", rrMeter === 2, `${rrMeter} segments`);

  const winClass = await perfCells.nth(2).locator("span.font-mono").first().getAttribute("class");
  const lossClass = await perfCells.nth(3).locator("span.font-mono").first().getAttribute("class");
  check("Avg win value in profit ink", (winClass ?? "").includes("text-profit"), winClass ?? "");
  check("Avg loss value in loss ink", (lossClass ?? "").includes("text-loss"), lossClass ?? "");

  const ddFill = await perfCells
    .nth(4)
    .locator("div.rounded-full > div")
    .first()
    .getAttribute("class");
  check("Drawdown gauge fill present", (ddFill ?? "").includes("bg-"), ddFill ?? "");

  // ── 3. Product band visuals ───────────────────────────────────────────────
  const productBand = page.locator('[data-testid="product-band"]');
  await productBand.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const productCells = productBand.locator(".stat-cell");

  const monthMeter = await productCells.nth(1).locator("div.rounded-full > div").count();
  check("Trades logged shows month-share meter", monthMeter === 2, `${monthMeter} segments`);

  const usageBars = await productCells.nth(2).locator("svg rect").count();
  check("Usage time shows 14-day bars", usageBars >= 12, `${usageBars} bars`);

  const ring = productCells.nth(3).locator("svg circle");
  check("Retention ring renders (2 circles)", (await ring.count()) === 2, `${await ring.count()}`);
  const ringCenter = await productCells.nth(3).locator("span.font-mono.absolute").textContent();
  check("Retention ring center readout", /\/30/.test(ringCenter ?? ""), ringCenter ?? "none");

  await productBand.screenshot({ path: `${SHOTS}/dark-blue-product.png` });

  // ── 4. Discipline saved - ghost trend chart ───────────────────────────────
  const ghostCanvas = await page.locator("canvas").count();
  check("Ghost trend chart canvas renders", ghostCanvas >= 1, `${ghostCanvas} canvas`);
  const legendText = (await page.locator('[data-testid="ghost-legend"]').textContent()) ?? "";
  check(
    "Legend shows Discipline/Fear counts",
    /Discipline\s*\d+/.test(legendText) && /Fear\s*\d+/.test(legendText),
    legendText.slice(0, 60),
  );

  // ── 5. Colored hero chips ─────────────────────────────────────────────────
  const chipDots = await page
    .locator('span.inline-flex.items-center span[class*="bg-accent"], span.inline-flex.items-center span[class*="bg-loss"], span.inline-flex.items-center span[class*="bg-warning"]')
    .count();
  check("Hero chips carry colored dots (≥ 3)", chipDots >= 3, `${chipDots} dots`);

  // ── 6. Light theme (real switcher → tokens + charts re-resolve) ──────────
  await page.locator('button:has(svg.lucide-sun), button:has(svg.lucide-moon), [aria-label*="heme"]').first().click();
  await page.waitForTimeout(400);
  await page.getByRole("menuitem", { name: "Light" }).click();
  await page.waitForTimeout(1100);
  // Active wait: the win-rate sparkline stroke must re-resolve to the light token.
  let lightStroke = null;
  try {
    await page.waitForFunction(
      (darkStroke) => {
        const polyline = document.querySelector(
          'section[aria-label="Key performance indicators"] .stat-cell:nth-child(3) svg polyline',
        );
        return polyline !== null && polyline.getAttribute("stroke") !== darkStroke;
      },
      strokeColors[2],
      { timeout: 6000 },
    );
  } catch {
    // fall through - the check below reports the mismatch
  }
  lightStroke = await kpiCells.nth(2).locator("svg polyline").first().getAttribute("stroke");
  check(
    "Sparkline color follows theme switch",
    Boolean(lightStroke) && lightStroke !== strokeColors[2],
    `${lightStroke} (was ${strokeColors[2]})`,
  );
  await page.screenshot({ path: `${SHOTS}/light-full.png`, fullPage: true });

  // ── 7. Mobile 390 - no overflow, band re-flows ────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[mobile] ${msg.text()}`);
  });
  mobile.on("pageerror", (err) => errors.push(`[mobile] ${String(err)}`));
  await mobile.addInitScript(
    ([key, payload]) => window.localStorage.setItem(key, payload),
    ["cosmoz:usage:v1", JSON.stringify(usageRecord)],
  );
  await mobile.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(600);
  const mDemo = mobile.locator('[data-testid="fill-demo"]');
  if (await mDemo.isVisible().catch(() => false)) {
    await mDemo.click();
  } else {
    await mobile.locator("#login-email").fill("alex@cosmoz.app");
    await mobile.locator("#login-password").fill("cosmoz123");
  }
  await mobile.getByRole("button", { name: /Sign in/ }).click();
  await mobile.waitForFunction(
    () => window.location.pathname === "/" || window.location.pathname === "/dashboard",
    { timeout: 15000 },
  );
  await mobile.locator('[data-testid="performance-strip"]').waitFor({ timeout: 20000 });
  await mobile.waitForTimeout(900);

  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Mobile 390px: no horizontal overflow", overflow <= 1, `${overflow}px`);
  const mHeroW = await mobile
    .locator('section[aria-label="Key performance indicators"] .stat-cell')
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);
  check("Mobile: hero cell spans full width (≥ 340px)", mHeroW >= 340, `${Math.round(mHeroW)}px`);
  await mobile.screenshot({ path: `${SHOTS}/mobile-390.png`, fullPage: true });

  // ── 8. Console errors ─────────────────────────────────────────────────────
  const realErrors = errors.filter(
    (e) => !/4\d\d|Failed to load resource| AbortError/i.test(e),
  );
  check("0 console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exit(1);
});
