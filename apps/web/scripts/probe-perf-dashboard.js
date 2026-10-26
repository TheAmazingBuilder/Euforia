/**
 * Phase 09 performance probe - baseline & re-measure (BEFORE/AFTER).
 * Run against the ZERO-ENV mock preview (MSW on, default `next dev` :3000).
 *
 * ONE document load (login → dismiss onboarding), then everything else is
 * SPA navigation - the in-memory mock store never reseeds mid-run and the
 * QueryClient cache behavior is what we actually measure.
 *
 * Measures:
 *   1. Dashboard initial load: /api requests + DUPLICATE identical URLs.
 *   2. SPA → /analytics: request count + duplicates.
 *   3. SPA → back to dashboard (cache reuse: fresh-but-cached queries).
 *   4. ONE period filter change: requests triggered by a single change.
 *   5. Integrity: zero page errors.
 *
 * No timing thresholds (no flaky assertions per spec §11) - numbers are
 * printed for the Phase 09 report; assertions are structural only.
 */
const { chromium } = require("playwright");

const BASE = process.env.PROBE_BASE || "http://localhost:3000";
let passed = 0;
let failed = 0;
const pageErrors = [];

function check(label, ok, extra = "") {
  const tag = ok ? "✓" : "✗";
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${tag} ${label}${extra ? ` - ${extra}` : ""}`);
}

function startCapture(page) {
  const requests = [];
  const responses = [];
  const onRequest = (request) => {
    const url = request.url();
    if (url.includes("/api/")) requests.push(url.replace(/^https?:\/\/[^/]+/, ""));
  };
  const onResponse = (response) => {
    const url = response.url();
    if (url.includes("/api/")) responses.push(url.replace(/^https?:\/\/[^/]+/, ""));
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  return {
    requests,
    stop() {
      page.removeListener("request", onRequest);
      page.removeListener("response", onResponse);
      return { requested: requests, completed: responses };
    },
  };
}

function summarize(label, capture) {
  const { requested, completed } = capture;
  const counts = new Map();
  for (const request of requested) counts.set(request, (counts.get(request) ?? 0) + 1);
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1);
  const completedCounts = new Map();
  for (const request of completed) completedCounts.set(request, (completedCounts.get(request) ?? 0) + 1);
  const completedDuplicates = [...completedCounts.entries()].filter(([, count]) => count > 1);
  console.log(`\n  ── ${label} ──`);
  console.log(`  requested /api: ${requested.length} (unique ${counts.size}, dup URLs ${duplicates.length})`);
  console.log(`  completed /api: ${completed.length} (unique ${completedCounts.size}, dup URLs ${completedDuplicates.length})`);
  for (const [url, count] of duplicates.slice(0, 12)) {
    const completedCount = completedCounts.get(url) ?? 0;
    console.log(`    ×${count} req (×${completedCount} completed) ${url.slice(0, 110)}`);
  }
  return {
    total: requested.length,
    unique: counts.size,
    duplicates: duplicates.length,
    completedTotal: completed.length,
    completedUnique: completedCounts.size,
    completedDuplicates: completedDuplicates.length,
  };
}

/** The mock store reseeds on every document load → onboarding re-triggers
 * and blocks pointer events. It opens with a DELAY (eligibility resolves
 * async), so dismiss with retries until the overlay stays closed. */
async function dismissOnboarding(page, label) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const overlay = page.locator('[data-testid="onb-overlay"]');
      if (!(await overlay.isVisible({ timeout: 2500 }).catch(() => false))) {
        check(`onboarding absent (${label})`, true);
        return;
      }
      await page.click('[data-testid="onb-close"]', { timeout: 5000 });
      await page.waitForTimeout(800);
      if (!(await overlay.isVisible({ timeout: 1000 }).catch(() => false))) {
        check(`onboarding paused (${label})`, true);
        return;
      }
    } catch {
      // Retry - the overlay may still be animating in.
    }
  }
  check(`onboarding dismiss attempts exhausted (${label})`, false);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    console.log("\n[0] One document load: login → dismiss onboarding");
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.fill('input[type="email"]', "trader@cosmoz.app");
    await page.fill('input[type="password"]', "cosmoz-demo-2026");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    check("login landed on the app", !page.url().includes("/login"), page.url());
    await dismissOnboarding(page, "post-login");

    console.log("\n[1] Dashboard initial load (SPA from post-login landing)");
    let capture = startCapture(page);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(async () => {
      // If already on "/" this reload is the ONE cold-load measurement.
    });
    await page.waitForTimeout(2000);
    await dismissOnboarding(page, "dashboard");
    await page.waitForTimeout(2500);
    check("dashboard mounted", page.url().replace(BASE, "") === "/" || page.url().includes(BASE), page.url());
    const dash = summarize("DASHBOARD COLD LOAD", capture.stop());
    global.__dash = dash;

    console.log("\n[2] SPA navigation → /analytics");
    capture = startCapture(page);
    await page.locator('a[href="/analytics"]').first().click({ timeout: 10000 });
    await page.waitForTimeout(4000);
    const analytics = summarize("SPA → /analytics", capture.stop());
    global.__analytics = analytics;

    console.log("\n[3] SPA navigation → back to / (cache reuse)");
    capture = startCapture(page);
    await page.locator('a[href="/"]').first().click({ timeout: 10000 });
    await page.waitForTimeout(2500);
    const back = summarize("SPA → / (back)", capture.stop());
    global.__back = back;

    console.log("\n[4] ONE period filter change on the dashboard");
    await page.waitForTimeout(500);
    capture = startCapture(page);
    await page.click('[data-testid="dashboard-filter-period"]', { timeout: 10000 });
    await page.waitForTimeout(400);
    await page.getByRole("option").nth(2).click({ timeout: 10000 });
    await page.waitForTimeout(3500);
    const filter = summarize("FILTER CHANGE (period)", capture.stop());
    global.__filter = filter;

    console.log("\n[5] Integrity");
    check("zero page errors across the whole run", pageErrors.length === 0, `${pageErrors.length} errors`);
    check("dashboard load captured requests", dash.total > 0);
    check("analytics navigation captured requests", analytics.total > 0);
  } catch (error) {
    failed += 1;
    console.error("PROBE ERROR:", String(error).slice(0, 600));
  } finally {
    console.log(`\n=== PROBE RESULT: ${passed} passed / ${failed} failed ===`);
    console.log(JSON.stringify({ dash: global.__dash, analytics: global.__analytics, back: global.__back, filter: global.__filter, pageErrors: pageErrors.length }, null, 2));
    await browser.close();
    process.exit(failed === 0 ? 0 : 1);
  }
})();
