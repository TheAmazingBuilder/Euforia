/**
 * Verify — Session Live upgrades (module-by-module round).
 * Probes (ONE SPA session — the mock store reseeds on full reload):
 *  1. Station loads: toolbar, chart, key-levels minimap with ≥1 level row
 *  2. Session logbook: log a note (POST /session/notes), timestamped row,
 *     note SURVIVES SPA navigation (server persistence), delete removes it
 *  3. Session timer: start ticks; the duration cap persists via PATCH
 *     /me/preferences/trading; a restored stopwatch past the cap raises
 *     the one-time "Session duration cap reached" warning toast
 *  4. Replay: toggle → scrubber bar; dragging the scrubber slices the
 *     candles (data-replay-index); play advances; close exits
 *  5. Light theme + mobile 390 no overflow; zero unexpected console errors
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  let notesPOST = 0;
  let notesDELETE = 0;
  let tradingPATCH = 0;
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
  });
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/session/notes")) notesPOST++;
    if (req.method() === "DELETE" && req.url().includes("/session/notes/")) notesDELETE++;
    if (req.method() === "PATCH" && req.url().includes("/me/preferences/trading")) tradingPATCH++;
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
  const toastFor = (text) => page.locator("[data-sonner-toast]", { hasText: text });

  const run = async () => {
    // ── 1. Station + minimap ────────────────────────────────────────────────
    await page.goto(`${BASE}/session`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    check("Toolbar renders", await page.locator('[data-testid="session-toolbar"]').isVisible());
    check("Chart renders", await page.locator('[data-testid="price-chart"]').isVisible());
    const minimapVisible = await page.locator('[data-testid="session-minimap"]').isVisible();
    const levelCount = await page.locator('[data-testid="session-minimap-level"]').count();
    check("Key-levels minimap renders", minimapVisible, `${levelCount} level rows`);
    check("Minimap has at least one level (Entry)", levelCount >= 1, `${levelCount}`);
    await page.screenshot({ path: "scripts/shots/session-upgrades-default.png" });

    // ── 2. Session logbook ──────────────────────────────────────────────────
    check("Logbook renders", await page.locator('[data-testid="session-logbook"]').isVisible());
    const noteText = "Verify note — watching the retest into 4,180";
    await page.locator('[data-testid="session-logbook-input"]').fill(noteText);
    await page.locator('[data-testid="session-logbook-submit"]').click();
    await page.waitForTimeout(1200);
    const noteRow = page.locator('[data-testid="session-logbook-note"]', { hasText: noteText });
    check("Note lands with a timestamp", await noteRow.first().isVisible());
    check("POST /session/notes fired", notesPOST >= 1, `${notesPOST} post(s)`);

    // Persistence: SPA away and back — the refetch must return the saved note.
    await page.locator('aside nav a[href="/trades"]').click();
    await page.waitForTimeout(1100);
    await page.locator('aside nav a[href="/session"]').click();
    await page.waitForTimeout(1400);
    await page.locator('[data-testid="session-logbook"]').waitFor({ state: "visible", timeout: 15000 });
    const persistedNote = page.locator('[data-testid="session-logbook-note"]', { hasText: noteText });
    check("Note persists across SPA navigation (server)", await persistedNote.first().isVisible());

    await persistedNote.first().locator('[data-testid="session-logbook-delete"]').hover();
    await persistedNote.first().locator('[data-testid="session-logbook-delete"]').click();
    await page.waitForTimeout(1100);
    check("Delete removes the note", (await page.locator('[data-testid="session-logbook-note"]', { hasText: noteText }).count()) === 0);
    check("DELETE /session/notes/:id fired", notesDELETE >= 1, `${notesDELETE} delete(s)`);

    // ── 3. Session timer ────────────────────────────────────────────────────
    const elapsedBefore = await page.locator('[data-testid="session-timer-elapsed"]').textContent();
    await page.locator('[data-testid="session-timer-toggle"]').click();
    await page.waitForTimeout(2600);
    const elapsedAfter = await page.locator('[data-testid="session-timer-elapsed"]').textContent();
    check("Timer ticks after Start", elapsedBefore === "00:00:00" && elapsedAfter !== "00:00:00", `${elapsedBefore} → ${elapsedAfter}`);

    // Cap: 30 min via the select (radix select trigger + option)
    await page.locator('[data-testid="session-timer-max"]').click();
    await page.getByRole("option", { name: "30 min" }).click();
    await page.waitForTimeout(900);
    check("Cap select PATCHes trading prefs", tradingPATCH >= 1, `${tradingPATCH} patch(es)`);

    // Cap alert via the restore path: plant a stopwatch 31 minutes old.
    await page.evaluate(() => {
      const past = Date.now() - 31 * 60 * 1000;
      window.localStorage.setItem("cosmoz.session.startedAt", String(past));
      window.dispatchEvent(new Event("cosmoz:session-started-at"));
    });
    await page.waitForTimeout(1800);
    check("Restored stopwatch resumes (≈31 min)", (await page.locator('[data-testid="session-timer-elapsed"]').textContent())?.startsWith("00:31"), await page.locator('[data-testid="session-timer-elapsed"]').textContent());
    check("Cap alert toast fires", await toastFor("Session duration cap reached").first().isVisible());
    check("Timer shows capped state", await page.locator('[data-testid="session-timer-capped"]').isVisible());
    await page.screenshot({ path: "scripts/shots/session-upgrades-timer-cap.png" });

    // Stop clears the stopwatch.
    await page.locator('[data-testid="session-timer-toggle"]').click();
    await page.waitForTimeout(600);
    check("Stop resets the timer", (await page.locator('[data-testid="session-timer-elapsed"]').textContent()) === "00:00:00");

    // ── 4. Replay scrubber ──────────────────────────────────────────────────
    check("Replay toggle renders", await page.locator('[data-testid="session-replay-toggle"]').isVisible());
    await page.locator('[data-testid="session-replay-toggle"]').click();
    await page.waitForTimeout(700);
    check("Replay bar appears", await page.locator('[data-testid="session-replay-bar"]').isVisible());
    check("Chart enters replay mode", (await page.locator('[data-testid="price-chart"]').getAttribute("data-replay")) === "true");

    const total = Number(await page.locator('[data-testid="price-chart"]').getAttribute("data-replay-index")) + 1;
    const mid = Math.min(Math.max(2, Math.floor(total / 2)), total - 1);
    await page.locator('[data-testid="session-replay-scrubber"]').fill(String(mid));
    await page.waitForTimeout(500);
    const scrubbed = Number(await page.locator('[data-testid="price-chart"]').getAttribute("data-replay-index"));
    check("Scrubber slices the candles", scrubbed === mid, `index ${scrubbed} / target ${mid}`);
    check("Counter reflects the scrub", (await page.locator('[data-testid="session-replay-time"]').textContent()).includes(`${mid + 1}/`));

    await page.locator('[data-testid="session-replay-play"]').click();
    await page.waitForTimeout(700);
    const playing = Number(await page.locator('[data-testid="price-chart"]').getAttribute("data-replay-index"));
    check("Play advances the replay", playing > scrubbed, `${scrubbed} → ${playing}`);
    await page.locator('[data-testid="session-replay-play"]').click(); // pause
    await page.locator('[data-testid="session-replay-close"]').click();
    await page.waitForTimeout(500);
    check("Close exits replay mode", (await page.locator('[data-testid="price-chart"]').getAttribute("data-replay")) === "false");
    await page.screenshot({ path: "scripts/shots/session-upgrades-replay.png" });

    // ── 5. Light theme + mobile ─────────────────────────────────────────────
    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    });
    await page.waitForTimeout(600);
    check("Light theme renders the upgrades", await page.locator('[data-testid="session-logbook"]').isVisible());
    await page.screenshot({ path: "scripts/shots/session-upgrades-light.png" });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.on("pageerror", (err) => errors.push(`mobile: ${err}`));
    await mobile.goto(`${BASE}/session`, { waitUntil: "networkidle", timeout: 60000 });
    await mobile.waitForTimeout(1600);
    const overflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check("Mobile 390: no horizontal overflow", overflow <= 0, `${overflow}px`);
    check("Mobile: logbook renders", await mobile.locator('[data-testid="session-logbook"]').isVisible());
    check("Mobile: minimap renders", await mobile.locator('[data-testid="session-minimap"]').isVisible());
    await mobile.screenshot({ path: "scripts/shots/session-upgrades-mobile.png" });
    await mobile.close();

    // ── Console health (socket.io 404 + candles 400 = market-service noise) ──
    const noise = errors.filter(
      (e) => e.includes("socket.io") || (e.includes("404") && e.includes("candles")),
    );
    check("Zero console errors (known market-service noise excluded)", errors.length - noise.length === 0, errors.slice(0, 3).join(" | "));
  };

  try {
    await run();
  } catch (error) {
    console.log(`\n[ABORTED] ${error}`);
    console.log("\n═══ PARTIAL RESULTS ═══");
  }

  console.log("\n═══ SESSION LIVE UPGRADES — RESULTS ═══");
  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
