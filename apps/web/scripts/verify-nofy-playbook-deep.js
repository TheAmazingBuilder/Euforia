/**
 * Verify — Nofy ↔ Playbook approfondi (increment ③).
 *
 * Covers:
 *   A. SETUP notes: setup row detail carries the Nofy section; "Take notes"
 *      creates a linked note in Nofy (SETUP ref card resolved); returning
 *      to Playbook shows the linked count.
 *   B. RULE notes: rule rows gain a notes toggle; the expanded area lists
 *      linked notes and spawns a RULE-linked note.
 *   C. RULE ref kind end-to-end: the editor's entity picker offers the
 *      Rule chip and resolves real playbook rules.
 *   D. Regression: strategy detail keeps its Nofy section.
 * SPA-only navigation after the first goto (MSW store lives in the tab).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");
const { ensureLogin } = require("./helpers/login"); // AUTH-1 gate: scripts log the demo account in first

const BASE = "http://localhost:3000";
const NOISE = [/\/api\/auth\/(me|refresh)\b/i, // fresh-context boot restore 401s are expected
  /socket\.io/i, /candles/i, /market-service/i, /favicon/i, /net::ERR/i, /X-TransformPort/i];
const SHOTS = "/home/z/my-project/scripts/shots/nofy-playbook-deep";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400 && !NOISE.some((re) => re.test(resp.url()))) errors.push(`${resp.status()} ${resp.url()}`);
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };

  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await ensureLogin(page); // AUTH-1 gate bootstrap (SPA flow preserved)
  await page.waitForTimeout(800);

  // ══ A. SETUP notes ═══════════════════════════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/playbook"]').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="tab-setups"]').click();
  await page.waitForTimeout(900);

  const setupRow = page.locator('[data-testid="setup-row"]').first();
  await setupRow.locator('button[aria-label="Expand"]').click();
  await page.waitForTimeout(700);
  check("Setup detail shows the Nofy section", await setupRow.locator('[data-testid="setup-nofy-section"]').isVisible());
  // The Nofy seed may already carry setup-linked notes — read the baseline.
  const setupCountBefore = Number(((await setupRow.locator('[data-testid="setup-nofy-count"]').textContent()) ?? "0").trim());
  check("Setup linked count readable", Number.isFinite(setupCountBefore) === true, `before=${setupCountBefore}`);

  await setupRow.locator('[data-testid="setup-take-notes"]').click();
  await page.waitForTimeout(2000);
  const setupTitle = await page.locator('[data-testid="nofy-title-input"]').inputValue();
  const editorText = (await page.locator("body").textContent()) ?? "";
  check("Take notes SPA-lands in the Nofy editor", page.url().includes("/nofy") === true, page.url());
  check("Setup note title carries the setup name", setupTitle.includes("— setup notes") === true, setupTitle);
  check("SETUP ref card resolved (meta visible)", editorText.includes("Playbook setup") === true);
  await page.screenshot({ path: `${SHOTS}/setup-note-editor.png` });

  // Back to Playbook — the same setup now lists the linked note.
  await page.locator('nav[aria-label="Main navigation"] a[href="/playbook"]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="tab-setups"]').click();
  await page.waitForTimeout(900);
  await page.locator('[data-testid="setup-row"]').first().locator('button[aria-label="Expand"]').click();
  await page.waitForTimeout(900);
  const setupCountAfter = Number(((await page.locator('[data-testid="setup-row"]').first().locator('[data-testid="setup-nofy-count"]').textContent()) ?? "0").trim());
  check("Setup linked count incremented", setupCountAfter === setupCountBefore + 1, `${setupCountBefore} → ${setupCountAfter}`);
  await page.screenshot({ path: `${SHOTS}/setup-notes-linked.png` });

  // ══ B. RULE notes ════════════════════════════════════════════════════════
  await page.locator('[data-testid="tab-rules"]').click();
  await page.waitForTimeout(900);
  const ruleToggle = page.locator('[data-testid="playbook-rule-row"]').first().locator('[data-testid="rule-notes-toggle"]');
  await ruleToggle.click();
  await page.waitForTimeout(800);
  check("Rule notes area expands", await page.locator('[data-testid="rule-notes-area"]').isVisible());
  check("Rule Nofy section rendered", await page.locator('[data-testid="rule-nofy-section"]').isVisible());
  await page.locator('[data-testid="rule-take-notes"]').first().click();
  await page.waitForTimeout(2000);
  const ruleTitle = await page.locator('[data-testid="nofy-title-input"]').inputValue();
  const ruleEditorText = (await page.locator("body").textContent()) ?? "";
  check("Rule note created in Nofy", page.url().includes("/nofy") && ruleTitle.includes("— rule notes") === true, ruleTitle);
  check("RULE ref card resolved (meta visible)", ruleEditorText.includes("Playbook rule") === true);
  await page.screenshot({ path: `${SHOTS}/rule-note-editor.png` });

  // Back — the rule's expanded area now lists the note.
  await page.locator('nav[aria-label="Main navigation"] a[href="/playbook"]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="tab-rules"]').click();
  await page.waitForTimeout(900);
  await page.locator('[data-testid="playbook-rule-row"]').first().locator('[data-testid="rule-notes-toggle"]').click();
  await page.waitForTimeout(900);
  check("Rule linked count updated to 1", ((await page.locator('[data-testid="rule-nofy-count"]').first().textContent()) ?? "").trim() === "1");

  // ══ C. RULE ref kind in the entity picker ════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/nofy"]').click();
  await page.waitForTimeout(1500);
  // Open any note from the notes browser.
  const notesTab = page.locator('[data-testid="nofy-tab-notes"]');
  if ((await notesTab.count()) > 0) {
    await notesTab.click();
    await page.waitForTimeout(1000);
  }
  await page.locator('[data-testid="nofy-note-row"], [data-testid="nofy-note-card"]').first().click();
  await page.waitForTimeout(1500);
  // Slash menu → the reference command opens the entity picker.
  await page.locator('[data-testid="nofy-blocks"]').click();
  await page.keyboard.type("/");
  await page.waitForTimeout(600);
  const slashItem = page.locator('[data-testid="nofy-slash-item"]').filter({ hasText: /reference/i }).first();
  await slashItem.click();
  await page.waitForTimeout(700);
  const picker = page.locator('[data-testid="nofy-ref-picker"]');
  check("Entity picker opened from the slash menu", await picker.isVisible().catch(() => false));
  check("Rule chip offered in the picker", (await page.locator('[data-testid="nofy-ref-kind-RULE"]').count()) === 1);
  await page.locator('[data-testid="nofy-ref-kind-RULE"]').click();
  await page.waitForTimeout(700);
  check(
    "Real playbook rules resolve as refs",
    (await picker.getByRole("button").count()) >= 1 && ((await picker.textContent()) ?? "").includes("Playbook rule"),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ══ D. Regression — strategy detail keeps its Nofy section ═══════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/playbook"]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="tab-setups"]').click();
  await page.waitForTimeout(800);
  // Strategy header buttons open the detail dialog.
  await page.locator('section[aria-label^="Setups of"] header button').first().click();
  await page.waitForTimeout(900);
  check("Strategy detail keeps its Nofy section", await page.locator('[data-testid="strategy-nofy-section"]').isVisible());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ══ Cleanliness ══════════════════════════════════════════════════════════
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 4).join(" | "));

  console.log("\n=== SUMMARY ===");
  console.log(results.filter((line) => line.startsWith("FAIL")).length === 0 ? "ALL PASS" : "FAILURES PRESENT");
  await browser.close();
})().catch((error) => {
  console.error("SCRIPT ERROR:", error);
  process.exit(1);
});
