/** Probe: raw PATCH /api/me/preferences/notifications + POST /api/trades statuses. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (msg) => console.log("[console]", msg.type(), msg.text().slice(0, 200)));
  page.on("response", (res) => {
    if (res.url().includes("/api/")) console.log("[api]", res.status(), res.request().method(), res.url());
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
    const me = await get("/api/me/preferences");
    const patch = await get("/api/me/preferences/notifications", {
      method: "PATCH",
      body: JSON.stringify(me.body.notifications),
    });
    return { getStatus: me.status, patchStatus: patch.status, patchBody: patch.body };
  });
  console.log(JSON.stringify(out, null, 2).slice(0, 1200));

  await browser.close();
})();
