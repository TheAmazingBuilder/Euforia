/** Debug — probe rows inside the trading notification section. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/settings#notifications`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1500);

  const report = await mobile.evaluate(() => {
    const section = document.querySelector('[data-testid="settings-notifications-trading"]');
    const out = [`section w=${Math.round(section.getBoundingClientRect().width)}`];
    for (const child of section.children) {
      const r = child.getBoundingClientRect();
      out.push(`child <${child.tagName.toLowerCase()} cls="${(child.getAttribute("class") ?? "").slice(0, 60)}"> w=${Math.round(r.width)} right=${Math.round(r.right)} scrollW=${child.scrollWidth}`);
    }
    // Deep-dive: the widest leaf spans
    const spans = [...section.querySelectorAll("span, p")];
    spans.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
    for (const s of spans.slice(0, 6)) {
      const r = s.getBoundingClientRect();
      out.push(`span w=${Math.round(r.width)} right=${Math.round(r.right)} text="${(s.textContent ?? "").slice(0, 40)}"`);
    }
    return out;
  });
  console.log(report.join("\n"));
  await mobile.screenshot({ path: "scripts/shots/settings-mobile-notifications.png" });
  await mobile.locator('[data-testid="settings-nav-account"]').click();
  await mobile.waitForTimeout(900);
  await mobile.screenshot({ path: "scripts/shots/settings-mobile-account.png" });
  await browser.close();
})();
