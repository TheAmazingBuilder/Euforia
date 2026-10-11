/**
 * Verify Phase 10 — Journal + broker CSV import + session WIN/LOSS stamps.
 * Uses the ALREADY RUNNING dev server on :3000 (no kill/restart).
 * Screenshots land in scripts/phase10-*.png (desktop 1280 / mobile 390 / light).
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

const SAMPLE_CSV = [
  "Ticket,Open Time,Type,Size,Item,Open Price,Close Time,Close Price,Commission,Swap,Profit",
  "55001,2026.09.22 14:30,buy,0.5,EURUSD,1.08650,2026.09.22 16:45,1.08950,-2.5,0.4,250",
  "55002,2026.09.23 09:12,sell,0.3,XAUUSD,2385.10,2026.09.23 10:05,2380.60,-1.8,-0.9,135",
  "55001,2026.09.22 14:30,buy,0.5,EURUSD,1.08650,2026.09.22 16:45,1.08950,-2.5,0.4,250",
  "55003,2026.09.23 11:00,buy,0.2,BOOM1000,9820.00,2026.09.23 12:30,9860.00,-1.0,0,80",
  "0,2026.09.01 00:00,balance,,Deposit,,,,,,,,10000",
].join("\n");

(async () => {
  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  // ── 1. Journal page structure ─────────────────────────────────────────────
  await page.goto(`${BASE}/journal`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const heading = await page.locator("h1").first().textContent();
  check("journal: heading", heading?.trim() === "Journal", heading?.trim());

  const dayLabel = await page.locator("p.ledger-label", { hasText: "Trading day" }).first().textContent();
  check("journal: server trading date shown", /\d{4}-\d{2}-\d{2}/.test(dayLabel ?? ""), dayLabel?.trim());

  const sleepInput = page.locator("#journal-sleep");
  check("journal: sleep input", await sleepInput.count() === 1);

  const planTextarea = page.locator("#journal-plan");
  check("journal: plan textarea", await planTextarea.count() === 1);

  const emotionChips = page.locator('[role="radiogroup"][aria-label="Mood before the session"] button');
  check("journal: emotion chips", (await emotionChips.count()) >= 10, `${await emotionChips.count()} chips`);

  const saveBtn = page.locator('section[aria-label="Journal editor"] header button').first();
  check("journal: save disabled when pristine", await saveBtn.isDisabled());

  // ── 2. Journal history ledger ─────────────────────────────────────────────
  const historyRows = page.locator('[aria-label="Journal history"] ul > li');
  const rowCount = await historyRows.count();
  check("journal: history rows", rowCount >= 10, `${rowCount} rows`);

  // Expand the first expandable row
  const firstExpandable = historyRows.filter({ has: page.locator("button[aria-expanded]") }).first();
  if ((await firstExpandable.count()) > 0) {
    await firstExpandable.locator("button[aria-expanded]").first().click();
    await page.waitForTimeout(400);
    const expanded = await firstExpandable.locator("button[aria-expanded='true']").count();
    check("journal: row expands", expanded === 1);
  } else {
    check("journal: row expands", false, "no expandable row");
  }

  // ── 3. Journal save flow (fill + save + toast) ────────────────────────────
  await sleepInput.fill("7.5");
  await page.locator('[role="radiogroup"][aria-label="Energy level"] button').nth(3).click();
  await planTextarea.fill("Only EURUSD setups at the London open. Max 2 trades, then stop.");
  await page.waitForTimeout(200);
  check("journal: save enabled when dirty", !(await saveBtn.isDisabled()));
  await saveBtn.click();
  await page.waitForSelector("text=Journal saved", { timeout: 8000 }).then(() => {
    check("journal: save toast", true);
  }).catch(() => {
    check("journal: save toast", false);
  });
  await page.waitForTimeout(800);

  // Screenshots — desktop, light theme, mobile
  await page.screenshot({ path: "scripts/phase10-journal.png", fullPage: true });

  // Light theme
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    try { localStorage.setItem("theme", "light"); } catch {}
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "scripts/phase10-journal-light.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });

  // Mobile 390
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "scripts/phase10-journal-390.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  // ── 4. Session timeline WIN/LOSS stamps ───────────────────────────────────
  await page.goto(`${BASE}/session`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const stamps = page.locator('[aria-label="Today\'s session timeline"] .stamp');
  const stampCount = await stamps.count();
  check("session: outcome stamps present", stampCount >= 1, `${stampCount} stamps`);
  const stampTexts = await stamps.allTextContents();
  check(
    "session: stamps are WIN/LOSS/B/E",
    stampTexts.every((text) => ["Win", "Loss", "B/E"].includes(text.trim())),
    stampTexts.map((t) => t.trim()).join(","),
  );
  await page.locator('[aria-label="Today\'s session timeline"]').screenshot({ path: "scripts/phase10-timeline-stamps.png" }).catch(() => {});
  await page.screenshot({ path: "scripts/phase10-session.png", fullPage: true });

  // ── 5. Settings: CSV import flow (paste → analyze → import) ──────────────
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const importCard = page.locator("section, .rounded-xl", { hasText: "Import broker CSV" }).first();
  check("settings: import card present", (await page.locator("text=Import broker CSV").count()) >= 1);

  // Open the paste fallback and enter the sample CSV
  await page.locator("summary", { hasText: "or paste CSV text" }).click();
  const csvTextarea = page.locator("details textarea");
  await csvTextarea.fill(SAMPLE_CSV);
  await page.locator('button:has-text("Analyze file")').click();
  await page.waitForSelector("text=importable", { timeout: 8000 });
  await page.waitForTimeout(500);

  const detected = await page.locator("p.font-mono", { hasText: "rows" }).first().textContent();
  check("settings: preview detected info", /MT5/.test(detected ?? ""), detected?.trim().slice(0, 60));

  const dupStamps = await page.locator(".stamp", { hasText: "dup" }).count();
  check("settings: intra-file duplicate flagged", dupStamps >= 1, `${dupStamps} dup stamps`);

  const errorRowVisible = await page.locator("text=Unknown symbol BOOM1000").count();
  check("settings: unknown symbol warning", errorRowVisible >= 1);

  await page.screenshot({ path: "scripts/phase10-csv-preview.png", fullPage: true });

  await page.locator('button:has-text("Import 3 trades")').click();
  await page.waitForSelector("text=Import complete", { timeout: 8000 }).then(() => {
    check("settings: commit toast", true);
  }).catch(() => {
    check("settings: commit toast", false);
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "scripts/phase10-csv-committed.png", fullPage: true });

  // Trades page reflects the import — CLIENT-SIDE nav only: the mock store
  // lives in page memory and a full reload would reseed the fixtures.
  await page.locator('aside a[href="/trades"], nav a[href="/trades"], a[href="/trades"]').first().click();
  await page.waitForTimeout(1200);
  const importedVisible = await page.locator("text=BOOM1000").count();
  check("trades: imported trade visible", importedVisible >= 1, `${importedVisible} matches`);
  await page.screenshot({ path: "scripts/phase10-trades-after-import.png", fullPage: true });

  // ── Console health ────────────────────────────────────────────────────────
  check("console: no errors across flows", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILURES`}`);
  process.exit(failed === 0 ? 0 : 1);
})();
