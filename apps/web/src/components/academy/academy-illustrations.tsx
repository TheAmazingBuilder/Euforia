"use client";

import * as React from "react";

import { hueOf, tint } from "@/components/academy/academy-shared";

/**
 * Academy illustration registry - one authored SVG "chart vignette" per
 * course: the concept the course teaches, drawn in the ledger chart language
 * (token inks, hairline grid, mono annotations). Colors come exclusively from
 * CSS variables (design hard rule §9 - zero hex in .tsx); the wash and hero
 * strokes carry the course category's identity hue, so every illustration
 * re-tints with the theme.
 *
 * The registries below are the client-side twin of the course catalog - a
 * future CMS would serve the geometry next to the course records.
 */

type P = [number, number];

const INK = "var(--text-primary)";
const MUTED = "var(--text-muted)";
const BORDER = "var(--border)";
const PROFIT = "var(--profit)";
const LOSS = "var(--loss)";

// ── Geometry helpers ─────────────────────────────────────────────────────────

function poly(points: P[]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}

/** Catmull-Rom → cubic bézier: buttery curves for price/indicator lines. */
function smooth(points: P[]): string {
  if (points.length < 3) return poly(points);
  const d: string[] = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1);
    const c1y = (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1);
    const c2x = (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1);
    const c2y = (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1);
    d.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`);
  }
  return d.join(" ");
}

function Label({
  x,
  y,
  children,
  color = MUTED,
  anchor = "start",
  size = 8.5,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  color?: string;
  anchor?: "start" | "middle" | "end";
  size?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      style={{ fill: color, fontSize: size, fontFamily: "var(--font-mono)", fontWeight: 600, letterSpacing: "0.04em" }}
    >
      {children}
    </text>
  );
}

function Line({
  d,
  color = INK,
  width = 1.6,
  dash,
  opacity = 1,
  smooth: useSmooth = false,
}: {
  d: P[];
  color?: string;
  width?: number;
  dash?: string;
  opacity?: number;
  smooth?: boolean;
}) {
  return (
    <path
      d={useSmooth ? smooth(d) : poly(d)}
      fill="none"
      style={{ stroke: color, strokeWidth: width, strokeLinecap: "round", strokeLinejoin: "round", opacity }}
      strokeDasharray={dash}
    />
  );
}

function Dot({ x, y, color = INK, r = 2.4, hollow = false }: { x: number; y: number; color?: string; r?: number; hollow?: boolean }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={r}
      style={hollow ? { fill: "none", stroke: color, strokeWidth: 1.4 } : { fill: color }}
    />
  );
}

/** One candle in pixel space (top of rect = higher price). */
function Candle({
  x,
  high,
  low,
  bodyTop,
  bodyBottom,
  bullish,
  color,
  bodyW = 12,
  filled,
}: {
  x: number;
  high: number;
  low: number;
  bodyTop: number;
  bodyBottom: number;
  bullish: boolean;
  color?: string;
  bodyW?: number;
  filled?: boolean;
}) {
  const ink = color ?? (bullish ? PROFIT : LOSS);
  const solid = filled ?? !bullish;
  return (
    <g>
      <line x1={x} x2={x} y1={high} y2={low} style={{ stroke: ink, strokeWidth: 1.3 }} />
      <rect
        x={x - bodyW / 2}
        y={Math.min(bodyTop, bodyBottom)}
        width={bodyW}
        height={Math.max(Math.abs(bodyBottom - bodyTop), 1.6)}
        rx={1}
        style={{ fill: solid ? ink : "transparent", stroke: ink, strokeWidth: 1.3 }}
      />
    </g>
  );
}

function Zone({
  y1,
  y2,
  color,
  x1 = 18,
  x2 = 302,
  opacity = 0.1,
}: {
  y1: number;
  y2: number;
  color: string;
  x1?: number;
  x2?: number;
  opacity?: number;
}) {
  return <rect x={x1} y={y1} width={x2 - x1} height={Math.max(y2 - y1, 2)} style={{ fill: color, opacity }} />;
}

// ── The frame: tinted wash + hairline grid + corner tag ──────────────────────

function ArtFrame({
  hue,
  label,
  title,
  children,
}: {
  hue: string;
  label?: string;
  title: string;
  children: React.ReactNode;
}) {
  const gridX = [44, 88, 132, 176, 220, 264];
  const gridY = [30, 60, 90, 120];
  return (
    <svg
      viewBox="0 0 320 150"
      role="img"
      aria-label={title}
      preserveAspectRatio="xMidYMid slice"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <rect x={0} y={0} width={320} height={150} style={{ fill: tint(hue, 7) }} />
      {gridX.map((x) => (
        <line key={`gx-${x}`} x1={x} x2={x} y1={8} y2={142} style={{ stroke: BORDER, strokeWidth: 0.5, opacity: 0.55 }} />
      ))}
      {gridY.map((y) => (
        <line key={`gy-${y}`} x1={12} x2={308} y1={y} y2={y} style={{ stroke: BORDER, strokeWidth: 0.5, opacity: 0.55 }} />
      ))}
      {children}
      {label ? (
        <text
          x={306}
          y={143}
          textAnchor="end"
          style={{ fill: MUTED, fontSize: 7.5, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}
        >
          {label}
        </text>
      ) : null}
    </svg>
  );
}

// ── Trading Fundamentals ─────────────────────────────────────────────────────

function MarketsArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="instruments" title="Markets and instruments - three quote sparklines">
      <line x1={18} x2={302} y1={57} y2={57} style={{ stroke: BORDER, strokeWidth: 0.6 }} />
      <line x1={18} x2={302} y1={95} y2={95} style={{ stroke: BORDER, strokeWidth: 0.6 }} />
      <Label x={18} y={34}>EUR·USD</Label>
      <Label x={18} y={72}>BTC·USD</Label>
      <Label x={18} y={110}>XAU·USD</Label>
      <Line d={[[64, 46], [104, 40], [140, 44], [184, 32], [224, 36], [262, 24], [300, 20]]} color={PROFIT} smooth />
      <Line d={[[64, 76], [96, 56], [128, 70], [160, 50], [192, 64], [232, 48], [268, 58], [300, 50]]} color={INK} smooth />
      <Line d={[[64, 96], [104, 104], [140, 100], [184, 112], [224, 108], [262, 118], [300, 116]]} color={LOSS} smooth />
      <Dot x={300} y={20} color={PROFIT} r={2.2} />
      <Dot x={300} y={50} color={INK} r={2.2} />
      <Dot x={300} y={116} color={LOSS} r={2.2} />
    </ArtFrame>
  );
}

function AccountArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="leverage" title="Account mechanics - equity funds a leveraged position">
      <line x1={40} x2={280} y1={126} y2={126} style={{ stroke: MUTED, strokeWidth: 0.8 }} />
      {Array.from({ length: 21 }).map((_, i) => (
        <line key={i} x1={40 + i * 12} x2={40 + i * 12} y1={126} y2={i % 5 === 0 ? 121 : 123.5} style={{ stroke: MUTED, strokeWidth: 0.7 }} />
      ))}
      <Label x={288} y={129}>pip</Label>
      <rect x={84} y={92} width={34} height={34} rx={2} style={{ fill: tint(hue, 22), stroke: hue, strokeWidth: 1.2 }} />
      <Label x={101} y={86} anchor="middle">equity</Label>
      <rect x={178} y={42} width={34} height={84} rx={2} style={{ fill: tint(hue, 12), stroke: hue, strokeWidth: 1.2 }} />
      <Label x={195} y={36} anchor="middle">position</Label>
      <line x1={118} x2={178} y1={92} y2={92} style={{ stroke: hue, strokeWidth: 0.9, strokeDasharray: "3 3", opacity: 0.8 }} />
      <Label x={148} y={88} anchor="middle">margin</Label>
      <Label x={248} y={78} color={hue} size={13}>1 : 30</Label>
      <Label x={248} y={92} size={7.5}>notional</Label>
    </ArtFrame>
  );
}

// ── Risk Management ──────────────────────────────────────────────────────────

function RiskBasicsArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="risk per trade" title="Risk fundamentals - one unit risked against two units of reward">
      <Label x={20} y={28} color={hue}>risk 1% = $100</Label>
      <line x1={20} x2={302} y1={76} y2={76} style={{ stroke: MUTED, strokeWidth: 0.9, strokeDasharray: "5 4" }} />
      <Label x={22} y={71}>entry</Label>
      <rect x={64} y={76} width={58} height={40} rx={2} style={{ fill: tint(LOSS, 22), stroke: LOSS, strokeWidth: 0.9 }} />
      <Label x={93} y={99} anchor="middle" color={LOSS}>−1R</Label>
      <Label x={93} y={128} anchor="middle" color={LOSS}>stop</Label>
      <rect x={178} y={36} width={104} height={40} rx={2} style={{ fill: tint(PROFIT, 22), stroke: PROFIT, strokeWidth: 0.9 }} />
      <Label x={230} y={59} anchor="middle" color={PROFIT}>+2R</Label>
      <Label x={230} y={30} anchor="middle" color={PROFIT}>target</Label>
      <Dot x={122} y={76} color={MUTED} r={2} />
      <Dot x={178} y={76} color={MUTED} r={2} />
    </ArtFrame>
  );
}

function DrawdownArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="drawdown math" title="Drawdown - the fall from an equity peak and the larger recovery it demands">
      <rect x={182} y={46} width={62} height={54} style={{ fill: tint(LOSS, 12) }} />
      <line x1={20} x2={302} y1={46} y2={46} style={{ stroke: PROFIT, strokeWidth: 0.8, strokeDasharray: "5 4", opacity: 0.7 }} />
      <line x1={20} x2={302} y1={100} y2={100} style={{ stroke: LOSS, strokeWidth: 0.8, strokeDasharray: "5 4", opacity: 0.7 }} />
      <Label x={22} y={42} color={PROFIT}>equity peak</Label>
      <Label x={190} y={80} color={LOSS}>drawdown −X%</Label>
      <Label x={196} y={118} color={PROFIT}>recovery +Y% (Y &gt; X)</Label>
      <Line
        d={[[22, 100], [52, 88], [84, 92], [116, 70], [148, 76], [180, 46], [212, 54], [242, 100], [268, 88], [300, 72]]}
        color={INK}
        smooth
      />
      <Dot x={180} y={46} color={PROFIT} r={2.4} />
      <Dot x={242} y={100} color={LOSS} r={2.4} />
    </ArtFrame>
  );
}

// ── Technical Analysis ───────────────────────────────────────────────────────

function LevelsArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="key levels" title="Support and resistance - price reacts at bands, not lines">
      <Zone y1={28} y2={40} color={LOSS} />
      <Zone y1={106} y2={118} color={PROFIT} />
      <line x1={18} x2={302} y1={34} y2={34} style={{ stroke: LOSS, strokeWidth: 1, strokeDasharray: "5 4", opacity: 0.85 }} />
      <line x1={18} x2={302} y1={112} y2={112} style={{ stroke: PROFIT, strokeWidth: 1, strokeDasharray: "5 4", opacity: 0.85 }} />
      <Label x={300} y={25} anchor="end" color={LOSS}>resistance</Label>
      <Label x={300} y={132} anchor="end" color={PROFIT}>support</Label>
      <Line
        d={[[20, 74], [46, 40], [74, 100], [104, 38], [134, 104], [164, 40], [196, 106], [228, 42], [258, 70], [280, 54], [302, 60]]}
        color={INK}
      />
      <Dot x={46} y={40} color={hue} r={2.4} />
      <Dot x={104} y={38} color={hue} r={2.4} />
      <Dot x={164} y={40} color={hue} r={2.4} />
      <Dot x={228} y={42} color={hue} r={2.4} />
      <Dot x={74} y={100} color={hue} r={2.4} />
      <Dot x={134} y={104} color={hue} r={2.4} />
      <Dot x={196} y={106} color={hue} r={2.4} />
    </ArtFrame>
  );
}

function BreakoutArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="breakout · retest" title="Breakout and retest - the range breaks, comes back, then continues">
      <rect x={24} y={48} width={156} height={56} rx={3} style={{ fill: "none", stroke: BORDER, strokeWidth: 0.9, strokeDasharray: "4 4" }} />
      <line x1={24} x2={302} y1={48} y2={48} style={{ stroke: hue, strokeWidth: 1, strokeDasharray: "5 4", opacity: 0.9 }} />
      <Line
        d={[[24, 96], [52, 54], [80, 98], [108, 52], [136, 100], [164, 54], [204, 28], [238, 50], [270, 24], [300, 16]]}
        color={INK}
      />
      <Dot x={238} y={50} color={hue} r={2.6} />
      <Label x={206} y={20} color={hue}>breakout</Label>
      <Label x={244} y={64}>retest</Label>
    </ArtFrame>
  );
}

// ── Price Action ─────────────────────────────────────────────────────────────

function PriceBehaviorArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="impulse · correction" title="Price behavior - steep impulses separated by shallow corrections">
      <Line d={[[20, 112], [64, 40]]} color={PROFIT} width={2} />
      <Line d={[[64, 40], [86, 58]]} color={MUTED} width={1.4} dash="4 3" />
      <Line d={[[86, 58], [130, 30]]} color={PROFIT} width={2} />
      <Line d={[[130, 30], [152, 52]]} color={MUTED} width={1.4} dash="4 3" />
      <Line d={[[152, 52], [196, 24]]} color={PROFIT} width={2} />
      <Line d={[[196, 24], [218, 44]]} color={MUTED} width={1.4} dash="4 3" />
      <Line d={[[218, 44], [262, 20]]} color={PROFIT} width={2} />
      <Line d={[[262, 20], [300, 30]]} color={MUTED} width={1.4} dash="4 3" />
      <Label x={24} y={100} color={PROFIT}>impulse</Label>
      <Label x={64} y={78}>correction</Label>
      <Label x={90} y={48} color={PROFIT}>impulse</Label>
      <Label x={226} y={70}>correction</Label>
    </ArtFrame>
  );
}

function SmcArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="supply · demand · fvg" title="Liquidity and SMC - a displacement leg leaves a fair value gap above an order block">
      <Zone y1={18} y2={32} color={LOSS} />
      <Zone y1={112} y2={126} color={PROFIT} />
      <line x1={18} x2={302} y1={25} y2={25} style={{ stroke: LOSS, strokeWidth: 0.9, strokeDasharray: "5 4", opacity: 0.8 }} />
      <line x1={18} x2={302} y1={119} y2={119} style={{ stroke: PROFIT, strokeWidth: 0.9, strokeDasharray: "5 4", opacity: 0.8 }} />
      <Label x={300} y={15} anchor="end" color={LOSS}>supply</Label>
      <Label x={300} y={137} anchor="end" color={PROFIT}>demand</Label>
      <rect x={48} y={46} width={254} height={12} rx={1.5} style={{ fill: tint(hue, 16) }} />
      <Label x={300} y={43} anchor="end" color={hue}>FVG</Label>
      <Candle x={56} high={58} low={70} bodyTop={62} bodyBottom={68} bullish={false} color={hue} filled={false} bodyW={16} />
      <Candle x={96} high={38} low={70} bodyTop={42} bodyBottom={68} bullish bodyW={16} />
      <Candle x={136} high={30} low={46} bodyTop={34} bodyBottom={42} bullish bodyW={16} />
      <Candle x={176} high={22} low={38} bodyTop={26} bodyBottom={34} bullish bodyW={16} />
      <Label x={76} y={82} anchor="middle" color={hue}>OB</Label>
      <Label x={96} y={98} anchor="middle">displacement</Label>
    </ArtFrame>
  );
}

// ── Candlestick Patterns ─────────────────────────────────────────────────────

function SingleCandleArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="anatomy" title="Candle anatomy - open, high, low and close on three single candles">
      <Candle x={116} high={30} low={110} bodyTop={62} bodyBottom={98} bullish filled={false} color={PROFIT} bodyW={16} />
      <Candle x={170} high={42} low={102} bodyTop={69} bodyBottom={71} bullish color={INK} bodyW={16} />
      <Candle x={224} high={40} low={120} bodyTop={72} bodyBottom={106} bullish={false} color={LOSS} bodyW={16} />
      {([["H", 30], ["C", 60], ["O", 100], ["L", 112]] as [string, number][]).map(([name, y]) => (
        <g key={name}>
          <line x1={124} x2={138} y1={y} y2={y} style={{ stroke: MUTED, strokeWidth: 0.7, strokeDasharray: "2 2" }} />
          <Label x={142} y={y + 3}>{name}</Label>
        </g>
      ))}
      <Label x={116} y={134} anchor="middle" color={PROFIT}>bullish</Label>
      <Label x={170} y={134} anchor="middle">doji</Label>
      <Label x={224} y={134} anchor="middle" color={LOSS}>bearish</Label>
    </ArtFrame>
  );
}

function MultiCandleArt({ hue }: { hue: string }) {
  const series: { x: number; high: number; low: number; top: number; bottom: number; bull: boolean; star?: boolean }[] = [
    { x: 36, high: 36, low: 56, top: 40, bottom: 52, bull: false },
    { x: 64, high: 48, low: 70, top: 52, bottom: 66, bull: false },
    { x: 92, high: 62, low: 82, top: 66, bottom: 78, bull: false },
    { x: 120, high: 74, low: 94, top: 78, bottom: 90, bull: false },
    { x: 148, high: 88, low: 100, top: 92, bottom: 95, bull: false, star: true },
    { x: 176, high: 82, low: 100, top: 84, bottom: 94, bull: true },
    { x: 204, high: 62, low: 88, top: 66, bottom: 84, bull: true },
    { x: 232, high: 48, low: 70, top: 52, bottom: 66, bull: true },
    { x: 260, high: 34, low: 56, top: 38, bottom: 52, bull: true },
  ];
  return (
    <ArtFrame hue={hue} label="formations" title="Multi-candle patterns - a morning star turns the decline around">
      <rect x={104} y={68} width={90} height={42} rx={6} style={{ fill: tint(hue, 10), stroke: hue, strokeWidth: 1, strokeDasharray: "4 3" }} />
      {series.map((c) => (
        <Candle
          key={c.x}
          x={c.x}
          high={c.high}
          low={c.low}
          bodyTop={c.top}
          bodyBottom={c.bottom}
          bullish={c.bull}
          color={c.star ? INK : undefined}
          bodyW={13}
        />
      ))}
      <Label x={149} y={122} anchor="middle" color={hue}>morning star</Label>
    </ArtFrame>
  );
}

// ── Chart Patterns ───────────────────────────────────────────────────────────

function ReversalPatternsArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="head & shoulders" title="Head and shoulders reversal with its neckline">
      <line x1={34} x2={232} y1={68} y2={68} style={{ stroke: hue, strokeWidth: 1, strokeDasharray: "5 4" }} />
      <Line
        d={[[24, 80], [52, 52], [76, 68], [110, 30], [144, 68], [176, 48], [204, 72], [232, 92], [262, 108], [296, 116]]}
        color={INK}
      />
      <Dot x={76} y={68} color={hue} r={2.2} />
      <Dot x={144} y={68} color={hue} r={2.2} />
      <Label x={48} y={44}>LS</Label>
      <Label x={104} y={22}>HEAD</Label>
      <Label x={170} y={40}>RS</Label>
      <Label x={238} y={64} color={hue}>neckline</Label>
    </ArtFrame>
  );
}

function ContinuationPatternsArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="bull flag" title="Bull flag continuation - pole, consolidation channel, breakout">
      <Line d={[[30, 118], [78, 38]]} color={PROFIT} width={2.2} />
      <Line d={[[78, 42], [148, 60]]} color={hue} width={1} dash="4 3" />
      <Line d={[[78, 58], [148, 76]]} color={hue} width={1} dash="4 3" />
      <Line
        d={[[30, 118], [78, 38], [94, 52], [108, 46], [124, 58], [138, 50], [150, 62], [196, 24], [222, 36], [262, 14], [298, 20]]}
        color={INK}
      />
      <Label x={38} y={84} color={PROFIT}>pole</Label>
      <Label x={104} y={80} color={hue}>flag</Label>
      <Label x={200} y={48} color={PROFIT}>breakout</Label>
    </ArtFrame>
  );
}

// ── Indicators ───────────────────────────────────────────────────────────────

function TrendMomentumArt({ hue }: { hue: string }) {
  const macdBars = [-7, -9, -6, -3, 3, 6, 9, 11, 8, 5, 7, 10, 13, 10, 7, 4, 6, 8, 10];
  return (
    <ArtFrame hue={hue} label="sma · ema · macd" title="Trend and momentum indicators - price with two moving averages above a MACD histogram">
      <Line d={[[24, 80], [52, 60], [80, 70], [108, 48], [136, 58], [168, 38], [200, 48], [232, 30], [264, 40], [298, 22]]} color={INK} smooth />
      <Line d={[[24, 90], [56, 78], [92, 72], [128, 64], [164, 58], [200, 52], [236, 46], [268, 42], [298, 38]]} color={hue} smooth />
      <Line d={[[24, 86], [56, 70], [92, 66], [128, 54], [164, 50], [200, 44], [236, 36], [268, 33], [298, 30]]} color={PROFIT} smooth />
      <Label x={299} y={30} anchor="end" color={PROFIT}>EMA</Label>
      <Label x={299} y={48} anchor="end" color={hue}>SMA</Label>
      <Dot x={60} y={73} color={hue} r={2.6} />
      <Label x={64} y={60} color={hue}>cross</Label>
      <line x1={18} x2={302} y1={98} y2={98} style={{ stroke: BORDER, strokeWidth: 0.7 }} />
      <line x1={22} x2={300} y1={122} y2={122} style={{ stroke: MUTED, strokeWidth: 0.7, strokeDasharray: "3 3", opacity: 0.8 }} />
      {macdBars.map((h, i) => (
        <rect
          key={i}
          x={28 + i * 14.4}
          y={h >= 0 ? 122 - h : 122}
          width={7}
          height={Math.abs(h)}
          style={{ fill: h >= 0 ? tint(PROFIT, 45) : tint(LOSS, 45) }}
        />
      ))}
      <Label x={22} y={112}>MACD 12·26·9</Label>
    </ArtFrame>
  );
}

function VolVolumeArt({ hue }: { hue: string }) {
  const volBars = [
    { h: 10, up: true }, { h: 16, up: false }, { h: 8, up: false }, { h: 22, up: true },
    { h: 14, up: true }, { h: 26, up: false }, { h: 12, up: true }, { h: 18, up: false },
    { h: 24, up: true }, { h: 10, up: true }, { h: 20, up: false }, { h: 16, up: true },
    { h: 26, up: false }, { h: 12, up: true }, { h: 18, up: true }, { h: 22, up: false },
    { h: 14, up: true }, { h: 8, up: false }, { h: 20, up: true },
  ];
  const upper: P[] = [[24, 46], [60, 44], [100, 50], [140, 42], [180, 46], [220, 36], [260, 40], [296, 32]];
  const mid: P[] = [[24, 70], [60, 66], [100, 72], [140, 64], [180, 68], [220, 58], [260, 62], [296, 54]];
  const lower: P[] = [[24, 94], [60, 88], [100, 94], [140, 86], [180, 90], [220, 80], [260, 84], [296, 76]];
  const bandPath = `${smooth(upper)} L ${lower[lower.length - 1][0]} ${lower[lower.length - 1][1]} ${smooth([...lower].reverse()).replace(/^M/, "L")} Z`;
  return (
    <ArtFrame hue={hue} label="volatility · volume" title="Volatility and volume - Bollinger bands around price over a volume pane">
      <path d={bandPath} style={{ fill: tint(hue, 9) }} />
      <Line d={upper} color={hue} width={1.1} smooth />
      <Line d={mid} color={MUTED} width={0.9} dash="4 3" smooth />
      <Line d={lower} color={hue} width={1.1} smooth />
      <Line
        d={[[24, 72], [48, 58], [72, 84], [96, 62], [120, 88], [144, 66], [168, 86], [192, 56], [216, 74], [240, 50], [264, 68], [288, 46], [298, 52]]}
        color={INK}
      />
      <line x1={18} x2={302} y1={104} y2={104} style={{ stroke: BORDER, strokeWidth: 0.7 }} />
      {volBars.map((bar, i) => (
        <rect key={i} x={24 + i * 14.4} y={138 - bar.h} width={8} height={bar.h} style={{ fill: tint(bar.up ? PROFIT : LOSS, 40) }} />
      ))}
    </ArtFrame>
  );
}

// ── Trading Strategies ───────────────────────────────────────────────────────

function StrategyCoreArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="entry · stop · target" title="Strategy core - a pullback setup with entry, stop and target">
      <line x1={140} x2={300} y1={96} y2={96} style={{ stroke: LOSS, strokeWidth: 1, strokeDasharray: "5 4" }} />
      <line x1={140} x2={300} y1={28} y2={28} style={{ stroke: PROFIT, strokeWidth: 1, strokeDasharray: "5 4" }} />
      <Label x={298} y={92} anchor="end" color={LOSS}>stop</Label>
      <Label x={298} y={24} anchor="end" color={PROFIT}>target</Label>
      <Line d={[[24, 96], [56, 56], [88, 92], [120, 58], [152, 88], [184, 60], [220, 42], [248, 50], [292, 26]]} color={INK} />
      <Dot x={184} y={60} color={hue} r={3} />
      <Label x={168} y={48} color={hue}>entry</Label>
      <Label x={252} y={66}>1 : 2</Label>
    </ArtFrame>
  );
}

function MeanReversionArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="mean reversion" title="Mean reversion - fading the extremes of an oscillating range">
      <line x1={20} x2={300} y1={72} y2={72} style={{ stroke: MUTED, strokeWidth: 0.9, strokeDasharray: "5 4" }} />
      <Label x={22} y={66}>mean</Label>
      <Line
        d={[[24, 72], [48, 38], [72, 72], [96, 106], [120, 72], [144, 40], [168, 72], [192, 104], [216, 72], [240, 38], [264, 72], [288, 98], [300, 84]]}
        color={hue}
        smooth
      />
      <Dot x={48} y={38} color={LOSS} r={3} />
      <Dot x={144} y={40} color={LOSS} r={3} />
      <Dot x={96} y={106} color={PROFIT} r={3} />
      <Dot x={192} y={104} color={PROFIT} r={3} />
      <Label x={140} y={28} anchor="middle" color={LOSS}>fade high</Label>
      <Label x={196} y={122} anchor="middle" color={PROFIT}>fade low</Label>
    </ArtFrame>
  );
}

// ── Trade Management ─────────────────────────────────────────────────────────

function TradeMgmtArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="trailing · partials" title="Trade management - a trailing stop stepping up under a winning position">
      <line x1={20} x2={140} y1={96} y2={96} style={{ stroke: MUTED, strokeWidth: 0.9, strokeDasharray: "5 4" }} />
      <Label x={22} y={108}>entry</Label>
      <Line d={[[24, 96], [56, 74], [88, 80], [120, 60], [152, 66], [184, 46], [216, 52], [248, 36], [280, 40], [300, 30]]} color={INK} smooth />
      <Line
        d={[[24, 124], [88, 124], [88, 108], [152, 108], [152, 88], [216, 88], [216, 68], [280, 68], [280, 52], [300, 52]]}
        color={PROFIT}
        width={1.5}
        dash="5 3"
      />
      <Dot x={152} y={96} color={hue} r={2.6} />
      <Label x={160} y={92} color={hue}>BE</Label>
      <rect x={117} y={57} width={6} height={6} transform="rotate(45 120 60)" style={{ fill: hue }} />
      <rect x={181} y={43} width={6} height={6} transform="rotate(45 184 46)" style={{ fill: hue }} />
      <Label x={110} y={48}>T1</Label>
      <Label x={174} y={34}>T2</Label>
    </ArtFrame>
  );
}

// ── Trading Psychology ───────────────────────────────────────────────────────

function PsychologyArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="the emotional ledger" title="Trading psychology - the emotional wave between fear and greed">
      <line x1={20} x2={300} y1={36} y2={36} style={{ stroke: MUTED, strokeWidth: 0.8, strokeDasharray: "5 4", opacity: 0.8 }} />
      <line x1={20} x2={300} y1={112} y2={112} style={{ stroke: MUTED, strokeWidth: 0.8, strokeDasharray: "5 4", opacity: 0.8 }} />
      <line x1={20} x2={300} y1={74} y2={74} style={{ stroke: hue, strokeWidth: 0.9, strokeDasharray: "3 4", opacity: 0.9 }} />
      <Label x={22} y={30}>greed</Label>
      <Label x={22} y={124}>fear</Label>
      <Label x={22} y={68} color={hue}>process</Label>
      <Line
        d={[[28, 74], [52, 42], [76, 88], [100, 116], [124, 60], [148, 34], [172, 78], [196, 108], [220, 52], [244, 38], [268, 86], [294, 70]]}
        color={INK}
        smooth
        opacity={0.85}
      />
      <circle cx={220} cy={52} r={6} style={{ fill: "none", stroke: hue, strokeWidth: 1, opacity: 0.5 }} />
      <Dot x={220} y={52} color={hue} r={3} />
      <Label x={230} y={44} color={hue}>observe</Label>
    </ArtFrame>
  );
}

// ── Market Structure ─────────────────────────────────────────────────────────

function StructureArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="hh · hl · bos" title="Market structure - higher highs and higher lows breaking above the prior swing">
      <line x1={124} x2={214} y1={32} y2={32} style={{ stroke: hue, strokeWidth: 1, strokeDasharray: "5 4" }} />
      <Line
        d={[[24, 108], [56, 72], [44, 84], [92, 48], [76, 62], [128, 32], [112, 46], [168, 26], [152, 40], [212, 20], [200, 30], [258, 14], [298, 22]]}
        color={INK}
      />
      <Dot x={128} y={32} color={MUTED} r={2.2} />
      <Label x={218} y={28} color={hue}>BOS</Label>
      <Label x={50} y={64} color={PROFIT}>HH</Label>
      <Label x={86} y={40} color={PROFIT}>HH</Label>
      <Label x={122} y={24} color={PROFIT}>HH</Label>
      <Label x={38} y={94} color={PROFIT}>HL</Label>
      <Label x={70} y={72} color={PROFIT}>HL</Label>
      <Label x={106} y={56} color={PROFIT}>HL</Label>
    </ArtFrame>
  );
}

// ── Advanced Trading ─────────────────────────────────────────────────────────

function SystematicArt({ hue }: { hue: string }) {
  return (
    <ArtFrame hue={hue} label="backtest · expectancy" title="Systematic trading - an equity curve over a fixed sample of trades">
      <Label x={24} y={30} color={hue} size={9}>n = 240</Label>
      <Label x={24} y={42}>WR 54% · PF 1.6</Label>
      <Line
        d={[[24, 110], [60, 96], [70, 100], [110, 84], [120, 88], [160, 70], [170, 76], [210, 56], [220, 62], [260, 42], [296, 32]]}
        color={hue}
        width={1.8}
      />
      <Dot x={60} y={96} color={INK} r={2} />
      <Dot x={110} y={84} color={INK} r={2} />
      <Dot x={160} y={70} color={INK} r={2} />
      <Dot x={210} y={56} color={INK} r={2} />
      <Dot x={260} y={42} color={INK} r={2} />
      <Dot x={120} y={88} color={LOSS} r={2.6} />
      <Label x={128} y={94} color={LOSS}>loss</Label>
    </ArtFrame>
  );
}

function ExecutionArt({ hue }: { hue: string }) {
  const bars = [-14, -8, -3, 5, 10, 16, 22, 18, 12, 6, -2, -6, -12];
  return (
    <ArtFrame hue={hue} label="r distribution" title="Execution quality - the distribution of trade outcomes in R multiples">
      <line x1={22} x2={300} y1={100} y2={100} style={{ stroke: MUTED, strokeWidth: 0.8, strokeDasharray: "4 3" }} />
      {bars.map((h, i) => (
        <rect
          key={i}
          x={34 + i * 20}
          y={h >= 0 ? 100 - h : 100}
          width={12}
          height={Math.abs(h)}
          style={{ fill: tint(h >= 0 ? PROFIT : LOSS, 40) }}
        />
      ))}
      <line x1={162} x2={162} y1={38} y2={118} style={{ stroke: hue, strokeWidth: 1, strokeDasharray: "4 3" }} />
      <Label x={162} y={30} anchor="middle" color={hue}>expectancy &gt; 0</Label>
    </ArtFrame>
  );
}

// ── Registry ─────────────────────────────────────────────────────────────────

type ArtComponent = (props: { hue: string }) => React.ReactElement;

/** courseId → its category (for hue resolution when only the course id is known). */
export const COURSE_CATEGORY: Record<string, string> = {
  "crs-fund-markets": "cat-fundamentals",
  "crs-fund-account": "cat-fundamentals",
  "crs-risk-fundamentals": "cat-risk",
  "crs-risk-advanced": "cat-risk",
  "crs-ta-charts": "cat-technical",
  "crs-ta-breakouts": "cat-technical",
  "crs-pa-behavior": "cat-price-action",
  "crs-pa-smc": "cat-price-action",
  "crs-candles-single": "cat-candles",
  "crs-candles-multi": "cat-candles",
  "crs-chartpatterns-reversal": "cat-chart-patterns",
  "crs-chartpatterns-continuation": "cat-chart-patterns",
  "crs-indicators-trend-momentum": "cat-indicators",
  "crs-indicators-volatility-volume": "cat-indicators",
  "crs-strategies-core": "cat-strategies",
  "crs-strategies-styles": "cat-strategies",
  "crs-trademgmt": "cat-trade-management",
  "crs-psychology": "cat-psychology",
  "crs-structure-reading": "cat-structure",
  "crs-advanced-systematic": "cat-advanced",
  "crs-advanced-execution": "cat-advanced",
};

const COURSE_ART: Record<string, ArtComponent> = {
  "crs-fund-markets": MarketsArt,
  "crs-fund-account": AccountArt,
  "crs-risk-fundamentals": RiskBasicsArt,
  "crs-risk-advanced": DrawdownArt,
  "crs-ta-charts": LevelsArt,
  "crs-ta-breakouts": BreakoutArt,
  "crs-pa-behavior": PriceBehaviorArt,
  "crs-pa-smc": SmcArt,
  "crs-candles-single": SingleCandleArt,
  "crs-candles-multi": MultiCandleArt,
  "crs-chartpatterns-reversal": ReversalPatternsArt,
  "crs-chartpatterns-continuation": ContinuationPatternsArt,
  "crs-indicators-trend-momentum": TrendMomentumArt,
  "crs-indicators-volatility-volume": VolVolumeArt,
  "crs-strategies-core": StrategyCoreArt,
  "crs-strategies-styles": MeanReversionArt,
  "crs-trademgmt": TradeMgmtArt,
  "crs-psychology": PsychologyArt,
  "crs-structure-reading": StructureArt,
  "crs-advanced-systematic": SystematicArt,
  "crs-advanced-execution": ExecutionArt,
};

/** The illustration that represents a whole category (Overview map, hero cards). */
export const CATEGORY_FLAGSHIP: Record<string, string> = {
  "cat-fundamentals": "crs-fund-markets",
  "cat-risk": "crs-risk-fundamentals",
  "cat-technical": "crs-ta-charts",
  "cat-price-action": "crs-pa-smc",
  "cat-candles": "crs-candles-single",
  "cat-chart-patterns": "crs-chartpatterns-reversal",
  "cat-indicators": "crs-indicators-trend-momentum",
  "cat-strategies": "crs-strategies-core",
  "cat-trade-management": "crs-trademgmt",
  "cat-psychology": "crs-psychology",
  "cat-structure": "crs-structure-reading",
  "cat-advanced": "crs-advanced-systematic",
};

export function hasCourseArt(courseId: string): boolean {
  return courseId in COURSE_ART;
}

/**
 * Course illustration - the tinted chart vignette for a course card or hero.
 * `categoryId` overrides the hue resolution when it is already at hand.
 */
export function CourseArt({
  courseId,
  categoryId,
  className,
  testid,
}: {
  courseId: string;
  categoryId?: string | null;
  className?: string;
  testid?: string;
}) {
  const Art = COURSE_ART[courseId];
  const catId = categoryId ?? COURSE_CATEGORY[courseId];
  const hue = hueOf(catId);
  if (!Art) {
    // Unknown course: an abstract "open book of charts" placeholder in the hue.
    return (
      <span className={className} aria-hidden="true" style={{ display: "block", overflow: "hidden" }} data-testid={testid}>
        <ArtFrame hue={hue} title="Course illustration">
          <Line d={[[40, 104], [104, 48], [150, 76], [212, 32], [276, 56]]} color={hue} smooth />
          <Dot x={104} y={48} color={hue} r={2.6} />
          <Dot x={212} y={32} color={hue} r={2.6} />
        </ArtFrame>
      </span>
    );
  }
  return (
    <span className={className} aria-hidden="true" style={{ display: "block", overflow: "hidden" }} data-testid={testid}>
      <Art hue={hue} />
    </span>
  );
}
