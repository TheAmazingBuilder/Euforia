/**
 * Verify - PRIVATE positions stream on the `user:<id>` channel (WS-POS).
 *
 *   A. Service-level (direct :3003, token codec mirror):
 *      A1 valid token → "positions" events with source "sim" + full snapshot
 *      A2 per-user scoping - two users connected simultaneously receive
 *         DIFFERENT books (each id embeds its owner's uid prefix)
 *      A3 snapshot idempotency - the id set is stable across events
 *         (no duplication on reconnect/replay)
 *      A4 live mark-to-market - unrealizedPnl changes between events
 *   B. Browser (SPA-only navigation): Session Live renders the private
 *      stream card LIVE with items, P&L updates in place, card is read-only
 *      (no <button> anywhere in it).
 *   C. Mid-stream refresh → re-handshake → stream returns to LIVE.
 *   D. Logout teardown - no market-service traffic after sign-out (§76).
 *   E. Console/network cleanliness.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");
const { io } = require("/home/z/my-project/node_modules/.pnpm/socket.io-client@4.8.3_supports-color@7.2.0/node_modules/socket.io-client");

const BASE = "http://localhost:3000";
const SERVICE = "http://localhost:3003";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/ws-positions";

/** Sandbox token codec mirror (documented seam in market-service/auth.ts). */
const SECRET = "cosmoz-mock-access-secret-v1";
function fnv1a(input) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ input.charCodeAt(input.length - 1 - i), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}
function mintToken(uid, exp) {
  const payload = Buffer.from(JSON.stringify({ uid, iat: Date.now(), exp, v: 1 })).toString("base64url");
  return `czat1.${payload}.${fnv1a(`${SECRET}:${payload}`)}`;
}
const DEMO_UID = "8b1f4b2a-3c9d-4e0f-9a1b-2d7c6e5f4a3b";
const USER_B_UID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** Collect "positions" events for `ms` milliseconds. */
function collectPositions(auth, ms) {
  return new Promise((resolve) => {
    const socket = io(SERVICE, { auth, transports: ["polling", "websocket"], timeout: 3000, reconnection: false });
    const events = [];
    socket.on("positions", (event) => events.push(event));
    setTimeout(() => {
      try { socket.disconnect(); } catch {}
      resolve(events);
    }, ms);
  });
}

(async () => {
  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };

  const tokenA = mintToken(DEMO_UID, Date.now() + 900_000);
  const tokenB = mintToken(USER_B_UID, Date.now() + 900_000);

  // ══ A. Service-level ══════════════════════════════════════════════════════
  const eventsA = await collectPositions({ token: tokenA }, 3500);
  const first = eventsA[0];
  check("A1 Private 'positions' events arrive (source sim, snapshot shape)",
    eventsA.length > 0
    && first && first.source === "sim"
    && Array.isArray(first.positions) && first.positions.length > 0
    && typeof first.ts === "number"
    && first.positions.every((p) => p.id && p.symbol && (p.direction === "BUY" || p.direction === "SELL")
      && typeof p.volume === "string" && typeof p.entryPrice === "string" && "unrealizedPnl" in p),
    `${eventsA.length} events`);

  // A2 - run both users simultaneously; each book belongs to its owner only.
  const [bookA, bookB] = await Promise.all([
    collectPositions({ token: tokenA }, 2500),
    collectPositions({ token: tokenB }, 2500),
  ]);
  const idsA = new Set((bookA[0]?.positions ?? []).map((p) => p.id));
  const idsB = new Set((bookB[0]?.positions ?? []).map((p) => p.id));
  const onlyOwned = (events, uid) => events.every((event) =>
    event.positions.every((p) => p.id.startsWith(`sim-${uid.slice(0, 8)}-`)));
  const disjoint = [...idsA].every((id) => !idsB.has(id));
  check("A2 Per-user scoping - A and B receive DIFFERENT private books",
    disjoint && onlyOwned(bookA, DEMO_UID) && onlyOwned(bookB, USER_B_UID),
    `A:${idsA.size} positions / B:${idsB.size} positions`);

  const idSetsStable = eventsA.every((event) =>
    event.positions.length === first.positions.length
    && event.positions.every((p) => idsA.has(p.id)));
  check("A3 Snapshot semantics - id set stable across events (no duplication)",
    idSetsStable, `${first.positions.length} ids × ${eventsA.length} events`);

  const pnlValues = new Set(eventsA.flatMap((event) => event.positions.map((p) => p.unrealizedPnl)));
  check("A4 Live mark-to-market - P&L moves between snapshots", pnlValues.size > 1,
    `${pnlValues.size} distinct P&L values`);

  // ══ B. Browser flow (SPA) ═════════════════════════════════════════════════
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  let bootPhase = true;
  let expect401 = false;
  page.on("response", (resp) => {
    const url = resp.url();
    if (resp.status() >= 400) {
      const expected =
        (expect401 && resp.status() === 401) ||
        (bootPhase && resp.status() === 401 && /\/api\/auth\/(me|refresh)/.test(url)) ||
        /socket\.io/i.test(url) || /X-TransformPort/i.test(url);
      if (!expected) errors.push(`${resp.status()} ${url}`);
    }
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 20_000 });
  bootPhase = false;

  // SPA navigation - sidebar click (MSW state lives in the tab).
  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.locator('[data-testid="session-live-header"]').waitFor({ state: "visible", timeout: 20_000 });

  const streamCard = page.locator('[data-testid="private-positions-stream"]');
  await streamCard.waitFor({ state: "visible", timeout: 20_000 });

  let streamState = "none";
  for (let i = 0; i < 25; i += 1) {
    streamState = (await streamCard.getAttribute("data-stream-state")) ?? "none";
    if (streamState === "live") break;
    await page.waitForTimeout(1000);
  }
  check("B1 Private stream reaches LIVE in Session Live", streamState === "live", streamState);

  const itemCount = await page.locator('[data-testid="private-positions-item"]').count();
  check("B2 Stream renders private positions", itemCount > 0, `${itemCount} items`);

  const pnl1 = await page.locator('[data-testid="private-positions-pnl"]').first().getAttribute("data-pnl");
  await page.waitForTimeout(5000);
  const pnl2 = await page.locator('[data-testid="private-positions-pnl"]').first().getAttribute("data-pnl");
  check("B3 P&L updates in place (mark-to-market stream)", pnl1 !== null && pnl1 !== pnl2, `${pnl1} → ${pnl2}`);

  const buttonCount = await streamCard.locator("button").count();
  check("B4 READ-ONLY - no button inside the stream card", buttonCount === 0, `${buttonCount} buttons`);
  await page.screenshot({ path: `${SHOTS}/private-positions-live.png` });

  // ══ C. Mid-stream refresh → re-handshake → stream resumes ════════════════
  expect401 = true;
  await page.evaluate(() => window.__cosmoz_auth.expireAccessToken());
  await page.evaluate(() => window.__cosmoz_auth.refetchGuarded());
  await page.waitForTimeout(5000);
  expect401 = false;

  let refreshedState = "none";
  for (let i = 0; i < 20; i += 1) {
    refreshedState = (await streamCard.getAttribute("data-stream-state")) ?? "none";
    if (refreshedState === "live") break;
    await page.waitForTimeout(1000);
  }
  check("C1 Stream re-handshakes after refresh → LIVE", refreshedState === "live", refreshedState);
  await page.screenshot({ path: `${SHOTS}/private-positions-after-refresh.png` });

  // ══ D. Logout teardown (§76) ══════════════════════════════════════════════
  const feedRequests = [];
  page.on("request", (req) => {
    const url = req.url();
    if (/X-TransformPort=3003/.test(url)) feedRequests.push(url);
  });
  await page.locator('[data-testid="sidebar-logout"]').click();
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  feedRequests.length = 0;
  await page.waitForTimeout(5000);
  check("D1 No market-service traffic after logout (shared socket torn down)", feedRequests.length === 0,
    feedRequests.length > 0 ? feedRequests[0] : "clean");

  // ══ E. Cleanliness ════════════════════════════════════════════════════════
  check("E1 No unexpected console/network errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} ${failed === 0 ? "ALL PASS" : "FAILURES PRESENT"}`);
  process.exit(failed === 0 ? 0 : 1);
})();
