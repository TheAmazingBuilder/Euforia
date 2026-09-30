const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/trades`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  // Set the guardrail preference + force a violation today, both via API.
  const setup = await page.evaluate(async () => {
    await fetch("/api/me/preferences/trading", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ softLockAfterViolations: 1 }),
    });
    const instruments = (await (await fetch("/api/instruments")).json()).instruments;
    for (let i = 0; i < 4; i += 1) {
      const status = await (await fetch("/api/rules/status")).json();
      if (status.violationsToday > 0) break;
      await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant: "open",
          instrumentId: instruments[0].id,
          direction: "BUY",
          entryPrice: "100",
          size: { mode: "quantity", quantity: "1" },
          outOfPlaybook: true,
        }),
      });
    }
    return (await (await fetch("/api/rules/status")).json()).violationsToday;
  });
  console.log("violationsToday:", setup);
  await page.locator('[data-testid="trades-new"]').click();
  await page.waitForTimeout(900);
  console.log("banner count:", await page.locator('[data-testid="trade-form-guardrail"]').count());
  await page.locator("#trade-entry-price").fill("100");
  await page.locator("#trade-exit-price").fill("101");
  await page.locator("#trade-stop").fill("99");
  await page.getByRole("radio", { name: "Out of playbook" }).click();
  await page.waitForTimeout(600);
  const submit = page.locator('form button[type="submit"]');
  console.log("disabled before ack:", await submit.isDisabled());
  await page.locator('[data-testid="trade-form-guardrail-confirm"]').click();
  await page.waitForTimeout(500);
  console.log("disabled after ack:", await submit.isDisabled());
  console.log("banner text:", (await page.locator('[data-testid="trade-form-guardrail"]').textContent())?.slice(0, 120));
  await page.screenshot({ path: "scripts/shots/probe-guardrail.png" });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
