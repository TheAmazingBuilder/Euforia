/**
 * Quick visual check: restored equity-curve logo (brand + favicon) and the
 * discreet sidebar logout. Shots -> scripts/shots/logo-restore-*.png
 */
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve(__dirname, "shots");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  // 1) Sidebar brand shows the equity-curve tile (svg present in brand link)
  const brandSvg = await page.locator('a[aria-label="Cosmoz — Dashboard"] svg').count();
  console.log("brand svg count:", brandSvg);

  // 2) Discreet logout link below Collapse
  const logout = page.locator('[data-testid="sidebar-logout"]');
  console.log("sidebar logout visible:", await logout.isVisible());
  const collapseBox = await page.getByRole("button", { name: /collapse sidebar/i }).boundingBox();
  const logoutBox = await logout.boundingBox();
  console.log(
    "logout below collapse:",
    collapseBox && logoutBox ? logoutBox.y > collapseBox.y : "n/a",
    JSON.stringify({ collapse: collapseBox && Math.round(collapseBox.y), logout: logoutBox && Math.round(logoutBox.y) })
  );
  await page.screenshot({ path: `${OUT}/logo-restore-sidebar.png` });

  // 3) Favicon reachable + SVG content type
  const res = await page.request.get(`${BASE}/icon.svg`);
  const body = await res.text();
  console.log("icon.svg status:", res.status(), "| equity curve artwork:", body.includes("polyline"), "| bytes:", body.length);

  // 4) Collapsed sidebar still shows the logout icon
  await page.getByRole("button", { name: /collapse sidebar/i }).click();
  await page.waitForTimeout(400);
  console.log("logout visible (collapsed):", await logout.isVisible());
  await page.screenshot({ path: `${OUT}/logo-restore-collapsed.png` });
  await page.getByRole("button", { name: /expand sidebar/i }).click();

  // 5) Login page brand
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/logo-restore-login.png` });

  console.log("console errors:", errors.length);
  errors.slice(0, 5).forEach((e) => console.log("  -", e.slice(0, 140)));
  await browser.close();
})();
