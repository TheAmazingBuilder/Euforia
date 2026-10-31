/**
 * Euforia rebrand smoke - verifies the logo implementation end-to-end:
 *   1. favicon + manifest + brand assets served
 *   2. login page renders the Euforia lockup (no Cosmoz text)
 *   3. after demo login, the sidebar carries the Euforia brand link
 *   4. screenshots: login page + dashboard (scripts/shots/)
 */
const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 140)));
  let results = { pass: 0, fail: 0 };
  const ok = (name, extra) => { results.pass++; console.log(`  ✓ ${name}${extra ? " - " + extra : ""}`); };
  const bad = (name, extra) => { results.fail++; console.log(`  ✗ ${name}${extra ? " - " + extra : ""}`); };

  // ── 1. Static brand assets ─────────────────────────────────────────────
  console.log("\n[1] Brand assets over HTTP");
  for (const [path, type] of [
    ["/icon.svg", "svg"], ["/favicon.ico", "ico"], ["/apple-icon.png", "png"],
    ["/brand/euforia-mark.svg", "svg"], ["/brand/png/icon-192.png", "png"],
    ["/brand/png/icon-512.png", "png"], ["/manifest.webmanifest", "manifest"],
  ]) {
    const res = await page.request.get(`http://localhost:3000${path}`);
    res.status() === 200 ? ok(path) : bad(path, `HTTP ${res.status()}`);
  }
  const manifest = await (await page.request.get("http://localhost:3000/manifest.webmanifest")).json();
  manifest.name.includes("Euforia") ? ok("manifest name Euforia") : bad("manifest name", manifest.name);

  // ── 2. Login page branding ─────────────────────────────────────────────
  console.log("\n[2] Login page");
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);
  const body = await page.locator("body").innerText();
  /euforia/i.test(body) ? ok("Euforia text present") : bad("no Euforia text");
  // The seeded demo identity keeps its @cosmoz.app email + cosmoz-demo-2026
  // password (connection data, not brand copy) and the demo panel displays
  // both - strip them before the brand-word check.
  const brandText = body
    .replace(/[\w.+-]+@cosmoz\.app/g, "")
    .replace(/cosmoz-demo-2026/g, "");
  /cosmoz/i.test(brandText) ? bad("Cosmoz text still visible") : ok("no Cosmoz text");
  const demoHint = await page.locator('[data-testid="login-demo-hint"]').isVisible().catch(() => false);
  demoHint ? ok("demo credentials panel visible") : bad("demo panel hidden");
  const brandSvgs = await page.locator('svg[aria-label="Euforia"], svg[aria-hidden="true"]').count();
  brandSvgs > 0 ? ok(`brand mark svg count = ${brandSvgs}`) : bad("no brand svg");
  const title = await page.title();
  /Euforia/i.test(title) ? ok(`title "${title}"`) : bad("title", title);
  fs.mkdirSync("scripts/shots", { recursive: true });
  await page.screenshot({ path: "scripts/shots/rebrand-login.png", fullPage: true });
  console.log("  📸 scripts/shots/rebrand-login.png");

  // ── 3. Dashboard after demo login ──────────────────────────────────────
  console.log("\n[3] Dashboard sidebar");
  await page.fill('input[type="email"]', "trader@cosmoz.app").catch(() => bad("email input"));
  await page.fill('input[type="password"]', "cosmoz-demo-2026").catch(() => bad("password input"));
  await page.click('button[type="submit"]').catch(() => bad("submit"));
  await page.waitForTimeout(3000);
  if (!page.url().includes("/login")) {
    ok("login succeeded", page.url());
    const brandLink = page.locator('a[aria-label="Euforia - Dashboard"]');
    (await brandLink.count()) > 0 ? ok("sidebar brand link aria-label Euforia") : bad("sidebar brand link");
    const brandText = await brandLink.first().innerText().catch(() => "");
    /Euforia/.test(brandText) ? ok(`sidebar wordmark "${brandText.trim()}"`) : bad("sidebar wordmark", brandText);
    const dashBody = await page.locator("body").innerText();
    /Cosmoz/i.test(dashBody) ? bad("Cosmoz text visible on dashboard") : ok("no Cosmoz text on dashboard");
    await page.screenshot({ path: "scripts/shots/rebrand-dashboard.png", fullPage: false });
    console.log("  📸 scripts/shots/rebrand-dashboard.png");
  } else {
    bad("login failed", page.url());
  }

  console.log(`\nRESULT: ${results.pass} passed, ${results.fail} failed, pageerrors=${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 5).join("\n"));
  await browser.close();
  process.exit(results.fail === 0 ? 0 : 1);
})();
