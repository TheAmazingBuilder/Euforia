/**
 * Replay module probe (REPLAY MASTER PROMPT verification) — the first-class
 * historical replay workspace, end to end against the mock backend:
 *
 *   1. TRADING sidebar entry renders (/replay) with hero + metrics + list
 *   2. Seeded sessions appear (COMPLETED / IN_PROGRESS / DRAFT)
 *   3. New Replay form creates a session → workspace opens
 *   4. Transport works: play/pause, step, scrub, speed set
 *   5. SIMULATED activity: decision markers, note, trade open (manual entry
 *      — the market service may be offline, the feed error state must stay
 *      honest and must not block simulation)
 *   6. Complete → result panel with SIMULATED label
 *   7. Session Live untouched (page still renders)
 *
 * Usage: node scripts/verify-replay.js  (web dev server on :3000)
 */
const { chromium } = require("playwright");
const { ensureLogin } = require("./helpers/login");

const NOISE = /\/api\/auth\/(me|refresh)\b|socket\.io|candles|prices|favicon|XTransformPort/i;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 140)));
  page.on("response", (r) => {
    if (r.status() >= 400 && !NOISE.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url().slice(28, 90)}`);
  });

  const results = [];
  const check = (name, ok, detail = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  };

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60_000 });
  await ensureLogin(page);

  // 1) Sidebar → Replay (TRADING section)
  const replayLink = page.locator('nav[aria-label="Main navigation"] [href="/replay"]');
  check("sidebar TRADING entry", (await replayLink.count()) > 0);
  await replayLink.first().click();
  await page.locator('[data-testid="replay-hero"]').waitFor({ state: "visible", timeout: 15_000 });
  check("overview hero", true);
  check("hero SIMULATED badge", (await page.locator('[data-testid="replay-hero"] >> text=SIMULATED').count()) > 0);

  // 2) Seeded sessions
  await page.locator('[data-testid="replay-list"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(800);
  const cards = await page.locator('[data-testid="replay-card"]').count();
  check("seeded sessions listed", cards >= 3, `${cards} cards`);
  const metrics = await page.locator('[data-testid="replay-metric"]').count();
  check("overview metrics", metrics >= 6, `${metrics} metric cards`);

  // 3) New Replay flow
  await page.locator('[data-testid="replay-new-cta"]').click();
  await page.locator('[data-testid="replay-new-form"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('[data-testid="replay-symbol"]').click();
  await page.locator('[role="option"]').first().click();
  await page.locator('[data-testid="replay-preset-14400000"]').click(); // Last 4 hours
  await page.locator('[data-testid="replay-create"]').click();
  await page.locator('[data-testid="replay-workspace"]').waitFor({ state: "visible", timeout: 20_000 });
  check("workspace opens after create", true);
  check("workspace SIMULATED badge", (await page.locator('[data-testid="replay-simulated-badge"]').count()) > 0);

  // 4) Transport — play/pause, step, speed, scrub
  const clockBefore = await page.locator('[data-testid="replay-clock"]').textContent();
  await page.locator('[data-testid="replay-play"]').click();
  await page.waitForTimeout(1600);
  const clockPlaying = await page.locator('[data-testid="replay-clock"]').textContent();
  check("playback advances clock", clockBefore !== clockPlaying, `${clockBefore} → ${clockPlaying}`);
  await page.locator('[data-testid="replay-play"]').click(); // pause
  await page.locator('[data-testid="replay-step-forward"]').click();
  await page.locator('[data-testid="replay-speed-10"]').click();
  const speedPressed = await page.locator('[data-testid="replay-speed-10"]').getAttribute("aria-pressed");
  check("speed selection", speedPressed === "true");

  // 5) SIMULATED activity — decision, note, trade (manual entry; feed may be down)
  await page.locator('[data-testid="replay-decision-WAIT"]').click();
  await page.waitForTimeout(900);
  await page.locator('[data-testid="replay-add-note"]').click();
  await page.locator('[data-testid="replay-note-body"]').fill("Probe note — price stalling under the high.");
  await page.locator('[data-testid="replay-note-submit"]').click();
  await page.waitForTimeout(900);
  await page.locator('[data-testid="replay-tab-notes"]').click();
  const noteRows = await page.locator('[data-testid="replay-note-row"]').count();
  check("note recorded", noteRows >= 1, `${noteRows} note rows`);

  await page.locator('[data-testid="replay-sim-long"]').click();
  await page.locator('[data-testid="replay-entry"]').fill("1.0850");
  await page.locator('[data-testid="replay-stop"]').fill("1.0830");
  await page.locator('[data-testid="replay-target"]').fill("1.0900");
  await page.locator('[data-testid="replay-qty"]').fill("0.5");
  await page.locator('[data-testid="replay-trade-submit"]').click();
  await page.waitForTimeout(900);
  await page.locator('[data-testid="replay-tab-trades"]').click();
  const tradeRows = await page.locator('[data-testid="replay-trade-row"]').count();
  check("simulated trade opened", tradeRows >= 1, `${tradeRows} trade rows`);

  // 6) Complete → result
  await page.locator('[data-testid="replay-complete"]').click();
  await page.waitForTimeout(1200);
  const resultCells = await page.locator('[data-testid="replay-result"]').count();
  check("result panel after complete", resultCells === 1);
  const statusBadge = await page.locator('[data-testid="replay-workspace-header"] >> text=Completed').count();
  check("status Completed", statusBadge >= 1);

  // 7) Session Live untouched
  await page.locator('nav[aria-label="Main navigation"] [href="/session"]').first().click();
  await page.waitForTimeout(1600);
  const slTitle = await page.locator("h1").first().textContent().catch(() => "NONE");
  check("session live intact", /Session/i.test(slTitle ?? ""), slTitle?.trim() ?? "");

  console.log(results.join("\n"));
  console.log("ERRORS:", errors.length === 0 ? "none" : errors.slice(0, 8));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(failed === 0 && errors.length === 0 ? "REPLAY PROBE: FULL GREEN" : `REPLAY PROBE: ${failed} failures`);
  await browser.close();
  process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
})();
