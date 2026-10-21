/**
 * verify-bridge-ui.js — Phase 08 MT5 terminal bridge (frontend wiring).
 *
 * Task 1-webui-bridge probe plan (desktop 1440×900, MSW prod build):
 *   A. Providers list: the connect dialog registry contains "MT5 Terminal
 *      Bridge" (mt5-bridge), honestly NOT stamped "Simulated provider".
 *   B. Bridge connect flow: for a PLATFORM_BRIDGE provider the identity step
 *      shows NO secret input — the honest explainer instead — and the submit
 *      body carries NO credentials (the mock engine refuses credentials for
 *      bridge providers, so a 201 proves the omission).
 *   C. Pairing panel (connect-time follow-up state): absolute ingest URL,
 *      bridge key, secret MASKED by default (reveal shows the bks_demo_…
 *      secret), EA download anchor with `download`, compact 4-step list.
 *   D. Account detail drawer: "MT5 bridge" section with the CONNECTING
 *      first-push treatment, Pairing sheet / Rotate secret / Download EA
 *      buttons; the pairing sheet dialog re-serves the SAME secret; rotate
 *      mints a DIFFERENT one with the invalidation warning; reconnect is
 *      hidden for bridge accounts (credentials don't apply).
 *
 * Run: bash scripts/verify-bridge-ui-run.sh
 * (or: node apps/web/scripts/verify-bridge-ui.js with :3000 listening)
 *
 * Probe conventions (verify-connect-redesign lessons): no networkidle —
 * domcontentloaded + waits; nextjs-portal removed so it cannot swallow
 * clicks; demo login via the shared helper.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- Node verification helper */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const { ensureLogin } = require(path.resolve(__dirname, "helpers/login.js"));

const BASE = process.env.PROBE_BASE || "http://localhost:3000";
const SHOT_DIR = process.env.PROBE_SHOTS || "/home/z/my-project/download/bridge-ui";

let passed = 0;
let failed = 0;

function check(label, ok, extra = "") {
  const tag = ok ? "✓" : "✗";
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${tag} ${label}${extra ? ` — ${extra}` : ""}`);
}

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
  "/api/auth/me",
  "/api/auth/refresh",
  "/api/auth/login",
];

const BRIDGE_EXTERNAL_ID = "5021347";

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (CONSOLE_NOISE.some((noise) => text.includes(noise))) return;
    pageErrors.push(text);
  });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);
  await clearDevOverlay(page);
  await ensureLogin(page);
  await page.waitForTimeout(1_500);
  await clearDevOverlay(page);

  // ── A. Providers list contains the MT5 Terminal Bridge ───────────────────
  console.log("\n[A] Providers registry — MT5 Terminal Bridge");
  await page.locator('a[href="/accounts"]').first().click();
  await page.waitForFunction(
    () => document.querySelector("h1")?.textContent?.trim() === "Accounts",
    { timeout: 15_000 },
  );
  await clearDevOverlay(page);
  await page.waitForTimeout(800);

  const emptyAdd = page.locator('[data-testid="accounts-empty-add"]');
  if ((await emptyAdd.count()) > 0) {
    await emptyAdd.click();
  } else {
    await page.locator('[data-testid="accounts-add-button"]').click();
  }
  await page.waitForSelector('[data-testid="connect-account-dialog"]', { timeout: 10_000 });
  await page.waitForTimeout(600);

  const bridgeRow = page.locator('[data-testid="connect-provider-mt5-bridge"]');
  await bridgeRow.waitFor({ state: "visible", timeout: 10_000 });
  check("providers list contains MT5 Terminal Bridge", true);
  const bridgeRowText = (await bridgeRow.innerText()).replace(/\n/g, " ");
  check(
    "bridge provider is honestly NOT stamped simulated",
    !bridgeRowText.includes("Simulated provider"),
    bridgeRowText.slice(0, 80),
  );
  check(
    "bridge provider advertises PLATFORM_BRIDGE",
    bridgeRowText.includes("PLATFORM_BRIDGE"),
  );
  await page.screenshot({ path: `${SHOT_DIR}/01-provider-list.png` });

  // ── B. Bridge connect flow — NO secret input ─────────────────────────────
  console.log("\n[B] Bridge connect flow — no credentials");
  await bridgeRow.click();
  await page.locator('[data-testid="connect-next"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="connect-environment-DEMO"]').click();
  await page.locator('[data-testid="connect-next"]').click();
  await page.waitForTimeout(500);

  await page.locator('[data-testid="connect-external-id"]').waitFor({ state: "visible", timeout: 8_000 });
  check("identity step hides the API-key/secret input", (await page.locator('[data-testid="connect-secret"]').count()) === 0);
  const explainer = page.locator('[data-testid="connect-bridge-explainer"]');
  check("honest bridge explainer renders", (await explainer.count()) > 0);
  const explainerText = (await explainer.innerText()).replace(/\n/g, " ");
  check(
    "explainer says the secret is generated and the broker password stays local",
    explainerText.includes("Euforia generates the bridge secret") &&
      explainerText.includes("never leaves your terminal"),
    explainerText.slice(0, 100),
  );

  await page.locator('[data-testid="connect-external-id"]').fill(BRIDGE_EXTERNAL_ID);
  await page.waitForTimeout(900); // identification debounce
  const submitBtn = page.locator('[data-testid="connect-submit"]');
  check("submit enabled WITHOUT any typed secret", await submitBtn.isEnabled());
  await page.screenshot({ path: `${SHOT_DIR}/02-bridge-identity-step.png` });
  await submitBtn.click();

  // ── C. Pairing panel — the connect-time follow-up state ──────────────────
  console.log("\n[C] Pairing panel after connect (201)");
  const panel = page.locator('[data-testid="connect-bridge-pairing"]');
  await panel.waitFor({ state: "visible", timeout: 15_000 });
  check("connect succeeds into the pairing panel (no credentials sent)", true);

  const origin = await page.evaluate(() => window.location.origin);
  const ingestText = (await page.locator('[data-testid="connect-bridge-pairing-ingest"] code').innerText()).trim();
  check(
    "ingest URL is ABSOLUTE (origin + ingestPath)",
    ingestText === `${origin}/api/v1/trading-accounts/bridge/ingest`,
    ingestText,
  );

  const keyText = (await page.locator('[data-testid="connect-bridge-pairing-key"] code').innerText()).trim();
  check("bridge key rendered (bk_…)", keyText.startsWith("bk_"), keyText);

  const secretBeforeReveal = (await page.locator('[data-testid="connect-bridge-pairing-secret"]').innerText()).trim();
  check("secret MASKED by default", !secretBeforeReveal.includes("bks_demo_") && secretBeforeReveal.includes("•"), secretBeforeReveal.slice(0, 20));
  await page.locator('[data-testid="connect-bridge-pairing-reveal"]').click();
  const secretAfterReveal = (await page.locator('[data-testid="connect-bridge-pairing-secret"]').innerText()).trim();
  check("reveal shows the demo bridge secret", secretAfterReveal.startsWith("bks_demo_"), `${secretAfterReveal.slice(0, 12)}…`);
  await page.screenshot({ path: `${SHOT_DIR}/03-connect-pairing-panel.png` });

  const download = page.locator('[data-testid="connect-bridge-pairing-download"]');
  check(
    "EA download anchor carries the pairing downloadPath + download attr",
    (await download.getAttribute("href")) === "/bridge/EuforiaBridge.mq5" &&
      (await download.getAttribute("download")) === "EuforiaBridge.mq5",
  );
  const stepCount = await page.locator('[data-testid="connect-bridge-pairing-setup"] ol li').count();
  check("compact 4-step setup list", stepCount === 4, `steps=${stepCount}`);

  // ── D. Detail drawer — MT5 bridge section ────────────────────────────────
  console.log("\n[D] Detail drawer — Pont MT5 / MT5 bridge section");
  await page.locator('[data-testid="connect-bridge-done"]').click();
  await page.waitForTimeout(1_200);
  await clearDevOverlay(page);

  const bridgeSection = page.locator('[data-testid="account-bridge-section"]');
  await bridgeSection.waitFor({ state: "visible", timeout: 15_000 });
  check("drawer shows the MT5 bridge section", true);

  const statusNote = page.locator('[data-testid="account-bridge-status-note"]');
  const statusText = (await statusNote.innerText()).replace(/\n/g, " ");
  const statusAttr = await statusNote.getAttribute("data-bridge-status");
  check(
    "CONNECTING → honest first-push treatment (amber/info)",
    statusAttr === "CONNECTING" && statusText.includes("Waiting for the first push"),
    statusText.slice(0, 80),
  );
  check("Pairing sheet button present", (await page.locator('[data-testid="account-bridge-pairing"]').count()) === 1);
  check("Rotate secret button present", (await page.locator('[data-testid="account-bridge-rotate"]').count()) === 1);
  await page.waitForTimeout(800); // pairing GET → download href
  check("Download EA button present", (await page.locator('[data-testid="account-bridge-download"]').count()) === 1);
  check("Reconnect hidden for bridge accounts (no credentials to refresh)", (await page.locator('[data-testid="account-detail-reconnect"]').count()) === 0);
  await page.screenshot({ path: `${SHOT_DIR}/04-detail-bridge-section.png` });

  // Pairing sheet dialog — the GET serves the SAME secret as connect did.
  await page.locator('[data-testid="account-bridge-pairing"]').click();
  const dialog = page.locator('[data-testid="bridge-pairing-dialog"]');
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(600);
  const detailIngest = (await page.locator('[data-testid="detail-bridge-pairing-ingest"] code').innerText()).trim();
  check("pairing sheet dialog re-serves the ingest URL", detailIngest === `${origin}/api/v1/trading-accounts/bridge/ingest`, detailIngest);
  await page.locator('[data-testid="detail-bridge-pairing-reveal"]').click();
  const detailSecret = (await page.locator('[data-testid="detail-bridge-pairing-secret"]').innerText()).trim();
  check(
    "GET pairing returns the SAME secret the connect delivered",
    detailSecret === secretAfterReveal,
    `${detailSecret.slice(0, 12)}…`,
  );
  await page.screenshot({ path: `${SHOT_DIR}/05-detail-pairing-sheet.png` });
  await page.locator('[data-testid="bridge-pairing-close"]').click();
  await page.waitForTimeout(500);

  // Rotate — NEW secret + invalidation warning.
  await page.locator('[data-testid="account-bridge-rotate"]').click();
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  const rotateWarning = page.locator('[data-testid="bridge-rotate-warning"]');
  await rotateWarning.waitFor({ state: "visible", timeout: 10_000 });
  const warningText = (await rotateWarning.innerText()).replace(/\n/g, " ");
  check(
    "rotate opens the panel with the invalidation warning",
    warningText.includes("previous terminal configuration was invalidated"),
    warningText.slice(0, 90),
  );
  await page.locator('[data-testid="detail-bridge-pairing-reveal"]').click();
  const rotatedSecret = (await page.locator('[data-testid="detail-bridge-pairing-secret"]').innerText()).trim();
  check(
    "rotate mints a DIFFERENT secret",
    rotatedSecret.startsWith("bks_demo_") && rotatedSecret !== detailSecret,
    `${rotatedSecret.slice(0, 12)}…`,
  );
  await page.screenshot({ path: `${SHOT_DIR}/06-rotate-new-secret.png` });

  check("no unexpected page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`Screenshots: ${SHOT_DIR}`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error("PROBE CRASHED:", error);
  process.exit(1);
});
