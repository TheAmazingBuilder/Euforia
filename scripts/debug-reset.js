const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const DEMO_EMAIL = "alex@cosmoz.app";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE ERROR:", m.text().slice(0, 200));
  });
  page.on("response", (r) => {
    if (r.url().includes("/auth/")) console.log("AUTH RESPONSE:", r.status(), r.url());
  });

  await page.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator("#forgot-email").fill(DEMO_EMAIL);
  await page.getByRole("button", { name: /Send reset code/ }).click();
  await page.locator('[data-testid="dev-code"]').waitFor({ timeout: 8000 });
  const raw = await page.locator('[data-testid="dev-code"]').textContent();
  const code = (raw ?? "").replace(/\D/g, "").slice(-6);
  console.log("code parsed:", JSON.stringify(code));

  await page.getByRole("button", { name: /Continue to reset/ }).click();
  await page.waitForTimeout(1500);
  console.log("URL:", page.url());

  await page.locator('[data-testid="code-slot-0"]').fill(code);
  await page.waitForTimeout(300);
  console.log("slot values:", await page.evaluate(() =>
    Array.from({ length: 6 }, (_, i) => document.querySelector(`[data-testid="code-slot-${i}"]`)?.value).join(""),
  ));
  await page.locator("#reset-password").fill("Freshpass7");
  await page.locator("#reset-confirm").fill("Freshpass7");
  await page.getByRole("button", { name: /Reset password and sign in/ }).click();
  await page.waitForTimeout(3000);
  console.log("URL after submit:", page.url());
  console.log("Has reset error:", await page.locator('[data-testid="reset-error"]').textContent().catch(() => "none"));

  await browser.close();
})();
