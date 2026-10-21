const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("PAGEERROR: " + String(e).slice(0, 200)));
  p.on("console", (m) => { if (m.type() === "error" && !/socket|XTransform|ERR_|Failed to load/.test(m.text())) errs.push("CONSOLE: " + m.text().slice(0, 200)); });
  await p.goto("http://localhost:3000/", { waitUntil: "load", timeout: 60000 });
  try { await p.waitForSelector('[data-testid="login-form"]', { timeout: 15000 }); } catch {}
  const demo = p.locator('[data-testid="login-demo-hint"] button').first();
  if (await demo.count()) await demo.click();
  await p.click('[data-testid="login-submit"]').catch(()=>{});
  try { await p.waitForSelector('[data-testid="login-mfa-code"]', { timeout: 10000 }); } catch {}
  if (await p.locator('[data-testid="login-mfa-code"]').count()) {
    const h = (await p.locator('[data-testid="login-mfa-demo-hint"]').innerText()).match(/\d{6}/);
    if (h) { await p.fill('[data-testid="login-mfa-code"]', h[0]); await p.keyboard.press("Enter"); }
  }
  await p.waitForSelector('a[href="/oryon"]', { timeout: 30000 });
  await p.locator('a[href="/oryon"]').first().click();
  try {
    await p.waitForSelector('[data-testid="oryon-workspace"]', { timeout: 20000 });
    await p.click('[data-testid="oryon-lower-toggle"]');
    await p.waitForTimeout(2500);
    const rows = await p.locator('[data-testid="oryon-position-row"]').count();
    const badge = await p.locator('[data-testid="oryon-positions-sim-badge"]').count();
    const account = await p.locator('[data-testid="oryon-positions-account-empty"]').count();
    const table = await p.locator('[data-testid="oryon-positions-table"]').count();
    console.log(`PROD SMOKE: rows=${rows} simBadge=${badge} accountEmpty=${account} table=${table}`);
  } catch (e) {
    console.log("WORKSPACE TIMEOUT. url=", p.url());
  }
  errs.slice(0, 6).forEach((e) => console.log(e));
  await p.screenshot({ path: "/home/z/my-project/scripts/shots/smoke-p4-prod.png" });
  await b.close();
})();
