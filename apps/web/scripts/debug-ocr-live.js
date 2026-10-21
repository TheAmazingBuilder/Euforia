/** OCR live probe — boots the full live stack and dumps exactly what
 * /recognition renders after a REAL login (with fixed token race). */
const { chromium } = require("playwright");
const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = "/home/z/my-project";
const ART = "/tmp/cosmoz-ocr-live";
const API_LOG = path.join(ART, "api.log");
const EMAIL = `ocr-probe-${Date.now()}@test.cosmoz.dev`;
const PASSWORD = "Str0ng-Passphrase!";

async function main() {
  // ── pre-flight: fresh ports + fresh api log (kills the token race) ────
  // fuser is NOT installed here — parse ss -tlnp instead (see verify-ocr-backend-live.js).
  for (const port of [4000, 3004, 3001]) {
    try {
      const out = execSync(`ss -tlnp | grep ':${port} '`, { encoding: "utf8" });
      const pids = [...new Set([...out.matchAll(/pid=(\d+)/g)].map((m) => m[1]))];
      for (const pid of pids) { try { execSync(`kill -9 ${pid}`, { stdio: "ignore" }); } catch {} }
    } catch {}
  }
  try { execSync("pkill -f 'dist/apps/api/src/main.js'", { stdio: "ignore" }); } catch {}
  try { execSync("pkill -f 'uvicorn app.main:app'", { stdio: "ignore" }); } catch {}
  await new Promise((r) => setTimeout(r, 1500));
  fs.mkdirSync(ART, { recursive: true });
  try { fs.rmSync(API_LOG); } catch {}

  const ocr = spawn("python3", ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "3004", "--log-level", "warning"], { cwd: ROOT + "/mini-services/ocr-service", env: { ...process.env, OCR_SERVICE_TOKEN: "browser-e2e-token-0123456789abcdef0123456789" }, stdio: "ignore" });
  const api = spawn("node", ["--enable-source-maps", "dist/apps/api/src/main.js"], { cwd: ROOT + "/apps/api", env: { ...process.env, DATABASE_URL: "postgresql://cosmoz@127.0.0.1:5433/cosmoz", AUTH_JWT_SECRET: "runtime-verify-jwt-secret-0123456789abcdef0123456789", AUTH_MFA_ENCRYPTION_KEY: "h0mEbiEr05Qkg5f8Duz4PrOups2o69gGx+LIEdXAuvU=", ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY: "Mck3U8lb0RHzT7eDlBd7hgmE5FpYm0ZOSJB3ZfA4GFo=", WEB_APP_URL: "http://localhost:3001", OCR_SERVICE_URL: "http://127.0.0.1:3004", OCR_SERVICE_TOKEN: "browser-e2e-token-0123456789abcdef0123456789", OCR_MOCK_ENGINE: "disabled", LOG_LEVEL: "info", PORT: "4000" }, stdio: ["ignore", "pipe", "pipe"] });
  api.stdout.on("data", (d) => fs.appendFileSync(API_LOG, d));
  api.stderr.on("data", (d) => fs.appendFileSync(API_LOG, d));
  const web = spawn("npx", ["next", "start", "-p", "3001"], { cwd: ROOT + "/apps/web", env: { ...process.env, NEXT_PUBLIC_API_MOCKED: "true", NEXT_PUBLIC_OCR_LIVE: "true" }, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch("http://127.0.0.1:4000/health"); if (r.ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch("http://localhost:3001/login"); if (r.ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log("stack up");

  // ── register + verify with a size-marker (only tokens AFTER register) ──
  const reg = await fetch("http://127.0.0.1:4000/api/v1/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "OCR Probe" }) });
  console.log("register:", reg.status);
  if (reg.status !== 201) throw new Error(await reg.text());
  let token = "";
  for (let i = 0; i < 60; i++) {
    try {
      const log = fs.readFileSync(API_LOG, "utf8");
      const m = [...log.matchAll(/token=([A-Za-z0-9_-]+)/g)];
      if (m.length) { token = m[m.length - 1][1]; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!token) throw new Error("no token in fresh api log");
  const verify = await fetch("http://127.0.0.1:4000/api/v1/auth/email/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  const verifyBody = await verify.text();
  console.log("verify:", verify.status, verifyBody.slice(0, 120));
  if (verify.status !== 200) throw new Error("verify failed — token race or expired");

  // ── browser: real login, then inspect /recognition ──────────────────────
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 200)); });
  page.on("response", async (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) {
      let body = "";
      try { body = (await r.text()).slice(0, 180); } catch {}
      console.log("HTTP", r.status(), r.request().method(), r.url().slice(0, 110), "→", body);
    }
  });
  await page.goto("http://localhost:3001/login", { waitUntil: "networkidle" });
  await page.locator("#login-email").fill(EMAIL);
  await page.locator("#login-password").fill(PROBE_PASSWORD(PASSWORD));
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ timeout: 20000 });
  console.log("✓ logged in");

  // raw API probes from INSIDE the page (same cookies/localStorage the app uses)
  const rawJobs = await page.evaluate(async () => {
    const r = await fetch("/api/recognition/jobs", { headers: { "content-type": "application/json" } });
    return { status: r.status, body: (await r.text()).slice(0, 300) };
  });
  console.log("RAW /api/recognition/jobs:", rawJobs.status, rawJobs.body);

  await page.goto("http://localhost:3001/recognition", { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  console.log("URL:", page.url());
  console.log("BODY HEAD:", (await page.locator("body").innerText()).slice(0, 900).replace(/\n+/g, " | "));
  await page.screenshot({ path: ROOT + "/apps/web/scripts/shots/debug-ocr-live-overview.png", fullPage: true });
  console.log("shot saved: debug-ocr-live-overview.png");
  await browser.close();
  for (const p of [web, api, ocr]) try { p.kill(); } catch {}
}
function PROBE_PASSWORD(p) { return p; }
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
