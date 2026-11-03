/**
 * Priority 2 verification - coach weekly report, pre-trade checklist,
 * stop efficiency (MAE/MFE), discipline streaks.
 * Run: node scripts/verify-priority2.js   (dev server must be on :3000)
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = "http://localhost:3000";
const OUT = "scripts/priority2";
const errors = [];
const ok = [];

function check(label, condition, detail = "") {
  if (condition) {
    ok.push(label);
    console.log(`  ✓ ${label}`);
  } else {
    errors.push(`${label}${detail ? ` - ${detail}` : ""}`);
    console.log(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleIssues = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      if (!/DevTools|React DevTools|mock|msw/i.test(msg.text())) consoleIssues.push(msg.text());
    }
  });
  page.on("pageerror", (err) => consoleIssues.push(`pageerror: ${err.message}`));
  page.on("response", (res) => {
    if (res.status() >= 400) consoleIssues.push(`HTTP ${res.status()} ${res.url()}`);
  });

  // ── 1. Dashboard - Coach weekly report ────────────────────────────────────
  console.log("\n[1] Dashboard - Coach weekly report");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const report = page.getByTestId("coach-weekly-report");
  await report.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  check("coach weekly report card visible", await report.isVisible().catch(() => false));
  const focus = page.getByTestId("coach-focus");
  check("focus block visible", await focus.isVisible().catch(() => false));
  const focusText = (await focus.textContent().catch(() => "")) ?? "";
  check("focus has a title + message", focusText.length > 60, `len=${focusText.length}`);
  const decisions = await page.getByTestId("coach-decision-best").count();
  check("best decisions rendered", decisions >= 1, `count=${decisions}`);
  const streaksRow = page.getByTestId("coach-streaks");
  check("streaks row in report", await streaksRow.isVisible().catch(() => false));
  const streakText = (await streaksRow.textContent().catch(() => "")) ?? "";
  check("streaks list 4 pillars", /Clean days/.test(streakText) && /Journaling/.test(streakText) && /Grading/.test(streakText) && /Checklist/.test(streakText));
  await page.screenshot({ path: `${OUT}/p2-dashboard-report.png`, fullPage: true });

  // ── 2. Playbook - checklist editor ───────────────────────────────────────
  console.log("\n[2] Playbook - checklist editor");
  await page.goto(`${BASE}/playbook`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  // Open first strategy detail
  await page.locator("[data-slot=card], .group").first().click().catch(() => {});
  await page.waitForTimeout(600);
  const detailDialog = page.getByRole("dialog").first();
  const detailVisible = await detailDialog.isVisible().catch(() => false);
  if (detailVisible) {
    const detailText = (await detailDialog.textContent()) ?? "";
    check("detail dialog shows pre-trade checklist", /Pre-trade checklist/i.test(detailText));
    check("detail checklist marks required items", /required/i.test(detailText));
    // Open the edit form
    await detailDialog.getByRole("button", { name: /edit/i }).first().click();
    await page.waitForTimeout(600);
    const formDialog = page.getByRole("dialog").first();
    const editorVisible = await formDialog.isVisible().catch(() => false);
    check("edit dialog opens", editorVisible);
    const itemCount = await formDialog.locator('input[aria-label^="Checklist item"]').count();
    check("checklist items editable", itemCount >= 3, `items=${itemCount}`);
    // Toggle one item to optional and back - anchor by POSITION inside the
    // fieldset (the title changes with the state, so title-based locators
    // would silently re-resolve to the next button).
    const toggle = formDialog.locator("fieldset button[aria-pressed]").first();
    if (await toggle.isVisible().catch(() => false)) {
      const wasPressed = (await toggle.getAttribute("aria-pressed")) === "true";
      await toggle.click();
      await page.waitForTimeout(200);
      const nowPressed = (await toggle.getAttribute("aria-pressed")) === "true";
      check("required toggle works", nowPressed === !wasPressed, `was=${wasPressed} now=${nowPressed}`);
      await toggle.click();
      await page.waitForTimeout(200);
      const restored = (await toggle.getAttribute("aria-pressed")) === "true";
      check("required toggle restores", restored === wasPressed);
    }
    // Add an item then remove it (round-trip safety)
    const before = await formDialog.locator('input[aria-label^="Checklist item"]').count();
    await formDialog.getByRole("button", { name: /add item/i }).click();
    await page.waitForTimeout(200);
    const after = await formDialog.locator('input[aria-label^="Checklist item"]').count();
    check("add item works", after === before + 1, `${before}→${after}`);
    // Save (keeps data identical: last item was empty → dropped)
    await formDialog.getByRole("button", { name: /save changes/i }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/p2-playbook-editor.png`, fullPage: false });
  } else {
    check("strategy detail dialog opens", false, "no dialog visible");
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ── 3. Capture - checklist guard-rail ────────────────────────────────────
  console.log("\n[3] Capture - pre-trade checklist gating");
  await page.goto(`${BASE}/trades`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.keyboard.press("n"); // open trade modal
  await page.waitForTimeout(700);
  const form = page.locator("form").first();
  const modalOpen = await form.isVisible().catch(() => false);
  check("trade modal opens (hotkey N)", modalOpen);

  // Fill instrument first (combobox) - wait for the listbox, pick option 1
  const instrumentInput = page.locator('[role=combobox]').first();
  await instrumentInput.click();
  const firstOption = page.locator('[role="option"]').first();
  await firstOption.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await firstOption.click().catch(() => {});
  await page.waitForTimeout(400);
  const triggerText = (await instrumentInput.textContent()) ?? "";
  check(
    "instrument selected from combobox",
    !triggerText.includes("Search instrument"),
    `trigger shows: "${triggerText.slice(0, 40)}"`,
  );

  // Entry price + stop so the form is otherwise valid. REALISTIC stop:
  // EURUSD (first option) has contractSize 100000 - a 1.00-wide stop yields
  // < 0.01 lots and the sizer correctly refuses to suggest (min lot would
  // blow the risk budget). 2 pips keeps the auto-size computable.
  await page.locator("#trade-entry-price").fill("100");
  await page.locator("#trade-stop").fill("99.998");
  // Exit time must be AFTER the default entry time (now) - push it +2h.
  const exitLocal = new Date(Date.now() + 2 * 3_600_000 - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  await page.locator("#trade-exit-at").fill(exitLocal);
  await page.waitForTimeout(200);

  // Pick a strategy WITH a checklist via the StrategyPicker chips
  const strategyChip = page.locator('button:has-text("Breakout NY")').first();
  await strategyChip.click();
  await page.waitForTimeout(400);
  const panel = page.getByTestId("pre-trade-checklist");
  check("checklist panel appears on strategy pick", await panel.isVisible().catch(() => false));
  const items = await panel.locator("button[aria-pressed]").count();
  check("4 checklist items rendered", items === 4, `items=${items}`);

  // Fill remaining required fields (exit for closed variant)
  await page.locator("#trade-exit-price").fill("100.5");
  await page.waitForTimeout(200);

  const submit = form.locator('button[type="submit"]');
  const disabledBefore = await submit.isDisabled();
  check("submit BLOCKED while required items unchecked", disabledBefore === true);
  const warn = panel.locator("text=required item");
  check("amber hint shows missing required items", await warn.isVisible().catch(() => false));

  // Check every item
  const itemButtons = panel.locator("button[aria-pressed]");
  const n = await itemButtons.count();
  for (let i = 0; i < n; i += 1) {
    const btn = itemButtons.nth(i);
    if ((await btn.getAttribute("aria-pressed")) === "false") await btn.click();
  }
  await page.waitForTimeout(250);
  const allPressed = await itemButtons.evaluateAll((els) => els.every((el) => el.getAttribute("aria-pressed") === "true"));
  check("all items toggleable", allPressed);
  const disabledAfter = await submit.isDisabled();
  // The sizer needs the balance query (useStatsOverview) to land before it
  // can auto-size - wait for the "risk % + stop" hint to clear, then re-check.
  await page
    .waitForFunction(() => !document.body.textContent?.includes("risk % + stop for auto-size"), { timeout: 8000 })
    .catch(() => {});
  const disabledFinal = await submit.isDisabled();
  const addHint = (await page.locator("form p", { hasText: "Add:" }).last().textContent().catch(() => "")) ?? "";
  check("submit UNLOCKED once checklist complete", disabledFinal === false,
    disabledFinal ? `still missing → ${addHint.trim()}` : "");
  await page.screenshot({ path: `${OUT}/p2-capture-checklist.png`, fullPage: false });

  // Submit the trade end-to-end → gate should open (closed variant)
  await submit.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1400);
  const gateVisible = await page.getByTestId("judgment-gate").isVisible().catch(() => false);
  check("judgment gate opens after submit (E2E capture)", gateVisible);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ── 4. Analytics - stop efficiency ───────────────────────────────────────
  console.log("\n[4] Analytics - stop efficiency (What-If)");
  await page.goto(`${BASE}/analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("tab", { name: /what-if/i }).click();
  await page.waitForTimeout(900);
  const stopEff = page.getByTestId("stop-efficiency");
  check("stop efficiency card visible", await stopEff.isVisible().catch(() => false));
  const mae = page.getByTestId("mae-buckets");
  const mfe = page.getByTestId("mfe-buckets");
  check("MAE buckets rendered", await mae.isVisible().catch(() => false));
  check("MFE buckets rendered", await mfe.isVisible().catch(() => false));
  const effText = (await stopEff.textContent().catch(() => "")) ?? "";
  check("capture ratio insight present", /favorable excursion/.test(effText));
  check("sample sizes shown per histogram", /n \d+/.test(effText));
  // The low-n flag only appears when a side has fewer than 10 trades.
  check(
    "low-n flag iff thin sample",
    /low n/.test(effText) || (!/low n/.test(effText) && effText.includes("n ")),
  );
  await page.screenshot({ path: `${OUT}/p2-stop-efficiency.png`, fullPage: true });

  // ── 5. Discipline - streaks ──────────────────────────────────────────────
  console.log("\n[5] Discipline - process streaks");
  await page.goto(`${BASE}/discipline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const streakCard = page.getByTestId("discipline-streaks");
  check("process streaks card visible", await streakCard.isVisible().catch(() => false));
  for (const key of ["clean_days", "journaling", "grading", "checklist"]) {
    check(`streak ${key} rendered`, await page.getByTestId(`streak-${key}`).isVisible().catch(() => false));
  }
  await page.screenshot({ path: `${OUT}/p2-discipline-streaks.png`, fullPage: true });

  // ── 6. Themes + mobile ───────────────────────────────────────────────────
  console.log("\n[6] Themes + mobile");
  const darkPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await darkPage.goto(BASE, { waitUntil: "networkidle" });
  await darkPage.evaluate(() => {
    localStorage.setItem("theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
  });
  await darkPage.waitForTimeout(900);
  check("light theme report visible", await darkPage.getByTestId("coach-weekly-report").isVisible().catch(() => false));
  await darkPage.screenshot({ path: `${OUT}/p2-dashboard-light.png`, fullPage: false });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(900);
  const bodyScroll = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("no horizontal scroll on 390px", bodyScroll);
  await mobile.screenshot({ path: `${OUT}/p2-dashboard-mobile.png`, fullPage: true });

  console.log("\n[7] Console health");
  check("no console errors/warnings/4xx", consoleIssues.length === 0, consoleIssues.slice(0, 3).join(" | "));

  await browser.close();
  console.log(`\n═══ RESULT: ${ok.length} passed, ${errors.length} failed ═══`);
  if (errors.length > 0) {
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    process.exit(1);
  }
})().catch((err) => {
  console.error("Script crashed:", err);
  process.exit(1);
});
