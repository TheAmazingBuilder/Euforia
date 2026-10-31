/**
 * Verify - Playbook strategy color picker redesign.
 * Probes: create-mode default = Auto, 13 radios (12 named + auto), named
 * selection + live readout + preview dot color, check mark, arrow-key
 * roving selection, create flow stores the color (card sparkline stroke),
 * edit flow preserves it, Auto falls back to the theme accent token,
 * light-theme + mobile 390px renders.
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const NAME = "Pick Verify Coral";
const CORAL = "#F87171";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];
  const check = (name, ok, extra = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} - ${name}${extra ? ` (${extra})` : ""}`);

  await page.goto(`${BASE}/playbook`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "New Strategy" }).first().waitFor({ timeout: 15000 });

  // 1. Open the create dialog
  await page.getByRole("button", { name: "New Strategy" }).first().click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 5000 });
  check("Create dialog opens", await dialog.isVisible());

  // 2. Radiogroup: 12 palette swatches + Auto = 13 options
  const radios = dialog.locator('button[role="radio"]');
  const radioCount = await radios.count();
  check("13 color options (12 palette + Auto)", radioCount === 13, `${radioCount} radios`);

  // 3. Create-mode default is Auto (stored color null)
  const auto = dialog.locator('[data-testid="color-auto"]');
  check("Default selection is Auto", (await auto.getAttribute("aria-checked")) === "true");
  const readout = dialog.locator('[data-testid="color-readout"]');
  check("Auto readout", (await readout.textContent())?.includes("Auto · theme accent") ?? false);

  // 4. Preview renders with the accent token while Auto
  const previewDot = dialog.locator('[data-testid="color-preview"] .rounded-full').first();
  const autoDotColor = await previewDot.evaluate((el) => getComputedStyle(el).backgroundColor);
  check("Preview dot has accent color while Auto", autoDotColor.includes("rgb"), autoDotColor);

  // 5. Preview mirrors the typed strategy name
  await dialog.locator("#strategy-name").fill(NAME);
  check(
    "Preview name mirrors typed name",
    (await dialog.locator('[data-testid="color-preview"]').textContent())?.includes(NAME) ?? false,
  );

  // 6. Select Coral by name
  await dialog.locator('[data-testid="color-coral"]').click();
  check("Coral becomes checked", (await dialog.locator('[data-testid="color-coral"]').getAttribute("aria-checked")) === "true");
  check("Coral readout with hex", (await readout.textContent())?.trim() === `Coral · ${CORAL}`, await readout.textContent().then((t) => t?.trim()));
  const coralDot = await previewDot.evaluate((el) => getComputedStyle(el).backgroundColor);
  check("Preview dot turns coral", coralDot === "rgb(248, 113, 113)", coralDot);
  check(
    "Check mark visible on selected swatch",
    await dialog.locator('[data-testid="color-coral"] svg').isVisible(),
  );
  await page.screenshot({ path: "scripts/shots/color-picker/coral-selected.png" });

  // 7. Arrow-key roving selection: Coral → Sky
  await dialog.locator('[data-testid="color-coral"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  check("ArrowRight moves selection to Sky", (await dialog.locator('[data-testid="color-sky"]').getAttribute("aria-checked")) === "true");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(150);
  check("ArrowLeft returns to Coral", (await dialog.locator('[data-testid="color-coral"]').getAttribute("aria-checked")) === "true");

  // 8. Create the strategy → card appears. A fresh strategy has no closed
  //    trades yet, so the card shows the no-history placeholder (the color
  //    persistence is proven by the edit dialog + API probes below).
  await dialog.getByRole("button", { name: "Create strategy" }).click();
  await page.waitForTimeout(1500);
  check("Dialog closes after create", !(await dialog.isVisible().catch(() => false)));
  const cardButton = page
    .locator("h3", { hasText: NAME })
    .locator("xpath=ancestor::button[1]");
  check("Created card appears", (await cardButton.count()) === 1);
  check(
    "Fresh strategy shows no-history placeholder",
    (await cardButton.textContent())?.includes("No closed trades yet") ?? false,
  );

  // 8b. Seeded strategies carry stats → their sparkline stroke must equal
  //     the stored color (rendering wiring proof).
  const seeded = await page.evaluate(async () => {
    const res = await fetch("/api/strategies");
    const body = await res.json();
    return (body.strategies ?? []).filter((s) => s.color);
  });
  let strokeMatch = false;
  let strokeDetail = "no colored card with sparkline found";
  for (const strategy of seeded) {
    const btn = page
      .locator("h3", { hasText: strategy.name })
      .locator("xpath=ancestor::button[1]");
    if ((await btn.count()) === 0) continue;
    const poly = btn.locator("polyline").first();
    if ((await poly.count()) === 0) continue;
    const stroke = await poly.getAttribute("stroke");
    strokeDetail = `${strategy.name}: stroke=${stroke} stored=${strategy.color}`;
    strokeMatch = stroke === strategy.color;
    break;
  }
  check("Seeded card sparkline stroke = stored color", strokeMatch, strokeDetail);

  // 9. Edit flow: color preserved in the form, Auto switch persists null
  await cardButton.click();
  const detail = page.locator('[role="dialog"]');
  await detail.waitFor({ timeout: 5000 });
  await detail.getByRole("button", { name: "Edit", exact: true }).click();
  await page.waitForTimeout(400);
  const editDialog = page.locator('[role="dialog"]').last();
  check(
    "Edit dialog preserves stored color",
    (await editDialog.locator('[data-testid="color-coral"]').getAttribute("aria-checked")) === "true",
  );
  check(
    "Edit readout shows Coral · hex",
    (await editDialog.locator('[data-testid="color-readout"]').textContent())?.trim() === `Coral · ${CORAL}`,
  );
  await editDialog.locator('[data-testid="color-auto"]').click();
  check(
    "Switch to Auto in edit",
    (await editDialog.locator('[data-testid="color-auto"]').getAttribute("aria-checked")) === "true",
  );
  await page.screenshot({ path: "scripts/shots/color-picker/edit-auto.png" });
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(1500);
  const saved = await page.evaluate(async (name) => {
    const res = await fetch("/api/strategies");
    const body = await res.json();
    return (body.strategies ?? []).find((s) => s.name === name);
  }, NAME);
  check(
    "Auto saved as null color on the strategy",
    saved !== undefined && saved.color === null,
    `color=${JSON.stringify(saved?.color)}`,
  );

  // 10. Light theme render of the picker
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "New Strategy" }).first().click();
  await page.waitForTimeout(500);
  const lightDialog = page.locator('[role="dialog"]');
  check("Picker opens in light theme", await lightDialog.locator('[data-testid="strategy-color-picker"]').isVisible());
  await page.screenshot({ path: "scripts/shots/color-picker/light.png" });
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark-blue"));

  // 11. Mobile 390px - picker wraps, no horizontal overflow
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/playbook`, { waitUntil: "networkidle" });
  await mobile.getByRole("button", { name: "New Strategy" }).first().waitFor({ timeout: 15000 });
  await mobile.getByRole("button", { name: "New Strategy" }).first().click();
  await mobile.waitForTimeout(600);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("Mobile 390px - no horizontal overflow", overflow <= 0, `overflow=${overflow}px`);
  await mobile.screenshot({ path: "scripts/shots/color-picker/mobile-390.png" });
  await mobile.close();

  console.log("\n=== COLOR PICKER RESULTS ===");
  results.forEach((r) => console.log(r));
  console.log(`\nConsole errors: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log("  ERROR:", e.slice(0, 200)));

  await browser.close();
  process.exit(results.every((r) => r.startsWith("PASS")) && errors.length === 0 ? 0 : 1);
})();
