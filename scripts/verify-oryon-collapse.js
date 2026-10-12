// Oryon route-driven sidebar auto-collapse verification.
// PROD-SAFE (:3000): DOM measurements + localStorage reads only.
//  (C1) Dashboard baseline            → aside 240px
//  (C2) Click Oryon tab               → aside auto-collapses to 72px (icon mode)
//  (C3) Main column follows           → padding-left 72px (Oryon gets the width)
//  (C4) Leave Oryon                   → sidebar restored to 240px, storage "0"
//  (C5) Deep link /oryon directly     → collapses (all entry points behave the same)
//  (C6) Reload on /oryon              → still collapsed (persisted value)
//  (C7) Manual toggle wins            → expand during Oryon, leave → stays expanded
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const results = [];
function check(id, label, ok, detail = "") {
  results.push({ id, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${label}${detail ? "  — " + detail : ""}`);
}
const NOISE = [/401/, /auth\/me/, /auth\/refresh/, /WebSocket/];

async function ensureLogin(page) {
  const sidebar = page.locator('nav[aria-label="Main navigation"]');
  if ((await sidebar.count()) > 0 && (await sidebar.isVisible().catch(() => false))) return;
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 20000 });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await sidebar.waitFor({ state: "visible", timeout: 20000 });
}

async function asideWidth(page) {
  return page.evaluate(() => {
    const aside = document.querySelector("aside");
    return aside ? Math.round(aside.getBoundingClientRect().width) : null;
  });
}

async function mainPadding(page) {
  return page.evaluate(() => {
    // The lg:pl-[72px] lives on the wrapper around <main> (main keeps its own
    // px-8 which Oryon cancels with negative margins).
    const main = document.querySelector("main");
    const wrapper = main ? main.parentElement : null;
    return wrapper ? Math.round(parseFloat(getComputedStyle(wrapper).paddingLeft)) : null;
  });
}

async function stored(page) {
  return page.evaluate(() => window.localStorage.getItem("cosmoz:sidebar-collapsed"));
}

async function settle(page) {
  await page.waitForTimeout(500); // width/padding transition is 200ms
}

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const tally = () => {
    pass = results.filter((r) => r.ok).length;
    fail = results.filter((r) => !r.ok).length;
  };
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error" && !NOISE.some((r) => r.test(m.text()))) errors.push(m.text().slice(0, 200));
  });

  try {
    // Clean starting state: expanded sidebar.
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await ensureLogin(page);
    await page.evaluate(() => window.localStorage.setItem("cosmoz:sidebar-collapsed", "0"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('nav[aria-label="Main navigation"]', { timeout: 20000 });
    await settle(page);

    // (C1) baseline
    let w = await asideWidth(page);
    check("C1", "dashboard baseline aside is 240px", w === 240, `width=${w}`);

    // (C2) click the Oryon tab in the sidebar
    await page.click('nav[aria-label="Main navigation"] a[href="/oryon"]');
    await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 20000 });
    await settle(page);
    w = await asideWidth(page);
    check("C2", "clicking Oryon tab auto-collapses sidebar to icon mode (72px)", w === 72, `width=${w}`);

    // (C3) main column follows (Oryon canvas gets the extra width)
    const pad = await mainPadding(page);
    check("C3", "main column padding follows 72px", pad === 72, `padding=${pad}`);
    const persisted = await stored(page);
    check("C3b", "collapse persisted as icon mode", persisted === "1", `storage=${persisted}`);

    // (C4) leave Oryon → restored
    await page.click('nav[aria-label="Main navigation"] a[href="/trades"]');
    await page.waitForSelector('nav[aria-label="Main navigation"] a[href="/trades"][aria-current="page"]', { timeout: 20000 });
    await settle(page);
    w = await asideWidth(page);
    const storedAfter = await stored(page);
    check("C4", "leaving Oryon restores the sidebar (240px)", w === 240, `width=${w}`);
    check("C4b", "storage back to expanded", storedAfter === "0", `storage=${storedAfter}`);

    // (C5) deep link directly to /oryon (not via sidebar click)
    await page.goto(BASE + "/oryon", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 20000 });
    await settle(page);
    w = await asideWidth(page);
    check("C5", "deep link to /oryon collapses too", w === 72, `width=${w}`);

    // (C6) reload on /oryon → still collapsed
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 20000 });
    await settle(page);
    w = await asideWidth(page);
    check("C6", "reload on /oryon keeps icon mode", w === 72, `width=${w}`);

    // (C7) manual toggle during Oryon wins over the auto-restore
    await page.click('[data-testid="sidebar-toggle"]');
    await settle(page);
    w = await asideWidth(page);
    check("C7a", "manual expand during Oryon works", w === 240, `width=${w}`);
    await page.click('nav[aria-label="Main navigation"] a[href="/journal"]');
    await page.waitForSelector('nav[aria-label="Main navigation"] a[href="/journal"][aria-current="page"]', { timeout: 20000 });
    await settle(page);
    w = await asideWidth(page);
    check("C7b", "manual choice respected after leaving Oryon (stays 240px)", w === 240, `width=${w}`);

    // console/page errors
    check("E0", "no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  } catch (e) {
    check("FATAL", String(e).slice(0, 300), false);
  } finally {
    tally();
    console.log(`\n${pass}/${results.length} checks passed`);
    await page.screenshot({ path: "scripts/oryon-collapse.png", fullPage: false }).catch(() => {});
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
  }
})();
