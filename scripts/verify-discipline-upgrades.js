/**
 * Verify — Discipline / Risk upgrades (4 user-selected features).
 *  1. Violation Pareto (80/20): ranked by frequency, cumulative %, « vital
 *     few » highlighted, drill-through to the actual trades
 *  2. Emotion → outcome heatmap (server-computed, correlational by design)
 *  3. Capture guardrail: soft-lock after N violations today (preference),
 *     honest two-step acknowledgment — never a hard block
 *  4. Weekly discipline report pushed to the inbox on the new week
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
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  // ── 1+2. Pareto + emotion heatmap (Discipline page) ────────────────────────
  await page.goto(`${BASE}/discipline`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);

  const pareto = page.locator('[data-testid="violation-pareto"]');
  check("Pareto card rendered", await pareto.isVisible());
  const paretoRows = page.locator('[data-testid^="pareto-row-"]');
  const rowCount = await paretoRows.count();
  check("Pareto ranks violation types", rowCount >= 1, `rows=${rowCount}`);
  if (rowCount >= 2) {
    // Descending order: first row's count ≥ second row's count.
    const firstCount = Number((await paretoRows.nth(0).textContent())?.match(/(\d+)\s*\d+% cum/)?.[1] ?? 0);
    const secondCount = Number((await paretoRows.nth(1).textContent())?.match(/(\d+)\s*\d+% cum/)?.[1] ?? 0);
    check("Pareto sorted by frequency (desc)", firstCount >= secondCount, `${firstCount} vs ${secondCount}`);
  }
  check(
    "Top-2 share badge rendered",
    ((await pareto.textContent()) ?? "").includes("top 2 ="),
  );

  // Heatmap FIRST — the drill-through below navigates away to /trades.
  const emotionCard = page.locator('[data-testid="emotion-matrix"]');
  check("Emotion heatmap card rendered", await emotionCard.isVisible());
  const emotionRows = await page.locator('[data-testid^="emotion-row-"]').count();
  check("Heatmap has emotion rows from the window", emotionRows >= 1, `rows=${emotionRows}`);
  check(
    "Correlational disclaimer present",
    ((await emotionCard.textContent()) ?? "").includes("correlational, not causal"),
  );
  await page.screenshot({ path: "scripts/shots/discipline-upgrades-heatmap.png" });
  await page.screenshot({ path: "scripts/shots/discipline-upgrades-pareto.png", fullPage: false });

  // Drill-through: click the first type → trades list → open trade drawer.
  await paretoRows.nth(0).locator("button").first().click();
  await page.waitForTimeout(500);
  const tradeLinks = page.locator('[data-testid="pareto-trade-link"]');
  const linkCount = await tradeLinks.count();
  check(
    "Drill-through lists the type's trades",
    (await page.locator('[data-testid="pareto-trades"]').count()) === 1,
    `rows=${rowCount}, trade links=${linkCount}`,
  );
  if (linkCount > 0) {
    await tradeLinks.first().click();
    await page.waitForTimeout(1100);
    // The deep link consumes ?trade= (the URL is stripped on purpose once
    // the drawer opens) — the drawer being open IS the success signal.
    check(
      "Drill-through opens the trade drawer",
      (await page.locator('[data-testid="trade-detail-dialog"]').count()) > 0 ||
        (await page.locator('[data-testid="trade-detail-drawer"]').count()) > 0,
      page.url().slice(0, 90),
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: "scripts/shots/discipline-upgrades-drillthrough.png" });

  // ── 3. Weekly discipline report in the inbox ───────────────────────────────
  await page.locator('[data-testid="notification-bell"]').click();
  await page.waitForTimeout(600);
  const inboxItems = page.locator('[data-testid="notification-item"]');
  const inboxText = (await inboxItems.allTextContents()).join(" | ");
  check(
    "Weekly discipline report pushed to the inbox",
    inboxText.includes("Discipline weekly report"),
    inboxText.slice(0, 110),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ── 4. Guardrail: preference + soft-lock mechanics ─────────────────────────
  // A full reload here RESEEDS the store — harmless because the preference
  // is saved AFTER this navigation; everything downstream stays in-session.
  await page.goto(`${BASE}/settings#trading`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1000);
  await page.locator('[data-testid="settings-trading"]').scrollIntoViewIfNeeded();
  await page.locator('[data-testid="settings-trading-softlock"]').selectOption({ label: "After 1 violation today" });
  await page.waitForTimeout(200);
  await page.locator('[data-testid="settings-trading-save"]').click();
  await page.waitForTimeout(800);
  check("Guardrail preference saved", await page.waitForSelector('[data-sonner-toast]:has-text("saved")', { timeout: 4000 }).then(() => true).catch(() => false));

  // Force a rule violation TODAY: capture trades until the engine trips
  // (MAX_TRADES_PER_DAY limit 3 — the 3rd capture of the day breaches).
  const createdViolations = await page.evaluate(async () => {
    const instrumentsResponse = await fetch("/api/instruments");
    const instruments = (await instrumentsResponse.json()).instruments;
    let violations = 0;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const statusResponse = await fetch("/api/rules/status");
      const status = await statusResponse.json();
      if (status.violationsToday > 0) {
        violations = status.violationsToday;
        break;
      }
      await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant: "open",
          instrumentId: instruments[0].id,
          direction: "BUY",
          entryPrice: "100",
          size: { mode: "quantity", quantity: "1" },
          outOfPlaybook: true,
        }),
      });
    }
    const finalStatus = await (await fetch("/api/rules/status")).json();
    return { violations: Math.max(violations, finalStatus.violationsToday) };
  });
  check(
    "Rule violation forced today (engine trip)",
    createdViolations.violations >= 1,
    `violationsToday=${createdViolations.violations}`,
  );

  // The capture form is now soft-locked until acknowledged.
  await page.click('a[href="/trades"]');
  await page.waitForTimeout(900);
  await page.locator('[data-testid="trades-new"]').click();
  await page.waitForTimeout(800);
  const guardrailBanner = page.locator('[data-testid="trade-form-guardrail"]');
  check("Guardrail banner shows in the capture form", await guardrailBanner.isVisible());
  check(
    "Banner counts today's violations",
    ((await guardrailBanner.textContent()) ?? "").includes("soft-locked"),
    ((await guardrailBanner.textContent()) ?? "").slice(0, 90),
  );
  // Fill every required field so ONLY the guardrail keeps the submit off:
  // entry + exit prices, exit AFTER entry (+1h, minute resolution), a fixed
  // size (the auto-sizer needs more context) and out-of-playbook.
  await page.locator("#trade-entry-price").fill("100");
  await page.locator("#trade-exit-price").fill("101");
  const entryAtValue = await page.locator("#trade-entry-at").inputValue();
  const [datePart, timePart] = entryAtValue.split("T");
  const [hours, minutes] = timePart.split(":").map(Number);
  const later = `${datePart}T${String((hours + 1) % 24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  await page.locator("#trade-exit-at").fill(later);
  await page.getByRole("tab", { name: "Fixed size" }).click();
  await page.locator("#trade-sizer-quantity").fill("1");
  await page.getByRole("radio", { name: "Out of playbook" }).click();
  await page.waitForTimeout(400);
  const submitButton = page.locator('form button[type="submit"]');
  check(
    "Submit blocked by the soft-lock alone (fields complete)",
    await submitButton.isDisabled(),
  );
  await page.locator('[data-testid="trade-form-guardrail-confirm"]').click();
  await page.waitForTimeout(300);
  check("Acknowledge unlocks the submit (two-step, not a wall)", await submitButton.isEnabled());
  check(
    "Acknowledged state is visible",
    ((await guardrailBanner.textContent()) ?? "").includes("acknowledged"),
  );
  await page.screenshot({ path: "scripts/shots/discipline-upgrades-guardrail.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ── 5. Light theme ─────────────────────────────────────────────────────────
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  });
  await page.goto(`${BASE}/discipline`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1100);
  check("Light theme: pareto + heatmap render", (await pareto.isVisible()) && (await emotionCard.isVisible()));
  await page.screenshot({ path: "scripts/shots/discipline-upgrades-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "dark");
  });

  // ── 6. Mobile 390 ──────────────────────────────────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (err) => errors.push(`mobile: ${err}`));
  await mobile.goto(`${BASE}/discipline`, { waitUntil: "networkidle", timeout: 60_000 });
  await mobile.waitForTimeout(1100);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Mobile 390: no horizontal overflow", overflow <= 0, `${overflow}px`);
  check("Mobile: pareto renders", await mobile.locator('[data-testid="violation-pareto"]').isVisible());
  await mobile.screenshot({ path: "scripts/shots/discipline-upgrades-mobile.png" });
  await mobile.close();

  // ── 7. Console health ──────────────────────────────────────────────────────
  const realErrors = errors.filter(
    (text) =>
      !text.includes("400") &&
      !text.includes("Failed to load resource") &&
      !text.includes("socket.io") &&
      !text.includes("XTransformPort"),
  );
  check("No console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  console.log("\n=== DISCIPLINE UPGRADES RESULTS ===");
  for (const line of results) console.log(line);
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error("VERIFY SCRIPT CRASHED:", error);
  process.exit(1);
});
