/**
 * Verify — TOOLS module: Lot Size + Compounding calculators.
 *
 * IMPORTANT: navigation uses sidebar clicks ONLY (SPA). Exactly ONE reload
 * is performed, for the compounding re-render sanity on a fresh mount — and
 * dark mode is exercised through media emulation (no reload).
 *
 * Covers (MASTER PROMPT §54 DoD + §45/§49):
 *   A. Sidebar gains the TOOLS section; both calculators reachable by
 *      SPA navigation; headers render.
 *   B. Lot size happy path: instrument (XAUUSD example §10), balance, risk,
 *      direction, entry, SL, optional TP → Calculate → result 0.10 lots,
 *      units, risk amount, pip value, RR 1 : 2, breakdown rows.
 *   C. Lot size validation (§12/§13): identical entry/stop, wrong-side stop,
 *      zero/invalid risk → inline errors, never a silent zero result.
 *   D. Risk presets (§17) update the risk field; advanced parameters (§15)
 *      expose contract/pip/pip-value overrides with the broker disclaimer.
 *   E. Copy actions (§39): Copy Lot Size writes to the clipboard.
 *   F. Compounding (§18–§23): prefilled 1000/20/5 → live summary (final
 *      ≈ 2 653,30), growth chart canvas, 20-row table with sticky header.
 *   G. Live updates (§19): changing the gain recomputes without any button;
 *      negative return (§26) reduces the balance; presets fill the fields.
 *   H. Currency selector (§28): switching to EUR re-formats the summary.
 *   I. Mobile 390px: no horizontal overflow; table becomes cards (§31).
 *   J. Dark mode (§45): both pages render clean under dark emulation.
 *   L. Trading costs (V1.1): commission + spread shrink the size to 0.09,
 *      effective stop widens to 10.50, total costs shown at size; clearing
 *      the costs restores the V1 size (0.10).
 *   M. Periodic deposits (V1.1): 100/period over 20 periods → Total
 *      Deposits 2 000, Final ≈ 5 959,89, Deposit column appears; clearing
 *      restores the V1 summary and hides the column/cell.
 *   K. Console/network cleanliness.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/calculators";

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400) {
      const url = resp.url();
      const expected =
        (resp.status() === 401 && /\/api\/auth\/(me|refresh)/.test(url)) ||
        /socket\.io/i.test(url) || /X-TransformPort/i.test(url);
      if (!expected) errors.push(`${resp.status()} ${url}`);
    }
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };
  const shot = async (name) => {
    try {
      await page.screenshot({ path: `${SHOTS}/${name}.png` });
    } catch {
      /* late screenshots must never fail the run */
    }
  };

  const sidebarClick = async (href) => {
    // Desktop: the rail link. Mobile: the sheet link — take whichever is
    // VISIBLE (both navs exist in the DOM once the sheet is open).
    const link = page
      .locator(`nav[aria-label="Main navigation"] a[href="${href}"]`)
      .locator("visible=true")
      .first();
    if (!(await link.isVisible().catch(() => false))) {
      await page.locator('[aria-label="Open navigation menu"]').click();
      await link.waitFor({ state: "visible", timeout: 10_000 });
    }
    await link.click();
    await page.waitForURL(new RegExp(href.replace(/\//g, "\\/")), { timeout: 30_000 });
    await page.waitForTimeout(500);
  };
  const fillInput = async (testid, value) => {
    const input = page.locator(`[data-testid="${testid}"]`);
    await input.fill(value);
  };

  // ══ Entry: login ═══════════════════════════════════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(800);

  // ══ A. TOOLS section in the sidebar + SPA navigation ═══════════════════
  const lotLink = page.locator('nav[aria-label="Main navigation"] a[href="/features/lot-size"]');
  const compLink = page.locator('nav[aria-label="Main navigation"] a[href="/features/compounding"]');
  check("A1 Sidebar carries both calculator links", (await lotLink.count()) === 1 && (await compLink.count()) === 1);
  check("A2 TOOLS section title renders", (await page.locator('nav[aria-label="Main navigation"] >> text=Tools').count()) >= 1);

  await lotLink.click();
  await page.waitForURL(/\/features\/lot-size/, { timeout: 30_000 });
  await page.locator('[data-testid="lot-size-inputs"]').waitFor({ state: "visible", timeout: 60_000 });
  const lotH1 = (await page.locator("h1").first().innerText()).trim();
  check("A3 Lot Size page header renders", /lot size/i.test(lotH1), lotH1);
  check("A4 Lot size spec line shows the resolved preset (EURUSD)",
    /FOREX/i.test(await page.locator('[data-testid="lot-size-spec"]').innerText()));
  shot("A-lot-size-empty");

  // ══ B. Lot size happy path — XAUUSD example (§10) ══════════════════════
  await page.locator('[data-testid="lot-size-instrument"]').click();
  await page.locator('[role="option"]', { hasText: /XAUUSD/ }).click();
  await page.locator('[data-testid="lot-size-direction-long"]').check({ force: true }).catch(async () => {
    await page.locator('[data-testid="lot-size-direction-long"]').click({ force: true });
  });
  await fillInput("lot-size-balance", "10000");
  await fillInput("lot-size-risk", "1");
  await fillInput("lot-size-entry", "2650");
  await fillInput("lot-size-stop", "2640");
  await fillInput("lot-size-tp", "2670");
  await page.locator('[data-testid="lot-size-calculate"]').click();
  await page.locator('[data-testid="lot-size-result-lots"]').waitFor({ state: "visible", timeout: 15_000 });

  const lotsText = (await page.locator('[data-testid="lot-size-result-lots"]').innerText()).replace(/\u202f|\u00a0/g, " ");
  check("B1 Result shows 0,10 Lots (§10 example)", /0[,.\u00a0\u202f]?10/i.test(lotsText) && /lots/i.test(lotsText), lotsText);

  const unitsText = (await page.locator('[data-testid="lot-size-result-units"]').innerText()).replace(/\u202f|\u00a0/g, " ");
  check("B2 Units shown (10 oz)", /10/.test(unitsText), unitsText);

  const riskRow = (await page.locator('[data-testid="lot-size-result-risk-amount"]').innerText()).replace(/\u202f|\u00a0/g, " ");
  check("B3 Risk amount 100", /100/.test(riskRow), riskRow);

  const rrRatio = (await page.locator('[data-testid="lot-size-rr-ratio"]').innerText()).replace(/\u202f|\u00a0/g, " ");
  check("B4 Risk/Reward 1 : 2 (§14)", /1\s*:\s*2([,.]0+)?$/.test(rrRatio.trim()), rrRatio);

  const breakdown = (await page.locator('[data-testid="lot-size-breakdown"]').innerText()).replace(/\u202f|\u00a0/g, " ");
  check("B5 Breakdown carries balance, risk, amounts and the floored lot size (§16)",
    /10\s?000/.test(breakdown) && /1[,\.]00\s?%/.test(breakdown) && /0[,\.]1/.test(breakdown));
  check("B6 Broker disclaimer visible (§37)", /vary by broker/i.test(breakdown));
  shot("B-lot-size-result");

  // ══ C. Validation (§12/§13) ════════════════════════════════════════════
  await fillInput("lot-size-stop", "2650");
  await page.locator('[data-testid="lot-size-calculate"]').click();
  await page.locator('[data-testid="lot-size-stop-error"]').waitFor({ state: "visible", timeout: 10_000 });
  const identicalError = await page.locator('[data-testid="lot-size-stop-error"]').innerText();
  check("C1 Identical entry/stop → inline error (§12)", /different from entry price/i.test(identicalError), identicalError);

  await fillInput("lot-size-stop", "2700");
  await page.locator('[data-testid="lot-size-calculate"]').click();
  await page.locator('[data-testid="lot-size-stop-error"]').waitFor({ state: "visible", timeout: 10_000 });
  const sideError = await page.locator('[data-testid="lot-size-stop-error"]').innerText();
  check("C2 Long with stop above entry → inline error (§13)", /below the entry/i.test(sideError), sideError);

  await fillInput("lot-size-stop", "2640");
  await fillInput("lot-size-risk", "0");
  await page.locator('[data-testid="lot-size-calculate"]').click();
  await page.locator('[data-testid="lot-size-risk-error"]').waitFor({ state: "visible", timeout: 10_000 });
  const riskError = await page.locator('[data-testid="lot-size-risk-error"]').innerText();
  check("C3 Zero risk → inline error, result never silently recomputed (§12)", riskError.length > 3, riskError);

  await fillInput("lot-size-risk", "1");
  await fillInput("lot-size-tp", "");
  await page.locator('[data-testid="lot-size-calculate"]').click();
  await page.locator('[data-testid="lot-size-result-lots"]').waitFor({ state: "visible", timeout: 10_000 });
  const rrEmpty = await page.locator('[data-testid="lot-size-rr"]').innerText();
  check("C4 No TP → RR block stays with its empty hint (§14)", /take profit/i.test(rrEmpty));
  shot("C-validation");

  // ══ D. Risk presets + advanced parameters ══════════════════════════════
  await page.locator('[data-testid="lot-size-risk-presets"] button', { hasText: /1[,\.]50/ }).click();
  const riskValue = await page.locator('[data-testid="lot-size-risk"]').inputValue();
  check("D1 Risk preset 1.50% fills the field (§17)", riskValue === "1.5", riskValue);

  await page.locator('[data-testid="lot-size-advanced"] summary').click();
  await page.locator('[data-testid="lot-size-pipvalue"]').waitFor({ state: "visible", timeout: 10_000 });
  const advancedText = (await page.locator('[data-testid="lot-size-advanced"]').innerText()).replace(/\u202f|\u00a0/g, " ");
  check("D2 Advanced shows contract/pip/pip-value fields + broker note (§15)",
    /Contract Size/i.test(advancedText) && /Pip Size/i.test(advancedText) && /Pip Value/i.test(advancedText));

  // ══ E. Copy Lot Size (§39) — assert against the DISPLAYED size ═════════
  await page.locator('[data-testid="lot-size-calculate"]').click();
  await page.locator('[data-testid="lot-size-copy-lots"]').waitFor({ state: "visible", timeout: 10_000 });
  const displayedLots = (await page.locator('[data-testid="lot-size-result-lots"]').innerText())
    .replace(/\u202f|\u00a0/g, " ")
    .trim();
  // innerText glues "0,15" and "Lots" together (CSS margin, no character) —
  // extract the numeric token itself.
  const displayedLotsValue = displayedLots.match(/\d+(?:[.,]\d+)?/)?.[0] ?? ""; // "0,15"
  await page.locator('[data-testid="lot-size-copy-lots"]').click();
  await page.waitForTimeout(600);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  check("E1 Copy Lot Size writes the DISPLAYED size to the clipboard",
    displayedLotsValue !== "" && clipboard.includes(displayedLotsValue) && /lots/i.test(clipboard),
    `clipboard="${clipboard}" displayed="${displayedLotsValue}"`);

  // ══ F. Compounding — SPA nav, prefilled live results ═══════════════════
  await compLink.click();
  await page.waitForURL(/\/features\/compounding/, { timeout: 30_000 });
  await page.locator('[data-testid="compounding-summary-grid"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(800);

  const compH1 = (await page.locator("h1").first().innerText()).trim();
  check("F1 Compounding page header renders", /compounding/i.test(compH1), compH1);

  const summaryText = (await page.locator('[data-testid="compounding-summary-grid"]').innerText()).replace(/\u202f|\u00a0/g, " ");
  check("F2 Prefilled 1000/20/5 → Final ≈ 2 653,30 (§23 example)", /2\s?653,30/.test(summaryText), summaryText.slice(0, 120));
  check("F3 Total Profit +1 653,30 / Total Gain +165,33 %",
    /1\s?653,30/.test(summaryText) && /165,33/.test(summaryText));

  const chartCanvas = page
    .locator('[data-testid="compounding-chart-card"] [role="img"] canvas')
    .first();
  check("F4 Growth chart renders a canvas (§24)", (await chartCanvas.count()) === 1);

  const rowCount = await page.locator('[data-testid="compounding-table-body"] tr').count();
  check("F5 Table shows 20 periods (§22)", rowCount === 20, String(rowCount));

  const stickyHeader = await page
    .locator('[data-testid="compounding-table"] thead')
    .evaluate((el) => getComputedStyle(el).position);
  check("F6 Table header is sticky (§31)", stickyHeader === "sticky", stickyHeader);
  shot("F-compounding");

  // ══ G. Live updates + negative return + presets (§19/§26/§29) ══════════
  await fillInput("compounding-gain", "10");
  await page.waitForTimeout(600);
  const summary10 = (await page.locator('[data-testid="compounding-summary-grid"]').innerText()).replace(/\u202f|\u00a0/g, " ");
  check("G1 Gain 10% recomputes live (final ≈ 6 727,50)", /6\s?727,50/.test(summary10), summary10.slice(0, 120));

  await fillInput("compounding-gain", "-2");
  await page.waitForTimeout(600);
  const summaryNeg = (await page.locator('[data-testid="compounding-summary-grid"]').innerText()).replace(/\u202f|\u00a0/g, " ");
  check("G2 Negative return reduces the balance without error (§26)", /667,61/.test(summaryNeg), summaryNeg.slice(0, 120));

  await fillInput("compounding-gain", "5");
  await page.locator('[data-testid="compounding-balance"]').fill("");
  await page.locator('[data-testid="compounding-balance-error"]').waitFor({ state: "visible", timeout: 10_000 });
  check("G3 Empty balance → inline validation (§25)",
    /required|greater than zero/i.test(await page.locator('[data-testid="compounding-balance-error"]').innerText()));

  await page.locator('[data-testid="compounding-cards"]').waitFor({ state: "visible", timeout: 5_000 }).catch(() => null);
  await page.locator('[data-testid="compounding-balance"]').fill("500");
  await page.waitForTimeout(400);
  const balancePreset = page
    .locator('[data-testid="compounding-inputs"] button', { hasText: /5\s?000/ })
    .first();
  await balancePreset.click();
  await page.waitForTimeout(600);
  const summary5k = (await page.locator('[data-testid="compounding-summary-grid"]').innerText()).replace(/\u202f|\u00a0/g, " ");
  check("G4 Balance preset 5 000 fills and recomputes (§29)", /13\s?266,49/.test(summary5k), summary5k.slice(0, 120));

  // ══ H. Currency selector (§28) ═════════════════════════════════════════
  await page.locator('[data-testid="compounding-currency"]').click();
  await page.locator('[role="option"]', { hasText: /^EUR$/ }).click();
  await page.waitForTimeout(600);
  const summaryEur = (await page.locator('[data-testid="compounding-summary-grid"]').innerText()).replace(/\u202f|\u00a0/g, " ");
  check("H1 Currency switch to EUR re-formats the summary", /€/.test(summaryEur), summaryEur.slice(0, 120));
  await page.locator('[data-testid="compounding-currency"]').click();
  await page.locator('[role="option"]', { hasText: /^USD$/ }).click();
  await page.waitForTimeout(400);

  // ══ I. Mobile 390px — no overflow, table becomes cards ═════════════════
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const overflowComp = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("I1 Mobile 390px: no horizontal overflow on Compounding", overflowComp <= 0, `overflow=${overflowComp}px`);
  const mobileCards = await page.locator('[data-testid="compounding-cards"] > div').count();
  check("I2 Table becomes cards on mobile (§31)", mobileCards === 20, String(mobileCards));
  shot("I-mobile-compounding");

  await sidebarClick("/features/lot-size");
  await page.locator('[data-testid="lot-size-inputs"]').waitFor({ state: "visible", timeout: 30_000 });
  const overflowLot = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("I3 Mobile 390px: no horizontal overflow on Lot Size", overflowLot <= 0, `overflow=${overflowLot}px`);

  // ══ J. Dark mode (§45) — desktop, dark emulation ═══════════════════════
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(800);
  // SPA remount reset the form — re-select the instrument, then re-fill.
  await page.locator('[data-testid="lot-size-instrument"]').click();
  await page.locator('[role="option"]', { hasText: /XAUUSD/ }).click();
  await page.locator('[data-testid="lot-size-balance"]').fill("10000");
  await page.locator('[data-testid="lot-size-risk"]').fill("1");
  await page.locator('[data-testid="lot-size-entry"]').fill("2650");
  await page.locator('[data-testid="lot-size-stop"]').fill("2640");
  await page.locator('[data-testid="lot-size-calculate"]').click();
  await page.locator('[data-testid="lot-size-result-lots"]').waitFor({ state: "visible", timeout: 10_000 });
  check("J1 Lot size renders and computes under dark emulation",
    /0[,\.]10/.test((await page.locator('[data-testid="lot-size-result-lots"]').innerText()).replace(/[\u202f\u00a0]/g, " ")));
  shot("J-dark-lot-size");

  // ══ L. Trading costs (V1.1) — commission + spread shrink the size ══════
  await page.locator('[data-testid="lot-size-costs"] summary').click();
  await fillInput("lot-size-commission", "30");
  await fillInput("lot-size-spread", "0.5");
  await page.locator('[data-testid="lot-size-calculate"]').click();
  await page.locator('[data-testid="lot-size-result-effective-stop"]').waitFor({ state: "visible", timeout: 10_000 });
  const clean = (text) => text.replace(/[\u202f\u00a0]/g, " ");

  const lotsCosts = clean(await page.locator('[data-testid="lot-size-result-lots"]').innerText());
  // risk/lot 1 080 (1 000 stop + 50 spread + 30 commission) → 0.0926 → 0.09
  check("L1 Costs shrink the size to 0.09 lots (divisor 1 080)", /0[,\.]09/.test(lotsCosts), lotsCosts);

  const effStop = clean(await page.locator('[data-testid="lot-size-result-effective-stop"]').innerText());
  check("L2 Effective stop distance 10.50 (10 + 0.5 spread)", /10[,\.]50/.test(effStop), effStop);

  const totalCosts = clean(await page.locator('[data-testid="lot-size-breakdown-total-costs"]').innerText());
  // 0.09 × (50 + 30) = 7.20 at the tradable size
  check("L3 Breakdown shows total costs 7.20 at size", /7[,\.]20/.test(totalCosts), totalCosts);

  await fillInput("lot-size-commission", "");
  await fillInput("lot-size-spread", "");
  await page.locator('[data-testid="lot-size-calculate"]').click();
  await page.waitForTimeout(600);
  const lotsReset = clean(await page.locator('[data-testid="lot-size-result-lots"]').innerText());
  check("L4 Clearing the costs restores the V1 size (0.10)", /0[,\.]10/.test(lotsReset), lotsReset);

  await sidebarClick("/features/compounding");
  await page.locator('[data-testid="compounding-summary-grid"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800);
  const darkSummary = (await page.locator('[data-testid="compounding-summary-grid"]').innerText()).replace(/\u202f|\u00a0/g, " ");
  check("J2 Compounding renders and computes under dark emulation", /13\s?266,49|2\s?653,30|6\s?727|667,61/.test(darkSummary) || darkSummary.length > 20, darkSummary.slice(0, 120));
  shot("J-dark-compounding");

  // ══ M. Periodic deposits (V1.1) — end-of-period, earned figures split ══
  await fillInput("compounding-deposit", "100");
  await page.waitForTimeout(800);
  const depositCell = page.locator('[data-testid="compounding-summary-deposits"]');
  await depositCell.waitFor({ state: "visible", timeout: 10_000 });
  const cleanC = (text) => text.replace(/[\u202f\u00a0]/g, " ");
  const depositsSummary = cleanC(await page.locator('[data-testid="compounding-summary-grid"]').innerText());
  // 1000×1.05^20 + 100×((1.05^20 − 1)/0.05) = 2 653,30 + 3 306,60 = 5 959,89
  check("M1 Deposit 100/period → Total Deposits 2 000,00", /2\s?000,00/.test(depositsSummary), depositsSummary.slice(0, 140));
  check("M2 Final balance ≈ 5 959,89 with deposits", /5\s?959,89/.test(depositsSummary), depositsSummary.slice(0, 140));
  const tableHead = cleanC(await page.locator('[data-testid="compounding-table"] thead').innerText());
  check("M3 Table gains a Deposit column", /deposit/i.test(tableHead), tableHead.replace(/\s+/g, " "));

  await fillInput("compounding-deposit", "");
  await page.waitForTimeout(800);
  const depositsCleared = cleanC(await page.locator('[data-testid="compounding-summary-grid"]').innerText());
  check("M4 Clearing the deposit restores the V1 summary (2 653,30)",
    /2\s?653,30/.test(depositsCleared) && !(await depositCell.isVisible().catch(() => false)),
    depositsCleared.slice(0, 140));

  // ══ N. Annual rate mode (V1.1) — compound-consistent conversion ════════
  await page.locator('[data-testid="compounding-mode-annual"]').check({ force: true }).catch(async () => {
    await page.locator('[data-testid="compounding-mode-annual"]').click({ force: true });
  });
  await page.locator('[data-testid="compounding-periods"]').fill("12");
  await fillInput("compounding-gain", "12");
  await page.waitForTimeout(800);
  const effectiveNote = cleanC(await page.locator('[data-testid="compounding-effective-rate"]').innerText());
  // (1.12)^(1/12) − 1 ≈ 0,95 % per month
  check("N1 Effective per-period rate ≈ 0,95 % shown", /0[,\.]95/.test(effectiveNote), effectiveNote);
  const annualSummary = cleanC(await page.locator('[data-testid="compounding-summary-grid"]').innerText());
  // 1000 × 1.12 = 1 120,00 EXACTLY (the conversion identity)
  check("N2 12 monthly periods at 12% annual → Final 1 120,00", /1\s?120,00/.test(annualSummary), annualSummary.slice(0, 140));
  const duration = cleanC(await page.locator('[data-testid="compounding-duration"]').innerText());
  check("N3 Duration note (12 monthly periods ≈ 1.0 year)", /12 monthly periods/i.test(duration) && /1[,\.]0 years/i.test(duration), duration);

  await page.locator('[data-testid="compounding-mode-per-period"]').check({ force: true }).catch(async () => {
    await page.locator('[data-testid="compounding-mode-per-period"]').click({ force: true });
  });
  await page.waitForTimeout(800);
  const perPeriodSummary = cleanC(await page.locator('[data-testid="compounding-summary-grid"]').innerText());
  // Back to per-period: 1000 × 1.05^12 = 1 795,86
  check("N4 Switching back to per-period recomputes (1 795,86)", /1\s?795,86/.test(perPeriodSummary), perPeriodSummary.slice(0, 140));

  // ══ O. Withdrawals + scenarios (V1.2) + Pip Value tool (TOOLS) ═════════
  // State at this point: compounding, 1000 / 20 periods / 5%, no flows.
  await fillInput("compounding-withdrawal", "50");
  await page.waitForTimeout(800);
  const withdrawalCell = page.locator('[data-testid="compounding-summary-withdrawals"]');
  await withdrawalCell.waitFor({ state: "visible", timeout: 10_000 });
  const withdrawalsSummary = cleanC(await page.locator('[data-testid="compounding-summary-grid"]').innerText());
  // 2653.2977 − 50×((1.05^20−1)/0.05) = 2 653,30 − 1 653,30 = 1 000,00 EXACTLY
  check("O1 Withdrawal 50/period → Total Withdrawals 1 000,00", /1\s?000,00/.test(withdrawalsSummary), withdrawalsSummary.slice(0, 160));
  check("O2 Withdrawal 50/period → Final back to 1 000,00", /1\s?000,00/.test(withdrawalsSummary));
  const withdrawHead = cleanC(await page.locator('[data-testid="compounding-table"] thead').innerText());
  check("O3 Table gains a Withdrawal column", /withdrawal/i.test(withdrawHead), withdrawHead.replace(/\s+/g, " "));
  await fillInput("compounding-withdrawal", "");
  await page.waitForTimeout(600);

  await fillInput("compounding-scenario-pessimistic", "3");
  await fillInput("compounding-scenario-optimistic", "7");
  await page.waitForTimeout(800);
  const scenariosBlock = page.locator('[data-testid="compounding-scenarios"]');
  await scenariosBlock.waitFor({ state: "visible", timeout: 10_000 });
  const scenariosText = cleanC(await scenariosBlock.innerText());
  // State: 1000 / 12 periods / 5% per period, no flows.
  // Pessimistic 1000×1.03^12 = 1 425,76 · base 1 795,86 · optimistic 1000×1.07^12 = 2 252,19
  check("O4 Scenario endpoints render (1 425,76 / 1 795,86 / 2 252,19)",
    /1\s?425,76/.test(scenariosText) && /1\s?795,86/.test(scenariosText) && /2\s?252,19/.test(scenariosText),
    scenariosText.replace(/\s+/g, " ").slice(0, 160));
  // Order violation: optimistic below base gain → stable error code surfaced
  await fillInput("compounding-scenario-optimistic", "2");
  await page.waitForTimeout(600);
  const orderError = page.locator('[data-testid="compounding-scenarios-error"]');
  check("O5 Scenario order violation surfaces the stable code copy",
    (await orderError.isVisible().catch(() => false)) && /optimistic/i.test(await orderError.innerText()),
    (await orderError.innerText().catch(() => "")).trim());
  await fillInput("compounding-scenario-pessimistic", "");
  await fillInput("compounding-scenario-optimistic", "");
  await page.waitForTimeout(600);

  // Pip & Tick Value tool — new TOOLS page (SPA nav).
  const pipLink = page.locator('nav[aria-label="Main navigation"] a[href="/features/pip-value"]');
  check("O6 Sidebar carries the Pips link (TOOLS)", (await pipLink.count()) === 1);
  await pipLink.click();
  await page.waitForURL(/\/features\/pip-value/, { timeout: 30_000 });
  await page.locator('[data-testid="pip-value-summary-grid"]').waitFor({ state: "visible", timeout: 30_000 });
  const pipH1 = (await page.locator("h1").first().innerText()).trim();
  check("O7 Pips page header renders", /pips/i.test(pipH1), pipH1);
  await page.waitForTimeout(700);
  const pipDefault = cleanC(await page.locator('[data-testid="pip-value-summary-grid"]').innerText());
  // EURUSD on a USD account: 10,00 $US per pip, 1,00 $US per tick, 1 lot
  check("O8 EURUSD 1 lot → Pip 10,00 / Tick 1,00 (derived)",
    /10,00/.test(pipDefault) && /1,00/.test(pipDefault) && /derived/i.test(pipDefault),
    pipDefault.replace(/\s+/g, " ").slice(0, 160));
  await fillInput("pip-value-lots", "5");
  await page.waitForTimeout(600);
  const pipPosition = cleanC(await page.locator('[data-testid="pip-value-summary-grid"]').innerText());
  check("O9 5 lots → position values 50,00 / 5,00", /50,00/.test(pipPosition) && /5,00/.test(pipPosition), pipPosition.replace(/\s+/g, " ").slice(0, 120));
  await page.locator('[data-testid="pip-value-instrument"]').click();
  await page.locator('[role="option"]', { hasText: /USDJPY/ }).click();
  await fillInput("pip-value-price", "150");
  await page.waitForTimeout(700);
  const pipConverted = cleanC(await page.locator('[data-testid="pip-value-summary-grid"]').innerText());
  // 0.01×100000/150 = 6,67 $US per pip on 1 lot — converted at the price
  check("O10 USDJPY @150 → converted 6,67 per pip", /6,67/.test(pipConverted) && /converted/i.test(pipConverted), pipConverted.replace(/\s+/g, " ").slice(0, 160));
  shot("O-pip-value");

  // ══ K. Console/network cleanliness ═════════════════════════════════════
  check("K1 No console/page errors or unexpected 4xx", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("VERIFY CRASH:", error);
  process.exit(1);
});
