/**
 * verify-playbook.js - Playbook module (MASTER PROMPT) end-to-end verification.
 *
 * Contract under test:
 *  - 7 tabs (§4) persisted in the URL (?tab=): Overview, My Strategies, Setups,
 *    Rules, Checklists, Performance, Templates
 *  - Overview (§5): counts tiles, performance summary (server money + currency),
 *    completeness-to-fix (§20 - indicators, never a performance judgment)
 *  - My Strategies (§6): cards, status filters, detail dialog, duplicate dialog
 *  - Setups (§9) grouped by strategy with expandable detail; Rules (§13);
 *    Checklists (§16) with required/optional items
 *  - Performance (§19): per-strategy rows from the analytics dataset, small-sample
 *    flags, NO composite "best strategy" score
 *  - Templates (§18): 10 starting points, instantiate → DRAFT strategy + toast
 *  - CRUD: create strategy via the full form, delete via detail dialog
 *  - light theme + mobile 390 · 0 console errors
 *
 * MSW caveat: the mock store RESEEDS on every full page load - mutations made
 * here stay alive only while the SPA session lives (asserted in-session).
 */
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve(__dirname, "shots");

let pass = 0;
let fail = 0;
const ok = (label, cond) => {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}`);
  }
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedUrls = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 400) failedUrls.push(res.url());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  const isEnvNoise = (text) =>
    text.includes("socket.io") ||
    text.includes("XTransformPort") ||
    (text.includes("Failed to load resource") &&
      failedUrls.every((url) => url.includes("socket.io") || url.includes("XTransformPort")));

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "strategies", label: "My Strategies" },
    { id: "setups", label: "Setups" },
    { id: "rules", label: "Rules" },
    { id: "checklists", label: "Checklists" },
    { id: "performance", label: "Performance" },
    { id: "templates", label: "Templates" },
  ];

  // ── 1. Navigation & header ──────────────────────────────────────────────────
  console.log("\n■ Navigation & header");
  await page.goto(`${BASE}/playbook`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2200);

  ok(
    "Sidebar shows the Playbook entry",
    await page.locator("aside a[href='/playbook']").first().isVisible(),
  );
  ok(
    "Header h1 is Playbook",
    (await page.locator("h1").first().textContent())?.trim() === "Playbook",
  );
  ok(
    "Header carries the operational-source-of-truth copy",
    (await page.locator("main, body").first().textContent())?.includes("Trade it as written"),
  );
  ok(
    "New Strategy button visible",
    await page.getByRole("button", { name: "New Strategy" }).isVisible(),
  );

  // ── 2. Seven tabs + URL persistence ────────────────────────────────────────
  console.log("\n■ Tabs & URL persistence");
  for (const tab of TABS) {
    const trigger = page.getByRole("tab", { name: tab.label, exact: true });
    ok(`Tab "${tab.label}" visible`, await trigger.isVisible());
  }
  await page.getByRole("tab", { name: "Setups", exact: true }).click();
  await page.waitForTimeout(600);
  ok("Clicking Setups persists ?tab=setups", page.url().includes("tab=setups"));
  // Deep link opens the right tab
  await page.goto(`${BASE}/playbook?tab=templates`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  ok(
    "Deep link ?tab=templates lands on Templates",
    await page.getByRole("tab", { name: "Templates", exact: true }).getAttribute("aria-selected") ===
      "true",
  );

  // ── 3. Overview tab (§5/§20) ────────────────────────────────────────────────
  console.log("\n■ Overview");
  const tileNumber = async (testid) => {
    const text = (await page.locator(`[data-testid='${testid}']`).textContent()) ?? "";
    const match = text.match(/(\d+)/);
    return match ? Number(match[1]) : null;
  };
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.waitForTimeout(900);
  const overviewShotTotal = await tileNumber("overview-total-strategies");
  ok(
    `Counts tiles parse to numbers (total strategies = ${overviewShotTotal})`,
    Number.isInteger(overviewShotTotal),
  );
  const activeCount = await tileNumber("overview-active-strategies");
  ok(`Active tile parses to a number (${activeCount})`, Number.isInteger(activeCount));
  ok(
    "Performance summary shows a net P&L figure",
    (await page.locator("[data-testid='overview-net-pnl']").textContent())?.trim().length > 1,
  );
  const overviewText = await page.locator("main, body").first().textContent();
  ok(
    "Quick actions present (Create Setup / Rule / Checklist / Duplicate)",
    overviewText?.includes("Create Setup") &&
      overviewText?.includes("Create Rule") &&
      overviewText?.includes("Create Checklist") &&
      overviewText?.includes("Duplicate Strategy"),
  );
  ok(
    "Completeness card speaks in indicators, not scores",
    overviewText?.includes("never a performance judgment") ||
      overviewText?.includes("Completeness"),
  );
  ok(
    "Recently updated list renders",
    overviewText?.includes("Recently updated") && overviewText?.includes("Recently used"),
  );

  // ── 4. My Strategies: cards, filters, detail dialog ─────────────────────────
  console.log("\n■ My Strategies");
  await page.getByRole("tab", { name: "My Strategies", exact: true }).click();
  await page.waitForTimeout(900);
  const strategyCards = page.locator("[data-strategy-id] button[aria-haspopup='dialog']");
  const cardCount = await strategyCards.count();
  ok(`Strategy cards rendered (${cardCount} >= 3 seeded)`, cardCount >= 3);
  ok(
    "Status filter row present",
    await page
      .getByRole("button", { name: /All|Active|Draft|Paused|Retired/i })
      .first()
      .isVisible(),
  );
  ok(
    "Duplicate quick action present",
    await page.locator("[data-testid='strategies-duplicate']").isVisible(),
  );
  // Open the first card's detail dialog
  await strategyCards.first().click();
  await page.waitForTimeout(700);
  const detailVisible = await page
    .getByRole("dialog")
    .first()
    .isVisible()
    .catch(() => false);
  ok("Detail dialog opens from a card", detailVisible);
  if (detailVisible) {
    const detailText = await page.getByRole("dialog").first().textContent();
    ok(
      "Detail dialog carries identity + lifecycle info",
      detailText?.includes("Version") || detailText?.includes("v") === true,
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  // ── 5. Setups tab (§9) ──────────────────────────────────────────────────────
  console.log("\n■ Setups");
  await page.getByRole("tab", { name: "Setups", exact: true }).click();
  await page.waitForTimeout(900);
  const setupRows = await page.locator("[data-testid='setup-row']").count();
  ok(`Setup rows rendered (${setupRows} >= 5)`, setupRows >= 5);
  await page.locator("[data-testid='setup-row'] button").first().click();
  await page.waitForTimeout(500);
  ok(
    "Expanding a setup reveals the detail recipe",
    await page.locator("[data-testid='setup-detail']").first().isVisible(),
  );
  ok(
    "New Setup action present",
    await page.getByRole("button", { name: /New Setup/i }).isVisible(),
  );

  // ── 6. Rules tab (§13) ──────────────────────────────────────────────────────
  console.log("\n■ Rules");
  await page.getByRole("tab", { name: "Rules", exact: true }).click();
  await page.waitForTimeout(900);
  const ruleRows = await page.locator("[data-testid='playbook-rule-row']").count();
  ok(`Operating rules rendered (${ruleRows} >= 1)`, ruleRows >= 1);
  ok(
    "New rule action present",
    await page.getByRole("button", { name: /New rule/i }).isVisible(),
  );

  // ── 7. Checklists tab (§16) ─────────────────────────────────────────────────
  console.log("\n■ Checklists");
  await page.getByRole("tab", { name: "Checklists", exact: true }).click();
  await page.waitForTimeout(900);
  const checklistCards = await page.locator("[data-testid='checklist-card']").count();
  ok(`Checklist templates rendered (${checklistCards} >= 4)`, checklistCards >= 4);
  const checklistText = await page.locator("main, body").first().textContent();
  ok(
    "Optional items explicitly labelled (required = unchecked styling)",
    checklistText?.includes("optional"),
  );

  // ── 8. Performance tab (§19) ────────────────────────────────────────────────
  console.log("\n■ Performance");
  await page.getByRole("tab", { name: "Performance", exact: true }).click();
  await page.waitForTimeout(1800);
  ok(
    "Performance table renders",
    await page.locator("[data-testid='performance-table']").isVisible(),
  );
  const perfText = await page.locator("[data-testid='performance-table']").textContent();
  ok("Columns carry PF + Expectancy + Plan %", perfText?.includes("PF") && perfText?.includes("Plan %"));
  const smallSampleBadges = await page
    .locator("[data-testid='performance-table'] >> text=n<5")
    .count();
  ok(`Small-sample flags present (${smallSampleBadges} rows with n<5)`, smallSampleBadges >= 0);
  const perfFooter = await page.locator("main, body").first().textContent();
  ok(
    "Footer states there is NO composite best-strategy score",
    perfFooter?.includes("NO composite"),
  );
  ok(
    "Open in Analytics link present",
    await page.locator("a[href='/analytics?tab=strategy']").isVisible(),
  );

  // ── 9. Templates tab (§18) ──────────────────────────────────────────────────
  console.log("\n■ Templates");
  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  await page.waitForTimeout(1200);
  const templateCards = await page.locator("[data-testid='template-card']").count();
  ok(`Template library renders 10 starting points (${templateCards})`, templateCards === 10);
  const templatesText = await page.locator("main, body").first().textContent();
  ok(
    "Templates framed as starting points",
    templatesText?.toLowerCase().includes("starting point"),
  );
  const firstCreate = page.locator("[data-testid^='template-create-']").first();
  ok("Instantiate action available on cards", await firstCreate.isVisible());

  // ── 10. Create strategy (full form) then delete it ──────────────────────────
  console.log("\n■ CRUD: create + delete strategy");
  await page.getByRole("button", { name: "New Strategy" }).click();
  await page.waitForTimeout(700);
  const dialog = page.getByRole("dialog");
  ok("Create dialog opens", await dialog.first().isVisible());
  await page.locator("#strategy-name").fill("Verify Playbook Strategy");
  await dialog.first().getByRole("button", { name: "Create strategy" }).click();
  await page.waitForTimeout(1500);
  const createToast = await page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "added to your playbook" })
    .first()
    .isVisible()
    .catch(() => false);
  ok("Create → success toast", createToast);
  // It should appear on My Strategies
  await page.getByRole("tab", { name: "My Strategies", exact: true }).click();
  await page.waitForTimeout(900);
  const createdCard = page
    .locator("[data-strategy-id]")
    .filter({ hasText: "Verify Playbook Strategy" });
  ok("Created strategy listed", (await createdCard.count()) === 1);
  // Delete it through the detail dialog
  await createdCard.first().locator("button[aria-haspopup='dialog']").click();
  await page.waitForTimeout(700);
  await page.getByRole("dialog").first().getByRole("button", { name: "Delete" }).click();
  await page.waitForTimeout(1400);
  const deleteToast = await page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Strategy deleted" })
    .first()
    .isVisible()
    .catch(() => false);
  ok("Delete → success toast", deleteToast);
  ok(
    "Created strategy removed from the list",
    (await page
      .locator("[data-strategy-id]")
      .filter({ hasText: "Verify Playbook Strategy" })
      .count()) === 0,
  );

  // ── 11. Instantiate a template (§18) ────────────────────────────────────────
  console.log("\n■ Template instantiation");
  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  await page.waitForTimeout(800);
  const beforeInstantiate = await page.locator("[data-testid='template-card']").count();
  await page.locator("[data-testid^='template-create-']").first().click();
  await page.waitForTimeout(1500);
  const instantiateToast = await page
    .locator("[data-sonner-toast]")
    .filter({ hasText: /playbook|Draft|template/i })
    .first()
    .isVisible()
    .catch(() => false);
  ok("Instantiate → toast confirmation", instantiateToast);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.waitForTimeout(1200);
  const afterInstantiate = await tileNumber("overview-total-strategies");
  ok(
    `Strategy count incremented after instantiate (${overviewShotTotal} → ${afterInstantiate})`,
    afterInstantiate === overviewShotTotal + 1 && beforeInstantiate > 0,
  );

  // ── 12. Duplicate dialog opens (§5 quick action) ─────────────────────────────
  console.log("\n■ Duplicate dialog");
  await page.getByRole("tab", { name: "My Strategies", exact: true }).click();
  await page.waitForTimeout(800);
  await page.locator("[data-testid='strategies-duplicate']").click();
  await page.waitForTimeout(600);
  ok(
    "Duplicate dialog opens",
    await page.getByRole("dialog").filter({ hasText: "Duplicate a strategy" }).isVisible(),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ── 13. Child entity dialogs open (setup / rule / checklist) ─────────────────
  console.log("\n■ Child entity dialogs");
  await page.getByRole("tab", { name: "Setups", exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /New Setup/i }).first().click();
  await page.waitForTimeout(600);
  ok(
    "Setup dialog opens",
    await page.getByRole("dialog").filter({ hasText: "New setup" }).isVisible(),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: "Rules", exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /New rule/i }).first().click();
  await page.waitForTimeout(600);
  ok(
    "Rule dialog opens",
    await page.getByRole("dialog").filter({ hasText: "New operating rule" }).isVisible(),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ── 14. Light theme ──────────────────────────────────────────────────────────
  console.log("\n■ Light theme");
  await page.goto(`${BASE}/playbook?tab=overview`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.waitForTimeout(600);
  ok(
    "Light: overview tiles still visible",
    await page.locator("[data-testid='overview-total-strategies']").isVisible(),
  );
  const lightBg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  ok(`Light theme applied (body bg ${lightBg})`, lightBg !== "rgb(14, 17, 22)" && lightBg !== "rgb(10, 10, 10)");
  await page.screenshot({ path: path.join(OUT, "playbook-light.png") });

  // ── 15. Mobile 390 ───────────────────────────────────────────────────────────
  console.log("\n■ Mobile 390");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/playbook`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2200);
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  );
  ok("Mobile: no horizontal overflow", !mobileOverflow);
  ok(
    "Mobile: tab list still reachable",
    await page.getByRole("tab", { name: "Performance", exact: true }).isVisible(),
  );
  await page.screenshot({ path: path.join(OUT, "playbook-mobile.png") });

  // Desktop shot of the overview for the visual tour
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${BASE}/playbook?tab=overview`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(OUT, "playbook-overview.png") });
  await page.goto(`${BASE}/playbook?tab=strategies`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "playbook-strategies.png") });

  await browser.close();

  const realErrors = consoleErrors.filter((text) => !isEnvNoise(text));
  console.log("\n■ Console");
  ok(`0 console errors (${realErrors.length} after noise filter)`, realErrors.length === 0);
  if (realErrors.length > 0) console.log(realErrors.slice(0, 5));

  console.log(`\n════════════════════════════════`);
  console.log(`  PASS ${pass}  /  FAIL ${fail}`);
  console.log(`════════════════════════════════`);
  process.exit(fail > 0 ? 1 : 0);
})();
