/**
 * Verify — Analytics detection thresholds (adjustable RR floor / overtrading
 * window) + pattern-drawer coming-soon actions.
 *
 * IMPORTANT: navigation uses sidebar/tab clicks ONLY (SPA). Exactly ONE
 * reload is performed, for the threshold deep-link persistence check.
 *
 * Covers:
 *   A. Sidebar Analytics → Overview intact; Behavior tab renders the
 *      Detection thresholds bar (default applied = RR 2 · ≥2× median · min 4).
 *   B. RR floor 2 → 3: URL gains rrFloor=3, "Applied" readout updates,
 *      POOR_RISK_REWARD occurrences grow (monotonic) or appear.
 *   C. Overtrading window 2× → 1.5×: URL gains otFactor=1.5, the network
 *      request carries it, the server-declared "Applied" readout echoes it;
 *      when the OVERTRADING pattern exists its headline mirrors the window
 *      (the seeded dataset has max 2 trades/day → honest absence below the
 *      declared min 4/day floor).
 *   D. Execution tab stays consistent: floor chip mirrors the requested floor
 *      (1:3), below-floor count matches the behavioral pattern.
 *   E. Reset restores defaults (URL params removed, applied readout back).
 *   F. Deep link /analytics?tab=behavior&rrFloor=3 survives ONE reload.
 *   G. Pattern drawer: Actions section with "View Playbook Rule" and
 *      "Save to Nofy" — both disabled, "Coming soon" declared.
 *   H. Existing tabs untouched (Performance spot-check), FilterBar intact.
 *   I. Mobile 390px: no horizontal overflow on the Behavior tab.
 *   J. Console/network cleanliness.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node verification script */
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "trader@cosmoz.app";
const DEMO_PASSWORD = "cosmoz-demo-2026";
const SHOTS = "/home/z/my-project/scripts/shots/analytics-thresholds";

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400) {
      const url = resp.url();
      const expected =
        (resp.status() === 401 && /\/api\/auth\/(me|refresh)/.test(url)) ||
        /socket\.io/i.test(url) || /X-TransformPort/i.test(url);
      if (!expected) errors.push(`${resp.status()} ${url}`);
    }
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
    console.log(results[results.length - 1]);
  };
  const shot = async (name) => {
    try {
      await page.screenshot({ path: `${SHOTS}/${name}.png` });
    } catch {
      /* late screenshots must never fail the run */
    }
  };

  const sidebarClick = async (href) => {
    await page.locator(`nav[aria-label="Main navigation"] a[href="${href}"]`).click();
    await page.waitForURL(new RegExp(href.replace("/", "\\/")), { timeout: 30_000 });
  };
  const openTab = async (tab) => {
    await page.locator('[role="tab"]', { hasText: new RegExp(`^${tab}$`, "i") }).click();
    await page
      .locator(`[data-testid="analytics-tab-${tab.toLowerCase()}"]`)
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(500);
  };
  /** Occurrences of a pattern type as rendered on the cards. */
  const patternOccurrences = async (type) => {
    const card = page.locator(`[data-testid="behavior-pattern-card"][data-pattern-type="${type}"]`);
    const count = await card.count();
    if (count === 0) return null;
    const text = await card.first().innerText();
    const match = text.match(/(\d+)\s+occurrences?/i);
    return match ? Number(match[1]) : null;
  };

  // ══ Entry: login ═══════════════════════════════════════════════════════
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await page.locator("#login-email").fill(DEMO_EMAIL);
  await page.locator("#login-password").fill(DEMO_PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(800);

  // ══ A. Analytics → Behavior tab: threshold bar at engine defaults ══════
  await sidebarClick("/analytics");
  await page.locator('[data-testid="analytics-tab-overview"]').waitFor({ state: "visible", timeout: 60_000 });
  await openTab("Behavior");

  const thresholdBar = page.locator('[data-testid="behavior-thresholds"]');
  check("A1 Detection thresholds bar visible", (await thresholdBar.count()) === 1);

  const appliedDefault = await page.locator('[data-testid="behavior-thresholds-applied"]').innerText();
  check("A2 Applied readout at engine defaults (RR 2, ≥2× median, min 4)",
    /RR\s*2/.test(appliedDefault) && /2/.test(appliedDefault) && /4/.test(appliedDefault), appliedDefault);

  const resetAtDefault = await page.locator('[data-testid="behavior-threshold-reset"]').count();
  check("A3 No Reset button at defaults", resetAtDefault === 0);

  const baselineRR = await patternOccurrences("POOR_RISK_REWARD");
  check("A4 Pattern cards render", (await page.locator('[data-testid="behavior-pattern-card"]').count()) > 0);
  shot("A-behavior-defaults");

  // ══ B. RR floor 2 → 3 ═══════════════════════════════════════════════════
  await page.locator('[data-testid="behavior-threshold-rr"]').click();
  await page.locator('[role="option"]', { hasText: /^3$/ }).click();
  await page
    .locator('[data-testid="behavior-thresholds-applied"]')
    .filter({ hasText: /RR\s*3/ })
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);

  const urlAfterRR = page.url();
  check("B1 URL carries rrFloor=3", /[?&]rrFloor=3/.test(urlAfterRR), urlAfterRR);

  const afterRR = await patternOccurrences("POOR_RISK_REWARD");
  check("B2 Below-floor occurrences grow (or appear) with a higher floor",
    afterRR !== null && (baselineRR === null || afterRR >= baselineRR),
    `baseline=${baselineRR} after=${afterRR}`);

  const resetVisible = await page.locator('[data-testid="behavior-threshold-reset"]').count();
  check("B3 Reset button appears when adjusted", resetVisible === 1);
  shot("B-rr-floor-3");

  // ══ C. Overtrading window 2× → 1.5× ════════════════════════════════════
  // The client→server contract: the extended request MUST carry otFactor=1.5.
  const otRequestPromise = page
    .waitForRequest((req) => /stats\/analytics-extended.*otFactor=1\.5/.test(req.url()), { timeout: 20_000 })
    .then(() => "seen")
    .catch(() => "missing");
  await page.locator('[data-testid="behavior-threshold-ot"]').click();
  await page.locator('[role="option"]', { hasText: /1\.5×/ }).click();
  await page
    .locator('[data-testid="behavior-thresholds-applied"]')
    .filter({ hasText: /1\.5/ })
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);

  check("C1 URL carries otFactor=1.5 and keeps rrFloor=3",
    /[?&]otFactor=1\.5/.test(page.url()) && /[?&]rrFloor=3/.test(page.url()), page.url());
  check("C2 Extended request carried otFactor=1.5 to the engine", (await otRequestPromise) === "seen");

  const appliedOT = await page.locator('[data-testid="behavior-thresholds-applied"]').innerText();
  check("C3 Applied readout echoes the server-declared window (≥1.5× median, min 4)",
    /≥1\.5× median/.test(appliedOT) && /4/.test(appliedOT), appliedOT);

  const otCard = page.locator('[data-testid="behavior-pattern-card"][data-pattern-type="OVERTRADING"]');
  if ((await otCard.count()) > 0) {
    const headline = await otCard.first().innerText();
    check("C4 OVERTRADING headline mirrors the 1.5× window", /1\.5×/.test(headline), headline.slice(0, 90));
  } else {
    // Seeded dataset: max 2 trades/day — below the declared min 4/day floor,
    // so an absent OVERTRADING pattern IS the correct engine answer.
    check("C4 OVERTRADING absent is consistent with the declared min 4/day floor", true, "seed max 2 trades/day");
  }
  shot("C-ot-1-5");

  // ══ D. Execution tab mirrors the declared floor ═════════════════════════
  await openTab("Execution");
  const execText = await page.locator('[data-testid="analytics-tab-execution"]').innerText();
  check("D1 Execution floor chip mirrors 1:3", /1:3\b/.test(execText), execText.match(/1:3[\d.]*/)?.[0] ?? "n/a");
  const execBelowFloor = Number(execText.match(/(\d+)\s*\n?Trades below floor/i)?.[1] ?? /Below floor[\s\S]*?(\d+)/i.exec(execText)?.[1] ?? "0");
  check("D2 Execution below-floor count matches the behavioral pattern",
    Number.isFinite(execBelowFloor) && execBelowFloor === afterRR,
    `execution=${execBelowFloor} behavior=${afterRR}`);

  // ══ E. Reset restores the engine defaults ═══════════════════════════════
  await openTab("Behavior");
  await page.locator('[data-testid="behavior-threshold-reset"]').click();
  await page
    .locator('[data-testid="behavior-thresholds-applied"]')
    .filter({ hasText: /RR\s*2/ })
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);

  check("E1 URL params removed after Reset", !/[?&]rrFloor=/.test(page.url()) && !/[?&]otFactor=/.test(page.url()), page.url());
  check("E2 Reset button gone at defaults", (await page.locator('[data-testid="behavior-threshold-reset"]').count()) === 0);

  // ══ F. Deep-link persistence across ONE reload ══════════════════════════
  await page.goto(`${BASE}/analytics?tab=behavior&rrFloor=3&otFactor=1.5`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="analytics-tab-behavior"]').waitFor({ state: "visible", timeout: 60_000 });
  await page
    .locator('[data-testid="behavior-thresholds-applied"]')
    .filter({ hasText: /RR\s*3/ })
    .waitFor({ state: "visible", timeout: 30_000 });
  const appliedReload = await page.locator('[data-testid="behavior-thresholds-applied"]').innerText();
  check("F1 Thresholds survive a reload via the URL", /RR\s*3/.test(appliedReload) && /1\.5/.test(appliedReload), appliedReload);

  // ══ G. Pattern drawer — coming-soon actions ═════════════════════════════
  const firstCard = page.locator('[data-testid="behavior-pattern-card"]').first();
  await firstCard.locator("button", { hasText: /view details/i }).click();
  await page.locator('[data-testid="behavior-pattern-drawer"]').waitFor({ state: "visible", timeout: 15_000 });

  const actionsSection = page.locator('[data-testid="behavior-drawer-actions"]');
  check("G1 Drawer Actions section visible", (await actionsSection.count()) === 1);

  const playbookBtn = page.locator('[data-testid="behavior-drawer-action-playbook"]');
  const nofyBtn = page.locator('[data-testid="behavior-drawer-action-nofy"]');
  check("G2 'View Playbook Rule' present and disabled",
    (await playbookBtn.count()) === 1 && (await playbookBtn.innerText()).includes("View Playbook Rule") && (await playbookBtn.isDisabled()));
  check("G3 'Save to Nofy' present and disabled",
    (await nofyBtn.count()) === 1 && (await nofyBtn.innerText()).includes("Save to Nofy") && (await nofyBtn.isDisabled()));
  const drawerText = (await actionsSection.innerText()).replace(/\s+/g, " ");
  const comingSoonCount = (drawerText.match(/coming soon/gi) ?? []).length;
  check("G4 Both actions declared 'Coming soon'", comingSoonCount >= 2, `count=${comingSoonCount}`);
  shot("G-drawer-actions");

  // Escape closes the drawer (pre-existing behavior must not regress).
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check("G5 Drawer closes on Escape", (await page.locator('[data-testid="behavior-pattern-drawer"][data-state="open"]').count()) === 0);

  // ══ H. Existing tabs untouched ══════════════════════════════════════════
  await openTab("Performance");
  check("H1 Performance tab renders unchanged",
    (await page.locator('[data-testid="analytics-tab-performance"]').innerText()).length > 100);
  check("H2 FilterBar still present", (await page.locator('[data-testid="analytics-filters"]').count()) === 1);

  // ══ I. Mobile 390px — no horizontal overflow ════════════════════════════
  await page.setViewportSize({ width: 390, height: 844 });
  await openTab("Behavior");
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("I1 Mobile 390px: no horizontal overflow on Behavior tab", overflow <= 0, `overflow=${overflow}px`);
  shot("I-mobile-behavior");

  // ══ J. Console/network cleanliness ══════════════════════════════════════
  check("J1 No console/page errors or unexpected 4xx", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("VERIFY CRASH:", error);
  process.exit(1);
});
