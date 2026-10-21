/**
 * Verify — Risk/Reward module (TOOLS section).
 * Probes: nav registration, page render, live summary math (2% × $1,000 × 1:3
 * over 100 trades), matrix structure (5 rows × 10 columns), spec §13.1 cell
 * vectors (E': -$400 @20% R3, G: +$1,200 @40% R3, F: $0 break-even @50% R1),
 * cell detail tooltip, live recompute on risk change, SL/TP amounts mode,
 * extra 1:8 row toggle, reset, invalid-input handling.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  // ── Auth (same demo account as every verify probe) ───────────────────────
  await page.goto(`${BASE}/tools/risk-reward`, { waitUntil: "domcontentloaded" });
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 20000 });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL("**/tools/risk-reward", { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  // ── 1. Page shell + nav registration ─────────────────────────────────────
  check("h1 'Risk Reward' rendered", await page.locator("h1", { hasText: "Risk Reward" }).isVisible());
  check(
    "Sidebar TOOLS entry present",
    (await page.locator('a[href="/tools/risk-reward"]').count()) >= 1,
  );
  await page.screenshot({ path: "scripts/shots/risk-reward-top.png" });

  // ── 2. Default live summary (2% × $1,000, R 1:3, 100 trades) ─────────────
  const summary = page.locator('[data-testid="rr-summary"]');
  const summaryText = await summary.innerText();
  check("Summary risk per losing trade $20", summaryText.includes("20.00"), "expect -$20.00");
  check("Summary reward per winning trade $60", summaryText.includes("60.00"), "expect +$60.00");
  check("Summary break-even 25%", summaryText.includes("25.00%"), "expect 25.00%");
  check("Summary ratio 1:3", summaryText.includes("1:3"));
  check("Summary risk of balance 2%", summaryText.includes("2.00%"));
  check("Summary reward of balance 6%", summaryText.includes("6.00%"));

  // ── 3. Matrix structure ──────────────────────────────────────────────────
  const matrix = page.locator('[data-testid="rr-matrix"]');
  const cellCount = await page.locator('[data-testid^="rr-cell-"]').count();
  check("Matrix 5 rows × 10 columns = 50 cells", cellCount === 50, `count=${cellCount}`);
  const rowHeads = await page.locator('th[scope="row"]').allInnerTexts();
  check(
    "Default rows 1:1..1:5",
    rowHeads.map((t) => t.trim()).join(",").includes("1:1") &&
      rowHeads.some((t) => t.includes("1:5")),
    rowHeads.map((t) => t.trim()).join(" | "),
  );

  // ── 4. Spec §13.1 cell vectors at defaults (risk $20, N=100) ─────────────
  const cell320 = await page.locator('[data-testid="rr-cell-3-20"]').innerText();
  check("Cell 1:3 @20% = LOSS -$400 (spec E')", /LOSS/.test(cell320) && cell320.includes("400"), cell320.replace(/\n/g, " "));
  const cell340 = await page.locator('[data-testid="rr-cell-3-40"]').innerText();
  check("Cell 1:3 @40% = PROFIT +$1,200 (spec G)", /PROFIT/.test(cell340) && cell340.includes("1,200"), cell340.replace(/\n/g, " "));
  const cell150 = await page.locator('[data-testid="rr-cell-1-50"]').innerText();
  check("Cell 1:1 @50% = BREAK EVEN $0 (spec F)", /BREAK EVEN/i.test(cell150) && cell150.includes("0.00"), cell150.replace(/\n/g, " "));

  // ── 5. Cell detail tooltip (spec §7.5) ───────────────────────────────────
  await page.locator('[data-testid="rr-cell-3-20"]').hover();
  await page.waitForTimeout(600);
  const detail = page.locator('[data-testid="rr-detail-3-20"]');
  const detailVisible = await detail.isVisible();
  const detailText = detailVisible ? await detail.innerText() : "";
  check(
    "Tooltip shows expected wins 20 / losses 80 + net -$400",
    detailVisible && detailText.includes("20.0") && detailText.includes("80.0") && detailText.includes("400"),
    detailVisible ? detailText.replace(/\n/g, " ").slice(0, 120) : "not visible",
  );
  await page.screenshot({ path: "scripts/shots/risk-reward-tooltip.png" });

  // ── 6. Live recompute: risk 2% → 5% (spec §9 — no Calculate button) ─────
  await page.locator('[data-testid="rr-risk-percent"]').fill("5");
  await page.waitForTimeout(400);
  const summaryText2 = await summary.innerText();
  check("Risk updates live to $50 at 5%", summaryText2.includes("50.00"), summaryText2.match(/-\$[\d.,]+/)?.[0] ?? "");
  const cell320b = await page.locator('[data-testid="rr-cell-3-20"]').innerText();
  check("Matrix cell recomputes (5% × 1:3 @20% = -$1,000)", cell320b.includes("1,000"), cell320b.replace(/\n/g, " "));

  // ── 7. Fixed risk mode ───────────────────────────────────────────────────
  await page.locator('[data-testid="rr-risk-mode-fixed"]').click();
  await page.waitForTimeout(400);
  const summaryText3 = await summary.innerText();
  check("Fixed mode: risk = $20 fixed", summaryText3.includes("20.00"), summaryText3.match(/-\$[\d.,]+/)?.[0] ?? "");
  await page.locator('[data-testid="rr-risk-mode-percent"]').click();
  await page.waitForTimeout(300);

  // ── 8. SL/TP amounts mode: $20 stop / $60 target → 1:3 ───────────────────
  await page.locator('[data-testid="rr-ratio-mode-amounts"]').click();
  await page.waitForTimeout(400);
  const summaryText4 = await summary.innerText();
  check("Amounts mode derives 1:3 from $20/$60", summaryText4.includes("1:3"), "");
  await page.locator('[data-testid="rr-ratio-mode-multiple"]').click();
  await page.waitForTimeout(300);

  // ── 9. Extra row 1:8 ─────────────────────────────────────────────────────
  const before8 = await page.locator('[data-testid^="rr-cell-8-"]').count();
  await page.locator('button:has-text("1:8")').click();
  await page.waitForTimeout(400);
  const after8 = await page.locator('[data-testid^="rr-cell-8-"]').count();
  check("Extra row 1:8 toggles on (10 cells)", before8 === 0 && after8 === 10, `${before8}→${after8}`);

  // ── 10. Reset ────────────────────────────────────────────────────────────
  await page.locator('[data-testid="rr-reset"]').click();
  await page.waitForTimeout(500);
  const summaryText5 = await summary.innerText();
  const cellCountAfterReset = await page.locator('[data-testid^="rr-cell-"]').count();
  check(
    "Reset restores defaults (2% / 1:3 / 5 rows)",
    summaryText5.includes("20.00") && cellCountAfterReset === 50,
    `cells=${cellCountAfterReset}`,
  );

  // ── 11. Invalid input handling (spec §10) ────────────────────────────────
  await page.locator('[data-testid="rr-trades"]').fill("abc");
  await page.waitForTimeout(400);
  const emptyVisible = await page.locator("text=Enter valid parameters").first().isVisible();
  check("Invalid trades → matrix empty state, no crash", emptyVisible);
  await page.locator('[data-testid="rr-trades"]').fill("100");
  await page.waitForTimeout(400);

  await page.locator('[data-testid="rr-balance"]').fill("0");
  await page.waitForTimeout(400);
  const balanceErr = await page.locator("#rr-balance-error").isVisible();
  check("Zero balance → inline validation", balanceErr);
  await page.locator('[data-testid="rr-balance"]').fill("1000");
  await page.waitForTimeout(400);

  await page.screenshot({ path: "scripts/shots/risk-reward-full.png", fullPage: true });

  // ── Console/page errors ──────────────────────────────────────────────────
  // The two pre-auth 401 refresh attempts also fire on every existing page
  // (verified identical on /settings) — platform bootstrap noise, not module.
  const meaningful = errors.filter((e) => !e.includes("401"));
  check("No console/page errors", meaningful.length === 0, meaningful.slice(0, 3).join(" | "));

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`\n${failed.length === 0 ? "ALL PASS" : `${failed.length} FAILURES`}`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error("PROBE CRASH:", e);
  process.exit(2);
});
