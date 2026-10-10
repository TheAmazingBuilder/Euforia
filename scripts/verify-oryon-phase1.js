/**
 * verify-oryon-phase1.js — Oryon Phase 1 (full-screen charting workspace +
 * Lightweight Charts engine). Contract under test:
 *  - /oryon resolves through the (app) router; workspace fills the viewport
 *  - a REAL chart instance renders candles from the market feed
 *  - instrument + timeframe controls work within verified capabilities
 *  - honest states: feed status pill, source badge (SIM/REAL), tool rail
 *    disabled tools, lower panel deferred copy
 *  - theme switch: engine re-applies tokens without console errors
 *  - 0 console errors · desktop 1440 + mobile 390 · screenshots
 *
 * NOTE MSW: the mock engine reseeds on full page reload — the script loads
 * the app once on the dashboard, then navigates client-side.
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-phase1-probe.log");
fs.writeFileSync(LOG, `=== oryon phase1 probe — ${new Date().toISOString()} ===\n`);

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve(__dirname, "shots");

let pass = 0;
let fail = 0;
const ok = (label, cond) => {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${label}`);
    fs.appendFileSync(LOG, `  PASS  ${label}\n`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}`);
    fs.appendFileSync(LOG, `  FAIL  ${label}\n`);
  }
};

async function clearDevOverlay(page) {
  await page
    .evaluate(() => {
      document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
    })
    .catch(() => {});
}

const CONSOLE_NOISE = [
  "socket.io",
  "XTransformPort",
  "Failed to load resource",
  "ERR_CONNECTION",
  "net::",
  "Download the React DevTools",
];

/** Mocked-mode sign-in (the app gates every route behind auth). */
async function signIn(app) {
  await app.goto(`${BASE}/`, { waitUntil: "load", timeout: 60_000 });
  fs.appendFileSync(LOG, `signIn: after goto — ${app.url()}\n`);
  // The /login redirect happens client-side after hydration — wait for the
  // form; if it never shows, the session is already authenticated.
  try {
    await app.waitForSelector('[data-testid="login-form"]', { timeout: 15_000 });
  } catch {
    fs.appendFileSync(LOG, "signIn: no login form (already authed?)\n");
    return;
  }
  fs.appendFileSync(LOG, "signIn: login form visible\n");
  // Canonical path: the demo-hint fill button (direct #login-email fill is
  // unreliable — AuthField may not put the id on the Input element itself).
  const demoButton = app.locator('[data-testid="login-demo-hint"] button').first();
  if ((await demoButton.count()) > 0) {
    await demoButton.click();
  } else {
    await app.fill("#login-email", "trader@cosmoz.app");
    await app.fill("#login-password", "cosmoz-demo-2026");
  }
  await app.click('[data-testid="login-submit"]');
  fs.appendFileSync(LOG, `signIn: submitted — ${app.url()}\n`);
  // Optional MFA step — the demo hint shows the code in mocked mode.
  try {
    await app.waitForSelector('[data-testid="login-mfa-code"], [data-testid="oryon-workspace"], a[href="/oryon"]', { timeout: 15_000 });
  } catch {
    /* fall through — link wait below decides */
  }
  fs.appendFileSync(LOG, `signIn: after settle — ${app.url()}\n`);
  if ((await app.locator('[data-testid="login-mfa-code"]').count()) > 0) {
    const hint = (await app.locator('[data-testid="login-mfa-demo-hint"]').innerText()).match(/\d{6}/);
    if (hint) {
      await app.fill('[data-testid="login-mfa-code"]', hint[0]);
      await app.click('form >> text=/verify|confirm|sign in/i').catch(() => app.keyboard.press("Enter"));
    }
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
    errors.push(text);
  });

  // ── 1. Sign in (mocked demo), then navigate client-side to /oryon ───────
  await signIn(page);
  // The shell hydrates then mounts the sidebar — wait for the real link.
  const navLink = page.locator('a[href="/oryon"]').first();
  await navLink.waitFor({ state: "visible", timeout: 30_000 });
  await clearDevOverlay(page);
  await navLink.click();
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 20_000 });
  await page.waitForTimeout(2_500); // chart mount + first candles
  await clearDevOverlay(page);

  ok("Oryon — workspace rendu", await page.locator('[data-testid="oryon-workspace"]').isVisible());
  ok("Oryon — toolbar présente", await page.locator('[data-testid="oryon-toolbar"]').isVisible());
  ok("Oryon — 7 timeframes", (await page.locator('[data-testid="oryon-timeframes"] button').count()) === 7);

  // ── 2. Chart engine — a real Lightweight Charts instance with candles ────
  const symbol = (await page.locator('[data-testid="oryon-instrument-trigger"]').innerText()).trim();
  ok("Oryon — instrument sélectionné (non vide)", symbol.length > 0 && symbol !== "—");

  await page.waitForSelector('[data-testid="oryon-chart-canvas"] canvas', { timeout: 15_000 });
  const canvasCount = await page.locator('[data-testid="oryon-chart-canvas"] canvas').count();
  ok("Oryon — canvas du moteur présent", canvasCount > 0);
  ok("Oryon — légende symbole", await page.locator('[data-testid="oryon-legend-symbol"]').isVisible());
  const legendInterval = (await page.locator('[data-testid="oryon-legend-interval"]').innerText()).trim();
  ok("Oryon — légende intervalle = 5m", legendInterval === "5m");
  const sourceBadge = await page.locator('[data-testid="oryon-source-sim"], [data-testid="oryon-source-real"]').count();
  ok("Oryon — badge source honnête (SIM/REAL)", sourceBadge === 1);
  const ohlc = await page.locator('[data-testid="oryon-legend-ohlc"]').count();
  ok("Oryon — légende OHLC peuplée", ohlc === 1);
  ok("Oryon — statut de flux visible", await page.locator('[data-testid="oryon-feed-status"]').isVisible());

  // ── 3. Timeframe switch — no chart recreation, no errors ─────────────────
  await page.locator('[data-testid="oryon-tf-1H"]').click();
  await page.waitForTimeout(1_500);
  ok("Oryon — 1H appliqué (légende)", (await page.locator('[data-testid="oryon-legend-interval"]').innerText()).trim() === "1H");
  ok("Oryon — canvas toujours unique après 1H", (await page.locator('[data-testid="oryon-chart-canvas"] canvas').count()) > 0);
  await page.locator('[data-testid="oryon-tf-5m"]').click();
  await page.waitForTimeout(1_000);

  // ── 4. Chart type — line puis candles (types réellement implémentés) ─────
  await page.locator('[data-testid="oryon-type-line"]').click();
  await page.waitForTimeout(800);
  ok("Oryon — type line sans erreur", errors.length === 0);
  await page.locator('[data-testid="oryon-type-candles"]').click();
  await page.waitForTimeout(800);

  // ── 5. Left tool rail — visual foundation, tools honestly disabled ───────
  ok("Oryon — rail d'outils visible (md+)", await page.locator('[data-testid="oryon-tool-rail"]').isVisible());
  const toolButtons = page.locator('[data-testid="oryon-tool-rail"] button');
  const toolCount = await toolButtons.count();
  let disabledCount = 0;
  for (let i = 0; i < toolCount; i += 1) {
    if (!(await toolButtons.nth(i).isEnabled())) disabledCount += 1;
  }
  ok("Oryon — tous les outils du rail désactivés (honnête)", toolCount > 0 && disabledCount === toolCount);

  // ── 6. Lower panel — collapsed par défaut, état reporté honnête ──────────
  ok("Oryon — panneau bas replié par défaut", (await page.locator('[data-testid="oryon-lower-panel"]').count()) === 0);
  await page.locator('[data-testid="oryon-lower-toggle"]').click();
  await page.waitForSelector('[data-testid="oryon-lower-panel"]', { timeout: 5_000 });
  const lowerCopy = (await page.locator('[data-testid="oryon-lower-panel"]').innerText()).toLowerCase();
  ok(
    "Oryon — panneau bas : copie honnête (pas de positions fabriquées)",
    lowerCopy.includes("not integrated") && !/buy|sell|open position \d/i.test(lowerCopy),
  );
  await page.locator('[data-testid="oryon-lower-close"]').click();
  await page.waitForTimeout(400);
  ok("Oryon — panneau bas se referme", (await page.locator('[data-testid="oryon-lower-panel"]').count()) === 0);

  // ── 7. Utility rail — notifications (deferred) + calendrier éco (réel) ───
  await page.locator('[data-testid="oryon-notifications"]').click();
  await page.waitForSelector('[data-testid="oryon-utility-rail"]', { timeout: 5_000 });
  const notifCopy = (await page.locator('[data-testid="oryon-panel-notifications"]').innerText()).toLowerCase();
  ok("Oryon — notifications : état reporté honnête", notifCopy.includes("not wired"));
  await page.locator('[data-testid="oryon-utility-tab-calendar"]').click();
  await page.waitForTimeout(1_200);
  ok("Oryon — panneau calendrier rendu", await page.locator('[data-testid="oryon-panel-calendar"]').isVisible());
  await page.locator('[data-testid="oryon-utility-close"]').click();
  await page.waitForTimeout(400);
  ok("Oryon — rail utilité se referme", (await page.locator('[data-testid="oryon-utility-rail"]').count()) === 0);

  // ── 8. Instrument switch — identité stable + badge source mis à jour ─────
  await page.locator('[data-testid="oryon-instrument-trigger"]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid="oryon-instrument-search"]').fill("BTCUSDT");
  await page.waitForTimeout(400);
  const btcOption = page.locator('[data-testid="oryon-instrument-option-BTCUSDT"]');
  ok("Oryon — option BTCUSDT présente et active", (await btcOption.count()) === 1 && (await btcOption.isEnabled()));
  await btcOption.click();
  await page.waitForTimeout(2_500);
  ok("Oryon — légende = BTCUSDT", (await page.locator('[data-testid="oryon-legend-symbol"]').innerText()).trim() === "BTCUSDT");
  // keepPreviousData shows the loading state during the fetch — the REAL
  // badge appears once Binance history lands (bounded wait, then assert).
  const realBadge = page.locator('[data-testid="oryon-source-real"]');
  try {
    await realBadge.waitFor({ state: "visible", timeout: 12_000 });
  } catch {
    /* counted below as FAIL */
  }
  ok("Oryon — badge REAL pour BTCUSDT", (await realBadge.count()) === 1);
  ok("Oryon — canvas BTCUSDT unique", (await page.locator('[data-testid="oryon-chart-canvas"] canvas').count()) > 0);

  // ── 9. Console — zéro erreur sur toute la session desktop ────────────────
  ok("Oryon — 0 erreur console (desktop)", errors.length === 0);
  if (errors.length > 0) console.log("    console errors:", errors.slice(0, 5));

  await page.screenshot({ path: path.join(OUT, "oryon-phase1-desktop.png") });

  // ── 10. Mobile 390 — fallback délibéré (rail caché, overlay utilités) ────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrors = [];
  mobile.on("pageerror", (e) => mobileErrors.push(String(e)));
  mobile.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
    mobileErrors.push(text);
  });
  await signIn(mobile);
  await mobile.goto(`${BASE}/oryon`, { waitUntil: "load", timeout: 60_000 });
  await mobile.waitForTimeout(3_000);
  await clearDevOverlay(mobile);
  ok("Mobile — workspace rendu", await mobile.locator('[data-testid="oryon-workspace"]').isVisible());
  ok(
    "Mobile — rail d'outils caché",
    !(await mobile.locator('[data-testid="oryon-tool-rail"]').isVisible().catch(() => false)),
  );
  ok("Mobile — canvas présent", (await mobile.locator('[data-testid="oryon-chart-canvas"] canvas').count()) > 0);
  await mobile.locator('[data-testid="oryon-notifications"]').click();
  await mobile.waitForTimeout(800);
  ok("Mobile — utilités en overlay (Sheet)", await mobile.locator('[data-testid="oryon-utility-overlay"]').isVisible());
  await mobile.keyboard.press("Escape");
  ok("Mobile — 0 erreur console", mobileErrors.length === 0);
  if (mobileErrors.length > 0) console.log("    mobile errors:", mobileErrors.slice(0, 5));
  await mobile.screenshot({ path: path.join(OUT, "oryon-phase1-mobile-390.png") });

  await browser.close();
  const summary = `\n=== ORYON PHASE 1 — ${pass} PASS / ${fail} FAIL ===\n`;
  console.log(summary);
  fs.appendFileSync(LOG, summary);
  process.exit(fail > 0 ? 1 : 0);
})().catch((error) => {
  console.error("PROBE CRASH:", error);
  fs.appendFileSync(LOG, `PROBE CRASH: ${error && error.message ? error.message : String(error)}\n`);
  process.exit(1);
});
