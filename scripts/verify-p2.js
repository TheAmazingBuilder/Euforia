/**
 * Priorité 2 verification - weekly coach report + pre-trade checklist.
 * Probes: /coach tabs (Chat | Weekly report), weekly report content
 * (headline, numbers grid, leaks, one focus), copy button; trade modal
 * pre-flight checklist appears when a playbook setup is picked and freezes
 * answers into the payload (payload asserted via store behavior: checklist
 * section visible + answer toggles). Mobile 390px + console health.
 * Screenshots into scripts/shots/p2/. Exit 1 on any FAIL.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = "scripts/shots/p2";

function ok(name, condition, detail = "") {
  const status = condition ? "PASS" : "FAIL";
  console.log(`${status}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!condition) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(String(err)));

  // ── Coach: weekly report tab ─────────────────────────────────────────────
  await page.goto(`${BASE}/coach`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const tablist = page.locator("[role='tablist'][aria-label='Coach sections']");
  ok("coach tabs present", (await tablist.count()) === 1);
  ok(
    "chat tab selected by default",
    (await tablist.locator("[role='tab']").nth(0).getAttribute("aria-selected")) === "true",
  );

  await tablist.locator("[role='tab']").nth(1).click();
  await page.waitForTimeout(1200);

  const panel = page.locator("[data-testid='weekly-report']");
  ok("weekly report panel renders", (await panel.count()) === 1);

  const panelText = await panel.textContent();
  ok("weekly review heading", panelText?.includes("Weekly review") ?? false);
  ok("week range shown", /Week of .*→/.test(panelText ?? ""));
  ok("net R headline (R suffix)", /R$|R\b/.test((await panel.locator("p.font-mono").first().textContent()) ?? ""));
  ok("numbers: Expectancy + Win rate + Discipline + Limits", (panelText?.includes("Expectancy") && panelText?.includes("Win rate") && panelText?.includes("Discipline avg") && panelText?.includes("Limits respected")) ?? false);
  ok("leaks: violations + top mistake + checklist", (panelText?.includes("Rule violations") && panelText?.includes("Top mistake") && panelText?.includes("Pre-flight checklist")) ?? false);
  ok("wins: best day + top strategy + graded", (panelText?.includes("Best day") && panelText?.includes("Top strategy") && panelText?.includes("Trades graded")) ?? false);
  ok("one focus box", (panelText?.includes("One focus for next week")) ?? false);
  ok("copy report button", (await page.getByRole("button", { name: "Copy report" }).count()) === 1);

  await page.screenshot({ path: `${OUT}/weekly-report-desktop.png`, fullPage: true });

  // Switching back to chat keeps working
  await tablist.locator("[role='tab']").nth(0).click();
  await page.waitForTimeout(600);
  ok("chat tab still renders", (await page.locator("[role='tablist']").count()) === 1);

  // ── Trade modal: pre-flight checklist ────────────────────────────────────
  await page.goto(`${BASE}/trades`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.locator("aside button[aria-label='New Trade']").click();
  await page.waitForTimeout(800);

  const dialog = page.locator("[role='dialog']");
  ok("trade modal opens", (await dialog.count()) >= 1);

  // Pick the first playbook strategy radio
  const radios = dialog.locator("[role='radiogroup'][aria-label='Strategy'] [role='radio']");
  const radioCount = await radios.count();
  ok("strategy options present", radioCount >= 2, `count=${radioCount}`);
  await radios.first().click();
  await page.waitForTimeout(500);

  const checklist = dialog.locator("[data-testid='preflight-checklist']");
  ok("preflight checklist appears", (await checklist.count()) === 1);

  const checklistText = await checklist.textContent();
  ok("checklist questions render", (checklistText?.includes("Setup matches your playbook criteria") && checklistText?.includes("risk budget") && checklistText?.includes("News / economic calendar")) ?? false);
  ok("checklist counter starts 0/3", checklistText?.includes("0/3") ?? false);

  // Answer one question (first Yes)
  await checklist.locator("[role='group'] button").first().click();
  await page.waitForTimeout(300);
  ok("checklist counter updates 1/3", (await checklist.textContent())?.includes("1/3") ?? false);

  // Answer all three "Yes" → no amber warning
  const groups = checklist.locator("[role='group']");
  const groupCount = await groups.count();
  for (let i = 1; i < groupCount; i += 1) {
    await groups.nth(i).locator("button").first().click();
    await page.waitForTimeout(200);
  }
  ok("checklist counter reaches 3/3", (await checklist.textContent())?.includes("3/3") ?? false);
  await page.screenshot({ path: `${OUT}/preflight-checklist.png`, fullPage: false });

  // Answer "No" on the last question → amber honesty note appears
  await groups.nth(groupCount - 1).locator("button").nth(1).click();
  await page.waitForTimeout(300);
  ok("amber note on 'No'", ((await checklist.textContent())?.includes("red check is still a valid capture")) ?? false);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ── Mobile 390px: weekly report ──────────────────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrors = [];
  mobile.on("console", (msg) => msg.type() === "error" && mobileErrors.push(msg.text()));
  mobile.on("pageerror", (err) => mobileErrors.push(String(err)));

  await mobile.goto(`${BASE}/coach`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1200);
  await mobile.locator("[role='tablist'][aria-label='Coach sections'] [role='tab']").nth(1).click();
  await mobile.waitForTimeout(1200);
  const overflow = await mobile.evaluate(
    () => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
  );
  ok("mobile weekly: no horizontal overflow", overflow <= 0, `overflow=${overflow}px`);
  await mobile.screenshot({ path: `${OUT}/weekly-report-mobile.png`, fullPage: true });

  // ── Console health ───────────────────────────────────────────────────────
  ok("console: no errors on coach/trades", errors.length === 0, errors.slice(0, 2).join(" | "));
  ok("console: no errors mobile", mobileErrors.length === 0, mobileErrors.slice(0, 2).join(" | "));

  await browser.close();
  console.log(process.exitCode === 1 ? "\nRESULT: FAIL" : "\nRESULT: ALL PASS");
})();
