/**
 * Verify — Dashboard KPI extension.
 * Probes: 6-cell primary strip (Balance + sparkline, Net P&L, Win rate with
 * avg-per-strategy sub), 5-cell performance strip (Total trades, Avg R:R,
 * Avg win, Avg loss, Drawdown now), equity chips (Drawdown now), monthly
 * goals card (4 direction-aware rows + API probe), recent trades (≤5 rows,
 * link), product & usage band (active users dot, trades logged, seeded usage
 * time "1h 35m", retention), light theme + mobile 390px, 0 console errors.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

/** Local calendar day key in the Node process (headless browser shares TZ). */
function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
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
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  // Seed the usage tracker's localStorage before any page load: 95 min today.
  const usagePayload = JSON.stringify({ [localDayKey()]: 95 });
  const seedUsage = (target) =>
    target.addInitScript(
      ([key, payload]) => window.localStorage.setItem(key, payload),
      ["cosmoz:usage:v1", usagePayload],
    );
  seedUsage(page);

  // ── Sign in (demo account) — every app route sits behind AuthGate ────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const fillDemo = page.locator('[data-testid="fill-demo"]');
  if (await fillDemo.isVisible().catch(() => false)) {
    await fillDemo.click();
  } else {
    await page.locator("#login-email").fill("trader@cosmoz.app");
    await page.locator("#login-password").fill("cosmoz-demo-2026");
  }
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForFunction(
    (base) => window.location.pathname === new URL(base).pathname || window.location.pathname === "/",
    BASE,
    { timeout: 15000 },
  );
  await page.locator('[data-testid="performance-strip"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);

  // ── 1. Primary KPI strip — 6 cells, Balance leads ─────────────────────────
  const kpiStrip = page.locator('section[aria-label="Key performance indicators"]');
  const kpiCells = kpiStrip.locator(".stat-cell");
  const kpiCount = await kpiCells.count();
  check("Primary strip has 6 cells", kpiCount === 6, `${kpiCount} cells`);

  const balanceCell = kpiCells.nth(0);
  check("Balance cell leads the strip", (await balanceCell.textContent())?.includes("Balance") ?? false);
  const balanceValue = await balanceCell.locator("div.font-mono").first().textContent();
  check("Balance value rendered", /\d/.test(balanceValue ?? ""), balanceValue ?? "none");
  check("Balance shows starting sub", (await balanceCell.textContent())?.includes("Start") ?? false);
  check("Balance carries equity sparkline", (await balanceCell.locator("svg").count()) === 1);

  const netPnlCell = kpiCells.nth(1);
  check("Net P&L cell follows", (await netPnlCell.textContent())?.includes("Net P&L") ?? false);

  const winRateCell = kpiCells.nth(2);
  const winRateText = (await winRateCell.textContent()) ?? "";
  check(
    "Win rate shows avg-per-strategy sub",
    winRateText.includes("Avg per strategy"),
    winRateText.slice(0, 80),
  );
  const avgSubMatch = winRateText.match(/Avg per strategy\s+([\d\s,.]+)\s%/);
  // fr-FR: thin-space thousands separators, comma decimal → "4 448,0" / "44,5"
  const avgSubPct = avgSubMatch
    ? Number(avgSubMatch[1].replace(/\s/g, "").replace(",", "."))
    : NaN;
  check("Avg-per-strategy sub is a plausible % (≤ 100)", Number.isFinite(avgSubPct) && avgSubPct <= 100, String(avgSubPct));

  // ── 2. Performance strip — 5 cells ─────────────────────────────────────────
  const perfStrip = page.locator('[data-testid="performance-strip"]');
  const perfCells = perfStrip.locator(".stat-cell");
  const perfCount = await perfCells.count();
  check("Performance strip has 5 cells", perfCount === 5, `${perfCount} cells`);

  const totalTrades = await perfCells.nth(0).locator("div.font-mono").first().textContent();
  check("Total trades is numeric", /^\d+$/.test((totalTrades ?? "").replace(/\s/g, "")), totalTrades ?? "none");

  const avgRR = await perfCells.nth(1).locator("div.font-mono").first().textContent();
  check("Avg R:R renders ratio", /:\s*1/.test(avgRR ?? ""), avgRR ?? "none");

  const avgWin = await perfCells.nth(2).locator("div.font-mono").first().textContent();
  check("Avg win renders money", /\d/.test(avgWin ?? ""), avgWin ?? "none");
  const avgLoss = await perfCells.nth(3).locator("div.font-mono").first().textContent();
  check("Avg loss renders money", /\d/.test(avgLoss ?? ""), avgLoss ?? "none");

  const ddNow = await perfCells.nth(4).locator("div.font-mono").first().textContent();
  check("Drawdown now renders %", /%/.test(ddNow ?? ""), ddNow ?? "none");
  const ddSub = (await perfCells.nth(4).textContent()) ?? "";
  check("Drawdown shows max sub", ddSub.includes("Max"), ddSub.slice(0, 60));

  // ── 3. Equity chips include Drawdown now ───────────────────────────────────
  const ddChip = page.getByText("Drawdown now", { exact: true }).first();
  check("Equity hero has Drawdown now chip", await ddChip.isVisible());

  // ── 4. Monthly goals card ──────────────────────────────────────────────────
  const goalsCard = page.locator('[data-testid="goals-card"]');
  check("Goals card visible", await goalsCard.isVisible());
  const goalRows = goalsCard.locator('[data-testid^="goal-row-"]');
  const goalRowCount = await goalRows.count();
  check("4 goal rows", goalRowCount === 4, `${goalRowCount} rows`);
  for (const key of ["net_pnl", "trades", "win_rate_floor", "max_dd_cap"]) {
    const fill = goalsCard.locator(`[data-testid="goal-fill-${key}"]`);
    const exists = (await fill.count()) === 1;
    check(`Goal bar ${key} present`, exists);
    if (exists) {
      const val = Number(await fill.getAttribute("aria-valuenow"));
      check(`Goal bar ${key} has numeric progress`, Number.isFinite(val) && val >= 0, String(val));
    }
  }
  const goalsDesc = (await goalsCard.locator("[data-slot=card-description], .text-muted-foreground").first().textContent()) ?? "";
  check(
    "Goals header shows month + on-track count",
    /\d\/4 on track/.test(goalsDesc) && goalsDesc.length > 5,
    goalsDesc.slice(0, 60),
  );
  const goalPct = await goalsCard.locator('[data-testid="goal-row-net_pnl"] .font-mono.font-semibold').textContent();
  check("Goal row shows percent label", /\d+%/.test(goalPct ?? ""), goalPct ?? "none");

  const goalsApi = await page.evaluate(async () => {
    const res = await fetch("/api/stats/goals");
    return res.json();
  });
  check(
    "API /stats/goals returns 4 goals",
    Array.isArray(goalsApi?.goals) && goalsApi.goals.length === 4,
    `currency=${goalsApi?.currency} label=${goalsApi?.monthLabel}`,
  );

  // ── 5. Recent trades card ──────────────────────────────────────────────────
  const recentCard = page.locator('[data-testid="recent-trades-card"]');
  await recentCard.locator('[data-testid="recent-trades-list"], [data-testid="recent-trades-empty"]').first().waitFor({ timeout: 15000 });
  const recentRows = recentCard.locator('[data-testid="recent-trades-list"] li');
  const recentCount = await recentRows.count();
  check("Recent trades shows between 1 and 5 rows", recentCount >= 1 && recentCount <= 5, `${recentCount} rows`);
  if (recentCount > 0) {
    const firstRow = (await recentRows.nth(0).textContent()) ?? "";
    check("First recent row has symbol + money", /[A-Z]{3,}/.test(firstRow) && /\d/.test(firstRow), firstRow.slice(0, 60));
    const profitTinted = await recentRows.nth(0).locator(".text-profit, .text-loss").count();
    check("First recent row has semantic P&L tint", profitTinted >= 1);
  }
  const viewAll = recentCard.getByRole("link", { name: /View all trades/ });
  check("View all trades link targets /trades", (await viewAll.getAttribute("href")) === "/trades");

  // ── 6. Product & usage band ────────────────────────────────────────────────
  const productBand = page.locator('[data-testid="product-band"]');
  check("Product band visible", await productBand.isVisible());

  const activeUsers = productBand.locator('[data-testid="product-active-users"]');
  const activeUsersText = (await activeUsers.textContent()) ?? "";
  check(
    "Active users cell — you, signed in, live dot",
    activeUsersText.includes("You · signed in") && (await activeUsers.locator(".animate-ping").count()) === 1,
  );

  const tradesLogged = productBand.locator('[data-testid="product-trades-logged"]');
  const tradesLoggedValue = (await tradesLogged.locator("div.font-mono").first().textContent()) ?? "";
  check("Trades logged is numeric", /^\d+$/.test(tradesLoggedValue.replace(/\s/g, "")), tradesLoggedValue);
  check("Trades logged shows month sub", ((await tradesLogged.textContent()) ?? "").includes("This month"));

  const usageCell = productBand.locator('[data-testid="product-usage"]');
  const usageValue = (await usageCell.locator("div.font-mono").first().textContent()) ?? "";
  check("Usage time reflects seeded 95 min → 1h 35m", usageValue.trim() === "1h 35m", usageValue);
  const usageMonth = (await usageCell.locator('[data-testid="usage-month"]').textContent()) ?? "";
  check("Usage month summary present", /\dh|\dm/.test(usageMonth), usageMonth);

  const retention = productBand.locator('[data-testid="product-retention"]');
  const retentionValue = (await retention.locator("div.font-mono").first().textContent()) ?? "";
  check("Retention renders %", /%/.test(retentionValue), retentionValue);
  check("Retention shows active-days sub", ((await retention.textContent()) ?? "").includes("of 30 active days"));

  const productApi = await page.evaluate(async () => {
    const res = await fetch("/api/stats/product");
    return res.json();
  });
  check(
    "API /stats/product sane",
    productApi?.activeUsers === 1 &&
      Number.isFinite(Number(productApi?.retentionPct)) &&
      Number(productApi?.retentionPct) >= 0 &&
      Number(productApi?.retentionPct) <= 1,
    `activeUsers=${productApi?.activeUsers} retention=${productApi?.retentionPct} days=${productApi?.activeDays30d}`,
  );

  // Full-page capture (dark-blue default)
  await page.screenshot({ path: "scripts/shots/dashboard-kpis/dark-blue-full.png", fullPage: true });
  await page.locator('[data-testid="goals-card"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "scripts/shots/dashboard-kpis/goals-recent.png" });

  // ── 7. Light theme ─────────────────────────────────────────────────────────
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.waitForTimeout(400);
  check("Goals card still visible in light theme", await page.locator('[data-testid="goals-card"]').isVisible());
  check("Performance strip still visible in light theme", await page.locator('[data-testid="performance-strip"]').isVisible());
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: "scripts/shots/dashboard-kpis/light-full.png", fullPage: true });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark-blue"));

  // ── 8. Mobile 390px (fresh context → own sign-in) ──────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  seedUsage(mobile);
  mobile.on("pageerror", (err) => errors.push(`mobile: ${String(err)}`));
  await mobile.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(800);
  const mobileDemo = mobile.locator('[data-testid="fill-demo"]');
  if (await mobileDemo.isVisible().catch(() => false)) {
    await mobileDemo.click();
  } else {
    await mobile.locator("#login-email").fill("trader@cosmoz.app");
    await mobile.locator("#login-password").fill("cosmoz-demo-2026");
  }
  await mobile.getByRole("button", { name: /Sign in/ }).click();
  await mobile.locator('[data-testid="performance-strip"]').waitFor({ timeout: 20000 });
  await mobile.waitForTimeout(800);

  const mobileUsage = (await mobile.locator('[data-testid="product-usage"] div.font-mono').first().textContent()) ?? "";
  check("Mobile usage cell seeded", mobileUsage.trim() === "1h 35m", mobileUsage);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Mobile 390px — no horizontal overflow", overflow <= 0, `overflow=${overflow}px`);
  await mobile.screenshot({ path: "scripts/shots/dashboard-kpis/mobile-390.png", fullPage: true });

  await browser.close();

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} PASS · console errors: ${errors.length}`);
  errors.slice(0, 6).forEach((e) => console.log(`  console: ${e.slice(0, 200)}`));
  process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
})();
