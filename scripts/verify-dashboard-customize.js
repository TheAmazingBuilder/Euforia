/**
 * Verify - Dashboard Customization Phase 01.
 * Probes (ONE SPA session - the mock store reseeds on full reload):
 *   [A] View mode: Layouts + Edit layout actions, 7-widget grid
 *   [B] Widget library: categories render, Added badges (default = all 7)
 *   [C] Remove → re-add via library (singleton guard) → hide/show keeps config
 *   [D] Resize: width step buttons (W−/W+), height (H+/H−), pointer handles present
 *   [E] Drag & drop reorder → Save → PATCH → SPA-persistent
 *   [F] Cancel with changes → confirm → draft discarded
 *   [G] Layouts manager: templates create layouts, rename, duplicate, switch, delete
 *   [H] Template replace draft (edit mode) → Save
 *   [I] Reset → default content → Save → canonical order
 *   [J] Mobile 390: no horizontal overflow, single column
 * Console: zero unexpected errors.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const CANONICAL = ["PNL_BAND", "EQUITY_ROW", "GOALS_PACE", "WEEK_COMPARE", "HEATMAP", "BEST_WORST", "ALERTS"];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  let patchCount = 0;
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
  });
  page.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/me/preferences/dashboard")) patchCount++;
  });

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);

  const widgetOrder = async () =>
    page.$$eval('[data-page="dashboard"] section[data-widget]', (nodes) =>
      nodes.map((node) => node.getAttribute("data-widget")),
    );

  const fireDrag = (widget, type) =>
    page.$eval(`section[data-widget="${widget}"]`, (el, t) => {
      el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true }));
    }, type);

  const enterEdit = async () => {
    await page.locator('[data-testid="dashboard-customize"]').click();
    await page.locator('[data-testid="dashboard-edit-toolbar"]').waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
  };

  const saveEdit = async () => {
    await page.locator('[data-testid="dashboard-toolbar-save"]').click();
    await page.waitForTimeout(1200);
  };

  // ── Sign in (mock demo account) ────────────────────────────────────────────
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
  await page.waitForFunction(() => window.location.pathname === "/", null, { timeout: 15000 });
  await page.locator('[data-testid="dashboard-widget-goals_pace"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);

  // ── [A] View mode ───────────────────────────────────────────────────────────
  check("[A] Layouts button renders", await page.locator('[data-testid="dashboard-layouts"]').isVisible());
  check("[A] Edit layout button renders", await page.locator('[data-testid="dashboard-customize"]').isVisible());
  const orderA = await widgetOrder();
  check("[A] 7 widgets, canonical order", orderA.join() === CANONICAL.join(), orderA.join(","));
  await page.screenshot({ path: "scripts/shots/customize-view.png", fullPage: false });

  // ── [B] Widget library - add ALERTS ────────────────────────────────────────
  await enterEdit();
  await page.locator('[data-testid="dashboard-toolbar-add"]').click();
  await page.locator('[data-testid="dashboard-widget-library"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  check("[B] Library renders", await page.locator('[data-testid="dashboard-widget-library"]').isVisible());
  check("[B] Overview category renders", await page.locator('section[aria-label="Overview"]').isVisible());
  check("[B] Performance category renders", await page.locator('section[aria-label="Performance"]').isVisible());
  check("[B] Risk & coaching category renders", await page.locator('section[aria-label="Risk & coaching"]').isVisible());
  check(
    "[B] Present widgets show Added badge (default layout has all 7)",
    (await page.locator('[data-testid="dashboard-library-added-pnl_band"]').count()) === 1 &&
      (await page.locator('[data-testid="dashboard-library-added-alerts"]').count()) === 1,
  );
  await page.screenshot({ path: "scripts/shots/customize-library.png", fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ── [C] Remove → re-add via the library → hide/show (all draft) ───────────
  await page.locator('[data-testid="dashboard-widget-remove-alerts"]').click();
  await page.waitForTimeout(300);
  let order = await widgetOrder();
  check("[C] Remove deletes the instance (draft)", !order.includes("ALERTS"), order.join(","));
  await page.locator('[data-testid="dashboard-toolbar-add"]').click();
  await page.locator('[data-testid="dashboard-widget-library"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  check("[C] Removed widget shows an Add button again", await page.locator('[data-testid="dashboard-library-add-alerts"]').isVisible());
  await page.locator('[data-testid="dashboard-library-add-alerts"]').click();
  await page.waitForTimeout(300);
  check("[C] Singleton guard: add button flips to Added", (await page.locator('[data-testid="dashboard-library-added-alerts"]').count()) === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  order = await widgetOrder();
  check("[C] Re-add appends ALERTS at the end", order.at(-1) === "ALERTS", order.join(","));

  await page.locator('[data-testid="dashboard-widget-hide-best_worst"]').click();
  await page.waitForTimeout(300);
  order = await widgetOrder();
  check("[C] Hide removes from view but keeps the instance (draft)", !order.includes("BEST_WORST"), order.join(","));
  await page.locator('[data-testid="dashboard-toolbar-add"]').click();
  await page.locator('[data-testid="dashboard-widget-library"]').waitFor({ timeout: 10000 });
  check("[C] Hidden section lists BEST_WORST", await page.locator('[data-testid="dashboard-library-hidden"]').isVisible());
  await page.locator('[data-testid="dashboard-library-show-best_worst"]').click();
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  order = await widgetOrder();
  check("[C] Show restores the widget", order.includes("BEST_WORST"), order.join(","));
  await page.locator('[data-testid="dashboard-widget-remove-alerts"]').click();
  await page.waitForTimeout(300);
  order = await widgetOrder();
  check("[C] Remove again - draft back to 6 visible widgets", !order.includes("ALERTS") && order.length === 6, order.join(","));

  // ── [D] Resize (step buttons + handles) ───────────────────────────────────
  const pnlSection = page.locator('section[data-widget="PNL_BAND"]');
  const spanBefore = await pnlSection.getAttribute("class");
  check("[D] PNL_BAND starts full width", spanBefore.includes("lg:col-span-12"), spanBefore);
  for (let step = 0; step < 6; step += 1) {
    await page.locator('[data-testid="dashboard-widget-narrower-pnl_band"]').click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(300);
  const spanAfter = await pnlSection.getAttribute("class");
  check("[D] W− narrows to 6/12", spanAfter.includes("lg:col-span-6"), spanAfter);
  check("[D] W− clamps at minW (disabled)", await page.locator('[data-testid="dashboard-widget-narrower-pnl_band"]').isDisabled());
  await page.locator('[data-testid="dashboard-widget-wider-pnl_band"]').click();
  await page.waitForTimeout(200);
  check("[D] W+ widens again (one step)", (await pnlSection.getAttribute("class")).includes("lg:col-span-7"), await pnlSection.getAttribute("class"));
  for (let step = 0; step < 5; step += 1) {
    await page.locator('[data-testid="dashboard-widget-wider-pnl_band"]').click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(200);
  check("[D] W+ clamps at maxW (full width restored)", (await pnlSection.getAttribute("class")).includes("lg:col-span-12"));
  check("[D] W+ disabled at maxW", await page.locator('[data-testid="dashboard-widget-wider-pnl_band"]').isDisabled());
  await page.locator('[data-testid="dashboard-widget-taller-pnl_band"]').click();
  await page.waitForTimeout(200);
  check("[D] H+ raises the height level", (await pnlSection.getAttribute("class")).includes("lg:min-h-80"));
  await page.locator('[data-testid="dashboard-widget-shorter-pnl_band"]').click();
  await page.waitForTimeout(200);
  check("[D] H− back to natural height", !(await pnlSection.getAttribute("class")).includes("lg:min-h-80"));
  check("[D] Pointer width handle renders", await page.locator('[data-testid="dashboard-resize-x-pnl_band"]').isVisible());
  check("[D] Pointer height handle renders", await page.locator('[data-testid="dashboard-resize-y-pnl_band"]').isVisible());
  check("[D] Composite EQUITY_ROW width-locked (no W buttons)", (await page.locator('[data-testid="dashboard-widget-narrower-equity_row"]').count()) === 0);
  check("[D] Composite EQUITY_ROW keeps H buttons", await page.locator('[data-testid="dashboard-widget-taller-equity_row"]').isVisible());
  await page.screenshot({ path: "scripts/shots/customize-resize.png", fullPage: false });

  // ── [E] Drag & drop → Save → persistence ──────────────────────────────────
  await fireDrag("WEEK_COMPARE", "dragstart");
  await page.waitForTimeout(200);
  await fireDrag("PNL_BAND", "dragover");
  await page.waitForTimeout(200);
  await fireDrag("WEEK_COMPARE", "dragend");
  await page.waitForTimeout(400);
  order = await widgetOrder();
  check(
    "[E] Drag & drop reorders the draft (WEEK_COMPARE → top)",
    order[0] === "WEEK_COMPARE",
    order.join(","),
  );
  check("[E] No PATCH before Save", patchCount === 0, `${patchCount}`);
  await saveEdit();
  check("[E] Save fires PATCH", patchCount >= 1, `${patchCount}`);
  check("[E] Save exits edit mode", (await page.locator('[data-testid="dashboard-edit-toolbar"]').count()) === 0);
  await page.locator('aside nav a[href="/trades"]').click();
  await page.waitForTimeout(1000);
  await page.locator('aside nav a[href="/"]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-page="dashboard"] section[data-widget]').first().waitFor({ timeout: 15000 });
  order = await widgetOrder();
  check("[E] Saved layout survives SPA navigation", order[0] === "WEEK_COMPARE", order.join(","));

  // ── [F] Cancel with changes ────────────────────────────────────────────────
  await enterEdit();
  await page.locator('[data-testid="dashboard-widget-down-week_compare"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="dashboard-toolbar-cancel"]').click();
  await page.waitForTimeout(300);
  check("[F] Cancel with dirty draft opens the confirm", await page.locator('[data-testid="dashboard-confirm-dialog"]').isVisible());
  await page.locator('[data-testid="dashboard-confirm-accept"]').click();
  await page.waitForTimeout(600);
  order = await widgetOrder();
  check("[F] Cancel restores the saved layout", order[0] === "WEEK_COMPARE", order.join(","));
  check("[F] Edit mode exited", (await page.locator('[data-testid="dashboard-edit-toolbar"]').count()) === 0);

  // ── [G] Layouts manager - templates + CRUD ────────────────────────────────
  await page.locator('[data-testid="dashboard-layouts"]').click();
  await page.locator('[data-testid="dashboard-layouts-dialog"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  check("[G] My layouts tab lists rows", (await page.locator('[data-testid^="dashboard-layout-row-"]').count()) >= 1);
  await page.locator('[data-testid="dashboard-templates-tab"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="dashboard-template-apply-minimal"]').click();
  await page.waitForTimeout(1000);
  order = await widgetOrder();
  check(
    "[G] Template creates + activates a new layout",
    order.join() === ["PNL_BAND", "BEST_WORST"].join(),
    order.join(","),
  );
  await page.locator('[data-testid="dashboard-layouts"]').click();
  await page.locator('[data-testid="dashboard-layouts-dialog"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  const rowCount = await page.locator('[data-testid^="dashboard-layout-row-"]').count();
  check("[G] Two layouts now", rowCount === 2, `${rowCount}`);
  const minimalRow = page.locator('[data-testid^="dashboard-layout-row-"]').filter({ hasText: "Minimal" });
  await minimalRow.locator('[data-testid^="dashboard-layout-rename-"]').click();
  await page.waitForTimeout(300);
  await page.locator('input[id^="layout-name-"]').fill("My minimal");
  await page.locator('input[id^="layout-name-"]').press("Enter");
  await page.waitForTimeout(600);
  check("[G] Rename applies", await page.locator('[data-testid="dashboard-layouts-dialog"]').locator("text=My minimal").first().isVisible());
  const activeRow = page.locator('[data-testid^="dashboard-layout-row-"]').filter({ hasText: "Active" });
  await activeRow.locator('[data-testid^="dashboard-layout-duplicate-"]').click();
  await page.waitForTimeout(1000);
  check("[G] Duplicate adds a copy and activates it", (await page.locator('[data-testid^="dashboard-layout-row-"]').count()) === 3);
  check("[G] Duplicate named 'copy'", await page.locator('[data-testid="dashboard-layouts-dialog"]').locator("text=copy").first().isVisible());
  const defaultRow = page.locator('[data-testid^="dashboard-layout-row-"]').filter({ hasText: /^Default/ }).first();
  await defaultRow.locator('[data-testid^="dashboard-layout-activate-"]').click();
  await page.waitForTimeout(1000);
  // layout_default's content is the order saved in [E] - switching must
  // render exactly that (Default ≠ canonical here).
  check(
    "[G] Switch back to Default renders its saved arrangement",
    (await widgetOrder()).join() === ["WEEK_COMPARE", "PNL_BAND", "EQUITY_ROW", "GOALS_PACE", "HEATMAP", "BEST_WORST"].join(),
    (await widgetOrder()).join(","),
  );
  const copyRow = page.locator('[data-testid^="dashboard-layout-row-"]').filter({ hasText: "copy" });
  await copyRow.locator('[data-testid^="dashboard-layout-delete-"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="dashboard-confirm-accept"]').click();
  await page.waitForTimeout(800);
  check("[G] Delete removes the layout (confirmed)", (await page.locator('[data-testid^="dashboard-layout-row-"]').count()) === 2);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ── [H] Template replaces the DRAFT in edit mode ──────────────────────────
  await enterEdit();
  await page.locator('[data-testid="dashboard-toolbar-layouts"]').click();
  await page.locator('[data-testid="dashboard-layouts-dialog"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await page.locator('[data-testid="dashboard-templates-tab"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="dashboard-template-apply-risk_management"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="dashboard-confirm-accept"]').click();
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  order = await widgetOrder();
  check(
    "[H] Template replaced the draft (EQUITY_ROW leads)",
    order[0] === "EQUITY_ROW" && order.length === 4,
    order.join(","),
  );
  await saveEdit();
  check("[H] Draft replacement saved", patchCount >= 2, `${patchCount}`);

  // ── [I] Reset to default ───────────────────────────────────────────────────
  await enterEdit();
  await page.locator('[data-testid="dashboard-toolbar-reset"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="dashboard-confirm-accept"]').click();
  await page.waitForTimeout(400);
  order = await widgetOrder();
  check("[I] Reset restores the default content", order.join() === CANONICAL.join(), order.join(","));
  await saveEdit();
  check("[I] Reset saved", patchCount >= 3, `${patchCount}`);
  await page.screenshot({ path: "scripts/shots/customize-final.png", fullPage: false });

  // ── [J] Mobile 390 ─────────────────────────────────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (err) => errors.push(`mobile: ${err}`));
  await mobile.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60000 });
  await mobile.waitForTimeout(800);
  // New page = fresh in-memory token store → sign in again.
  await mobile.locator("#login-email").fill("trader@cosmoz.app");
  await mobile.locator("#login-password").fill("cosmoz-demo-2026");
  await mobile.getByRole("button", { name: /Sign in/ }).click();
  await mobile.waitForFunction(() => window.location.pathname === "/", null, { timeout: 20000 });
  await mobile.waitForTimeout(1500);
  await mobile.locator('[data-testid="dashboard-widget-goals_pace"]').waitFor({ timeout: 20000 });
  // Transient boot toast (session-expiry warning, pre-existing app-wide)
  // mounts the fixed sonner list 16px past the viewport - wait for it to
  // dismiss so the measurement captures the DASHBOARD layout itself.
  await mobile
    .waitForFunction(() => document.querySelectorAll("[data-sonner-toast]").length === 0, null, { timeout: 15000 })
    .catch(() => {});
  await mobile.waitForTimeout(600);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("[J] Mobile 390: no horizontal overflow", overflow <= 0, `${overflow}px`);
  const singleColumn = await mobile.evaluate(() => {
    const grid = document.querySelector('[data-testid="dashboard-grid"]');
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length === 1 : false;
  });
  check("[J] Mobile: single-column grid", singleColumn);
  await mobile.screenshot({ path: "scripts/shots/customize-mobile.png", fullPage: false });
  await mobile.close();

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log("\n=== RESULTS ===");
  for (const line of results) console.log(line);
  const failed = results.filter((line) => line.startsWith("FAIL"));
  const noise = errors.filter(
    (e) => !e.includes("socket.io") && !e.includes("candles") && !e.includes("favicon")
      && !e.includes("/api/auth/me") && !e.includes("/api/auth/refresh")
      && !e.includes("Failed to load resource: the server responded with a status of 401"),
  );
  console.log(`\nConsole/network noise: ${noise.length}`);
  noise.slice(0, 8).forEach((e) => console.log("  •", e.slice(0, 220)));
  console.log(`\n${failed.length === 0 && noise.length === 0 ? "ALL GREEN" : `${failed.length} FAIL / ${noise.length} noise`}`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
})();
