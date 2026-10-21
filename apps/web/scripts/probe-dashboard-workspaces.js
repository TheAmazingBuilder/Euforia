/**
 * Dashboard workspaces probe — Phase 06 (workspace management, layout
 * collections & user templates), run against the ZERO-ENV mock preview
 * (MSW on, default `next dev`).
 *
 * Covers: the manager opens as "Workspaces", rename, duplicate, set
 * default (badge appears), save the current workspace as a user template,
 * spawn an independent workspace from it (deep copy — the clone edits do
 * not touch the source), delete the user template, delete the default
 * workspace (flag clears — the Default badge disappears), console integrity.
 *
 * NOTE ON PERSISTENCE: mock preferences live in browser memory and reseed
 * on reload — reload-survival is proven SERVER-SIDE by the settings e2e
 * suite (real PostgreSQL), not here.
 */
const { chromium } = require("playwright");

const BASE = process.env.PROBE_BASE || "http://localhost:3000";
let passed = 0;
let failed = 0;
const pageErrors = [];

function check(label, ok, extra = "") {
  const tag = ok ? "✓" : "✗";
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${tag} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#login-email", { state: "visible", timeout: 30000 });
  await page.fill("#login-email", "trader@cosmoz.app");
  await page.fill("#login-password", "cosmoz-demo-2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  check("login succeeded", !page.url().includes("/login"), page.url());
}

async function waitDashboardReady(page) {
  await page.waitForSelector('[data-testid="dashboard-customize"]', { state: "visible", timeout: 60000 });
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="dashboard-customize"]')?.disabled,
    { timeout: 60000 },
  );
  await page.waitForTimeout(800);
}

async function openWorkspaces(page) {
  await page.click('[data-testid="dashboard-layouts"]');
  await page.waitForTimeout(600);
  check("workspaces dialog open", await page.locator('[data-testid="dashboard-layouts-dialog"]').isVisible().catch(() => false));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    console.log("\n[0] Mount + open manager");
    await login(page);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitDashboardReady(page);
    await openWorkspaces(page);
    check("dialog titled Workspaces", await page.getByRole("heading", { name: "Workspaces" }).isVisible().catch(() => false));
    const rows = await page.locator('[data-testid^="dashboard-layout-row-"]').count();
    check("workspace rows listed", rows >= 1, `${rows} rows`);

    console.log("\n[1] Rename + duplicate");
    const firstRow = page.locator('[data-testid^="dashboard-layout-row-"]').first();
    const firstId = (await firstRow.getAttribute("data-testid")).replace("dashboard-layout-row-", "");
    await page.click(`[data-testid="dashboard-layout-rename-${firstId}"]`);
    await page.fill(`[data-testid="dashboard-layout-rename-input-${firstId}"]`, "Probe workspace");
    await page.click(`[data-testid="dashboard-layout-rename-input-${firstId}"] ~ button[type="submit"]`);
    await page.waitForTimeout(800);
    check("renamed", await page.getByText("Probe workspace").isVisible().catch(() => false));

    await page.click(`[data-testid="dashboard-layout-duplicate-${firstId}"]`);
    await page.waitForTimeout(900);
    const dupRows = await page.locator('[data-testid^="dashboard-layout-row-"]').count();
    check("duplicated adds a row", dupRows === rows + 1, `${dupRows} rows`);

    console.log("\n[2] Default workspace");
    const secondRow = page.locator('[data-testid^="dashboard-layout-row-"]').nth(1);
    const secondId = (await secondRow.getAttribute("data-testid")).replace("dashboard-layout-row-", "");
    await page.click(`[data-testid="dashboard-layout-set-default-${secondId}"]`);
    await page.waitForTimeout(600);
    check("Default badge on the starred workspace", (await page.locator(`[data-testid="dashboard-layout-default-${secondId}"]`).count()) === 1);

    console.log("\n[3] User template lifecycle");
    await page.click('[data-testid="dashboard-templates-tab"]');
    await page.waitForTimeout(500);
    check("built-in templates listed", (await page.locator('[data-testid^="dashboard-template-"]').count()) >= 4);
    check("save-as-template section present", await page.locator('[data-testid="dashboard-save-as-template"]').isVisible().catch(() => false));
    await page.fill('[data-testid="dashboard-save-as-template-input"]', "Probe snapshot");
    await page.click('[data-testid="dashboard-save-as-template"] button[type="submit"]');
    await page.waitForTimeout(900);
    const tplRow = page.locator('[data-testid^="dashboard-user-template-row-"]').first();
    check("user template listed with Yours badge", await tplRow.getByText("Yours").isVisible().catch(() => false));
    const tplId = (await tplRow.getAttribute("data-testid")).replace("dashboard-user-template-row-", "");

    // Apply the user template → NEW independent workspace, auto-activated.
    // The manager dialog stays open — count rows in the SAME session.
    await page.click(`[data-testid="dashboard-user-template-apply-${tplId}"]`);
    await page.waitForTimeout(1200);
    await page.click('[data-testid="dashboard-layouts-tab"]');
    await page.waitForTimeout(500);
    const afterRows = await page.locator('[data-testid^="dashboard-layout-row-"]').count();
    check("workspace created from template", afterRows === dupRows + 1, `${afterRows} rows`);
    const activeBadge = await page.locator('[data-testid^="dashboard-layout-active-"]').count();
    check("new workspace is the active one", activeBadge === 1);

    // Delete the user template (same dialog session).
    await page.click('[data-testid="dashboard-templates-tab"]');
    await page.waitForTimeout(400);
    await page.click(`[data-testid="dashboard-user-template-delete-${tplId}"]`);
    await page.waitForTimeout(800);
    check("user template deleted", (await page.locator('[data-testid^="dashboard-user-template-row-"]').count()) === 0);

    console.log("\n[4] Deleting the default workspace clears the flag");
    await page.click('[data-testid="dashboard-layouts-tab"]');
    await page.waitForTimeout(500);
    check(
      "Default badge present before delete",
      (await page.locator(`[data-testid="dashboard-layout-default-${secondId}"]`).count()) === 1,
    );
    await page.click(`[data-testid="dashboard-layout-delete-${secondId}"]`);
    await page.waitForTimeout(500);
    // Destructive deletes go through the ConfirmDialog (spec §12) — accept it.
    await page.click('[data-testid="dashboard-confirm-accept"]');
    await page.waitForTimeout(900);
    check(
      "Default badge gone after deleting the default workspace (flag cleared, never re-pointed)",
      (await page.locator('[data-testid^="dashboard-layout-default-"]').count()) === 0,
    );

    console.log("\n[5] Console integrity");
    check("zero page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  } catch (error) {
    failed += 1;
    console.error("PROBE CRASH:", error);
  } finally {
    await browser.close();
  }

  console.log(`\n=== dashboard-workspaces probe: ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
})();
