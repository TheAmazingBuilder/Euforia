/** debug-oryon-signin.js — what does the page actually show after sign-in? */
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = "/home/z/my-project/scripts/oryon-debug-signin.log";
fs.writeFileSync(LOG, `=== signin debug ${new Date().toISOString()} ===\n`);
const say = (line) => {
  fs.appendFileSync(LOG, `${line}\n`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`CONSOLE: ${m.text().slice(0, 200)}`);
  });

  await page.goto("http://localhost:3000/", { waitUntil: "load", timeout: 60_000 });
  say(`after goto / — url: ${page.url()}`);
  await page.waitForTimeout(2_000);
  say(`after 2s — url: ${page.url()}`);

  if (page.url().includes("/login")) {
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 20_000 }).catch(() => say("login-form NOT found"));
    say(`login form visible: ${await page.locator('[data-testid="login-form"]').isVisible().catch(() => false)}`);
    // Try the demo fill button inside the hint panel first (canonical flow).
    const hintButton = page.locator('[data-testid="login-demo-hint"] button').first();
    say(`demo hint button count: ${await hintButton.count()}`);
    if ((await hintButton.count()) > 0) {
      await hintButton.click();
      say("clicked demo fill button");
    } else {
      await page.fill("#login-email", "trader@cosmoz.app").catch((e) => say(`fill email failed: ${e.message.split("\n")[0]}`));
      await page.fill("#login-password", "cosmoz-demo-2026").catch((e) => say(`fill password failed: ${e.message.split("\n")[0]}`));
    }
    await page.click('[data-testid="login-submit"]');
    say("clicked login-submit");
    await page.waitForTimeout(6_000);
    say(`after submit — url: ${page.url()}`);
    say(`mfa step visible: ${await page.locator('[data-testid="login-mfa-code"]').isVisible().catch(() => false)}`);
    say(`login error visible: ${await page.locator('[data-testid="login-error"]').isVisible().catch(() => false)}`);
  }

  await page.waitForTimeout(4_000);
  say(`final url: ${page.url()}`);
  const info = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    return {
      title: document.title,
      oryonLink: links.filter((h) => h === "/oryon").length,
      navSample: links.filter((h) => h && h.startsWith("/")).slice(0, 24),
      bodyHead: document.body.innerText.replace(/\s+/g, " ").slice(0, 260),
    };
  });
  say(`title: ${info.title}`);
  say(`oryon links: ${info.oryonLink}`);
  say(`nav sample: ${JSON.stringify(info.navSample)}`);
  say(`body head: ${info.bodyHead}`);
  say(`ERRORS (${errors.length}):`);
  for (const e of errors.slice(0, 8)) say(`  ${e}`);
  await page.screenshot({ path: "/home/z/my-project/scripts/shots/debug-signin.png" });
  await browser.close();
  say("=== done ===");
})();
