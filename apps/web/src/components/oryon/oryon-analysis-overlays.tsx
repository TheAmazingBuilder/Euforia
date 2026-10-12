"use client";

import * as React from "react";

import type { AssetClass, Candle, MarketInterval, OryonPanelAnalysis } from "@cosmoz/shared";

import { useInstruments } from "@/lib/api/queries";
import { useCandles } from "@/lib/realtime/market";
import type { OryonChartEngine, OryonStructureMarkerSpec } from "@/lib/charting/oryon-chart-engine";
import type { OryonKeyLevelSpec } from "@/lib/charting/oryon-key-levels";
import type { OryonRangeBoxSpec } from "@/lib/charting/oryon-range-box-overlay";
import type { OryonStructureLineSpec } from "@/lib/charting/oryon-structure-lines";
import { intervalToMs, isIntraday } from "@/lib/charting/oryon-intervals";
import {
  classifyPivots,
  detectPivots,
} from "@/lib/oryon/structure/pivots";
import { detectStructureBreaks } from "@/lib/oryon/structure/breaks";
import {
  computePreviousDayLevels,
  computePreviousWeekLevels,
} from "@/lib/oryon/levels/levels";
import { computeOpeningRange } from "@/lib/oryon/levels/opening-range";
import { sessionDefinitionById } from "@/lib/oryon/sessions/definitions";

/**
 * Oryon analysis bridges (Phase 9 spec §6) — the ONLY components connecting
 * the workspace to the structure/levels engines.
 *
 * Render discipline (mirrors the Phase 8 context bridges): the component
 * renders null and pushes PURE SPECS into the engine imperatively on rare
 * commits (candles window, per-panel analysis config, instrument class,
 * calendar refetch) — no chart reinitialization, no per-render recomputation
 * beyond the memoized engines, no workspace re-render (§10/§14).
 *
 * Data reuse (§9.3/§10): the daily reference series is the app's SHARED
 * useCandles(symbol, "1D") TanStack query — one cache entry per symbol for
 * the whole workspace (panels showing the same instrument share it, and a
 * panel charted on 1D reuses its own history query verbatim). Structure
 * calculations run on the panel's OWN loaded candles — never another
 * panel's data (§9.3 isolation is structural).
 *
 * Honesty: markers anchor to the pivot/break candle's real open time; key
 * levels are REAL aggregated values from the datafeed's daily series (UTC
 * day buckets — the documented convention); a missing day/week is skipped,
 * never zero-filled; an unavailable range/level renders nothing (§11).
 */

/** Instrument class gate for the opening range (Phase 8 session scope). */
const SESSION_SCOPED_CLASSES: ReadonlySet<AssetClass> = new Set([
  "FOREX",
  "METAL",
  "ENERGY",
  "INDEX",
]);

export function OryonAnalysisOverlaysBridge({
  engineRef,
  mounted,
  dataSymbol,
  interval,
  candles,
  analysis,
  pipSize,
}: {
  engineRef: React.RefObject<OryonChartEngine | null>;
  mounted: boolean;
  /** Symbol of the data ACTUALLY displayed — analysis follows the data. */
  dataSymbol: string;
  interval: MarketInterval;
  candles: Candle[];
  analysis: OryonPanelAnalysis;
  /** Instrument pip size (decimal string contract) — distance filter. */
  pipSize: string;
}) {
  // The displayed instrument's class decides the opening-range gate (the
  // shared catalog query — one cache entry for the whole workspace).
  const instruments = useInstruments();
  const assetClass: AssetClass | null =
    instruments.data?.instruments.find((instrument) => instrument.symbol === dataSymbol)
      ?.assetClass ?? null;

  // Parsed pip size — a malformed contract value degrades the distance
  // filter to a no-op (never to a wrong rejection).
  const pipSizeNum = React.useMemo(() => {
    const parsed = Number(pipSize);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [pipSize]);

  // ── structure markers ─────────────────────────────────────────────────
  const structureSpecs = React.useMemo((): OryonStructureMarkerSpec[] => {
    const s = analysis.structure;
    if (!s.enabled || candles.length === 0) return [];
    const pivots = detectPivots({
      candles,
      config: {
        leftBars: s.leftBars,
        rightBars: s.rightBars,
        minDistancePips: s.minDistancePips,
        minSeparationBars: s.minSeparationBars,
      },
      pipSize: pipSizeNum,
    });
    const classified = classifyPivots(pivots);
    const specs: OryonStructureMarkerSpec[] = [];
    for (const pivot of classified) {
      if (pivot.provisional && !s.showProvisional) continue;
      if (pivot.kind === "high" && !s.showSwingHighs) continue;
      if (pivot.kind === "low" && !s.showSwingLows) continue;
      const label = !pivot.provisional && s.showLabels ? pivot.label : undefined;
      specs.push({
        id: `pivot-${pivot.id}`,
        timeSec: pivot.timeSec,
        position: pivot.kind === "high" ? "aboveBar" : "belowBar",
        shape: pivot.provisional
          ? "circle"
          : s.pivotStyle === "circles"
            ? "circle"
            : pivot.kind === "high"
              ? "arrowDown"
              : "arrowUp",
        colorToken: pivot.provisional ? "text-muted" : pivot.kind === "high" ? "cat-ta" : "cat-pa",
        size: pivot.provisional ? 0.8 : 1,
        text: label ?? (pivot.provisional ? "prov" : undefined),
      });
    }
    if (s.breaksEnabled) {
      const breaks = detectStructureBreaks({
        candles,
        pivots,
        rightBars: s.rightBars,
        mode: s.breakMode,
      });
      // With structure LINES on, the line + boxed label own the break
      // annotation end-to-end (which swing, when, what type) — the bare
      // circle markers would only duplicate it on every break candle.
      if (!s.showBreakLines) {
        for (const brk of breaks) {
          specs.push({
            id: `break-${brk.id}`,
            timeSec: brk.timeSec,
            // Bullish breaks mark under the candle, bearish above — the
            // direction is encoded by position AND shape, never color alone.
            position: brk.direction === "bullish" ? "belowBar" : "aboveBar",
            shape: "circle",
            colorToken: brk.type === "CHoCH" ? "warning" : "cat-strategies",
            size: 1.4,
            text: brk.type,
          });
        }
      }
    }
    return specs;
  }, [analysis, candles, pipSizeNum]);

  React.useEffect(() => {
    if (!mounted) return;
    const engine = engineRef.current;
    if (engine === null) return;
    engine.setStructureMarkers(structureSpecs);
  }, [mounted, structureSpecs, engineRef]);

  // ── structure break LINES (refinement) — pivot→break segments ─────────
  const structureLineSpecs = React.useMemo((): OryonStructureLineSpec[] => {
    const s = analysis.structure;
    if (!s.enabled || !s.breaksEnabled || !s.showBreakLines || candles.length === 0) return [];
    const pivots = detectPivots({
      candles,
      config: {
        leftBars: s.leftBars,
        rightBars: s.rightBars,
        minDistancePips: s.minDistancePips,
        minSeparationBars: s.minSeparationBars,
      },
      pipSize: pipSizeNum,
    });
    const pivotById = new Map(pivots.map((pivot) => [pivot.id, pivot]));
    const breaks = detectStructureBreaks({
      candles,
      pivots,
      rightBars: s.rightBars,
      mode: s.breakMode,
    });
    const lines: OryonStructureLineSpec[] = [];
    for (const brk of breaks) {
      const pivot = pivotById.get(brk.pivotId);
      if (pivot === undefined) continue;
      lines.push({
        id: `sline-${brk.id}`,
        startSec: pivot.timeSec,
        endSec: brk.timeSec,
        level: brk.level,
        type: brk.type,
        direction: brk.direction,
        // Direction colors for BOS (the TV convention — bullish break
        // green, bearish red); CHoCH keeps its dedicated warning token.
        colorToken:
          brk.type === "CHoCH"
            ? "warning"
            : brk.direction === "bullish"
              ? "profit"
              : "loss",
      });
    }
    return lines;
  }, [analysis, candles, pipSizeNum]);

  React.useEffect(() => {
    if (!mounted) return;
    const engine = engineRef.current;
    if (engine === null) return;
    engine.setStructureLines(structureLineSpecs);
  }, [mounted, structureLineSpecs, engineRef]);

  // ── key levels (previous day / week from the SHARED daily series) ─────
  const daily = useCandles(dataSymbol, "1D");
  const dailyCandles = daily.data?.candles ?? null;

  const openingRange = React.useMemo(() => {
    const l = analysis.levels;
    if (!l.openingRange) return null;
    if (!isIntraday(interval)) return null; // a 1D chart cannot host an intraday window
    if (assetClass === null || !SESSION_SCOPED_CLASSES.has(assetClass)) return null;
    const session = sessionDefinitionById(l.orSessionId);
    if (session === null) return null;
    const range = computeOpeningRange({
      candles,
      intervalMs: intervalToMs(interval),
      session,
      durationMinutes: l.orDurationMinutes,
    });
    if (range === null) return null;
    // A still-forming range is hidden entirely when the panel opts out.
    if (range.status === "developing" && !l.orShowDeveloping) return null;
    return range;
  }, [analysis, candles, interval, assetClass]);

  const levelSpecs = React.useMemo((): OryonKeyLevelSpec[] => {
    const l = analysis.levels;
    const specs: OryonKeyLevelSpec[] = [];
    if (dailyCandles !== null && dailyCandles.length > 0) {
      if (l.prevDayHighLow || l.prevDayOpenClose) {
        const day = computePreviousDayLevels(dailyCandles);
        if (day !== null) {
          if (l.prevDayHighLow) {
            specs.push({ key: `PDH:${day.periodKey}`, kind: "PDH", price: day.high, title: "PDH" });
            specs.push({ key: `PDL:${day.periodKey}`, kind: "PDL", price: day.low, title: "PDL" });
          }
          if (l.prevDayOpenClose) {
            specs.push({ key: `PDO:${day.periodKey}`, kind: "PDO", price: day.open, title: "PDO" });
            specs.push({ key: `PDC:${day.periodKey}`, kind: "PDC", price: day.close, title: "PDC" });
          }
        }
      }
      if (l.prevWeekHighLow || l.prevWeekOpenClose) {
        const week = computePreviousWeekLevels(dailyCandles);
        if (week !== null) {
          if (l.prevWeekHighLow) {
            specs.push({ key: `PWH:${week.periodKey}`, kind: "PWH", price: week.high, title: "PWH" });
            specs.push({ key: `PWL:${week.periodKey}`, kind: "PWL", price: week.low, title: "PWL" });
          }
          if (l.prevWeekOpenClose) {
            specs.push({ key: `PWO:${week.periodKey}`, kind: "PWO", price: week.open, title: "PWO" });
            specs.push({ key: `PWC:${week.periodKey}`, kind: "PWC", price: week.close, title: "PWC" });
          }
        }
      }
    }
    if (openingRange !== null) {
      const suffix = openingRange.status === "developing" ? "·dev" : "";
      specs.push({
        key: `ORH:${openingRange.startMs}`,
        kind: "ORH",
        price: openingRange.high,
        title: `OR-H${suffix}`,
      });
      specs.push({
        key: `ORL:${openingRange.startMs}`,
        kind: "ORL",
        price: openingRange.low,
        title: `OR-L${suffix}`,
      });
    }
    return specs;
  }, [analysis, dailyCandles, openingRange]);

  React.useEffect(() => {
    if (!mounted) return;
    const engine = engineRef.current;
    if (engine === null) return;
    engine.setKeyLevels(levelSpecs);
  }, [mounted, levelSpecs, engineRef]);

  // ── opening-range shading (the range's own window, never beyond) ──────
  const rangeBoxes = React.useMemo((): OryonRangeBoxSpec[] => {
    if (openingRange === null) return [];
    return [
      {
        id: `or-${openingRange.sessionId}-${openingRange.startMs}`,
        startSec: openingRange.startMs / 1000,
        endSec: openingRange.endMs / 1000,
        highPrice: openingRange.high,
        lowPrice: openingRange.low,
        colorToken: "cat-indicators",
      },
    ];
  }, [openingRange]);

  React.useEffect(() => {
    if (!mounted) return;
    const engine = engineRef.current;
    if (engine === null) return;
    engine.setOpeningRangeBoxes(rangeBoxes);
  }, [mounted, rangeBoxes, engineRef]);

  return null;
}
