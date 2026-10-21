/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let token = "";
  page.on("request", (req) => {
    const auth = req.headers()["authorization"];
    if (auth && !token) token = auth;
  });
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.locator("#login-email").fill("trader@cosmoz.app");
  await page.locator("#login-password").fill("cosmoz-demo-2026");
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL("http://localhost:3000/");
  await page.waitForTimeout(1000);

  const log = await page.evaluate(async ({ token }) => {
    const H = { "Content-Type": "application/json", Authorization: token };
    const out = [];
    for (let i = 0; i < 5; i += 1) {
      const up = await (await fetch("/api/recognition/uploads", {
        method: "POST", headers: H,
        body: JSON.stringify({ name: `rot${i}.png`, sizeBytes: 5000, mimeType: "image/png", width: 100, height: 100 }),
      })).json();
      const job = await (await fetch("/api/recognition/jobs", {
        method: "POST", headers: H,
        body: JSON.stringify({ screenshotId: up.screenshot.id, platform: "AUTO", mode: "AUTOMATIC" }),
      })).json();
      const id = job.job.id;
      // poll until terminal
      let status = "PROCESSING";
      for (let t = 0; t < 15; t += 1) {
        await new Promise((r) => setTimeout(r, 1200));
        const j = await (await fetch(`/api/recognition/jobs/${id}`, { headers: H })).json();
        status = j.job.status;
        if (status !== "PROCESSING" && status !== "PENDING") {
          out.push(`${id} rot${i}: ${status} (symbol=${j.job.screenshot.name})`);
          break;
        }
      }
    }
    return out;
  }, { token });
  for (const line of log) console.log(line);
  await browser.close();
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
