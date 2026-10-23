"use client";

import * as React from "react";

import type { AcademyCandle } from "@cosmoz/shared";

import { useInViewOnce, usePrefersReducedMotion } from "@/components/academy/academy-shared";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Academy visual registry — data-driven SVG diagrams for lesson blocks.
 * All color comes from design tokens via CSS variables (style props, so the
 * values resolve); no hardcoded hex per the design hard rule. The registries
 * below are the client-side twin of the block `variant` strings authored
 * server-side — a future CMS would serve the geometry with the blocks.
 */

const PROFIT = "var(--profit)";
const LOSS = "var(--loss)";
const INK = "var(--text-primary)";
const MUTED = "var(--text-muted)";
const ACCENT = "var(--accent)";
const BORDER = "var(--border)";
const WARNING = "var(--warning)";

// ── Candle primitives ────────────────────────────────────────────────────────

type CandleRenderProps = {
  candles: AcademyCandle[];
  /** Viewbox width/height in arbitrary units. */
  width?: number;
  height?: number;
  /** Optional index-labels under candles. */
  labels?: string[];
  className?: string;
  /**
   * Candle inks — CSS color values. Defaults resolve through the
   * --candle-bull/--candle-bear palette variables (see globals.css
   * [data-candle-ink]) falling back to the classic profit/loss pair, so a
   * wrapper can re-ink the whole series for color-independence drills.
   */
  bullInk?: string;
  bearInk?: string;
};

/** Renders a normalized candle series. Bullish = bull ink, bearish = bear ink. */
export function CandleSeries({ candles, width = 300, height = 180, labels, className, bullInk, bearInk }: CandleRenderProps) {
  const { dict } = useI18n();
  const BULL = bullInk ?? "var(--candle-bull, var(--profit))";
  const BEAR = bearInk ?? "var(--candle-bear, var(--loss))";
  const pad = 14;
  const highs = candles.map((candle) => candle.h);
  const lows = candles.map((candle) => candle.l);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const span = max - min || 1;

  const slot = (width - pad * 2) / candles.length;
  const bodyWidth = Math.min(slot * 0.62, 26);
  const yOf = (price: number) => pad + (1 - (price - min) / span) * (height - pad * 2);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={dict.academy.visuals.candlestickAria}
      className={className}
      style={{ width: "100%", height: "auto", maxWidth: width }}
    >
      {/* baseline grid — hairlines only, per the design language */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={pad}
          x2={width - pad}
          y1={pad + t * (height - pad * 2)}
          y2={pad + t * (height - pad * 2)}
          style={{ stroke: BORDER, strokeWidth: 0.5, strokeDasharray: "3 4" }}
        />
      ))}
      {candles.map((candle, index) => {
        const x = pad + slot * index + slot / 2;
        const bullish = candle.c >= candle.o;
        const color = bullish ? BULL : BEAR;
        const bodyTop = yOf(Math.max(candle.o, candle.c));
        const bodyBottom = yOf(Math.min(candle.o, candle.c));
        return (
          <g key={index}>
            <line x1={x} x2={x} y1={yOf(candle.h)} y2={yOf(candle.l)} style={{ stroke: color, strokeWidth: 1.4 }} />
            <rect
              x={x - bodyWidth / 2}
              y={bodyTop}
              width={bodyWidth}
              height={Math.max(bodyBottom - bodyTop, 1.6)}
              rx={1}
              style={{
                fill: bullish ? "transparent" : color,
                stroke: color,
                strokeWidth: 1.4,
              }}
            />
          </g>
        );
      })}
      {labels?.map((label, index) => (
        <text
          key={`label-${index}`}
          x={pad + slot * index + slot / 2}
          y={height - 2}
          textAnchor="middle"
          style={{ fill: MUTED, fontSize: 9, fontFamily: "var(--font-mono)" }}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

/** Single candle with OHLC callout — the anatomy diagram. */
function AnatomyCandle({ bearish }: { bearish: boolean }) {
  const { dict } = useI18n();
  // Fixed geometry: one candle + four labels (abstract units).
  const o = bearish ? 42 : 30;
  const cl = bearish ? 30 : 42;
  const h = 50;
  const l = 20;
  const toY = (v: number) => 10 + (1 - (v - l) / (h - l)) * 130;

  const parts: [string, number][] = [
    ["HIGH", h],
    ["OPEN", o],
    ["CLOSE", cl],
    ["LOW", l],
  ];

  return (
    <svg viewBox="0 0 260 150" role="img" aria-label={dict.academy.visuals.anatomyAria} style={{ width: "100%", height: "auto", maxWidth: 260 }}>
      <line x1={130} x2={130} y1={toY(h)} y2={toY(l)} style={{ stroke: INK, strokeWidth: 1.6 }} />
      <rect
        x={112}
        y={toY(Math.max(o, cl))}
        width={36}
        height={Math.max(toY(Math.min(o, cl)) - toY(Math.max(o, cl)), 2)}
        rx={1.5}
        style={{ fill: bearish ? LOSS : "transparent", stroke: INK, strokeWidth: 1.6 }}
      />
      {parts.map(([name, value]) => {
        const y = toY(value);
        const left = name === "CLOSE" || name === "LOW";
        return (
          <g key={name}>
            <line x1={left ? 100 : 160} x2={left ? 112 : 148} y1={y} y2={y} style={{ stroke: MUTED, strokeWidth: 0.8, strokeDasharray: "2 2" }} />
            <text x={left ? 96 : 164} y={y + 3} textAnchor={left ? "end" : "start"} style={{ fill: MUTED, fontSize: 9, fontFamily: "var(--font-mono)" }}>
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Client-side registry: block variant → candle series (abstract units). */
const CANDLE_VARIANTS: Record<string, { candles: AcademyCandle[]; labels?: string[] }> = {
  "anatomy-bull": { candles: [{ o: 30, h: 50, l: 20, c: 42 }] },
  "anatomy-bear": { candles: [{ o: 42, h: 50, l: 20, c: 30 }] },
  doji: { candles: [{ o: 26, h: 34, l: 18, c: 26.1 }] },
  "spinning-top": { candles: [{ o: 25, h: 33, l: 17, c: 27 }] },
  "marubozu-bull": { candles: [{ o: 18, h: 18.4, l: 17.6, c: 34 }] },
  "marubozu-bear": { candles: [{ o: 34, h: 34.4, l: 17.6, c: 18 }] },
  hammer: { candles: [{ o: 30, h: 31, l: 12, c: 31.8 }] },
  "hanging-man": { candles: [{ o: 31, h: 32, l: 13, c: 32.8 }] },
  "inverted-hammer": { candles: [{ o: 14, h: 32, l: 13, c: 15 }] },
  "shooting-star": { candles: [{ o: 30, h: 48, l: 29, c: 31 }] },
  "bullish-engulfing": { candles: [{ o: 32, h: 33, l: 26, c: 26.6 }, { o: 26.2, h: 36, l: 25.8, c: 35.4 }] },
  "bearish-engulfing": { candles: [{ o: 27, h: 34, l: 26.4, c: 33.4 }, { o: 34, h: 34.6, l: 25.6, c: 26.4 }] },
  "tweezer-bottom": { candles: [{ o: 32, h: 33, l: 24, c: 25 }, { o: 25, h: 30, l: 24, c: 29 }] },
  "tweezer-top": { candles: [{ o: 26, h: 34, l: 25, c: 33 }, { o: 33, h: 34, l: 28, c: 29 }] },
  "piercing-line": { candles: [{ o: 34, h: 34.6, l: 26, c: 26.6 }, { o: 25.8, h: 32.5, l: 25.4, c: 31 }] },
  "dark-cloud-cover": { candles: [{ o: 26, h: 34, l: 25.4, c: 33.4 }, { o: 34.4, h: 35, l: 27.5, c: 28.4 }] },
  "morning-star": { candles: [{ o: 34, h: 34.6, l: 27, c: 27.6 }, { o: 27, h: 28.6, l: 25.8, c: 26.4 }, { o: 26.6, h: 34, l: 26.2, c: 33.2 }] },
  "evening-star": { candles: [{ o: 26, h: 33.4, l: 25.4, c: 32.8 }, { o: 33, h: 34.8, l: 32.6, c: 33.6 }, { o: 33.4, h: 34, l: 26.4, c: 27.2 }] },
  "three-white-soldiers": { candles: [{ o: 20, h: 26, l: 19.6, c: 25.6 }, { o: 25, h: 31, l: 24.6, c: 30.6 }, { o: 30, h: 36.5, l: 29.6, c: 36 }] },
  "three-black-crows": { candles: [{ o: 36, h: 36.6, l: 30, c: 30.6 }, { o: 31, h: 31.6, l: 25, c: 25.6 }, { o: 26, h: 26.6, l: 19.5, c: 20 }] },
  "three-inside-up": { candles: [{ o: 33, h: 33.6, l: 25, c: 25.6 }, { o: 26.4, h: 30.5, l: 26, c: 30 }, { o: 30.2, h: 36, l: 30, c: 35.4 }] },
  "displacement-ob": { candles: [{ o: 30, h: 30.5, l: 24, c: 24.6 }, { o: 25, h: 34.5, l: 24.6, c: 34 }, { o: 34.4, h: 38, l: 33.8, c: 37.4 }] },
  fvg: { candles: [{ o: 20, h: 24, l: 19, c: 23.6 }, { o: 27, h: 33, l: 26, c: 32.4 }, { o: 32.8, h: 37, l: 32.2, c: 36.4 }] },
};

export function CandleDiagram({ variant, caption }: { variant: string; caption?: string }) {
  const { dict } = useI18n();
  if (variant === "anatomy-bull") {
    return <Figure caption={caption ?? dict.academy.visuals.anatomyBullCaption}><AnatomyCandle bearish={false} /></Figure>;
  }
  if (variant === "anatomy-bear") {
    return <Figure caption={caption ?? dict.academy.visuals.anatomyBearCaption}><AnatomyCandle bearish /></Figure>;
  }
  const spec = CANDLE_VARIANTS[variant];
  if (!spec) return null;
  return (
    <Figure caption={caption}>
      <CandleSeries candles={spec.candles} labels={spec.labels} />
    </Figure>
  );
}

// ── Structure diagrams (zigzag geometry in a 0-100 box) ─────────────────────

type StructureSpec = {
  points: [number, number][];
  lines?: { y: number; label?: string; tone?: "profit" | "loss" | "muted" | "accent" }[];
  labels?: { x: number; y: number; text: string; tone?: "profit" | "loss" | "muted" | "accent" | "warning" }[];
  zones?: { y1: number; y2: number; label?: string; tone?: "profit" | "loss" | "accent" | "warning" }[];
  fill?: boolean;
};

const S: Record<string, StructureSpec> = {
  uptrend: {
    points: [[6, 78], [26, 58], [20, 66], [46, 44], [40, 54], [66, 30], [60, 40], [90, 18]],
    labels: [{ x: 28, y: 54, text: "HH", tone: "profit" }, { x: 48, y: 70, text: "HL" }, { x: 68, y: 42, text: "HH", tone: "profit" }],
  },
  downtrend: {
    points: [[6, 22], [26, 42], [20, 34], [46, 56], [40, 46], [66, 70], [60, 60], [90, 82]],
    labels: [{ x: 28, y: 46, text: "LL", tone: "loss" }, { x: 48, y: 32, text: "LH" }, { x: 68, y: 58, text: "LL", tone: "loss" }],
  },
  range: {
    points: [[6, 60], [20, 30], [36, 62], [52, 30], [68, 60], [84, 30], [94, 46]],
    lines: [{ y: 30, label: "resistance", tone: "loss" }, { y: 60, label: "support", tone: "profit" }],
  },
  channel: {
    points: [[8, 72], [28, 52], [24, 62], [48, 40], [44, 50], [70, 28], [66, 38], [92, 18]],
    lines: [{ y: 92, label: "", tone: "muted" }],
    labels: [{ x: 30, y: 78, text: "lower rail", tone: "muted" }, { x: 62, y: 20, text: "upper rail", tone: "muted" }],
  },
  "impulse-correction": {
    points: [[8, 80], [24, 40], [40, 58], [48, 54], [58, 60], [78, 22]],
    labels: [{ x: 14, y: 52, text: "impulse", tone: "accent" }, { x: 44, y: 44, text: "correction", tone: "muted" }, { x: 68, y: 34, text: "impulse", tone: "accent" }],
  },
  "breakout-retest": {
    points: [[6, 62], [22, 36], [38, 60], [54, 36], [70, 58], [78, 50], [86, 20], [94, 14]],
    lines: [{ y: 36, label: "broken level → support", tone: "accent" }],
  },
  "consolidation-expansion": {
    points: [[6, 52], [18, 42], [28, 56], [38, 46], [48, 54], [58, 48], [72, 24], [88, 14], [94, 10]],
    labels: [{ x: 22, y: 68, text: "compression", tone: "muted" }, { x: 68, y: 44, text: "expansion", tone: "accent" }],
  },
  "liquidity-sweep": {
    points: [[6, 40], [24, 62], [40, 46], [56, 62], [72, 62.5], [78, 30], [94, 16]],
    lines: [{ y: 62, label: "equal lows - resting stops", tone: "loss" }],
    labels: [{ x: 74, y: 44, text: "sweep", tone: "warning" }],
  },
  hhhl: {
    points: [[6, 78], [26, 58], [20, 66], [46, 44], [40, 54], [66, 30], [60, 40], [90, 18]],
    labels: [{ x: 28, y: 53, text: "HH", tone: "profit" }, { x: 46, y: 71, text: "HL", tone: "profit" }, { x: 68, y: 41, text: "HH", tone: "profit" }, { x: 88, y: 56, text: "HL", tone: "profit" }],
  },
  "bos-up": {
    points: [[6, 70], [30, 52], [22, 62], [52, 40], [44, 50], [78, 28], [94, 22]],
    lines: [{ y: 40, label: "prior swing high", tone: "muted" }],
    labels: [{ x: 62, y: 24, text: "BOS", tone: "accent" }],
  },
  choch: {
    points: [[6, 76], [26, 56], [20, 64], [46, 42], [40, 52], [66, 46], [88, 68]],
    lines: [{ y: 52, label: "last HL", tone: "muted" }],
    labels: [{ x: 74, y: 60, text: "CHoCH", tone: "loss" }],
  },
  "double-top": {
    points: [[6, 66], [24, 28], [40, 56], [60, 29], [80, 78], [94, 84]],
    lines: [{ y: 56, label: "neckline", tone: "accent" }],
    labels: [{ x: 25, y: 22, text: "peak", tone: "muted" }, { x: 61, y: 22, text: "peak", tone: "muted" }],
  },
  "double-bottom": {
    points: [[6, 34], [24, 72], [40, 44], [60, 71], [80, 22], [94, 16]],
    lines: [{ y: 44, label: "neckline", tone: "accent" }],
  },
  "head-shoulders": {
    points: [[6, 56], [20, 36], [32, 50], [50, 18], [68, 50], [82, 37], [94, 74]],
    lines: [{ y: 50, label: "neckline", tone: "accent" }],
    labels: [{ x: 21, y: 31, text: "LS", tone: "muted" }, { x: 50, y: 13, text: "HEAD", tone: "muted" }, { x: 83, y: 32, text: "RS", tone: "muted" }],
  },
  "inverse-head-shoulders": {
    points: [[6, 44], [20, 64], [32, 50], [50, 82], [68, 50], [82, 63], [94, 26]],
    lines: [{ y: 50, label: "neckline", tone: "accent" }],
  },
  "triple-top": {
    points: [[6, 64], [20, 30], [34, 55], [48, 29], [62, 55], [76, 30], [88, 76]],
    lines: [{ y: 55, label: "neckline", tone: "accent" }],
  },
  "bull-flag": {
    points: [[6, 84], [30, 30], [40, 38], [50, 34], [60, 42], [70, 38], [84, 18]],
    labels: [{ x: 16, y: 52, text: "pole", tone: "accent" }, { x: 52, y: 52, text: "flag", tone: "muted" }],
  },
  "bear-flag": {
    points: [[6, 16], [30, 70], [40, 62], [50, 66], [60, 58], [70, 62], [84, 82]],
    labels: [{ x: 16, y: 46, text: "pole", tone: "accent" }, { x: 52, y: 48, text: "flag", tone: "muted" }],
  },
  "ascending-triangle": {
    points: [[6, 60], [20, 30], [34, 55], [48, 32], [62, 52], [76, 34], [90, 12]],
    lines: [{ y: 30, label: "flat resistance", tone: "loss" }],
  },
  "descending-triangle": {
    points: [[6, 40], [20, 70], [34, 45], [48, 68], [62, 48], [76, 66], [90, 88]],
    lines: [{ y: 70, label: "flat support", tone: "profit" }],
  },
  "symmetrical-triangle": {
    points: [[6, 62], [20, 32], [34, 56], [48, 38], [62, 50], [76, 44], [90, 40], [96, 42]],
    labels: [{ x: 34, y: 70, text: "coiling", tone: "muted" }],
  },
  "rising-wedge": {
    points: [[6, 78], [22, 58], [36, 64], [52, 46], [66, 52], [80, 38], [92, 32], [96, 30]],
    labels: [{ x: 40, y: 82, text: "momentum decaying", tone: "muted" }],
  },
  "falling-wedge": {
    points: [[6, 22], [22, 42], [36, 36], [52, 54], [66, 48], [80, 62], [92, 68], [96, 70]],
    labels: [{ x: 40, y: 18, text: "selling pressure fading", tone: "muted" }],
  },
  rectangle: {
    points: [[6, 62], [20, 32], [36, 60], [52, 32], [68, 62], [84, 32], [94, 20]],
    lines: [{ y: 32, label: "supply", tone: "loss" }, { y: 62, label: "demand", tone: "profit" }],
  },
  "cup-handle": {
    points: [[6, 28], [18, 52], [34, 72], [50, 78], [66, 64], [80, 36], [86, 46], [92, 42], [98, 16]],
    lines: [{ y: 30, label: "lip", tone: "accent" }],
    labels: [{ x: 46, y: 90, text: "cup", tone: "muted" }, { x: 88, y: 56, text: "handle", tone: "muted" }],
  },
  "trend-range-states": {
    points: [[6, 52], [16, 34], [28, 54], [40, 36], [52, 52], [64, 38], [78, 54], [90, 22], [96, 16]],
    lines: [{ y: 34, label: "range high → trend", tone: "muted" }],
    labels: [{ x: 30, y: 66, text: "range", tone: "muted" }, { x: 84, y: 40, text: "breakout", tone: "accent" }],
  },
};

const TONE_COLOR: Record<string, string> = {
  profit: PROFIT,
  loss: LOSS,
  muted: MUTED,
  accent: ACCENT,
  warning: WARNING,
};

function StructureDiagramSvg({ spec }: { spec: StructureSpec }) {
  const W = 300;
  const H = 150;
  const px = (x: number) => (x / 100) * W;
  const py = (y: number) => (y / 100) * H;
  const path = spec.points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${px(x)} ${py(y)}`).join(" ");
  const { dict } = useI18n();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={dict.academy.visuals.structureAria} style={{ width: "100%", height: "auto", maxWidth: 380 }}>
      {[0.33, 0.66].map((t) => (
        <line key={t} x1={8} x2={W - 8} y1={H * t} y2={H * t} style={{ stroke: BORDER, strokeWidth: 0.5, strokeDasharray: "3 4" }} />
      ))}
      {spec.zones?.map((zone, index) => (
        <rect
          key={`zone-${index}`}
          x={8}
          y={py(zone.y1)}
          width={W - 16}
          height={Math.max(py(zone.y2) - py(zone.y1), 3)}
          style={{ fill: TONE_COLOR[zone.tone ?? "accent"], opacity: 0.08 }}
        />
      ))}
      {spec.lines?.map((line, index) => (
        <g key={`line-${index}`}>
          <line x1={8} x2={W - 8} y1={py(line.y)} y2={py(line.y)} style={{ stroke: TONE_COLOR[line.tone ?? "muted"], strokeWidth: 1, strokeDasharray: "5 4", opacity: 0.8 }} />
          {line.label ? (
            <text x={W - 12} y={py(line.y) - 4} textAnchor="end" style={{ fill: TONE_COLOR[line.tone ?? "muted"], fontSize: 9, fontFamily: "var(--font-mono)" }}>
              {line.label}
            </text>
          ) : null}
        </g>
      ))}
      <path d={path} fill="none" style={{ stroke: INK, strokeWidth: 1.8, strokeLinejoin: "round", strokeLinecap: "round" }} />
      {spec.points.map(([x, y], index) => (
        <circle key={`pt-${index}`} cx={px(x)} cy={py(y)} r={2.2} style={{ fill: INK }} />
      ))}
      {spec.labels?.map((label, index) => (
        <text key={`lb-${index}`} x={px(label.x)} y={py(label.y)} style={{ fill: TONE_COLOR[label.tone ?? "muted"], fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
          {label.text}
        </text>
      ))}
    </svg>
  );
}

export function StructureFigure({ variant, caption }: { variant: string; caption?: string }) {
  const spec = S[variant];
  if (!spec) return null;
  return (
    <Figure caption={caption}>
      <StructureDiagramSvg spec={spec} />
    </Figure>
  );
}

// ── Zones & risk diagrams ────────────────────────────────────────────────────

export function ZonesFigure({ variant, caption }: { variant: string; caption?: string }) {
  const { dict } = useI18n();
  const spec: StructureSpec =
    variant === "support-resistance"
      ? {
          points: [[6, 52], [18, 26], [32, 62], [46, 27], [60, 61], [74, 28], [88, 50]],
          zones: [{ y1: 20, y2: 32, label: "supply", tone: "loss" }, { y1: 56, y2: 68, label: "demand", tone: "profit" }],
        }
      : {
          points: [[6, 50], [20, 30], [36, 62], [52, 34], [68, 60], [84, 38], [94, 44]],
          zones: [{ y1: 24, y2: 36, tone: "loss" }, { y1: 56, y2: 68, tone: "profit" }],
        };
  return (
    <Figure caption={caption ?? dict.academy.visuals.zonesCaption}>
      <StructureDiagramSvg spec={spec} />
    </Figure>
  );
}

function DrawdownFigure() {
  // Equity curve rising, then drawing down, then partial recovery.
  const { dict } = useI18n();
  const path = "M 8 40 L 40 26 L 66 34 L 96 18 L 128 44 L 160 62 L 192 70 L 224 52 L 252 44 L 286 30";
  const peakX = 96;
  const peakY = 18;
  const troughX = 192;
  const troughY = 70;
  return (
    <svg viewBox="0 0 300 150" role="img" aria-label={dict.academy.visuals.drawdownAria} style={{ width: "100%", height: "auto", maxWidth: 380 }}>
      <line x1={8} x2={292} y1={peakY} y2={peakY} style={{ stroke: PROFIT, strokeWidth: 0.8, strokeDasharray: "5 4" }} />
      <line x1={8} x2={292} y1={troughY} y2={troughY} style={{ stroke: LOSS, strokeWidth: 0.8, strokeDasharray: "5 4" }} />
      <rect x={peakX} y={peakY} width={troughX - peakX} height={troughY - peakY} style={{ fill: LOSS, opacity: 0.1 }} />
      <path d={path} fill="none" style={{ stroke: INK, strokeWidth: 1.8, strokeLinejoin: "round" }} />
      <text x={100} y={48} style={{ fill: LOSS, fontSize: 10, fontFamily: "var(--font-mono)" }}>
        drawdown −X%
      </text>
      <text x={210} y={92} style={{ fill: PROFIT, fontSize: 10, fontFamily: "var(--font-mono)" }}>
        recovery +Y% (Y &gt; X)
      </text>
      <text x={12} y={14} style={{ fill: MUTED, fontSize: 9, fontFamily: "var(--font-mono)" }}>
        equity peak
      </text>
    </svg>
  );
}

function RiskRewardFigure() {
  // Entry line, stop below, target above — asymmetric bars.
  const { dict } = useI18n();
  return (
    <svg viewBox="0 0 300 150" role="img" aria-label={dict.academy.visuals.riskRewardAria} style={{ width: "100%", height: "auto", maxWidth: 380 }}>
      <rect x={40} y={70} width={220} height={8} style={{ fill: MUTED, opacity: 0.25 }} />
      <text x={266} y={79} style={{ fill: MUTED, fontSize: 10, fontFamily: "var(--font-mono)" }}>
        entry
      </text>
      <rect x={60} y={78} width={40} height={50} rx={2} style={{ fill: LOSS, opacity: 0.35 }} />
      <text x={62} y={140} style={{ fill: LOSS, fontSize: 10, fontFamily: "var(--font-mono)" }}>
        risk 1R (stop)
      </text>
      <rect x={140} y={22} width={40} height={48} rx={2} style={{ fill: PROFIT, opacity: 0.35 }} />
      <text x={130} y={16} style={{ fill: PROFIT, fontSize: 10, fontFamily: "var(--font-mono)" }}>
        reward 2R–3R (target)
      </text>
      <line x1={40} x2={260} y1={128} y2={128} style={{ stroke: LOSS, strokeWidth: 1, strokeDasharray: "5 4" }} />
      <text x={110} y={124} style={{ fill: LOSS, fontSize: 9, fontFamily: "var(--font-mono)" }}>
        stop level
      </text>
    </svg>
  );
}

export function RiskFigure({ variant, caption }: { variant: string; caption?: string }) {
  return (
    <Figure caption={caption}>
      {variant === "rr" ? <RiskRewardFigure /> : <DrawdownFigure />}
    </Figure>
  );
}

// ── Shared figure frame ──────────────────────────────────────────────────────

/**
 * Figure frame with a scroll-reveal: the chart wipes in left-to-right and
 * rises slightly the first time it enters the viewport — the "chart drawing
 * itself" moment, in the ledger language. Honors prefers-reduced-motion.
 *
 * NOTE: the observer sits on the <figure> wrapper, NOT on the animated div —
 * the div's own clip-path would zero its intersection box and deadlock the
 * reveal (IntersectionObserver honors the target's clip).
 */
function Figure({ children, caption }: { children: React.ReactNode; caption?: string }) {
  const { ref, inView } = useInViewOnce<HTMLElement>("0px 0px -4% 0px");
  const reducedMotion = usePrefersReducedMotion();
  const shown = inView || reducedMotion;

  return (
    <figure ref={ref} className="my-4 overflow-hidden rounded-lg border border-border bg-surface">
      <div
        className="chart-paper flex items-center justify-center px-4 py-5"
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? "none" : "translateY(10px)",
          clipPath: shown ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
          transition: reducedMotion
            ? "none"
            : "opacity 500ms ease-out, transform 700ms cubic-bezier(0.16,1,0.3,1), clip-path 900ms cubic-bezier(0.16,1,0.3,1)",
        }}
        data-shown={shown ? "true" : "false"}
      >
        {children}
      </div>
      {caption ? (
        <figcaption className="border-t border-border px-4 py-2 text-xs leading-relaxed text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Dispatcher used by the lesson renderer. */
export function VisualBlock({ kind, variant, caption }: { kind: "candles" | "structure" | "zones" | "risk"; variant: string; caption?: string }) {
  if (kind === "candles") return <CandleDiagram variant={variant} caption={caption} />;
  if (kind === "structure") return <StructureFigure variant={variant} caption={caption} />;
  if (kind === "zones") return <ZonesFigure variant={variant} caption={caption} />;
  return <RiskFigure variant={variant} caption={caption} />;
}
