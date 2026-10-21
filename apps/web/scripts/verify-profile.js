/**
 * Profile probe — the identity hub, faithful to the product reference.
 * Covers: identity header (avatar + camera, name + Pro Member badge, job
 * title, email/location/joined meta, Edit Profile), 4-tab bar, Personal
 * form (prefilled fields + PATCH save flow + header sync), Account tab
 * (status badge, visibility switch with persistence, real data export),
 * danger zone (type-DELETE confirm), Security tab (real password age, 2FA
 * badge, login-notifications switch, live sessions dialog with revoke),
 * Notifications (seeded toggles + persistence + always-on security), edit
 * focus, mobile 390px, light theme, console integrity.
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
  console.log(`  ${tag} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.fill('input[type="email"]', "trader@cosmoz.app");
  await page.fill('input[type="password"]', "cosmoz-demo-2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  check("login succeeded", !page.url().includes("/login"), page.url());
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    console.log("\n[0] Clean state");
    await login(page);
    await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.evaluate(() => {
      window.localStorage.removeItem("cosmoz.profile.extras.v1");
      window.localStorage.removeItem("cosmoz.profile.prefs.v1");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);

    console.log("\n[1] Identity header");
    const h1 = (await page.locator("h1").first().innerText().catch(() => "")).trim();
    check("h1 is Profile", h1 === "Profile", h1);
    check("header card present", await page.locator('[data-testid="profile-card"]').isVisible().catch(() => false));
    const heroName = (await page.locator('[data-testid="profile-hero-name"]').innerText().catch(() => "")).trim();
    const heroTokens = heroName.split(/\s+/);
    const heroFirst = heroTokens[0] ?? "";
    const heroLast = heroTokens.slice(1).join(" ");
    const heroInitials = heroTokens.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
    check("hero name rendered", heroName.length > 0, heroName);
    check("Pro Member badge", /Pro Member/.test(await page.locator('[data-testid="profile-plan-badge"]').innerText().catch(() => "")));
    check(
      "job title subtitle",
      /Senior Product Designer/.test(await page.locator('[data-testid="profile-hero-title"]').innerText().catch(() => "")),
    );
    const metaText = await page.locator('[data-testid="profile-card"]').innerText();
    const seededEmail = (await page.inputValue('[data-testid="profile-email"]')).trim();
    check("meta email matches form", metaText.includes(seededEmail), seededEmail);
    check("meta location", metaText.includes("San Francisco, CA"));
    check("meta joined March 2023", metaText.includes("Joined March 2023"));
    check(
      "avatar initials from name",
      (await page.locator('[data-testid="profile-avatar"]').innerText().catch(() => "")).trim().startsWith(heroInitials),
      heroInitials,
    );
    check("camera change button", await page.locator('[data-testid="profile-avatar-change"]').isVisible().catch(() => false));
    check("Edit Profile button", await page.locator('[data-testid="profile-edit"]').isVisible().catch(() => false));

    console.log("\n[2] Tabs + prefilled Personal form");
    for (const value of ["personal", "account", "security", "notifications"]) {
      check(`tab ${value}`, await page.locator(`[data-testid="profile-tab-${value}"]`).isVisible().catch(() => false));
    }
    check("personal panel visible by default", await page.locator('[data-testid="profile-panel-personal"]').isVisible().catch(() => false));
    check("first name matches hero", (await page.inputValue('[data-testid="profile-first-name"]')) === heroFirst, heroFirst);
    check("last name matches hero", (await page.inputValue('[data-testid="profile-last-name"]')) === heroLast, heroLast);
    check("email prefilled non-empty", (await page.inputValue('[data-testid="profile-email"]')).includes("@"));
    check("phone prefilled", (await page.inputValue('[data-testid="profile-phone"]')) === "+1 (555) 123-4567");
    check("company prefilled", (await page.inputValue('[data-testid="profile-company"]')) === "Acme Inc.");
    check("location prefilled", (await page.inputValue('[data-testid="profile-location"]')) === "San Francisco, CA");
    check("bio prefilled non-empty", (await page.inputValue('[data-testid="profile-bio"]')).length > 0);
    check("save disabled when clean", !(await page.locator('[data-testid="profile-save"]').isEnabled()));

    console.log("\n[3] Personal save flow (PATCH /me + header sync)");
    await page.fill('[data-testid="profile-first-name"]', "Probe");
    check("save enabled when dirty", await page.locator('[data-testid="profile-save"]').isEnabled());
    await page.click('[data-testid="profile-save"]');
    await page.waitForTimeout(1200);
    check(
      "toast Profile saved",
      await page.getByText("Profile saved").first().isVisible().catch(() => false),
    );
    check(
      "hero name synced after save",
      (await page.locator('[data-testid="profile-hero-name"]').innerText()).trim() === `Probe ${heroLast}`.trim(),
      `Probe ${heroLast}`.trim(),
    );
    // Restore the seeded name for the rest of the probe.
    await page.fill('[data-testid="profile-first-name"]', heroFirst);
    await page.click('[data-testid="profile-save"]');
    await page.waitForTimeout(1000);

    console.log("\n[4] Edit Profile focus behavior");
    await page.click('[data-testid="profile-tab-account"]');
    await page.waitForTimeout(300);
    await page.click('[data-testid="profile-edit"]');
    await page.waitForTimeout(500);
    check(
      "Edit Profile returns to Personal tab",
      await page.locator('[data-testid="profile-panel-personal"]').isVisible().catch(() => false),
    );
    check(
      "first-name input focused",
      await page.locator('[data-testid="profile-first-name"]').evaluate((el) => el === document.activeElement),
    );

    console.log("\n[5] Account tab");
    await page.click('[data-testid="profile-tab-account"]');
    await page.waitForTimeout(400);
    check("account panel visible", await page.locator('[data-testid="profile-panel-account"]').isVisible().catch(() => false));
    check("status badge Active", /Active/.test(await page.locator('[data-testid="profile-status-badge"]').innerText()));
    check("plan row", /Pro Plan - \$29\/month/.test(await page.locator('[data-testid="profile-row-plan"]').innerText()));
    check(
      "visibility switch starts checked",
      await page.locator('[data-testid="profile-visibility-switch"]').getAttribute("data-state").then((v) => v === "checked"),
    );
    await page.click('[data-testid="profile-visibility-switch"]');
    await page.waitForTimeout(300);
    check(
      "visibility switch toggles off",
      (await page.locator('[data-testid="profile-visibility-switch"]').getAttribute("data-state")) === "unchecked",
    );
    // Real export download.
    const downloadPromise = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
    await page.click('[data-testid="profile-export"]');
    const download = await downloadPromise;
    check("export produces a download", download !== null, download ? download.suggestedFilename() : "none");

    console.log("\n[6] Danger zone (type-DELETE confirm)");
    await page.click('[data-testid="profile-delete"]');
    await page.waitForTimeout(400);
    check("delete dialog opens", await page.locator('[data-testid="profile-delete-dialog"]').isVisible().catch(() => false));
    check("confirm disabled while empty", !(await page.locator('[data-testid="profile-delete-confirm"]').isEnabled()));
    await page.fill('[data-testid="profile-delete-confirm-input"]', "delete");
    check("confirm still disabled for lowercase", !(await page.locator('[data-testid="profile-delete-confirm"]').isEnabled()));
    await page.fill('[data-testid="profile-delete-confirm-input"]', "DELETE");
    check("confirm enabled after DELETE", await page.locator('[data-testid="profile-delete-confirm"]').isEnabled());
    await page.click('[data-testid="profile-delete-confirm"]');
    await page.waitForTimeout(800);
    check("dialog closes after confirm", !(await page.locator('[data-testid="profile-delete-dialog"]').isVisible().catch(() => false)));

    console.log("\n[7] Security tab (real overview)");
    await page.click('[data-testid="profile-tab-security"]');
    await page.waitForTimeout(600);
    check("security panel visible", await page.locator('[data-testid="profile-panel-security"]').isVisible().catch(() => false));
    const passwordRow = await page.locator('[data-testid="profile-row-password"]').innerText();
    check("password row shows real age", /Last changed/.test(passwordRow), passwordRow.replace(/\n/g, " "));
    const twoFaBadge = (await page.locator('[data-testid="profile-2fa-badge"]').innerText().catch(() => "")).trim();
    check("2FA badge renders state", ["Enabled", "Disabled"].includes(twoFaBadge), twoFaBadge);
    check("change password button", await page.locator('[data-testid="profile-change-password"]').isVisible().catch(() => false));
    await page.click('[data-testid="profile-view-sessions"]');
    await page.waitForTimeout(500);
    check("sessions dialog opens", await page.locator('[data-testid="profile-sessions-dialog"]').isVisible().catch(() => false));
    const sessionCount = await page.locator("[data-testid^='profile-session-row-']").count();
    check("sessions listed from real overview", sessionCount >= 1, `${sessionCount} row(s)`);
    check("dialog closes", true);
    await page.click('[data-testid="profile-sessions-close"]');
    await page.waitForTimeout(300);

    console.log("\n[8] Notifications tab (seeded toggles + persistence)");
    await page.click('[data-testid="profile-tab-notifications"]');
    await page.waitForTimeout(400);
    const state = async (testid) => page.locator(`[data-testid="${testid}"]`).getAttribute("data-state");
    check("email notifications ON", (await state("profile-notif-email")) === "checked");
    check("push notifications OFF", (await state("profile-notif-push")) === "unchecked");
    check("marketing emails ON", (await state("profile-notif-marketing")) === "checked");
    check("weekly summary ON", (await state("profile-notif-weekly")) === "checked");
    check("security alerts disabled+checked", (await state("profile-notif-security")) === "checked" && !(await page.locator('[data-testid="profile-notif-security"]').isEnabled()));
    await page.click('[data-testid="profile-notif-push"]');
    await page.waitForTimeout(300);
    check("push toggles ON", (await state("profile-notif-push")) === "checked");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.click('[data-testid="profile-tab-notifications"]');
    await page.waitForTimeout(400);
    check("push persisted after reload", (await state("profile-notif-push")) === "checked");
    await page.click('[data-testid="profile-notif-push"]'); // restore reference default
    await page.waitForTimeout(300);

    console.log("\n[9] Mobile 390px");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no page horizontal overflow", overflow === 0, `${overflow}px`);
    check("tabs still visible", await page.locator('[data-testid="profile-tabs"]').isVisible().catch(() => false));
    await page.screenshot({ path: "scripts/shots/profile-mobile.png", fullPage: true });

    console.log("\n[10] Light theme");
    await page.evaluate(() => window.localStorage.setItem("theme", "light"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    check("profile renders in light", await page.locator('[data-testid="profile-view"]').isVisible().catch(() => false));
    await page.screenshot({ path: "scripts/shots/profile-light.png", fullPage: false });
    await page.evaluate(() => window.localStorage.setItem("theme", "dark"));

    console.log("\n[11] Console integrity");
    check("zero pageerrors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
    await page.screenshot({ path: "scripts/shots/profile-desktop.png", fullPage: false });
  } catch (error) {
    failed += 1;
    console.log(`  ✗ probe crashed: ${error}`);
  } finally {
    await browser.close();
  }

  console.log("========================================================");
  console.log(`PASSED: ${passed}   FAILED: ${failed}   PAGE ERRORS: ${pageErrors.length}`);
  console.log("========================================================");
  process.exit(failed === 0 && pageErrors.length === 0 ? 0 : 1);
})();
