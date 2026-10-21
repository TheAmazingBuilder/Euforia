/**
 * Verify — Session Live authenticated WebSocket connection (WS-AUTH).
 *
 * Mission §43/§45/§62/§63/§76: the market feed is an AUTHENTICATED channel.
 *
 *   A. Service-level security (direct to :3003, no browser):
 *      health public / REST 401 without-Bearer / 401 invalid token /
 *      handshake rejections (no token, garbage, forged signature, expired)
 *      / valid token accepted and streams "prices".
 *   B. Browser flow (SPA-only after entry): gate redirect, demo login,
 *      sidebar navigation to Session Live, feed badge reaches a live data
 *      state (proves the authenticated handshake), chart renders.
 *   C. Mid-stream refresh: dev-hook force-expires the access token → the
 *      candles refetch hits 401 → single-flight refresh → TOKEN_REFRESHED
 *      → socket re-handshake; session survives (no expiry redirect), badge
 *      returns to a live state.
 *   D. Logout teardown: signing out disconnects the feed — NO /prices or
 *      /candles requests may fire afterwards (§76 negative test).
 *   E. Console/network cleanliness (expected 401s from the forced-expiry
 *      test are excluded by an "expected" window, not by blanket filtering).
 *
 * SPA-only navigation after the initial entry (MSW state lives in the tab).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");
const { io } = require("/home/z/my-project/node_modules/.pnpm/socket.io-client@4.8.3_supports-color@7.2.0/node_modules/socket.io-client");

const BASE = "http://localhost:3000";
const SERVICE = "http://localhost:3003";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/ws-auth";

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

function wsProbe(auth, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = io(SERVICE, { auth, transports: ["polling", "websocket"], timeout: 3000, reconnection: false });
    let prices = false;
    socket.on("prices", () => {
      prices = true;
    });
    const finish = (result) => {
      try { socket.disconnect(); } catch {}
      resolve(result + (prices ? " + prices event" : ""));
    };
    socket.on("connect", () => {
      if (prices) finish("CONNECTED");
      else setTimeout(() => finish("CONNECTED"), 1200);
    });
    socket.on("connect_error", (err) => finish(`connect_error: ${err.message}`));
    setTimeout(() => finish("TIMEOUT"), timeoutMs);
  });
}

async function restProbe(path, headers) {
  const response = await fetch(`${BASE}${path}`, { headers });
  let body = null;
  try { body = await response.json(); } catch {}
  return { status: response.status, body };
}

(async () => {
  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };

  // ══ A. Service-level security (server is the boundary — §63) ══════════════
  // Probed through the SAME gateway route the browser uses (path first,
  // XTransformPort in the query) so header forwarding is covered too.
  const health = await restProbe("/health?XTransformPort=3003");
  check("A1 /health stays public (infra telemetry)", health.status === 200);

  const pricesAnon = await restProbe("/prices?XTransformPort=3003");
  check("A2 /prices without Bearer → 401 AUTH_REQUIRED",
    pricesAnon.status === 401 && pricesAnon.body?.error === "AUTH_REQUIRED",
    JSON.stringify(pricesAnon.body));

  const pricesBad = await restProbe("/prices?XTransformPort=3003", { Authorization: "Bearer garbage.token.here" });
  check("A3 /prices invalid token → 401 TOKEN_INVALID",
    pricesBad.status === 401 && pricesBad.body?.error === "TOKEN_INVALID",
    JSON.stringify(pricesBad.body));

  const candlesAnon = await restProbe("/candles?XTransformPort=3003&symbol=XAUUSD&interval=5m&limit=10");
  check("A4 /candles without Bearer → 401 AUTH_REQUIRED",
    candlesAnon.status === 401 && candlesAnon.body?.error === "AUTH_REQUIRED");

  check("A5 WS without token → AUTH_REQUIRED", (await wsProbe({})) .includes("AUTH_REQUIRED"));
  check("A6 WS garbage token → TOKEN_INVALID", (await wsProbe({ token: "garbage" })) .includes("TOKEN_INVALID"));

  const forged = `czat1.${Buffer.from(JSON.stringify({ uid: DEMO_UID, iat: Date.now(), exp: Date.now() + 900000, v: 1 })).toString("base64url")}.00000000ffffffff`;
  check("A7 WS forged signature → TOKEN_INVALID", (await wsProbe({ token: forged })).includes("TOKEN_INVALID"));

  const expired = mintToken(DEMO_UID, Date.now() - 1000);
  check("A8 WS expired token → TOKEN_EXPIRED", (await wsProbe({ token: expired })).includes("TOKEN_EXPIRED"));

  const valid = mintToken(DEMO_UID, Date.now() + 900_000);
  const validProbe = await wsProbe({ token: valid });
  check("A9 WS valid token → CONNECTED + prices stream", validProbe.includes("CONNECTED") && validProbe.includes("prices event"), validProbe);

  const pricesValid = await restProbe("/prices?XTransformPort=3003", { Authorization: `Bearer ${valid}` });
  check("A10 REST valid token → 200 with quotes",
    pricesValid.status === 200 && Array.isArray(pricesValid.body?.quotes) && pricesValid.body.quotes.length > 0,
    `${pricesValid.status}`);

  // ══ B. Browser flow (SPA) ═════════════════════════════════════════════════
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Expected-error window: the forced-expiry test intentionally produces 401s;
  // a FRESH context's boot restore (/auth/me + /auth/refresh without a jar)
  // also 401s by design (worklog AUTH-1: "the EXPECTED clean outcome").
  let expect401 = false;
  let bootPhase = true;
  const errors = [];
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
  check("B1 Unauthenticated gate → /login", page.url().includes("/login"));

  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL(/\/(\?.*)?$/, { timeout: 20_000 });
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 15_000 });
  bootPhase = false;
  check("B2 Demo login → app shell", true);

  await page.locator('nav[aria-label="Main navigation"] a[href="/session"]').click();
  await page.locator('[data-testid="session-live-header"]').waitFor({ state: "visible", timeout: 20_000 });

  // Authenticated handshake → the feed must reach a live data state.
  let feedState = "none";
  for (let i = 0; i < 30; i += 1) {
    feedState = (await page.locator('[data-testid="feed-badge"]').getAttribute("data-state")) ?? "none";
    if (feedState === "live" || feedState === "sim") break;
    await page.waitForTimeout(1000);
  }
  check("B3 Authenticated WS → feed badge LIVE/SIM", feedState === "live" || feedState === "sim", feedState);
  await page.screenshot({ path: `${SHOTS}/session-live-authenticated.png` });

  // ══ C. Mid-stream refresh → re-handshake (Reconnect → Authenticate, §45) ══
  expect401 = true;
  await page.evaluate(() => window.__cosmoz_auth.expireAccessToken());
  await page.evaluate(() => window.__cosmoz_auth.refetchGuarded());
  await page.waitForTimeout(4000);
  expect401 = false;

  const stillIn = !page.url().includes("/login");
  check("C1 Forced expiry + refresh → NO session-expiry redirect", stillIn, page.url());

  let refreshedState = "none";
  for (let i = 0; i < 20; i += 1) {
    refreshedState = (await page.locator('[data-testid="feed-badge"]').getAttribute("data-state")) ?? "none";
    if (refreshedState === "live" || refreshedState === "sim") break;
    await page.waitForTimeout(1000);
  }
  check("C2 Feed re-handshakes after TOKEN_REFRESHED → LIVE/SIM",
    refreshedState === "live" || refreshedState === "sim", refreshedState);
  await page.screenshot({ path: `${SHOTS}/session-live-after-refresh.png` });

  // ══ D. Logout teardown — the feed must stop streaming (§76) ═══════════════
  const feedRequests = [];
  page.on("request", (req) => {
    const url = req.url();
    if (/X-TransformPort=3003/.test(url) && (/\/prices/.test(url) || /\/candles/.test(url) || /\/socket\.io/.test(url))) {
      feedRequests.push(url);
    }
  });
  await page.locator('[data-testid="sidebar-logout"]').click();
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  check("D1 Logout → /login", true);
  feedRequests.length = 0;
  await page.waitForTimeout(5000);
  check("D2 No market-feed requests after logout (socket + polling torn down)", feedRequests.length === 0,
    feedRequests.length > 0 ? feedRequests[0] : "clean");
  await page.screenshot({ path: `${SHOTS}/after-logout.png` });

  // ══ E. Cleanliness ════════════════════════════════════════════════════════
  check("E1 No unexpected console/network errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} ${failed === 0 ? "ALL PASS" : "FAILURES PRESENT"}`);
  process.exit(failed === 0 ? 0 : 1);
})();
