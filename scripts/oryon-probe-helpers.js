/**
 * Shared probe helpers for the Oryon verification scripts — the catalog-
 * driven toolbar v2/v3 interaction shim.
 *
 * History: the v1 rail exposed FLAT buttons (`oryon-tool-trendline`, …).
 * Toolbar v2 moved to split controls + grouped flyouts (`oryon-tool-caret-*
 * / oryon-tool-item-*`) — the P2/P3/P7 probes kept the v1 selectors and
 * silently timed out (the documented "dérive sondes"). This module restores
 * them: ONE arming helper driven by the same group mapping as the catalog.
 */

/** tool → rail group id (mirrors lib/oryon/tools/catalog.ts). */
const TOOL_GROUP = {
  cursor: "cursors",
  "cursor-cross": "cursors",
  "cursor-dot": "cursors",
  eraser: "cursors",
  trend: "trend",
  ray: "trend",
  extended: "trend",
  hline: "trend",
  vline: "trend",
  crossline: "trend",
  fib: "fib",
  fibext: "fib",
  measure: "forecast",
  pricerange: "forecast",
  daterange: "forecast",
  longpos: "forecast",
  shortpos: "forecast",
  rect: "shapes",
  ellipse: "shapes",
  brush: "shapes",
  text: "text",
  "arrow-up": "text",
  "arrow-down": "text",
  "arrow-left": "text",
  "arrow-right": "text",
};

/** v1 probe names → v2 catalog tool ids. */
const LEGACY_TOOL_ALIAS = {
  pointer: "cursor",
  trendline: "trend",
};

/**
 * Arms a drawing tool through the rail flyout (caret → item → settle).
 * The settle wait lets the Radix popover exit animation finish — a chart
 * click landing inside the exiting popover is swallowed (observed).
 */
async function armTool(page, tool) {
  const id = LEGACY_TOOL_ALIAS[tool] ?? tool;
  const group = TOOL_GROUP[id];
  if (group === undefined) throw new Error(`armTool: unknown tool "${tool}"`);
  await page.click(`[data-testid="oryon-tool-caret-${group}"]`);
  await page.waitForSelector(`[data-testid="oryon-tool-item-${id}"]`, { timeout: 5_000 });
  await page.click(`[data-testid="oryon-tool-item-${id}"]`);
  await page.waitForTimeout(280);
}

/** True when the tool is the ACTIVE one (flyout item aria-checked). */
async function isToolArmed(page, tool) {
  const id = LEGACY_TOOL_ALIAS[tool] ?? tool;
  const group = TOOL_GROUP[id];
  await page.click(`[data-testid="oryon-tool-caret-${group}"]`);
  await page.waitForSelector(`[data-testid="oryon-tool-item-${id}"]`, { timeout: 5_000 });
  const checked = await page
    .locator(`[data-testid="oryon-tool-item-${id}"]`)
    .getAttribute("aria-checked");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  return checked === "true";
}

/** Sidebar navigation to a SPA route (the v1 `aref=` hack is long gone). */
async function navTo(page, href) {
  const link = page.locator(`nav[aria-label="Main navigation"] a[href="${href}"]`).first();
  await link.waitFor({ state: "visible", timeout: 30_000 });
  await link.click();
}

module.exports = { armTool, isToolArmed, navTo, TOOL_GROUP, LEGACY_TOOL_ALIAS };
