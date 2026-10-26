/** Probe 2: POST /api/trades breaching trade - inspect status + response. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("response", (res) => {
    if (res.url().includes("/api/")) {
      console.log("[api]", res.status(), res.request().method(), new URL(res.url()).pathname);
    }
  });
  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("MSW") || msg.type() === "error") console.log("[console]", msg.type(), t.slice(0, 300));
  });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const out = await page.evaluate(async () => {
    const get = async (path, options) => {
      const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
      let body = null;
      try { body = await res.json(); } catch {}
      return { status: res.status, body };
    };
    const instruments = (await get("/api/instruments")).body.instruments;
    const accounts = (await get("/api/accounts")).body.accounts;
    const instrumentId = (instruments.find((i) => i.assetClass === "FOREX") ?? instruments[0]).id;
    const accountId = (accounts.find((a) => a.isDefault) ?? accounts[0]).id;
    const payload = {
      variant: "closed",
      accountId,
      instrumentId,
      direction: "BUY",
      entryPrice: "1.1000",
      exitPrice: "1.1050",
      exitAt: new Date().toISOString(),
      exitReason: "MANUAL",
      size: { mode: "risk_percent", riskPercent: 5 },
      outOfPlaybook: true,
    };
    const post = await get("/api/trades", { method: "POST", body: JSON.stringify(payload) });
    const alerts = await get("/api/alerts");
    return { postStatus: post.status, postBody: post.body, alertsCount: alerts.body?.alerts?.length };
  });
  console.log(JSON.stringify(out, null, 2).slice(0, 800));

  await browser.close();
})();
