/** Debug offline behavior — no swallowed errors, full state logging. */
const { chromium } = require("playwright");
const { spawn, execSync } = require("child_process");

const BASE = "http://localhost:3000";

function killServer() {
  // Bracket trick: a literal "next dev" pattern makes pkill SIGKILL its own
  // parent shell (the pattern appears in the shell's cmdline). With [ ] the
  // regex matches the target processes but never the caller.
  try {
    execSync('pkill -9 -f "next[ ]dev" || true', { stdio: "ignore", shell: "/bin/bash" });
    execSync('pkill -9 -f "next[-]server" || true', { stdio: "ignore", shell: "/bin/bash" });
  } catch {}
}

async function startServer() {
  const child = spawn("pnpm", ["dev"], {
    cwd: "/home/z/my-project/apps/web",
    env: { ...process.env, PATH: `/home/z/.local/bin:${process.env.PATH}` },
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("server never up");
}

(async () => {
  killServer();
  await startServer();
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.log("[console]", m.type(), m.text().slice(0, 150));
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const state1 = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return {
      controlled: Boolean(navigator.serviceWorker.controller),
      scope: reg?.scope ?? null,
      active: reg?.active?.state ?? null,
      script: reg?.active?.scriptURL ?? null,
    };
  });
  console.log("STATE BEFORE:", JSON.stringify(state1));

  killServer();
  await new Promise((r) => setTimeout(r, 1500));
  console.log("server killed, navigating...");

  try {
    const resp = await page.goto(BASE, { waitUntil: "load", timeout: 20000 });
    console.log("goto OK — status:", resp?.status(), "url:", page.url());
  } catch (err) {
    console.log("goto THREW:", String(err).slice(0, 200));
  }
  await page.waitForTimeout(1500);

  const state2 = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyStart: (document.body.textContent ?? "").trim().slice(0, 120),
  }));
  console.log("STATE AFTER:", JSON.stringify(state2, null, 2));

  await page.screenshot({ path: "scripts/shots/debug-offline.png", fullPage: true });
  await browser.close();
  killServer();
  process.exit(0);
})();
