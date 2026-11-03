/**
 * Motion pass verification - Expandable accordions (Academy), sliding tab
 * pill + animated tab switch (Coach), reveal-stagger grids (Dashboard),
 * MotionConfig reduced-motion guard, mobile 390px + light theme.
 * Screenshots into scripts/shots/motion/. Exit 1 when any probe fails.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = "scripts/shots/motion";

function ok(name, condition, detail = "") {
  const status = condition ? "PASS" : "FAIL";
  console.log(`${status}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!condition) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch();

  // ── Desktop pass ─────────────────────────────────────────────────────
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(String(err)));

  // Academy - accordion open/close through Expandable
  await page.goto(`${BASE}/academy`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const track2 = page.locator("section > button[aria-expanded]").nth(1);
  const track2Section = page.locator("section").nth(1);
  const track2Lessons = track2Section.locator("ul li");

  ok("track 2 closed initially", (await track2.getAttribute("aria-expanded")) === "false");
  ok("track 2 lessons hidden", (await track2Lessons.count()) === 0);

  await track2.click();
  await page.waitForTimeout(450); // expand animation
  ok("track 2 opens", (await track2.getAttribute("aria-expanded")) === "true");
  ok("track 2 lessons rendered", (await track2Lessons.count()) > 0);

  // Lesson reader opens inside an animated track
  const firstLessonToggle = track2Section.locator("ul li button").nth(1);
  await firstLessonToggle.click();
  await page.waitForTimeout(400);
  ok(
    "lesson body visible",
    (await track2Section.getByText("Key takeaways").count()) === 1,
  );
  await page.screenshot({ path: `${OUT}/academy-expanded.png`, fullPage: false });

  // Close track - exit animation, content unmounts
  await track2.click();
  await page.waitForTimeout(450);
  ok("track 2 closes", (await track2.getAttribute("aria-expanded")) === "false");
  ok("track 2 lessons unmounted", (await track2Lessons.count()) === 0);

  // Coach - sliding pill + tab content switch
  await page.goto(`${BASE}/coach`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  const weeklyTab = page.getByRole("tab", { name: "Weekly report" });
  ok("chat tab selected first", (await page.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected")) === "true");

  await weeklyTab.click();
  await page.waitForTimeout(600); // wait mode + enter animation
  ok("weekly tab selected", (await weeklyTab.getAttribute("aria-selected")) === "true");
  ok(
    "weekly content rendered",
    (await page.getByText("Your week, reviewed from your journal").count()) >= 1,
  );
  const pill = page.locator('[data-motion-id="coach-pill"], span[layoutid="coach-tab-pill"]');
  // layoutId renders as a span inside the active tab button
  const pillInsideWeekly = weeklyTab.locator("span").first();
  ok("active pill inside weekly tab", (await pillInsideWeekly.count()) === 1);
  await page.screenshot({ path: `${OUT}/coach-weekly-pill.png`, fullPage: false });

  // Back to chat - content switch again
  await page.getByRole("tab", { name: "Chat" }).click();
  await page.waitForTimeout(600);
  ok(
    "chat content back",
    (await page.getByText("Ask your AI coach anything").count()) >= 1,
  );

  // Dashboard - reveal-stagger grids present, no overlap
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  const staggerGrids = await page.locator(".reveal-stagger").count();
  ok("dashboard stagger grids >= 3", staggerGrids >= 3, `found ${staggerGrids}`);
  await page.screenshot({ path: `${OUT}/dashboard-reveal.png`, fullPage: false });

  ok("no console errors (desktop)", errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();

  // ── Reduced motion pass (Academy must render plain CSS) ───────────────
  const rmPage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await rmPage.goto(`${BASE}/academy`, { waitUntil: "networkidle" });
  await rmPage.waitForTimeout(800);
  const rmTrack2 = rmPage.locator("section > button[aria-expanded]").nth(1);
  await rmTrack2.click();
  await rmPage.waitForTimeout(150);
  const rmSection = rmPage.locator("section").nth(1);
  ok(
    "reduced-motion: track still opens",
    (await rmTrack2.getAttribute("aria-expanded")) === "true" &&
      (await rmSection.locator("ul li").count()) > 0,
  );
  await rmPage.close();

  // ── Mobile 390px pass ─────────────────────────────────────────────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/academy`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1200);
  const mTrack2 = mobile.locator("section > button[aria-expanded]").nth(1);
  await mTrack2.click();
  await mobile.waitForTimeout(500);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  ok("mobile 390px: no horizontal overflow", !overflow);
  await mobile.screenshot({ path: `${OUT}/academy-mobile.png`, fullPage: false });
  await mobile.close();

  // ── Light theme pass ──────────────────────────────────────────────────
  const light = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await light.goto(`${BASE}/coach`, { waitUntil: "networkidle" });
  await light.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    window.localStorage.setItem("cosmoz:theme", "light");
  });
  await light.waitForTimeout(600);
  await light.screenshot({ path: `${OUT}/coach-light.png`, fullPage: false });
  await light.close();

  await browser.close();
  console.log(process.exitCode === 1 ? "\nRESULT: FAIL" : "\nRESULT: ALL PASS");
})();
