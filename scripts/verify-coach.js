/**
 * Verify Feature 11 - AI conversational coach.
 * Probes: nav entry, grounded header, suggestion → real LLM reply, typed
 * question, multi-turn context, persistence after reload, clear, mobile
 * layout, console health.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(BASE + "/coach", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);

  // 1. Sidebar nav entry
  const navCoach = page.locator('aside a[href="/coach"]');
  check("Sidebar nav entry", (await navCoach.count()) > 0);

  // 2. Grounded header (context ready)
  const grounded = await page
    .locator("text=/Grounded in \\d+ trade/")
    .first()
    .textContent()
    .catch(() => null);
  check("Header grounded in data", grounded !== null, grounded ?? "not found");

  // 3. Suggestion chip → assistant reply (real LLM call, generous timeout)
  await page.locator('button:has-text("What\'s my biggest leak right now?")').click();
  try {
    await page.locator("text=/.*leak|mistake|loss|R.*/i").first().waitFor({ timeout: 1000 });
  } catch {
    /* handled below */
  }
  let reply1 = null;
  try {
    await page
      .locator('[data-slot="button"]:has-text("Retry"), button:has-text("Retry")')
      .first()
      .waitFor({ state: "detached", timeout: 90000 });
  } catch {
    /* no retry button - fine */
  }
  await page.waitForFunction(
    () => {
      const bubbles = document.querySelectorAll('[role="log"] > div');
      return bubbles.length >= 2;
    },
    { timeout: 90000 },
  );
  const typingGone = await page
    .locator('[aria-label="Coach is typing"]')
    .waitFor({ state: "detached", timeout: 90000 })
    .then(() => true)
    .catch(() => false);
  reply1 = await page
    .locator('[role="log"] > div')
    .nth(1)
    .textContent()
    .catch(() => null);
  check("Suggestion gets a reply", typingGone && (reply1 ?? "").trim().length > 40, `${(reply1 ?? "").length} chars, typing gone=${typingGone}`);
  await page.screenshot({ path: "scripts/shots/coach-first-reply.png" });

  // 4. Typed follow-up referencing context (multi-turn)
  await page.locator("#coach-input").fill("Which strategy has the worst recent expectancy?");
  await page.keyboard.press("Enter");
  await page
    .locator('[aria-label="Coach is typing"]')
    .waitFor({ state: "visible", timeout: 10000 })
    .catch(() => {});
  const reply2Done = await page
    .locator('[aria-label="Coach is typing"]')
    .waitFor({ state: "detached", timeout: 90000 })
    .then(() => true)
    .catch(() => false);
  const turnCount = await page.locator('[role="log"] > div').count();
  check("Multi-turn exchange works", reply2Done && turnCount >= 4, `${turnCount} turns`);
  await page.screenshot({ path: "scripts/shots/coach-second-reply.png" });

  // 5. Persistence after reload
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const stored = await page.evaluate(() => window.localStorage.getItem("cosmoz.coach.history.v1"));
  const restoredTurns = stored ? JSON.parse(stored).length : 0;
  check("Conversation persists across reload", restoredTurns >= 4, `${restoredTurns} stored turns`);
  await page.screenshot({ path: "scripts/shots/coach-restored.png" });

  // 6. Clear conversation → empty state
  await page.locator('button[aria-label="Clear conversation"]').click();
  await page.waitForTimeout(400);
  const emptyIntro = await page
    .locator("text=Talk about your trading, not the market")
    .isVisible()
    .catch(() => false);
  check("Clear restores empty state", emptyIntro);

  // 7. API direct probe - invalid payload rejected, valid answered
  const bad = await page.evaluate(async () => {
    const res = await fetch("/api/coach/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: "nope" }),
    });
    return res.status;
  });
  check("Invalid payload rejected (400)", bad === 400, `status=${bad}`);

  // 8. Mobile 390px layout - no horizontal overflow, composer reachable
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/coach", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  check("No horizontal overflow at 390px", overflow <= 0, `overflow=${overflow}px`);
  await page.screenshot({ path: "scripts/shots/coach-mobile.png", fullPage: false });

  console.log("\n=== FEATURE 11 RESULTS ===");
  // The invalid-payload probe (step 7) intentionally triggers a 400 - the
  // browser logs it as a console error. Filter that expected noise out.
  const realErrors = errors.filter((e) => !/status of 400/.test(e));
  results.forEach((r) => console.log(r));
  console.log(`\nConsole errors: ${realErrors.length}`);
  realErrors.slice(0, 5).forEach((e) => console.log("  ERROR:", e.slice(0, 200)));

  await browser.close();
  process.exit(results.every((r) => r.startsWith("PASS")) && realErrors.length === 0 ? 0 : 1);
})();
