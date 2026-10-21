import type { BrokerPosition } from "@cosmoz/shared";

import { positionShortLabel, sideLabel } from "./match";

/**
 * Position overlay SPEC + structural diff (Phase 4 spec §8.1–§8.6) — PURE.
 *
 * The chart manager (lib/charting/oryon-position-overlays.ts) consumes the
 * diff and applies it through the engine's supported API
 * (`series.createPriceLine` / `IPriceLine.applyOptions` /
 * `series.removePriceLine`). Everything testable about the overlay logic —
 * filtering, level extraction, titles, diffing — lives HERE, without DOM,
 * without Lightweight Charts, so it is unit-testable in isolation (Phase 4
 * spec §13 "chart overlay tests" on the logic layer).
 *
 * Lifecycle contract implemented by the diff:
 *   - stable keys (`positionId:level`) — lines update IN PLACE on every
 *     mark-to-market snapshot instead of being destroyed and recreated;
 *   - removed positions / cleared levels → "remove" ops (no orphan lines,
 *     no duplicates after repeated updates);
 *   - selection only changes lineWidth (update op), never identity.
 */

export type PositionLevel = "entry" | "sl" | "tp";

/** One chart line derived from ONE validated position field. */
export interface PositionLineSpec {
  /** Stable identity: `${positionId}:${level}` — never reused across positions. */
  key: string;
  positionId: string;
  level: PositionLevel;
  /** Raw price the line anchors to (chart price domain — broker value). */
  price: number;
  side: "LONG" | "SHORT";
  /** Pre-composed short title painted on the line (concise, PRD §12.1). */
  title: string;
  selected: boolean;
}

/**
 * Levels of one position that are VALID to draw:
 *   - entry: always (a position without an entry price is not renderable —
 *     the schema makes entryPrice mandatory, so this is belt-and-braces);
 *   - SL / TP: ONLY when the field is present, finite and positive — a
 *     missing or invalid level is never invented, never defaulted (§8.2/§8.3).
 */
export function positionLineSpecsFor(
  position: BrokerPosition,
  selectedId: string | null,
): PositionLineSpec[] {
  const specs: PositionLineSpec[] = [];
  const side = sideLabel(position.direction);
  const label = positionShortLabel(position.id);
  const selected = position.id === selectedId;

  const entry = Number(position.entryPrice);
  if (Number.isFinite(entry) && entry > 0) {
    specs.push({
      key: `${position.id}:entry`,
      positionId: position.id,
      level: "entry",
      price: entry,
      side,
      title: `${side} ${position.volume} ${label}`,
      selected,
    });
  }

  const sl = position.stopLoss !== null ? Number(position.stopLoss) : NaN;
  if (Number.isFinite(sl) && sl > 0) {
    specs.push({
      key: `${position.id}:sl`,
      positionId: position.id,
      level: "sl",
      price: sl,
      side,
      title: `${label} SL`,
      selected,
    });
  }

  const tp = position.takeProfit !== null ? Number(position.takeProfit) : NaN;
  if (Number.isFinite(tp) && tp > 0) {
    specs.push({
      key: `${position.id}:tp`,
      positionId: position.id,
      level: "tp",
      price: tp,
      side,
      title: `${label} TP`,
      selected,
    });
  }

  return specs;
}

/**
 * Full spec list for the chart's active instrument: positions are filtered
 * upstream (exact symbol match), here they are expanded level by level.
 * `digitsHint` (instrument digits when the position matched a catalog
 * instrument) is currently unused by the line drawing itself — the axis
 * label follows the series price format — but the hint keeps the door
 * explicit for per-position precision without changing the signature.
 */
export function buildPositionLineSpecs(
  positions: readonly BrokerPosition[],
  selectedId: string | null,
  digitsHint: number | null = null,
): PositionLineSpec[] {
  void digitsHint;
  return positions.flatMap((position) => positionLineSpecsFor(position, selectedId));
}

export type PositionLineDiff =
  | { op: "create"; spec: PositionLineSpec }
  | { op: "update"; spec: PositionLineSpec }
  | { op: "remove"; key: string };

function sameSpec(a: PositionLineSpec, b: PositionLineSpec): boolean {
  return (
    a.price === b.price &&
    a.side === b.side &&
    a.title === b.title &&
    a.selected === b.selected
  );
}

/**
 * Structural diff between the rendered specs and the next specs.
 * Order: removals first (frees identities), then creates, then updates —
 * a replayed identical snapshot produces an EMPTY diff (idempotent apply).
 */
export function diffPositionLines(
  previous: readonly PositionLineSpec[],
  next: readonly PositionLineSpec[],
): PositionLineDiff[] {
  const previousByKey = new Map(previous.map((spec) => [spec.key, spec]));
  const nextByKey = new Map(next.map((spec) => [spec.key, spec]));
  const ops: PositionLineDiff[] = [];

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
