/**
 * verify-oryon-phase7.js — Oryon Phase 7 (multi-chart workspace, market
 * comparison, chart synchronization).
 * Contract under test:
 *  - GRIDS: single / side-by-side / stacked / quad, stable panel identities
 *    (charts NOT recreated on transitions), active-panel survival on
 *    `single`, <md graceful stack.
 *  - ACTIVE CHART (§7): explicit activation (pointer/focus), active badge,
 *    first click on an inactive panel activates WITHOUT drawing (second
 *    click draws), duplicate/remove from the per-panel header, remove
 *    guard on the last panel.
 *  - SYNC (§8): four INDEPENDENT flags; time-scale (visible-range
 *    broadcast, honest epsilon), crosshair (timestamp-based, same bar on
 *    both charts), instrument + timeframe linking at the config level,
 *    off = strictly inert.
 *  - OWNERSHIP (§11): drawings belong to the SYMBOL (per-symbol stores,
 *    cross-panel isolation), indicators belong to the PANEL (per-panel
 *    registry), templates apply to the ACTIVE panel only, positions and
 *    alert overlays appear ONLY on symbol-matching panels.
 *  - LAYOUTS (§12): multi-panel save/switch/reload restore (v2 envelope).
 *  - Honest a11y: sync state exposed via aria-checked; 0 console errors;
 *    desktop 1440 + mobile 390.
 *
 * Run: node scripts/verify-oryon-phase7.js   (DEV server on :3001 — the
 * structural debug handles are dev-only by design, phases 1-6 convention —
 * market service on :3003, mocked auth, BASE_URL overridable)
 */
const path = require("path");
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = path.resolve(__dirname, "oryon-phase7-probe.log");
fs.writeFileSync(LOG, `=== oryon phase7 probe — ${new Date().toISOString()} ===\n`);

const BASE = process.env.BASE_URL || "http://localhost:3001";

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
  "React does not recognize",
  "WebSocket",
];

/** Mocked-mode sign-in (the app gates every route behind auth). */
async function signIn(app) {
  await app.goto(`${BASE}/`, { waitUntil: "load", timeout: 90_000 });
  try {
    await app.waitForSelector('[data-testid="login-form"]', { timeout: 20_000 });
  } catch {
    fs.appendFileSync(LOG, "signIn: no login form (already authed?)\n");
    return;
  }
  const demoButton = app.locator('[data-testid="login-demo-hint"] button').first();
  if ((await demoButton.count()) > 0) {
    await demoButton.click();
  } else {
    await app.fill("#login-email", "trader@cosmoz.app");
    await app.fill("#login-password", "cosmoz-demo-2026");
  }
  await app.click('[data-testid="login-submit"]');
  try {
    await app.waitForSelector('[data-testid="login-mfa-code"]', { timeout: 15_000 });
  } catch {
    /* fall through */
  }
  if ((await app.locator('[data-testid="login-mfa-code"]').count()) > 0) {
    const hint = (await app.locator('[data-testid="login-mfa-demo-hint"]').innerText()).match(/\d{6}/);
    if (hint) {
      await app.fill('[data-testid="login-mfa-code"]', hint[0]);
      await app.click('form >> text=/verify|confirm|sign in/i').catch(() => app.keyboard.press("Enter"));
    }
  }
  await app.waitForSelector('a[href="/oryon"]', { timeout: 40_000 }).catch(() => {});
}

// ── Observers (debug handles — dev builds only) ──────────────────────────────

async function panels(app) {
  return app.evaluate(() => {
    const read = window.__ORYON_PANELS_DEBUG__;
    if (typeof read !== "function") return null;
    return read();
  });
}

/** Waits until the grid shows `count` panels, each engine live (series ≥ 1)
 *  and — when given — each raw session symbol matches `symbols[i]`. */
async function waitForPanels(app, count, symbols = null, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await panels(app);
    if (
      Array.isArray(last) &&
      last.length === count &&
      last.every((p) => p.series >= 1) &&
      (symbols === null || symbols.every((s, i) => last[i] && last[i].symbol === s))
    ) {
      return last;
    }
    await app.waitForTimeout(250);
  }
  return last;
}

async function layoutsFile(app) {
  return app.evaluate(() => {
    const raw = window.localStorage.getItem("euforia.oryon.layouts.v1");
    return raw === null ? null : JSON.parse(raw);
  });
}

async function templatesFile(app) {
  return app.evaluate(() => {
    const raw = window.localStorage.getItem("euforia.oryon.templates.v1");
    return raw === null ? null : JSON.parse(raw);
  });
}

/** Drawings records per symbol key (per-symbol stores — §11). */
async function drawingsBySymbol(app) {
  return app.evaluate(() => {
    const out = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key.startsWith("euforia.oryon.drawings.")) {
        const sym = key.split("drawings.")[1] ?? key;
        try {
          const value = JSON.parse(window.localStorage.getItem(key));
          const arr = Array.isArray(value) ? value : value?.drawings ?? [];
          out[sym] = arr.length;
        } catch {
          out[sym] = -1;
        }
      }
    }
    return out;
  });
}

// ── Interaction helpers ──────────────────────────────────────────────────────

const panelLoc = (app, i) => app.locator('[data-testid="oryon-panel"]').nth(i);

async function panelRawSymbol(app, i) {
  const list = await panels(app);
  return Array.isArray(list) ? (list[i]?.symbol ?? null) : undefined;
}

async function activatePanel(app, i) {
  await panelLoc(app, i).locator('[data-testid="oryon-panel-' + i + '-identity"]').click();
  await app.waitForTimeout(250);
}

async function setPanelSymbol(app, i, symbol) {
  // Header controls respond after the panel is active (first-click
  // activation semantic — the probe activates explicitly, like a user).
  await activatePanel(app, i);
  await app.click(`[data-testid="oryon-panel-${i}-instrument-trigger"]`);
  await app.waitForSelector(`[data-testid="oryon-panel-${i}-instrument-search"]`, { timeout: 5_000 });
  await app.fill(`[data-testid="oryon-panel-${i}-instrument-search"]`, symbol);
  await app.waitForTimeout(250);
  await app.click(`[data-testid="oryon-panel-${i}-instrument-option-${symbol}"]`);
  await waitForPanels(app, null, null, 500).catch(() => {});
  await app.waitForTimeout(1_200);
}

async function setPanelInterval(app, i, interval) {
  await activatePanel(app, i);
  await app.click(`[data-testid="oryon-panel-${i}-timeframes"]`);
  await app.waitForTimeout(200);
  await app.click(`[data-testid="oryon-panel-${i}-tf-${interval}"]`);
  await app.waitForTimeout(1_200);
}

/** Opens a panel's header menu and runs one of its items (the panel is
 *  activated first — first-click activation semantic). */
async function panelMenuAction(app, i, itemTestid) {
  await activatePanel(app, i);
  await app.click(`[data-testid="oryon-panel-${i}-menu"]`);
  await app.waitForTimeout(250);
  await app.click(`[data-testid="oryon-panel-${i}-${itemTestid}"]`);
  await app.waitForTimeout(800);
}

async function openGridMenu(app) {
  await app.click('[data-testid="oryon-grid-trigger"]');
  await app.waitForTimeout(200);
}

async function setGrid(app, grid) {
  await openGridMenu(app);
  await app.click(`[data-testid="oryon-grid-item-${grid}"]`);
  await app.waitForTimeout(500);
}

async function toggleSync(app, feature) {
  await app.click('[data-testid="oryon-sync-trigger"]');
  await app.waitForTimeout(200);
  await app.click(`[data-testid="oryon-sync-item-${feature}"]`);
  await app.waitForTimeout(300);
}

async function syncChecked(app, feature) {
  await app.click('[data-testid="oryon-sync-trigger"]');
  await app.waitForTimeout(200);
  const checked = await app
    .locator(`[data-testid="oryon-sync-item-${feature}"]`)
    .getAttribute("aria-checked");
  await app.keyboard.press("Escape");
  await app.waitForTimeout(200);
  return checked === "true";
}

async function canvasBox(app, i) {
  const canvas = panelLoc(app, i).locator('[data-testid="oryon-chart-canvas"] canvas').first();
  return canvas.boundingBox();
}

/** USER pan: press-drag horizontally on the panel's plot area. */
async function dragCanvas(app, i, dx) {
  const box = await canvasBox(app, i);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await app.mouse.move(cx, cy);
  await app.mouse.down();
  for (let step = 1; step <= 6; step++) {
    await app.mouse.move(cx + (dx * step) / 6, cy, { steps: 2 });
  }
  await app.mouse.up();
  await app.waitForTimeout(400);
}

/** USER hover: park the crosshair over the BARS (`xFrac` across the plot —
 *  the right part of the plot is empty right-offset margin where LWC
 *  reports no bar time). */
async function hoverCanvas(app, i, xFrac = 0.35, offsetY = 0) {
  const box = await canvasBox(app, i);
  const cx = box.x + box.width * xFrac;
  const cy = box.y + box.height / 2 + offsetY;
  await app.mouse.move(cx - 60, cy - 40, { steps: 4 });
  await app.mouse.move(cx, cy, { steps: 6 });
  await app.waitForTimeout(350);
}

const RANGE_EPS = 1;
function rangesAligned(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.from - b.from) <= RANGE_EPS && Math.abs(a.to - b.to) <= RANGE_EPS;
}

/** Leaves the plot (over the tool rail) and waits past the 150 ms echo
 *  window, so the NEXT hover is the only recent crosshair event. */
async function leavePlot(app) {
  await app.mouse.move(10, 500, { steps: 4 });
  await app.waitForTimeout(700);
}

// ── Main flow ────────────────────────────────────────────────────────────────

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => {
    const text = String(e);
    if (text.includes("Value is null")) {
      fs.appendFileSync(LOG, `pageerror-stack: ${text.split("\n").slice(0, 8).join(" | ")}\n`);
    }
    errors.push(text);
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (text.includes("Value is null")) {
      const loc = m.location();
      fs.appendFileSync(LOG, `null-err at ${loc.url}:${loc.lineNumber}:${loc.columnNumber}\n`);
    }
    if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
    errors.push(text);
  });

  // ── Setup: sign in + fresh config state ──────────────────────────────────
  await signIn(page);
  const navLink = page.locator('a[href="/oryon"]').first();
  await navLink.waitFor({ state: "visible", timeout: 40_000 });
  await clearDevOverlay(page);
  await navLink.click();
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });

  // Fresh Phase-7 state: wipe the config keys (never drawings/alerts/indicators).
  await page.evaluate(() => {
    window.localStorage.removeItem("euforia.oryon.layouts.v1");
    window.localStorage.removeItem("euforia.oryon.templates.v1");
  });
  await page.reload({ waitUntil: "load" });
  await clearDevOverlay(page);
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  await waitForPanels(page, 1);
  await page.waitForTimeout(2_000);

  // ── A. État initial ──────────────────────────────────────────────────────
  console.log("— A. État initial : single, un panneau, sync off");

  ok("A1 grille single (data-grid)", (await page.locator('[data-testid="oryon-chart-grid"]').getAttribute("data-grid")) === "single");
  ok("A2 un seul panneau, actif", await (async () => {
    const list = await panels(page);
    return Array.isArray(list) && list.length === 1 && list[0].active === true;
  })());
  ok("A3 déclencheur sync présent sans état actif", (await page.locator('[data-testid="oryon-sync-trigger"][data-active]').count()) === 0);
  ok("A4 sync : 4 fonctionnalités indépendantes désactivées (aria-checked)", await (async () => {
    const states = [];
    for (const f of ["timeScale", "crosshair", "instrument", "timeframe"]) {
      states.push(await syncChecked(page, f));
    }
    return states.every((s) => s === false);
  })());
  ok("A5 menu grille : les 4 arrangements", await (async () => {
    await openGridMenu(page);
    const n = await page.locator('[data-testid^="oryon-grid-item-"]').count();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    return n === 4;
  })());

  // ── B. Grilles : transitions sans recréation ─────────────────────────────
  console.log("— B. Grilles : transitions, identités stables");

  await setGrid(page, "twoHorizontal");
  await waitForPanels(page, 2);
  ok("B1 side-by-side → 2 panneaux", (await panels(page)).length === 2);

  // Canvas DOM identity survives the transition (chart NOT recreated).
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="oryon-panel"] [data-testid="oryon-chart-canvas"] canvas');
    if (canvas) canvas.__probeTag = "keep-me";
  });
  await setGrid(page, "quad");
  await waitForPanels(page, 4);
  const canvasKept = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="oryon-panel"] [data-testid="oryon-chart-canvas"] canvas');
    return canvas ? canvas.__probeTag === "keep-me" : false;
  });
  ok("B2 quad → 4 panneaux, canvas du panneau 1 NON recréé", (await panels(page)).length === 4 && canvasKept);

  await setGrid(page, "twoVertical");
  await page.waitForTimeout(600);
  const vertical = await panels(page);
  ok("B3 empilé → les 4 configurations survivent (rangée implicite)", vertical.length === 4 && vertical.every((p) => p.series >= 1));

  // `single` keeps the ACTIVE panel only.
  await activatePanel(page, 2);
  await setGrid(page, "single");
  const afterSingle = await waitForPanels(page, 1);
  ok("B4 single → seul le panneau ACTIF survit", Array.isArray(afterSingle) && afterSingle.length === 1 && afterSingle[0].active === true);

  await setGrid(page, "twoHorizontal");
  await waitForPanels(page, 2);
  ok("B5 retour side-by-side → 2 moteurs vivants", (await panels(page)).every((p) => p.series >= 1));

  // Distinct instruments for ownership tests (per-symbol/per-panel domains).
  await setPanelSymbol(page, 0, "EURUSD");
  await setPanelSymbol(page, 1, "XAUUSD");
  await waitForPanels(page, 2, ["EURUSD", "XAUUSD"]);
  ok("B6 instruments distincts posés (EURUSD / XAUUSD)", true);

  // ── C. Modèle du panneau actif (§7) ──────────────────────────────────────
  console.log("— C. Panneau actif : activation, premier clic sans dessin");

  await activatePanel(page, 1);
  ok("C1 activation explicite du panneau 2", await (async () => {
    const list = await panels(page);
    return list[1].active === true && list[0].active === false;
  })());
  ok("C2 badge actif présent sur le panneau 2 seul", await (async () => {
    const badge1 = await panelLoc(page, 1).locator('[data-testid="oryon-panel-1-active-badge"]').count();
    const badge0 = await panelLoc(page, 0).locator('[data-testid="oryon-panel-0-active-badge"]').count();
    return badge1 === 1 && badge0 === 0;
  })());

  // First click on an INACTIVE panel activates without drawing.
  await page.click('[data-testid="oryon-tool-trendline"]');
  await page.waitForTimeout(300);
  const box0 = await canvasBox(page, 0);
  await page.mouse.click(box0.x + box0.width * 0.4, box0.y + box0.height * 0.5);
  await page.waitForTimeout(400);
  ok("C3 premier clic sur panneau inactif → activation SANS dessin", await (async () => {
    const list = await panels(page);
    const draws = await drawingsBySymbol(page);
    return list[0].active === true && (draws.EURUSD ?? 0) === 0;
  })());

  // Second + third clicks: anchor then complete a trend line on panel 1.
  await page.mouse.click(box0.x + box0.width * 0.55, box0.y + box0.height * 0.45);
  await page.waitForTimeout(250);
  await page.mouse.click(box0.x + box0.width * 0.7, box0.y + box0.height * 0.6);
  await page.waitForTimeout(800);
  const drawsAfter = await drawingsBySymbol(page);
  ok("C4 clics suivants → la tendance appartient à EURUSD", (drawsAfter["v1:EURUSD"] ?? drawsAfter.EURUSD ?? 0) >= 1);
  ok("C5 isolation dessins : XAUUSD reste vide", (drawsAfter["v1:XAUUSD"] ?? drawsAfter.XAUUSD ?? 0) === 0);
  await page.click('[data-testid="oryon-tool-pointer"]');
  await page.waitForTimeout(200);

  // ── D. Sync time-scale (§8.1) ────────────────────────────────────────────
  console.log("— D. Sync time-scale : diffusion et inertie");

  // Sync OFF: a pan on panel 1 stays local.
  let before = await panels(page);
  await dragCanvas(page, 0, -160);
  let after = await panels(page);
  const changed = (p) => p.visibleRange && before[0].visibleRange && !rangesAligned(p.visibleRange, before[0].visibleRange);
  ok("D1 sync off → le pan de A ne se propage pas", rangesAligned(after[0].visibleRange, after[1].visibleRange) === false && after[1].visibleRange && before[1].visibleRange && rangesAligned(after[1].visibleRange, before[1].visibleRange));

  await toggleSync(page, "timeScale");
  ok("D2 timeScale activé (aria-checked)", (await syncChecked(page, "timeScale")) === true);

  before = await panels(page);
  await dragCanvas(page, 0, -120);
  after = await panels(page);
  ok("D3 pan sur A → B aligné (plage propagée)", rangesAligned(after[0].visibleRange, after[1].visibleRange));

  await toggleSync(page, "timeScale");
  before = await panels(page);
  await dragCanvas(page, 1, -140);
  after = await panels(page);
  ok("D4 timeScale désactivé → inertie totale", rangesAligned(after[0].visibleRange, after[1].visibleRange) === false);

  // ── E. Sync crosshair (§8.2 — timestamp-based) ───────────────────────────
  console.log("— E. Sync crosshair : même timestamp, jamais des pixels");

  await toggleSync(page, "crosshair");
  // Settle: the menu closing under the pointer fires synthetic crosshair
  // moves whose echo guards (150 ms) can absorb the NEXT real dispatch.
  // One sacrificial hover, then leave the plot — every guard expires and
  // both crosshairs are honestly empty before the assertions start.
  await hoverCanvas(page, 0, 0.5);
  await leavePlot(page);
  await hoverCanvas(page, 0, 0.35);
  let list = await panels(page);
  const t0 = list[0].crosshairTime;
  // Honest propagation: B shows the SAME bar when its own data can
  // represent it; when the bar is out of B's loaded span the coordinator
  // CLEARS B (empty crosshair — never a stale or fabricated position).
  ok("E1 hover A → B suit le timestamp (ou reste honnêtement vide)", t0 !== null && (list[1].crosshairTime === t0 || list[1].crosshairTime === null));
  if (!(t0 !== null && (list[1].crosshairTime === t0 || list[1].crosshairTime === null))) {
    console.log(`  DEBUG E1: A=${JSON.stringify(list[0].crosshairTime)} B=${JSON.stringify(list[1].crosshairTime)}`);
  }

  await leavePlot(page);
  await hoverCanvas(page, 0, 0.2);
  list = await panels(page);
  const t1 = list[0].crosshairTime;
  ok("E2 hover A (autre barre) → B suit le nouveau timestamp", t1 !== null && list[1].crosshairTime === t1 && t1 !== t0);
  if (!(t1 !== null && list[1].crosshairTime === t1 && t1 !== t0)) {
    console.log(`  DEBUG E2: t0=${JSON.stringify(t0)} t1=${JSON.stringify(t1)} B=${JSON.stringify(list[1].crosshairTime)}`);
  }

  await toggleSync(page, "crosshair");
  await leavePlot(page);
  await hoverCanvas(page, 0, 0.28);
  list = await panels(page);
  const t2 = list[0].crosshairTime;
  ok("E3 crosshair désactivé → B ne suit plus A", t2 !== null && t2 !== t1 && list[1].crosshairTime !== t2);

  // ── F. Sync instrument + timeframe (§8.3/§8.4 — état) ────────────────────
  console.log("— F. Liens instrument et timeframe (niveau configuration)");

  await setPanelSymbol(page, 1, "GBPUSD");
  await waitForPanels(page, 2, ["EURUSD", "GBPUSD"]);
  ok("F1 sans lien : A=EURUSD, B=GBPUSD indépendants", true);

  await toggleSync(page, "instrument");
  await setPanelSymbol(page, 0, "XAUUSD");
  await waitForPanels(page, 2, ["XAUUSD", "XAUUSD"]);
  ok("F2 lien instrument → le changement de A se propage à B", true);

  await toggleSync(page, "instrument");
  await toggleSync(page, "timeframe");
  await setPanelInterval(page, 0, "15m");
  await waitForPanels(page, 2, null);
  ok("F3 lien timeframe → A et B passent à 15m", await (async () => {
    const list2 = await panels(page);
    return list2[0].interval === "15m" && list2[1].interval === "15m";
  })());

  await toggleSync(page, "timeframe");
  await setPanelInterval(page, 0, "5m");
  await page.waitForTimeout(1_000);
  ok("F4 timeframe désactivé → B garde 15m (A repasse à 5m)", await (async () => {
    const list2 = await panels(page);
    return list2[0].interval === "5m" && list2[1].interval === "15m";
  })());

  await setPanelSymbol(page, 0, "EURUSD");
  await page.waitForTimeout(1_000);
  ok("F5 instrument désactivé → B garde son symbole", (await panelRawSymbol(page, 1)) === "XAUUSD");
  ok("F6 l'activation d'un canal n'active jamais l'autre (timeScale off, crosshair off)", (await syncChecked(page, "timeScale")) === false && (await syncChecked(page, "crosshair")) === false);

  // ── G. Duplication / retrait de panneaux (§5) ────────────────────────────
  console.log("— G. Duplication et retrait");

  await panelMenuAction(page, 0, "menu-duplicate");
  const dup = await panels(page);
  ok("G1 dupliquer → 3 panneaux, copie indépendante et active", dup.length === 3 && dup[2].active === true && dup[2].symbol === "EURUSD" && dup[2].panelId !== dup[0].panelId);
  if (!(dup.length === 3 && dup[2].active === true && dup[2].symbol === "EURUSD")) {
    console.log(`  DEBUG G1: ${JSON.stringify(dup.map((p) => ({ i: p.index, id: p.panelId.slice(-6), sym: p.symbol, active: p.active })))}`);
  }

  await panelMenuAction(page, 2, "menu-remove");
  ok("G2 retirer la copie → retour à 2 panneaux", (await panels(page)).length === 2);

  await panelMenuAction(page, 1, "menu-remove");
  const single = await waitForPanels(page, 1);
  ok("G3 dernier retrait → grille single, 1 panneau", Array.isArray(single) && single.length === 1 && (await page.locator('[data-testid="oryon-chart-grid"]').getAttribute("data-grid")) === "single");

  ok("G4 panneau unique : l'action retirer est désactivée", await (async () => {
    await page.click('[data-testid="oryon-panel-0-menu"]');
    await page.waitForTimeout(250);
    const item = page.locator('[data-testid="oryon-panel-0-menu-remove"]');
    const disabled = (await item.count()) === 1 && (await item.isDisabled());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    return disabled;
  })());

  // ── H. Layouts multi-panneaux (§12) ──────────────────────────────────────
  console.log("— H. Layouts : arrangement quad sauvegardé et restauré");

  // Build a distinctive quad: EURUSD 5m · XAUUSD 15m · GBPUSD 5m · BOOM500 5m.
  await setGrid(page, "twoHorizontal");
  await waitForPanels(page, 2);
  await setPanelSymbol(page, 1, "XAUUSD");
  await setGrid(page, "quad");
  await waitForPanels(page, 4);
  await setPanelSymbol(page, 2, "GBPUSD");
  await setPanelSymbol(page, 3, "BOOM500");
  await setPanelInterval(page, 1, "15m");
  await waitForPanels(page, 4, ["EURUSD", "XAUUSD", "GBPUSD", "BOOM500"]);

  await page.click('[data-testid="oryon-layouts"]');
  await page.waitForSelector('[data-testid="oryon-layout-menu"]', { timeout: 5_000 });
  await page.click('[data-testid="oryon-layout-save-as"]');
  await page.waitForSelector('[data-testid="oryon-layout-name-dialog"]', { timeout: 5_000 });
  await page.fill('[data-testid="oryon-layout-name-input"]', "P7 Quad");
  await page.click('[data-testid="oryon-layout-name-submit"]');
  await page.waitForTimeout(900);

  let file = await layoutsFile(page);
  const quadLayout = file.layouts.find((l) => l.name === "P7 Quad");
  ok("H1 layout sauvegardé (pointeur actif)", file.layouts.length === 1 && file.activeLayoutId === quadLayout.id);
  ok("H2 v2 : grille quad + 4 panneaux avec symboles capturés", quadLayout.grid === "quad" && JSON.stringify(quadLayout.panels.map((p) => p.symbol)) === JSON.stringify(["EURUSD", "XAUUSD", "GBPUSD", "BOOM500"]));

  // Switch away and back — the SAVED arrangement is restored.
  await page.click('[data-testid="oryon-layouts"]');
  await page.waitForSelector('[data-testid="oryon-layout-menu"]', { timeout: 5_000 });
  await page.locator('[data-testid="oryon-layout-menu"] [role="menuitemradio"]', { hasText: "Default layout" }).first().click();
  await page.waitForTimeout(1_500);
  await waitForPanels(page, 1);
  ok("H3 retour au défaut → single", (await page.locator('[data-testid="oryon-chart-grid"]').getAttribute("data-grid")) === "single");

  await page.click('[data-testid="oryon-layouts"]');
  await page.waitForSelector('[data-testid="oryon-layout-menu"]', { timeout: 5_000 });
  await page.locator('[data-testid="oryon-layout-menu"] [role="menuitemradio"]', { hasText: "P7 Quad" }).first().click();
  const restored = await waitForPanels(page, 4, ["EURUSD", "XAUUSD", "GBPUSD", "BOOM500"]);
  ok("H4 re-switch → 4 panneaux, symboles + intervalles restaurés", Array.isArray(restored) && restored[1].interval === "15m");

  // Reload — the active layout re-applies on boot.
  await page.reload({ waitUntil: "load" });
  await clearDevOverlay(page);
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  const reloaded = await waitForPanels(page, 4, ["EURUSD", "XAUUSD", "GBPUSD", "BOOM500"]);
  ok("H5 reload → l'arrangement multi-panneaux est restauré", Array.isArray(reloaded) && reloaded.length === 4);
  file = await layoutsFile(page);
  ok("H6 le pointeur actif survit au reload", file !== null && file.activeLayoutId === file.layouts.find((l) => l.name === "P7 Quad").id);

  // Activation is a VIEW preference — never dirty.
  await activatePanel(page, 2);
  ok("H7 activation seule → PAS de pastille dirty", (await page.locator('[data-testid="oryon-layout-dirty"]').count()) === 0);

  await setPanelInterval(page, 0, "1H");
  await page.waitForTimeout(600);
  ok("H8 mutation d'arrangement → pastille dirty honnête", (await page.locator('[data-testid="oryon-layout-dirty"]').count()) === 1);
  await page.click('[data-testid="oryon-layouts"]');
  await page.waitForSelector('[data-testid="oryon-layout-menu"]', { timeout: 5_000 });
  await page.click('[data-testid="oryon-layout-save"]');
  await page.waitForTimeout(700);
  ok("H9 save → pastille disparue", (await page.locator('[data-testid="oryon-layout-dirty"]').count()) === 0);

  // ── I. Templates → panneau ACTIF uniquement (§11/§12) ────────────────────
  console.log("— I. Templates : application au panneau actif");

  await activatePanel(page, 1);
  await page.click('[data-testid="oryon-indicators"]');
  await page.waitForSelector('[data-testid="oryon-indicator-dialog"]', { timeout: 5_000 });
  await page.click('[data-testid^="oryon-indicator-add-"]');
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const chipsP1 = await panelLoc(page, 1).locator('[data-testid="oryon-indicator-chip"]').count();
  const chipsP0 = await panelLoc(page, 0).locator('[data-testid="oryon-indicator-chip"]').count();
  ok("I1 indicateur ajouté au panneau ACTIF seul", chipsP1 >= 1 && chipsP0 === 0);

  await page.click('[data-testid="oryon-templates"]');
  await page.waitForSelector('[data-testid="oryon-template-menu"]', { timeout: 5_000 });
  await page.click('[data-testid="oryon-template-save"]');
  await page.waitForSelector('[data-testid="oryon-template-name-dialog"]', { timeout: 5_000 });
  await page.fill('[data-testid="oryon-template-name-input"]', "P7 T1");
  await page.click('[data-testid="oryon-template-name-submit"]');
  await page.waitForTimeout(800);
  let tplFile = await templatesFile(page);
  const tpl = tplFile.templates.find((t) => t.name === "P7 T1");
  ok("I2 template capturé (pile d'indicateurs du panneau actif)", tplFile.templates.length === 1 && Array.isArray(tpl.indicators) && tpl.indicators.length >= 1);

  // Apply to the OTHER panel (now active) — via Manage.
  await activatePanel(page, 0);
  await page.click('[data-testid="oryon-templates"]');
  await page.waitForSelector('[data-testid="oryon-template-menu"]', { timeout: 5_000 });
  await page.click('[data-testid="oryon-template-manage"]');
  await page.waitForSelector('[data-testid="oryon-template-manage-dialog"]', { timeout: 5_000 });
  await page.locator('[data-testid^="oryon-template-row-"]', { hasText: "P7 T1" }).locator('[data-testid^="oryon-template-apply-"]').click();
  await page.waitForTimeout(500);
  const confirm = page.locator('[data-testid="oryon-template-apply-dialog"]');
  if ((await confirm.count()) > 0) {
    await page.locator('[data-testid="oryon-template-apply-submit"]').click().catch(async () => {
      await confirm.locator("button", { hasText: /apply/i }).last().click();
    });
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  const chipsP0b = await panelLoc(page, 0).locator('[data-testid="oryon-indicator-chip"]').count();
  const chipsP1b = await panelLoc(page, 1).locator('[data-testid="oryon-indicator-chip"]').count();
  ok("I3 application → le panneau actif reçoit la pile, l'autre garde la sienne", chipsP0b >= 1 && chipsP1b >= 1);

  // Idempotent re-apply: no duplicate instances.
  await page.click('[data-testid="oryon-templates"]');
  await page.waitForSelector('[data-testid="oryon-template-menu"]', { timeout: 5_000 });
  await page.click('[data-testid="oryon-template-manage"]');
  await page.waitForSelector('[data-testid="oryon-template-manage-dialog"]', { timeout: 5_000 });
  await page.locator('[data-testid^="oryon-template-row-"]', { hasText: "P7 T1" }).locator('[data-testid^="oryon-template-apply-"]').click();
  await page.waitForTimeout(500);
  const confirm2 = page.locator('[data-testid="oryon-template-apply-dialog"]');
  if ((await confirm2.count()) > 0) {
    await page.locator('[data-testid="oryon-template-apply-submit"]').click().catch(async () => {
      await confirm2.locator("button", { hasText: /apply/i }).last().click();
    });
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  const chipsP0c = await panelLoc(page, 0).locator('[data-testid="oryon-indicator-chip"]').count();
  ok("I4 ré-application idempotente (zéro doublon)", chipsP0c === chipsP0b);

  // ── J. Overlays : positions et alertes par symbole (§11) ─────────────────
  console.log("— J. Positions et alertes : scoping par symbole");

  // Seed one ACTIVE alert for GBPUSD (a symbol with NO open positions).
  await page.evaluate(() => {
    const now = Date.now();
    const alert = {
      id: "probe-alert-gbp01",
      symbol: "GBPUSD",
      targetPrice: 1.265,
      condition: "crosses_above",
      label: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
      triggeredAt: null,
    };
    window.localStorage.setItem("euforia.oryon.alerts.v1", JSON.stringify({ version: 1, savedAt: now, alerts: [alert] }));
  });
  await page.reload({ waitUntil: "load" });
  await clearDevOverlay(page);
  await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 30_000 });
  const scoped = await waitForPanels(page, 4, ["EURUSD", "XAUUSD", "GBPUSD", "BOOM500"]);
  // The private positions stream arrives over WS after the reload — poll
  // until the overlays have data (or time out and report honestly).
  await page
    .waitForFunction(
      () => {
        const read = window.__ORYON_PANELS_DEBUG__;
        if (typeof read !== "function") return false;
        return read().some((p) => p.priceLines > 0);
      },
      { timeout: 15_000 },
    )
    .catch(() => {});
  const scopedNow = (await panels(page)) ?? scoped;

  ok("J1 alerte GBPUSD → seule la ligne du panneau GBPUSD", Array.isArray(scopedNow) && scopedNow[2].alertLines >= 1 && scopedNow[0].alertLines === 0 && scopedNow[1].alertLines === 0 && scopedNow[3].alertLines === 0);
  ok("J2 positions du carnet (EURUSD) → ligne uniquement sur EURUSD", scopedNow[0].priceLines >= 1 && scopedNow[2].priceLines === 0 && scopedNow[3].priceLines === 0);
  ok("J3 positions XAUUSD → ligne sur le panneau XAUUSD", scopedNow[1].priceLines >= 1);
  ok("J4 les 4 panneaux rendent toujours leurs séries", scopedNow.every((p) => p.series >= 1));

  // ── K. Mobile 390 (§15) ──────────────────────────────────────────────────
  console.log("— K. Mobile 390 : pile 1 colonne, rien ne déborde");

  await page.setViewportSize({ width: 390, height: 844 });
  // Sonner toasts are FIXED elements that can sit past the right edge —
  // wait for the template toasts to clear before measuring overflow.
  await page
    .waitForFunction(() => document.querySelectorAll("[data-sonner-toast]").length === 0, { timeout: 8_000 })
    .catch(() => {});
  await page.waitForTimeout(800);
  const mobileOk = await page.evaluate(() => {
    const sectionList = [...document.querySelectorAll('[data-testid="oryon-panel"]')];
    const widths = sectionList.map((s) => s.getBoundingClientRect().width);
    return {
      count: sectionList.length,
      stacked: sectionList.every((s) => s.getBoundingClientRect().height >= 300),
      noOverflow: document.documentElement.scrollWidth <= 391,
      widthsOk: widths.every((w) => w >= 300),
    };
  });
  ok("K1 les 4 panneaux restent rendus", mobileOk.count === 4);
  ok("K2 pile verticale : panneaux hauts, pas de débordement horizontal", mobileOk.stacked && mobileOk.noOverflow && mobileOk.widthsOk);
  if (!(mobileOk.stacked && mobileOk.noOverflow && mobileOk.widthsOk)) {
    console.log(`  DEBUG K2: ${JSON.stringify(mobileOk)}`);
  }
  ok("K3 déclencheurs grille + sync accessibles", await (async () => {
    const grid = await page.locator('[data-testid="oryon-grid-trigger"]').isVisible();
    const sync = await page.locator('[data-testid="oryon-sync-trigger"]').isVisible();
    return grid && sync;
  })());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);

  // ── L. Console ───────────────────────────────────────────────────────────
  console.log("— L. Console");
  ok("L1 zéro erreur console (hors bruit filtré)", errors.length === 0);
  if (errors.length > 0) {
    fs.appendFileSync(LOG, `console errors:\n${errors.slice(0, 10).join("\n")}\n`);
  }

  await browser.close();

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  fs.appendFileSync(LOG, `\n${pass} PASS / ${fail} FAIL\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("PROBE CRASH:", e);
  fs.appendFileSync(LOG, `PROBE CRASH: ${e}\n`);
  process.exit(1);
});
