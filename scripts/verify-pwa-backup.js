/**
 * Verify Feature 12 — PWA offline + backup JSON.
 * Self-contained: spawns the dev server itself so it can KILL it mid-test
 * for a REAL offline check (Playwright's setOffline breaks SW fetch handling
 * — a genuine connection failure does not).
 */
const { chromium } = require("playwright");
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const PORT = 3000;

function startServer() {
  const child = spawn(
    "pnpm",
    ["dev"],
    {
      cwd: "/home/z/my-project/apps/web",
      env: { ...process.env, PATH: `/home/z/.local/bin:${process.env.PATH}` },
      stdio: "ignore",
      detached: true,
    },
  );
  return child;
}

function killServer() {
  // Bracket trick so the pattern never matches its own shell cmdline —
  // a literal "next dev" pattern makes pkill SIGKILL its own parent shell.
  try {
    execSync('pkill -9 -f "next[ ]dev" || true', { stdio: "ignore", shell: "/bin/bash" });
    execSync('pkill -9 -f "next[-]server" || true', { stdio: "ignore", shell: "/bin/bash" });
  } catch {}
  try {
    execSync("sleep 0.5", { stdio: "ignore" });
  } catch {}
}

async function waitForServer(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

(async () => {
  killServer();
  const server = startServer();
  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);

  if (!(await waitForServer())) {
    console.log("FAIL — server never came up");
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 1. Manifest linked
  const manifestHref = await page.evaluate(() => {
    const link = document.querySelector('link[rel="manifest"]');
    return link ? link.getAttribute("href") : null;
  });
  check("Manifest linked in <head>", manifestHref === "/manifest.webmanifest", String(manifestHref));

  // 2. SW registered + offline.html cached
  const swInfo = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return { reg: "unsupported" };
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const cached = await caches.match("/offline.html");
    return { reg: reg && reg.active ? "active" : "none", offlineCached: Boolean(cached) };
  });
  check("Service worker active", swInfo.reg === "active", swInfo.reg);
  check("offline.html pre-cached", swInfo.offlineCached === true);

  // 3. Export backup → download + parse
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const backupCard = page.locator('[data-testid="backup-card"]');
  check("Backup card on settings", await backupCard.isVisible().catch(() => false));
  await page.screenshot({ path: "scripts/shots/settings-backup.png", fullPage: true });

  const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await page.locator('[data-testid="export-backup"]').click();
  const download = await downloadPromise;
  const filePath = path.join("/tmp", download.suggestedFilename());
  await download.saveAs(filePath);
  const backupJson = JSON.parse(fs.readFileSync(filePath, "utf8"));
  check(
    "Export downloads valid backup",
    backupJson.app === "cosmoz" && Array.isArray(backupJson.trades) && backupJson.trades.length > 0,
    `${backupJson.trades?.length} trades, file=${download.suggestedFilename()}`,
  );

  // 4. Import backup (re-import same file — replace trades, merge strategies)
  await page.locator('[data-testid="import-backup"]').click();
  await page.setInputFiles('input[type="file"]', filePath);
  await page.waitForTimeout(2000);
  const toastText = await page
    .locator("[data-sonner-toast]")
    .first()
    .textContent()
    .catch(() => "");
  check(
    "Import success toast",
    (toastText ?? "").toLowerCase().includes("imported"),
    (toastText ?? "").slice(0, 80),
  );
  await page.screenshot({ path: "scripts/shots/backup-import-toast.png" });

  // 5. Invalid file → error toast (poll — sonner stacks over the export one)
  const badFile = path.join("/tmp", "bad-backup.json");
  fs.writeFileSync(badFile, JSON.stringify({ hello: "world" }));
  await page.locator('[data-testid="import-backup"]').click();
  await page.setInputFiles('input[type="file"]', badFile);
  let rejectedSeen = false;
  try {
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("[data-sonner-toast]")].some((node) =>
          (node.textContent ?? "").toLowerCase().includes("import failed"),
        ),
      { timeout: 6000 },
    );
    rejectedSeen = true;
  } catch {}
  check("Invalid file rejected", rejectedSeen);

  // 6. REAL offline: kill the server, then navigate. The SW (already
  // controlling this page) must answer with /offline.html.
  killServer();
  await page.waitForTimeout(1000);
  await page.goto(BASE, { waitUntil: "load", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const offlineVisible = await page.locator('text="You are offline"').isVisible().catch(() => false);
  check("Offline fallback page served (real offline)", offlineVisible);
  await page.screenshot({ path: "scripts/shots/pwa-offline.png" });

  console.log("\n=== FEATURE 12 RESULTS ===");
  results.forEach((r) => console.log(r));
  console.log(`\nPage errors: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log("  ERROR:", e.slice(0, 200)));

  await browser.close();
  killServer();
  process.exit(results.every((r) => r.startsWith("PASS")) ? 0 : 1);
})();
