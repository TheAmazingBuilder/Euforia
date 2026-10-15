/**
 * Verify — Dashboard upgrades (module-by-module round).
 * Probes (ONE SPA session — the mock store reseeds on full reload):
 *  1. Seven widgets render in the canonical order
 *  2. « Goals on pace »: counters render; the at-risk counter is clickable
 *     → lands on /journal?tab=goals (Goals tab)
 *  3. « Week vs week »: two labeled rows, 7+7 day bands, delta pill
 *  4. Edit layout: draft transaction — tools render, move-down reorders the
 *     DRAFT (no PATCH), Save commits (PATCH /me/preferences/dashboard)
 *  5. Native drag & drop reorders the draft → Save fires the PATCH
 *  6. Saved order SURVIVES SPA navigation (server persisted)
 *  7. Cancel-with-changes asks + restores; Reset → draft = canonical → Save
 *  8. Density COMPACT (Settings → Appearance): dashboard-scoped tightening
 *     (descriptions hidden) — then back to COMFORTABLE
 *  9. Light theme + mobile 390 no overflow; zero unexpected console errors
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  let patchCount = 0;
  let resetCount = 0;
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
    if (res.url().includes("/me/preferences/dashboard")) {
      console.log(`   [net] PATCH dashboard → ${res.status()}`);
    }
    if (res.url().includes("/me/preferences/reset")) {
      console.log(`   [net] POST reset → ${res.status()}`);
    }
  });
  page.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/me/preferences/dashboard")) patchCount++;
    if (req.method() === "POST" && req.url().includes("/me/preferences/reset")) resetCount++;
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  const widgetOrder = async () =>
    page.$$eval('[data-page="dashboard"] section[data-widget]', (nodes) =>
      nodes.map((node) => node.getAttribute("data-widget")),
    );

  const fireDrag = (widget, type) =>
    page.$eval(`section[data-widget="${widget}"]`, (el, t) => {
      el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true }));
    }, type);

  const run = async () => {
  // ── 1. Canonical widget order ────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
  // Fresh browsers have no session — sign in with the demo account first
  // (same preamble as the other dashboard probes).
  if (page.url().includes("/login")) {
    const fillDemo = page.locator('[data-testid="fill-demo"]');
    if (await fillDemo.isVisible().catch(() => false)) {
      await fillDemo.click();
    } else {
      await page.locator("#login-email").fill("trader@cosmoz.app");
      await page.locator("#login-password").fill("cosmoz-demo-2026");
    }
    await page.getByRole("button", { name: /Sign in/ }).click();
    await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 15000 });
  }
  await page.locator('[data-testid="dashboard-goals-pace"]').waitFor({ state: "visible", timeout: 20000 });
  const canonical = ["PNL_BAND", "EQUITY_ROW", "GOALS_PACE", "WEEK_COMPARE", "HEATMAP", "BEST_WORST", "ALERTS"];
  const order0 = await widgetOrder();
  check("7 widgets render", order0.length === 7, order0.join(","));
  check("Canonical default order", order0.join() === canonical.join(), order0.join());
  check("Edit toolbar renders", await page.locator('[data-testid="dashboard-customize"]').isVisible());

  // ── 2. Goals on pace — counters + clickable at-risk counter ─────────────
  // The goals query resolves async — wait it out instead of racing isVisible.
  await page.locator('[data-testid="dashboard-goals-counters"]').waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  check("Goals card header renders", await page.locator('[data-testid="dashboard-goals-pace"]').isVisible());
  check("Counters grid renders", await page.locator('[data-testid="dashboard-goals-counters"]').isVisible());
  check("At-risk counter visible", await page.locator('[data-testid="dashboard-goals-atrisk"]').isVisible());
  await page.screenshot({ path: "scripts/shots/dashboard-upgrades-default.png", fullPage: false });
  await page.locator('[data-testid="dashboard-goals-atrisk"]').click();
  await page.waitForTimeout(1200);
  check("At-risk counter navigates to Goals tab", page.url().includes("/journal?tab=goals"), page.url());
  check("Goals panel rendered after jump", await page.locator('[data-testid="goals-panel"]').isVisible());
  await page.locator('aside nav a[href="/"]').click();
  await page.waitForTimeout(1400);
  await page.locator('[data-testid="dashboard-goals-pace"]').waitFor({ state: "visible", timeout: 15000 });

  // ── 3. Week vs week bands ────────────────────────────────────────────────
  check("This-week row renders", await page.locator('[data-testid="dashboard-week-compare-this"]').isVisible());
  check("Previous-week row renders", await page.locator('[data-testid="dashboard-week-compare-prev"]').isVisible());
  const bandCount = await page.locator('[data-testid="dashboard-week-band"]').count();
  check("14 day bands (7 per week)", bandCount === 14, `${bandCount} bands`);
  check("Delta pill renders", await page.locator('[data-testid="dashboard-week-delta"]').isVisible());

  // ── 4. Edit layout — draft transaction: reorder stays local until Save ───
  await page.locator('[data-testid="dashboard-customize"]').click();
  await page.waitForTimeout(400);
  check("Edit hint appears", await page.locator('[data-testid="dashboard-edit-hint"]').isVisible());
  check("Edit toolbar renders", await page.locator('[data-testid="dashboard-edit-toolbar"]').isVisible());
  check("Save disabled before edits (clean draft)", await page.locator('[data-testid="dashboard-toolbar-save"]').isDisabled());
  const toolCount = await page.locator('[data-testid^="dashboard-widget-tools-"]').count();
  check("7 widget tool chips in edit mode", toolCount === 7, `${toolCount} tools`);

  await page.locator('[data-testid="dashboard-widget-down-pnl_band"]').click();
  await page.waitForTimeout(400);
  const order1 = await widgetOrder();
  check("Move down reorders the DRAFT (PNL_BAND → 2nd)", order1[0] === "EQUITY_ROW" && order1[1] === "PNL_BAND", order1.join(","));
  check("No PATCH while drafting (transaction)", patchCount === 0, `${patchCount} patch(es)`);

  // ── 5. Native drag & drop (still draft-local) → Save commits both ────────
  await fireDrag("EQUITY_ROW", "dragstart");
  await page.waitForTimeout(200);
  await fireDrag("GOALS_PACE", "dragover");
  await page.waitForTimeout(200);
  await fireDrag("EQUITY_ROW", "dragend");
  await page.waitForTimeout(400);
  const order3 = await widgetOrder();
  check(
    "Drag & drop reorders the DRAFT (EQUITY_ROW → GOALS_PACE slot)",
    order3.join() === ["PNL_BAND", "GOALS_PACE", "EQUITY_ROW", "WEEK_COMPARE", "HEATMAP", "BEST_WORST", "ALERTS"].join(),
    order3.join(","),
  );
  check("Still no PATCH before Save", patchCount === 0, `${patchCount} patch(es)`);
  await page.screenshot({ path: "scripts/shots/dashboard-upgrades-edit-mode.png", fullPage: false });
  await page.locator('[data-testid="dashboard-toolbar-save"]').click();
  await page.waitForTimeout(1200);
  check("Save fires PATCH /me/preferences/dashboard", patchCount >= 1, `${patchCount} patch(es)`);
  check("Save exits edit mode (toolbar gone)", (await page.locator('[data-testid="dashboard-edit-toolbar"]').count()) === 0);

  // ── 6. Server persistence — SPA away and back; the refetch must return
  // the saved order. NOTE: navigating remounts the view, so edit mode is
  // re-entered below afterwards.
  await page.locator('aside nav a[href="/trades"]').click();
  await page.waitForTimeout(1200);
  await page.locator('aside nav a[href="/"]').click();
  await page.waitForTimeout(1400);
  await page
    .locator('[data-page="dashboard"] section[data-widget]')
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
  let persisted = false;
  try {
    await page.waitForFunction(
      () =>
        document.querySelector('[data-page="dashboard"] section[data-widget]')?.getAttribute("data-widget") === "PNL_BAND" &&
        document.querySelectorAll('[data-page="dashboard"] section[data-widget]')[1]?.getAttribute("data-widget") === "GOALS_PACE",
      { timeout: 12000 },
    );
    persisted = true;
  } catch {
    persisted = false;
  }
  const order2 = await widgetOrder();
  check("Layout persists across SPA navigation (server)", persisted, order2.join(","));

  // ── 7. Cancel + Reset (edit mode again — the remount reset it) ───────────
  await page.locator('[data-testid="dashboard-customize"]').click();
  await page.waitForTimeout(400);
  // Cancel with a dirty draft asks for confirmation, then restores.
  await page.locator('[data-testid="dashboard-widget-down-pnl_band"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="dashboard-toolbar-cancel"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="dashboard-confirm-accept"]').click();
  await page.waitForTimeout(600);
  check("Cancel with dirty draft discards and exits", (await page.locator('[data-testid="dashboard-edit-toolbar"]').count()) === 0);
  await page.locator('[data-testid="dashboard-customize"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="dashboard-toolbar-reset"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="dashboard-confirm-accept"]').click();
  await page.waitForTimeout(400);
  const order4 = await widgetOrder();
  check("Reset restores canonical order in the draft", order4.join() === canonical.join(), order4.join(","));
  await page.locator('[data-testid="dashboard-toolbar-save"]').click();
  await page.waitForTimeout(1200);
  check("Reset committed with a PATCH (no legacy reset endpoint)", patchCount >= 2, `${patchCount} patch(es)`);

  const toolsAfter = await page.locator('[data-testid^="dashboard-widget-tools-"]').count();
  check("Save hides the tools", toolsAfter === 0, `${toolsAfter} left`);

  // ── 8. Density COMPACT — dashboard-scoped tightening ─────────────────────
  await page.locator('aside nav a[href="/settings"]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="settings-nav-appearance"]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid="settings-appearance-density-COMPACT"]').click();
  await page.locator('[data-testid="settings-appearance-save"]').click();
  await page.waitForTimeout(900);
  await page.locator('aside nav a[href="/"]').click();
  await page.waitForTimeout(1400);
  await page.locator('[data-testid="dashboard-goals-pace"]').waitFor({ state: "visible", timeout: 15000 });
  const densityAttr = await page.evaluate(() => document.documentElement.getAttribute("data-density"));
  check("COMPACT density applied on <html>", densityAttr === "compact", String(densityAttr));
  const descHidden = await page.evaluate(() => {
    const node = document.querySelector('[data-page="dashboard"] [data-slot="card-description"]');
    return node ? node.getBoundingClientRect().height === 0 : false;
  });
  check("Card descriptions folded away in compact", descHidden);
  const rootCompact = await page.evaluate(
    () => document.querySelector('[data-page="dashboard"]')?.className.includes("space-y-3") ?? false,
  );
  check("Dashboard rhythm tightened (space-y-3)", rootCompact);
  await page.screenshot({ path: "scripts/shots/dashboard-upgrades-compact.png", fullPage: false });

  // Back to COMFORTABLE — design restored byte for byte.
  await page.locator('aside nav a[href="/settings"]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="settings-nav-appearance"]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid="settings-appearance-density-COMFORTABLE"]').click();
  await page.locator('[data-testid="settings-appearance-save"]').click();
  await page.waitForTimeout(900);
  await page.locator('aside nav a[href="/"]').click();
  await page.waitForTimeout(1400);
  const descVisibleAgain = await page.evaluate(() => {
    const node = document.querySelector('[data-page="dashboard"] [data-slot="card-description"]');
    return node ? node.getBoundingClientRect().height > 0 : false;
  });
  check("COMFORTABLE restores the designed look", descVisibleAgain);

  // ── 9. Light theme + mobile ────────────────────────────────────────────────
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  });
  await page.waitForTimeout(600);
  check("Light theme renders the upgrades", await page.locator('[data-testid="dashboard-week-compare"]').isVisible());
  await page.screenshot({ path: "scripts/shots/dashboard-upgrades-light.png", fullPage: false });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (err) => errors.push(`mobile: ${err}`));
  await mobile.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
  // Same fresh-session preamble as the desktop page.
  if (mobile.url().includes("/login")) {
    const mobileFill = mobile.locator('[data-testid="fill-demo"]');
    if (await mobileFill.isVisible().catch(() => false)) {
      await mobileFill.click();
    } else {
      await mobile.locator("#login-email").fill("trader@cosmoz.app");
      await mobile.locator("#login-password").fill("cosmoz-demo-2026");
    }
    await mobile.getByRole("button", { name: /Sign in/ }).click();
    await mobile.waitForFunction(() => window.location.pathname === "/", null, { timeout: 15000 });
  }
  await mobile.waitForTimeout(1400);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Mobile 390: no horizontal overflow", overflow <= 0, `${overflow}px`);
  check(
    "Mobile: goals card renders",
    await mobile.locator('[data-testid="dashboard-goals-pace"]').isVisible(),
  );
  await mobile.screenshot({ path: "scripts/shots/dashboard-upgrades-mobile.png" });
  await mobile.close();

  // ── Console health: known market-service noise + expected pre-login
  // auth 401 probes are excluded; everything else must be silent. ──────────
  const noise = errors.filter(
    (e) =>
      e.includes("socket.io") ||
      (e.includes("404") && e.includes("candles")) ||
      (e.includes("401") && e.includes("/api/auth/")) ||
      (e.includes("Failed to load resource") && e.includes("401")),
  );
  check("Zero console errors (known market-service noise excluded)", errors.length - noise.length === 0, errors.slice(0, 3).join(" | "));

  console.log("\n═══ DASHBOARD UPGRADES — RESULTS ═══");
  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  };

  try {
    await run();
  } catch (error) {
    console.log(`\n[ABORTED] ${error}`);
    console.log("\n═══ DASHBOARD UPGRADES — PARTIAL RESULTS ═══");
    results.forEach((r) => console.log(r));
    const failed = results.filter((r) => r.startsWith("FAIL")).length;
    console.log(`\n${results.length - failed}/${results.length} PASS so far`);
  }
  await browser.close();
  const failed2 = results.filter((r) => r.startsWith("FAIL")).length;
  process.exit(failed2 > 0 ? 1 : 0);
})();
