/**
 * Verify — Dashboard P&L charts + Open positions KPI + topbar user menu.
 * Probes: cumulative P&L card (canvas + end label data + accent area),
 * daily P&L card (canvas with BOTH profit- and loss-colored bars),
 * open positions KPI (count 2, BUY/SELL split, Σ risk, rows with symbol +
 * strategy + entry + risk, session link), /stats/overview cumulativePnl
 * contract, user menu (identity block, profile/settings/help destinations,
 * destructive log out → /login), light theme canvas survival, 390px
 * overflow, 0 console errors.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const SHOTS = "scripts/shots/dashboard-pnl";

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
  await page.waitForTimeout(1200);

  // ── 1. API contract — cumulativePnl rides the overview payload ───────────
  const api = await page.evaluate(async () => {
    const token = JSON.parse(window.localStorage.getItem("cosmoz:session") ?? "null")?.token;
    const res = await fetch("/api/stats/overview", {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return res.json();
  });
  const cum = Array.isArray(api?.cumulativePnl) ? api.cumulativePnl : null;
  check(
    "GET /stats/overview exposes cumulativePnl",
    cum !== null && cum.length > 0,
    cum ? `${cum.length} points` : "missing",
  );
  check(
    "cumulativePnl aligns with dailyPnl (same day count)",
    cum !== null && Array.isArray(api.dailyPnl) && cum.length === api.dailyPnl.length,
    cum && api.dailyPnl ? `${cum.length} vs ${api.dailyPnl.length}` : "",
  );
  const lastCum = cum ? Number(cum[cum.length - 1]?.cumPnl) : NaN;
  check(
    "Last cumulative point equals total netPnl",
    Number.isFinite(lastCum) && Math.abs(lastCum - Number(api.netPnl)) < 0.05,
    `${lastCum} vs ${api.netPnl}`,
  );

  // ── 2. Cumulative P&L card — canvas + accent area ─────────────────────────
  const cumCard = page.locator('[data-testid="cumulative-pnl-card"]');
  await cumCard.waitFor({ timeout: 10000 });
  check("Cumulative P&L card renders", await cumCard.isVisible());
  const cumCanvasInfo = await cumCard.evaluate(() => {
    const canvas = document.querySelector('[data-testid="cumulative-pnl-card"] canvas');
    if (!canvas) return null;
    return { w: canvas.clientWidth, h: canvas.clientHeight };
  });
  check(
    "Cumulative P&L canvas painted (≥ 300×180)",
    cumCanvasInfo !== null && cumCanvasInfo.w >= 300 && cumCanvasInfo.h >= 180,
    cumCanvasInfo ? `${cumCanvasInfo.w}×${cumCanvasInfo.h}` : "no canvas",
  );

  // ── 3. Daily P&L card — canvas with BOTH sign colors ──────────────────────
  const dailyCard = page.locator('[data-testid="daily-pnl-card"]');
  await dailyCard.waitFor({ timeout: 10000 });
  check("Daily P&L card renders", await dailyCard.isVisible());
  const barPixels = await dailyCard.evaluate(() => {
    const canvas = document.querySelector('[data-testid="daily-pnl-card"] canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const style = getComputedStyle(document.documentElement);
    const toRgb = (hex) => {
      const h = hex.trim();
      return [
        parseInt(h.slice(1, 3), 16),
        parseInt(h.slice(3, 5), 16),
        parseInt(h.slice(5, 7), 16),
      ];
    };
    const profit = toRgb(style.getPropertyValue("--profit"));
    const loss = toRgb(style.getPropertyValue("--loss"));
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const near = (px, rgb) =>
      Math.abs(px[0] - rgb[0]) <= 12 && Math.abs(px[1] - rgb[1]) <= 12 && Math.abs(px[2] - rgb[2]) <= 12;
    let profitPx = 0;
    let lossPx = 0;
    for (let i = 0; i < data.length; i += 4) {
      const px = [data[i], data[i + 1], data[i + 2]];
      if (near(px, profit)) profitPx += 1;
      else if (near(px, loss)) lossPx += 1;
    }
    return { profitPx, lossPx, w: width, h: height };
  });
  check(
    "Daily P&L canvas painted (≥ 900×160)",
    barPixels !== null && barPixels.w >= 900 && barPixels.h >= 160,
    barPixels ? `${barPixels.w}×${barPixels.h}` : "no canvas",
  );
  check(
    "Daily P&L has green (profit) bars",
    barPixels !== null && barPixels.profitPx > 200,
    barPixels ? `${barPixels.profitPx} profit px` : "",
  );
  check(
    "Daily P&L has red (loss) bars",
    barPixels !== null && barPixels.lossPx > 200,
    barPixels ? `${barPixels.lossPx} loss px` : "",
  );

  // ── 4. Open positions KPI ─────────────────────────────────────────────────
  const openCard = page.locator('[data-testid="open-positions-card"]');
  await openCard.waitFor({ timeout: 10000 });
  const countText = (await openCard.locator('[data-testid="open-positions-count"]').textContent())?.trim();
  check("Open positions KPI shows 2 seeded positions", countText === "2", `count=${countText}`);
  const splitText = (await openCard.locator('[data-testid="open-positions-split"]').textContent())?.trim();
  check(
    "BUY/SELL split present (BUY 1 · SELL 1)",
    /BUY\s*1/.test(splitText ?? "") && /SELL\s*1/.test(splitText ?? ""),
    splitText ?? "missing",
  );
  const riskText = (await openCard.locator('[data-testid="open-positions-kpi"]').textContent()) ?? "";
  check("Σ risk money readout present", /Σ risk/.test(riskText) && /\d/.test(riskText), riskText.slice(0, 60));
  const rows = openCard.locator('[data-testid="open-position-row"]');
  const rowCount = await rows.count();
  check("Open position rows list both positions", rowCount === 2, `${rowCount} rows`);
  const rowTexts = (await rows.allTextContents()).join(" | ");
  check(
    "Rows carry symbols (BOOM500, EURUSD)",
    rowTexts.includes("BOOM500") && rowTexts.includes("EURUSD"),
  );
  check(
    "Rows carry strategy names + entry + risk",
    /entry/.test(rowTexts) && /\d/.test(rowTexts) && rowTexts.length > 40,
  );
  const sessionLink = openCard.getByRole("link", { name: /Open the live session/ });
  check("Session link present → /session", (await sessionLink.count()) === 1 && (await sessionLink.getAttribute("href")) === "/session");

  // Band layout: cumulative spans 3, open positions spans 2 at 1440.
  const cumW = await cumCard.evaluate((el) => el.getBoundingClientRect().width);
  const openW = await openCard.evaluate((el) => el.getBoundingClientRect().width);
  check(
    "P&L band halves align (cum ≥ open width, both ≥ 380px)",
    cumW >= 380 && openW >= 380 && cumW > openW,
    `${Math.round(cumW)} vs ${Math.round(openW)}`,
  );

  await page.screenshot({ path: `${SHOTS}/dark-blue-full.png`, fullPage: true });

  // ── 5. User menu — trigger, identity block, destinations ──────────────────
  const trigger = page.locator('[data-testid="user-menu-trigger"]');
  await trigger.waitFor({ timeout: 10000 });
  const triggerText = (await trigger.textContent()) ?? "";
  check("Trigger shows the active user name", triggerText.includes("Alex Moreau"), triggerText.slice(0, 40));
  await trigger.click();
  await page.locator('[data-testid="user-menu-content"]').waitFor({ timeout: 5000 });
  check("Menu opens on click", await page.locator('[data-testid="user-menu-content"]').isVisible());
  const menuName = (await page.locator('[data-testid="user-menu-name"]').textContent())?.trim();
  const menuEmail = (await page.locator('[data-testid="user-menu-email"]').textContent())?.trim();
  check("Identity block: name + email", menuName === "Alex Moreau" && (menuEmail ?? "").includes("@"), `${menuName} / ${menuEmail}`);
  for (const [testid, href] of [
    ["user-menu-profile", "/profile"],
    ["user-menu-settings", "/settings"],
    ["user-menu-help", "/help"],
  ]) {
    const link = page.locator(`[data-testid="${testid}"]`);
    check(`${testid} → ${href}`, (await link.count()) === 1 && (await link.getAttribute("href")) === href);
  }
  check(
    "Log out action present",
    (await page.locator('[data-testid="user-menu-sign-out"]').count()) === 1,
  );
  await page.screenshot({ path: `${SHOTS}/user-menu-open.png` });

  // Profile destination actually navigates.
  await page.locator('[data-testid="user-menu-profile"]').click();
  await page.waitForFunction(() => window.location.pathname === "/profile", { timeout: 10000 });
  check("Menu → Profile navigates to /profile", true);
  await page.goBack();
  await page.waitForFunction(() => window.location.pathname === "/", { timeout: 10000 });

  // ── 6. Light theme — both canvases survive the token flip ────────────────
  await page.locator('button[aria-label="Change theme"]').click();
  await page.getByRole("menuitem", { name: /Light/ }).click();
  await page.waitForTimeout(1400);
  const lightCanvases = await page.evaluate(() => {
    const a = document.querySelector('[data-testid="cumulative-pnl-card"] canvas');
    const b = document.querySelector('[data-testid="daily-pnl-card"] canvas');
    return Boolean(a && b && a.clientWidth > 0 && b.clientWidth > 0);
  });
  check("Both P&L canvases survive the light-theme re-init", lightCanvases);
  await page.screenshot({ path: `${SHOTS}/light-full.png`, fullPage: true });
  await page.locator('button[aria-label="Change theme"]').click();
  await page.getByRole("menuitem", { name: /Dark blue/ }).click(); // back to dark-blue
  await page.waitForTimeout(900);

  // ── 7. Mobile 390px — no horizontal overflow ──────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("390px — no horizontal overflow", overflow <= 0, `${overflow}px`);
  await page.screenshot({ path: `${SHOTS}/mobile-390.png`, fullPage: false });

  // ── 8. Log out flow (destructive item) — LAST, it ends the session ────────
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(600);
  await page.locator('[data-testid="user-menu-trigger"]').click();
  await page.locator('[data-testid="user-menu-sign-out"]').click();
  await page.waitForFunction(() => window.location.pathname === "/login", { timeout: 15000 });
  check("Log out → redirected to /login", true);

  const consoleFails = errors.filter(
    (e) => !e.includes("favicon") && !e.includes("4xx") && !e.includes("401") && !e.includes("404"),
  );
  check("0 console errors", consoleFails.length === 0, consoleFails.slice(0, 3).join(" ; "));

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})();
