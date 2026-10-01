/**
 * Verify — Session Live replay de session complet (increment ②).
 *
 * Covers:
 *   A. Real documented session: start → bias → note → key level → analysis
 *      → end (creates a genuine COMPLETED session with events).
 *   B. History drawer exposes "Replay session" on completed rows.
 *   C. Replay dialog: meta chips, autoplay, restart, pause at start,
 *      event-feed states (future vs current), 1× playback progresses the
 *      clock, 480× finishes the session, final state (SESSION_ENDED banner,
 *      all events past, clock at end), scrub-to-end determinism, chart
 *      canvas + price readout.
 *   D. Read-only: no execution controls inside the replay dialog.
 *   E. Console/network cleanliness.
 * SPA-only navigation after the first goto (MSW store lives in the tab).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const NOISE = [/socket\.io/i, /candles/i, /market-service/i, /favicon/i, /net::ERR/i, /X-TransformPort/i];
const SHOTS = "/home/z/my-project/scripts/shots/sl-replay";

/** React-controlled range input: set through the native setter + input event. */
async function scrubTo(page, selector, value) {
  await page.locator(selector).evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

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

  // ══ A. Document a real session ═══════════════════════════════════════════
  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.locator('[data-testid="session-live-header"]').waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1800);

  await page.locator('[data-testid="start-session-button"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="start-session-dialog"]').waitFor({ state: "visible" });
  await page.locator("#ss-objective").fill("Replay verification session");
  await page.locator('[data-testid="start-session-confirm"]').click();
  await page.waitForTimeout(1500);
  check("Session started (LIVE)", await page.locator('[data-testid="session-status-active"]').isVisible());

  await page.locator('[data-testid="bias-bullish"]').click();
  await page.waitForTimeout(900);
  const logInput = page.locator('[data-testid="session-logbook-input"]');
  await logInput.fill("Replay verification note");
  await page.locator('[data-testid="session-logbook-submit"]').click();
  await page.waitForTimeout(1200);
  const priceText = (await page.locator('[data-testid="context-price"]').textContent()) ?? "0";
  const priceNum = Number(String(priceText).replace(/,/g, ""));
  await page.locator('[data-testid="level-kind"]').selectOption("SUPPORT");
  await page.locator('[data-testid="level-price"]').fill(String(priceNum ? (priceNum * 0.99).toFixed(2) : "1"));
  await page.locator('[data-testid="level-add"]').click();
  await page.waitForTimeout(1000);
  await page.locator('[data-testid="context-tab-analyses"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="save-analysis-button"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="scenario-bullish"]').fill("Reclaim of the support; target prior high.");
  await page.locator('[data-testid="save-analysis-confirm"]').click();
  await page.waitForTimeout(1200);

  await page.locator('[data-testid="end-session-button"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="end-session-confirm"]').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="session-summary-close"]').click();
  await page.waitForTimeout(900);
  check("Session completed", await page.locator('[data-testid="session-status-none"]').isVisible());

  // ══ B. History drawer → Replay ═══════════════════════════════════════════
  await page.locator('[data-testid="session-history-button"]').click();
  await page.waitForTimeout(700);
  const firstRow = page.locator('[data-testid="history-session-row"]').first();
  await firstRow.locator("summary").click();
  await page.waitForTimeout(400);
  check("History row offers Replay", await firstRow.locator('[data-testid="history-replay"]').isVisible());
  await firstRow.locator('[data-testid="history-replay"]').click();
  await page.locator('[data-testid="session-replay-dialog"]').waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(600);

  // ══ C. Replay behavior ═══════════════════════════════════════════════════
  const dialog = page.locator('[data-testid="session-replay-dialog"]');
  const title = (await page.locator('[data-testid="replay-title"]').textContent()) ?? "";
  check("Replay title carries symbol + timeframe", /·/.test(title) && title.length > 5, title.trim());
  const meta = (await page.locator('[data-testid="replay-meta"]').textContent()) ?? "";
  check("Meta chips include the event count", /events/.test(meta) && /\d+ events/.test(meta), meta.slice(0, 60));
  const eventCount = Number((meta.match(/(\d+) events/) ?? [])[1] ?? 0);
  check("Session documented with real events", eventCount >= 5, `${eventCount} events`);

  // Deterministic early state: 1× speed, restart, pause at start.
  await page.locator('[data-testid="replay-speed-1"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="replay-restart"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="replay-play"]').click(); // pause
  await page.waitForTimeout(300);
  check("Paused at start (aria-pressed false)", (await page.locator('[data-testid="replay-play"]').getAttribute("aria-pressed")) === "false");
  check(
    "First event is current at t0 (SESSION_STARTED)",
    (await page.locator('[data-testid="replay-event-current"]').getAttribute("data-event-kind")) === "SESSION_STARTED",
  );
  check(
    "Later events still future at t0",
    (await page.locator('[data-testid="replay-event-row"][data-state="future"]').count()) >= 3,
  );
  check(
    "Chart canvas rendered in replay",
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="session-replay-dialog"] [data-testid="analysis-chart"]');
      const canvas = el?.querySelector("canvas");
      return canvas !== null && canvas !== undefined && canvas.width > 200;
    }),
  );
  const priceAtStart = (await page.locator('[data-testid="replay-price"]').textContent()) ?? "";
  check("Price readout live from candles", priceAtStart.length > 0 && priceAtStart !== "—", priceAtStart);
  await dialog.screenshot({ path: `${SHOTS}/early.png` });

  // 1× playback: the clock advances with real time.
  const clockBefore = (await page.locator('[data-testid="replay-clock"]').textContent()) ?? "";
  await page.locator('[data-testid="replay-play"]').click(); // resume at 1×
  await page.waitForTimeout(2600);
  const clockAfter = (await page.locator('[data-testid="replay-clock"]').textContent()) ?? "";
  check("1× playback advances the clock", clockBefore !== clockAfter, `${clockBefore} → ${clockAfter}`);
  check(
    "Event feed progresses (no longer only-future)",
    (await page.locator('[data-testid="replay-event-row"][data-state="future"]').count()) < eventCount - 1,
  );

  // 480× finishes the session deterministically.
  await page.locator('[data-testid="replay-speed-480"]').click();
  await page.waitForTimeout(1600);
  check("Replay finished (paused at end)", (await page.locator('[data-testid="replay-play"]').getAttribute("aria-pressed")) === "false");
  check(
    "Final banner is SESSION_ENDED",
    (await page.locator('[data-testid="replay-event-current"]').getAttribute("data-event-kind")) === "SESSION_ENDED",
  );
  check(
    "All events revealed at end",
    (await page.locator('[data-testid="replay-event-row"][data-state="future"]').count()) === 0,
  );
  check("Progress shows 100%", ((await page.locator('[data-testid="replay-transport"]').textContent()) ?? "").includes("100%"));
  await dialog.screenshot({ path: `${SHOTS}/end.png` });

  // Deterministic scrub: jump back to the start.
  const scrubber = page.locator('[data-testid="replay-scrubber"]');
  const min = Number(await scrubber.getAttribute("min"));
  await scrubTo(page, '[data-testid="replay-scrubber"]', min);
  await page.waitForTimeout(400);
  check(
    "Scrub back to start resets the feed",
    (await page.locator('[data-testid="replay-event-row"][data-state="future"]').count()) >= 3,
  );
  check(
    "Scrub pauses playback",
    (await page.locator('[data-testid="replay-play"]').getAttribute("aria-pressed")) === "false",
  );

  // ══ D. Read-only dialog ══════════════════════════════════════════════════
  const executionControls = await dialog.locator("button, a, [role='button']").evaluateAll((elements) =>
    elements
      .filter((el) => /\b(buy|sell|execute|place order|close position|modify position|cancel order)\b/i.test(el.textContent ?? ""))
      .map((el) => el.textContent?.slice(0, 40)),
  );
  check("Replay dialog has zero execution controls", executionControls.length === 0, executionControls.slice(0, 3).join(" | "));

  await page.locator('[data-testid="replay-close"]').click();
  await page.waitForTimeout(500);
  check("Replay closes cleanly", (await page.locator('[data-testid="session-replay-dialog"]').count()) === 0);

  // ══ E. Cleanliness ═══════════════════════════════════════════════════════
  check("No unexpected 4xx/5xx or page errors", errors.length === 0, errors.slice(0, 4).join(" | "));

  console.log("\n=== SUMMARY ===");
  console.log(results.filter((line) => line.startsWith("FAIL")).length === 0 ? "ALL PASS" : "FAILURES PRESENT");
  await browser.close();
})().catch((error) => {
  console.error("SCRIPT ERROR:", error);
  process.exit(1);
});
