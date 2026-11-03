/**
 * Sidebar sections + new pages (Profile, Help, Activity Log, Backups) and
 * chart vivacity pass verification. Screenshots into scripts/shots/nav-colors/.
 * Exit 1 when any probe fails.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = "scripts/shots/nav-colors";

function ok(name, condition, detail = "") {
  const status = condition ? "PASS" : "FAIL";
  console.log(`${status}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!condition) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(String(err)));

  // ── Sidebar sections ─────────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  const sectionLabels = await page.locator("nav[aria-label='Main navigation'] p").allTextContents();
  ok(
    "sidebar sections present",
    ["Trading", "Review", "Coaching", "Settings", "Security"].every((s) =>
      sectionLabels.some((l) => l.trim() === s),
    ),
    sectionLabels.map((l) => l.trim()).filter(Boolean).join(", "),
  );
  const navLinks = page.locator("nav[aria-label='Main navigation'] a");
  ok("sidebar has >= 16 links", (await navLinks.count()) >= 16, `${await navLinks.count()} links`);
  ok("sign out in sidebar", (await page.locator("nav a[title='Sign out']").count()) === 1);
  ok(
    "profile link present",
    (await page.locator("nav a[href='/profile']").count()) === 1,
  );
  ok(
    "activity log link present",
    (await page.locator("nav a[href='/security/log']").count()) === 1,
  );
  await page.screenshot({ path: `${OUT}/sidebar-sections.png`, fullPage: false });

  // ── Profile page ─────────────────────────────────────────────────────
  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  ok("profile h1", (await page.locator("h1").first().textContent())?.trim() === "Profile");
  await page.fill("#profile-name", "Jordan Trader");
  ok(
    "profile initials update",
    (await page.locator("span[aria-hidden='true'].font-heading").first().textContent())?.trim() === "JT",
  );
  ok(
    "save enabled when dirty",
    await page.getByRole("button", { name: "Save profile" }).isEnabled(),
  );
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.waitForTimeout(600);
  ok("profile saved state", (await page.getByText("All changes saved").count()) === 1);
  await page.screenshot({ path: `${OUT}/profile.png`, fullPage: false });

  // ── Help & Support ───────────────────────────────────────────────────
  await page.goto(`${BASE}/help`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  ok("help h1", (await page.locator("h1").first().textContent())?.trim() === "Help & Support");
  ok("shortcuts listed", (await page.locator("kbd").count()) >= 5, `${await page.locator("kbd").count()} keys`);
  ok("faq rows", (await page.locator("[data-testid='faq-item']").count()) === 6);
  await page.locator("[data-testid='faq-item'] button[aria-expanded]").nth(2).click();
  await page.waitForTimeout(300);
  ok(
    "faq expands",
    (await page.getByText("It blends plan adherence on graded trades", { exact: false }).count()) >= 1,
  );
  await page.screenshot({ path: `${OUT}/help.png`, fullPage: false });

  // ── Activity log ─────────────────────────────────────────────────────
  await page.goto(`${BASE}/security/log`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  ok("log h1", (await page.locator("h1").first().textContent())?.trim() === "Activity Log");
  const allCount = await page.locator("ol > li").count();
  ok("log rows rendered", allCount >= 15, `${allCount} events`);
  await page.getByRole("tab", { name: /Security/ }).click();
  await page.waitForTimeout(400);
  const securityCount = await page.locator("ol > li").count();
  ok("security filter narrows", securityCount > 0 && securityCount < allCount, `${securityCount} rows`);
  await page.screenshot({ path: `${OUT}/activity-log.png`, fullPage: false });

  // ── Backups ──────────────────────────────────────────────────────────
  await page.goto(`${BASE}/backups`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  ok("backups h1", (await page.locator("h1").first().textContent())?.trim() === "Backups");
  ok("backup card present", (await page.locator("[data-testid='backup-card']").count()) === 1);
  ok("export history present", (await page.locator("[data-testid='export-history']").count()) === 1);
  await page.screenshot({ path: `${OUT}/backups.png`, fullPage: false });

  // ── Trades BUY/SELL badges ───────────────────────────────────────────
  await page.goto(`${BASE}/trades`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1100);
  const buyBadges = await page.locator("[data-testid='trades-table'] td span", { hasText: "BUY" }).count();
  const sellBadges = await page.locator("[data-testid='trades-table'] td span", { hasText: "SELL" }).count();
  ok("BUY badges colored", buyBadges > 0, `${buyBadges}`);
  ok("SELL badges colored", sellBadges > 0, `${sellBadges}`);
  const buyClass = await page.locator("[data-testid='trades-table'] td span", { hasText: "BUY" }).first().getAttribute("class");
  const sellClass = await page.locator("[data-testid='trades-table'] td span", { hasText: "SELL" }).first().getAttribute("class");
  ok("BUY uses profit ink", (buyClass ?? "").includes("text-profit"));
  ok("SELL uses loss ink", (sellClass ?? "").includes("text-loss"));
  await page.screenshot({ path: `${OUT}/trades-badges.png`, fullPage: false });

  // ── Dashboard constellation stars (colored per-day P&L) ─────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  const starColors = await page.evaluate(() => {
    const canvas = document.querySelector(".echart-for-equity, [role='img'] canvas");
    return canvas ? "canvas-present" : "missing";
  });
  ok("equity canvas present", starColors === "canvas-present");
  await page.screenshot({ path: `${OUT}/dashboard-colors.png`, fullPage: false });

  // ── Analytics: categorical emotion bars + summary accents ───────────
  await page.goto(`${BASE}/analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/analytics-summary.png`, fullPage: false });
  await page.getByRole("tab", { name: "Mind" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/analytics-mind.png`, fullPage: false });

  // ── Collapsed sidebar (icons + separators) ───────────────────────────
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.waitForTimeout(500);
  const collapsedWidth = await page.locator("aside").evaluate((el) => el.getBoundingClientRect().width);
  ok("sidebar collapses to 72px", Math.round(collapsedWidth) === 72, `${collapsedWidth}`);
  await page.screenshot({ path: `${OUT}/sidebar-collapsed.png`, fullPage: false });
  // (No expand click: the Next.js dev overlay can intercept the last pointer
  // event; collapse probes are complete at this point.)

  ok("no console errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  // ── Mobile 390px: sheet nav keeps sections ───────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1200);
  await mobile.getByRole("button", { name: "Open navigation" }).click();
  await mobile.waitForTimeout(700);
  const sheetSections = await mobile.locator("nav[aria-label='Main navigation'] p").count();
  ok("mobile sheet has section labels", sheetSections >= 5, `${sheetSections}`);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  ok("mobile 390px: no horizontal overflow", !overflow);
  await mobile.screenshot({ path: `${OUT}/mobile-sheet.png`, fullPage: false });
  await mobile.close();

  await browser.close();
  console.log(process.exitCode === 1 ? "\nRESULT: FAIL" : "\nRESULT: ALL PASS");
})();
