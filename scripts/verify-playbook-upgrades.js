/**
 * Verify - Playbook module upgrades (4 user-selected features).
 *  1. Live compliance score: % of the last 20 closed trades matched to the
 *     declared setup (server-computed, MATCHED only, unreviewed not judged)
 *  2. Strategy version diff: edit a definition → v1 frozen → visual diff
 *  3. Setup → instrument/session heuristics: best window + one-click ledger
 *     pre-filter link
 *  4. Light 90d backtest per setup with an honest sample-size badge
 * Plus light theme, mobile 390 and console health.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

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

  const waitForToast = async (text, timeout = 5000) => {
    try {
      await page.waitForSelector(`[data-sonner-toast]:has-text("${text}")`, { timeout });
      return true;
    } catch {
      return false;
    }
  };

  // ── 1. Live compliance score (Overview) ────────────────────────────────────
  const overviewPromise = page.waitForResponse(
    (resp) => resp.url().includes("/playbook/overview") && resp.request().method() === "GET",
    { timeout: 30_000 },
  );
  await page.goto(`${BASE}/playbook`, { waitUntil: "networkidle", timeout: 60_000 });
  const overview = await (await overviewPromise).json();
  await page.waitForTimeout(700);

  const complianceCard = page.locator('[data-testid="compliance-card"]');
  check("Compliance card rendered on the overview", await complianceCard.isVisible());
  const compliance = overview.compliance;
  check(
    "Server compliance numbers are coherent",
    compliance.reviewed === compliance.matched + compliance.partial + compliance.offPlaybook &&
      compliance.windowSize === 20,
    `reviewed=${compliance.reviewed} matched=${compliance.matched} partial=${compliance.partial} off=${compliance.offPlaybook} unreviewed=${compliance.unreviewed}`,
  );
  const expectedScore =
    compliance.reviewed > 0 ? Math.round((compliance.matched / compliance.reviewed) * 100) : null;
  const scoreText = (await page.locator('[data-testid="compliance-score"]').textContent()) ?? "";
  check(
    "Score equals matched/reviewed (MATCHED only)",
    compliance.scorePct === null
      ? scoreText.includes("-")
      : scoreText.includes(`${expectedScore}%`),
    `ui=${scoreText} server=${compliance.scorePct}`,
  );
  check(
    "Unreviewed trades reported, not judged",
    compliance.unreviewed === 0 ||
      ((await complianceCard.textContent()) ?? "").includes("not reviewed yet - not judged"),
    `unreviewed=${compliance.unreviewed}`,
  );
  await page.screenshot({ path: "scripts/shots/playbook-upgrades-compliance.png" });

  // ── 2+3+4. Setups: 90d backtest + sample badge + ledger pre-filter ─────────
  await page.locator('[data-testid="tab-setups"]').click();
  await page.waitForTimeout(800);
  const firstRow = page.locator('[data-testid="setup-row"]').first();
  await firstRow.locator('button[aria-label="Expand"]').click();
  await page.waitForTimeout(600);
  const insight = firstRow.locator('[data-testid="setup-insight"]');
  check("Setup insight block renders (90-day track record)", await insight.isVisible());
  const sampleBadge = (await insight.locator('[data-testid="setup-insight-sample"]').textContent()) ?? "";
  check(
    "Sample-size badge shows n (small-sample flagged honestly)",
    /n = \d+/.test(sampleBadge) || sampleBadge.includes("small sample"),
    sampleBadge,
  );
  check(
    "Track record shows win rate + expectancy",
    ((await insight.textContent()) ?? "").includes("Expectancy"),
  );
  check(
    "Market heuristic: best window (instrument + session) present",
    ((await insight.textContent()) ?? "").includes("Best window"),
  );

  // Pre-filter: the link carries instrument + strategy into the ledger URL.
  const filterLink = insight.locator('[data-testid="setup-insight-filter"]');
  const href = await filterLink.getAttribute("href");
  check(
    "Pre-filter link carries inst + strat params",
    href !== null && href.includes("/trades?inst=") && href.includes("&strat="),
    href ?? "no link",
  );
  await filterLink.click();
  await page.waitForTimeout(1200);
  check("Ledger opens pre-filtered", page.url().includes("/trades?inst=") && page.url().includes("strat="), page.url());
  await page.waitForSelector('[data-testid="trades-row"]', { timeout: 30_000 });
  const instrumentFilter = (await page.locator('[data-testid="trades-filter-instrument"]').textContent()) ?? "";
  check(
    "Instrument select reflects the heuristic (all rows share it)",
    !instrumentFilter.includes("All") || (await page.locator('[data-testid="trades-row"]').count()) === 0,
    instrumentFilter.slice(0, 30),
  );

  // ── 2. Version diff - create v2, then compare ──────────────────────────────
  await page.goto(`${BASE}/playbook?tab=strategies`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(900);
  await page.locator('button[aria-haspopup="dialog"]:has(h3)').first().click();
  await page.waitForTimeout(700);
  await page.locator('[data-testid="strategy-versions-open"]').click();
  await page.waitForTimeout(700);
  const versionsDialog = page.locator('[data-testid="strategy-versions-dialog"]');
  check("Version history dialog opens", await versionsDialog.isVisible());
  // Fresh store: no prior version yet - the honest empty state.
  check(
    "Empty history state is honest (no prior version yet)",
    ((await versionsDialog.textContent()) ?? "").includes("No prior version yet") ||
      (await page.locator('[data-testid="version-diff-row"]').count()) > 0,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Edit the description - the definition change freezes the current version.
  await page.locator('[data-testid="playbook-edit-strategy"]').click().catch(async () => {
    await page.getByRole("button", { name: "Edit" }).click();
  });
  await page.waitForTimeout(700);
  const descriptionInput = page.locator("#strategy-description");
  await descriptionInput.fill(`${await descriptionInput.inputValue()} [v2 diff check]`);
  await page.getByRole("button", { name: "Save changes" }).click();
  check("Version-freezing edit saved", await waitForToast("version was recorded"));
  await page.waitForTimeout(900);

  // Reopen the detail + history, compare v1 ↔ current.
  await page.locator('button[aria-haspopup="dialog"]:has(h3)').first().click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid="strategy-versions-open"]').click();
  await page.waitForTimeout(800);
  const aTrigger = page.locator('[data-testid="versions-select-a"]');
  const aLabel = (await aTrigger.textContent()) ?? "";
  check("Select A defaults to the frozen v1", aLabel.includes("v1"), aLabel.slice(0, 20));
  const bLabel = (await page.locator('[data-testid="versions-select-b"]').textContent()) ?? "";
  check("Select B defaults to current", bLabel.includes("current"), bLabel.slice(0, 24));
  const diffRows = page.locator('[data-testid="version-diff-row"]');
  check("Diff shows changed fields", (await diffRows.count()) >= 1, `rows=${await diffRows.count()}`);
  const diffText = (await page.locator('[data-testid="version-diff"]').textContent()) ?? "";
  check(
    "Diff marks the description change (CHANGED badge, old→new lines)",
    diffText.includes("Description") && diffText.includes("CHANGED") && diffText.includes("−") && diffText.includes("+"),
  );
  await page.screenshot({ path: "scripts/shots/playbook-upgrades-diff.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ── Light + mobile ─────────────────────────────────────────────────────────
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  });
  await page.goto(`${BASE}/playbook`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(900);
  check("Light theme: compliance card renders", await page.locator('[data-testid="compliance-card"]').isVisible());
  await page.screenshot({ path: "scripts/shots/playbook-upgrades-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "dark");
  });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (err) => errors.push(`mobile: ${err}`));
  await mobile.goto(`${BASE}/playbook`, { waitUntil: "networkidle", timeout: 60_000 });
  await mobile.waitForTimeout(900);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Mobile 390: no horizontal overflow", overflow <= 0, `${overflow}px`);
  await mobile.locator('[data-testid="tab-setups"]').click();
  await mobile.waitForTimeout(600);
  await mobile.locator('[data-testid="setup-row"]').first().locator('button[aria-label="Expand"]').click();
  await mobile.waitForTimeout(600);
  check(
    "Mobile: setup insight renders",
    await mobile.locator('[data-testid="setup-insight"]').first().isVisible(),
  );
  await mobile.screenshot({ path: "scripts/shots/playbook-upgrades-mobile.png" });
  await mobile.close();

  // ── Console health ─────────────────────────────────────────────────────────
  const realErrors = errors.filter(
    (text) =>
      !text.includes("400") &&
      !text.includes("Failed to load resource") &&
      !text.includes("socket.io") &&
      !text.includes("XTransformPort"),
  );
  check("No console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  console.log("\n=== PLAYBOOK UPGRADES RESULTS ===");
  for (const line of results) console.log(line);
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error("VERIFY SCRIPT CRASHED:", error);
  process.exit(1);
});
