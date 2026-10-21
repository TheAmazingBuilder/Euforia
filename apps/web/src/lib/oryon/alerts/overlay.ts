import type { OryonAlert } from "@cosmoz/shared";

/**
 * Alert overlay SPEC + structural diff (Phase 5 spec §7) — PURE.
 *
 * Mirrors the position overlay contract (lib/oryon/positions/overlay.ts):
 * the chart manager (lib/charting/oryon-alert-overlays.ts) consumes the diff
 * and applies it through the engine's supported API (`series.createPriceLine`
 * / `IPriceLine.applyOptions` / `series.removePriceLine`). Everything
 * testable about the overlay logic — filtering, level extraction, titles,
 * diffing — lives HERE, without DOM, without Lightweight Charts.
 *
 * Lifecycle contract:
 *   - stable key = the alert id (one line per alert) — lines update IN PLACE
 *     on store commits instead of being destroyed and recreated;
 *   - an alert that stops being eligible (removed, disabled, triggered, or
 *     its symbol no longer matches the displayed instrument) produces a
 *     "remove" op — no orphan lines, no duplicates after repeated updates;
 *   - ONLY active alerts are drawn (spec §7: display ACTIVE alerts; a
 *     triggered alert leaves the chart and lives in the panel history);
 *   - symbol matching is EXACT after trim+uppercase — never a substring
 *     (BTCUSD ≠ BTCUSDT, the Phase 4 invariant).
 */

export interface AlertLineSpec {
  /** Stable identity: the alert id — never reused while the alert exists. */
  key: string;
  alertId: string;
  /** Threshold the line anchors to (chart price domain). */
  price: number;
  condition: "crosses_above" | "crosses_below";
  /** Pre-composed short title painted on the line (concise). */
  title: string;
}

/** The arrow glyphs echo the condition semantics on the chart itself. */
function alertTitle(alert: OryonAlert): string {
  const arrow = alert.condition === "crosses_above" ? "▲" : "▼";
  const label = alert.label !== null && alert.label.trim().length > 0 ? alert.label.trim() : null;
  return label === null ? `${arrow} Alert` : `${arrow} ${label}`.slice(0, 24);
}

/** The single line derived from one alert — null when not renderable. */
export function alertLineSpecFor(alert: OryonAlert): AlertLineSpec | null {
  if (alert.status !== "active") return null;
  const price = Number(alert.targetPrice);
  if (!Number.isFinite(price)) return null;
  return {
    key: alert.id,
    alertId: alert.id,
    price,
    condition: alert.condition,
    title: alertTitle(alert),
  };
}

/** Specs for the chart's DISPLAYED instrument (exact symbol match). */
export function buildAlertLineSpecs(
  alerts: readonly OryonAlert[],
  symbol: string,
): AlertLineSpec[] {
  const upper = symbol.trim().toUpperCase();
  if (upper.length === 0) return [];
  return alerts
    .filter((alert) => alert.symbol.trim().toUpperCase() === upper)
    .map((alert) => alertLineSpecFor(alert))
    .filter((spec): spec is AlertLineSpec => spec !== null);
}

export type AlertLineDiff =
  | { op: "create"; spec: AlertLineSpec }
  | { op: "update"; spec: AlertLineSpec }
  | { op: "remove"; key: string };

function sameSpec(a: AlertLineSpec, b: AlertLineSpec): boolean {
  return a.price === b.price && a.condition === b.condition && a.title === b.title;
}

/**
 * Structural diff between the rendered specs and the next specs — a replayed
 * identical snapshot produces an EMPTY diff (idempotent apply).
 */
export function diffAlertLines(
  previous: readonly AlertLineSpec[],
  next: readonly AlertLineSpec[],
): AlertLineDiff[] {
  const previousByKey = new Map(previous.map((spec) => [spec.key, spec]));
  const nextByKey = new Map(next.map((spec) => [spec.key, spec]));
  const ops: AlertLineDiff[] = [];

  for (const [key] of previousByKey) {
    if (!nextByKey.has(key)) ops.push({ op: "remove", key });
  }
  for (const [key, spec] of nextByKey) {
    const before = previousByKey.get(key);
    if (before === undefined) ops.push({ op: "create", spec });
    else if (!sameSpec(before, spec)) ops.push({ op: "update", spec });
  }
  return ops;
}
