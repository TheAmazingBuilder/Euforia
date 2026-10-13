/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Capture the in-memory Bearer token from a real authenticated request
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
  await page.waitForTimeout(1200);
  console.log("token captured:", token ? "yes" : "NO");

  const probe = await page.evaluate(async ({ token }) => {
    const H = { "Content-Type": "application/json", Authorization: token };
    const tryFetch = async (path, init) => {
      const res = await fetch(path, { ...init, headers: H });
      const text = await res.text();
      return { status: res.status, path, text };
    };
    const out = [];
    const up = await tryFetch("/api/recognition/uploads", {
      method: "POST",
      body: JSON.stringify({ name: "probe.png", sizeBytes: 5000, mimeType: "image/png", width: 100, height: 100 }),
    });
    out.push(`${up.status} ${up.path} :: ${up.text.slice(0, 200)}`);
    let scrId = null;
    try { scrId = JSON.parse(up.text).screenshot.id; } catch {}
    if (!scrId) return out;
    const job = await tryFetch("/api/recognition/jobs", {
      method: "POST",
      body: JSON.stringify({ screenshotId: scrId, platform: "AUTO", mode: "AUTOMATIC" }),
    });
    out.push(`${job.status} ${job.path} :: ${job.text.slice(0, 200)}`);
    let jobId = null;
    try { jobId = JSON.parse(job.text).job.id; } catch {}
    if (!jobId) return out;
    const g1 = await tryFetch(`/api/recognition/jobs/${jobId}`, {});
    out.push(`${g1.status} ${g1.path} :: ${g1.text.slice(0, 240)}`);
    await new Promise((r) => setTimeout(r, 9500));
    const g2 = await tryFetch(`/api/recognition/jobs/${jobId}`, {});
    out.push(`${g2.status} ${g2.path} :: ${g2.text.slice(0, 240)}`);
    const g3 = await tryFetch(`/api/recognition/jobs/${jobId}/result`, {});
    out.push(`${g3.status} ${g3.path} :: ${g3.text.slice(0, 240)}`);
    return out;
  }, { token });

  console.log("--- direct probe ---");
  for (const line of probe) console.log(line);
  await browser.close();
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
