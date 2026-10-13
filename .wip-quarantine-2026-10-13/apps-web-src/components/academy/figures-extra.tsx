"use client";

import * as React from "react";

import { C, Label, SvgFrame } from "@/components/academy/figures";

/**
 * Lesson figure library — extension A (t47). Same grammar as figures.tsx:
 * token-driven SVG only (the hex exception stays reserved for CosmozMark),
 * honest annotations, labels kept inside the 360 viewBox. Covers orders,
 * leverage, R distributions, drawdown math, timeframes, regimes, breaks,
 * impulse rhythm and liquidity.
 */

/* ── Orders & leverage ───────────────────────────────────────────────────── */

function OrdersMapFigure() {
  return (
    <SvgFrame height={252}>
      <Label x={20} y={18} fill={C.fg}>THE ORDER MAP — one planned long</Label>
      {/* take-profit */}
      <line x1={20} x2={340} y1={52} y2={52} stroke={C.up} strokeWidth={1.4} strokeDasharray="5 4" />
      <Label x={24} y={46} fill={C.up}>TAKE-PROFIT — the planned exit</Label>
      {/* resting sell limit */}
      <line x1={20} x2={340} y1={88} y2={88} stroke={C.loss} strokeWidth={1.2} />
      <Label x={330} y={82} fill={C.loss} anchor="end">sell limit — exit into strength</Label>
      {/* last price + spread */}
      <line x1={20} x2={250} y1={120} y2={120} stroke={C.fg} strokeWidth={1.8} />
      <line x1={258} x2={344} y1={114} y2={114} stroke={C.muted} strokeWidth={1} />
      <line x1={258} x2={344} y1={126} y2={126} stroke={C.muted} strokeWidth={1} />
      <Label x={344} y={106} fill={C.muted} anchor="end">ask / bid — the spread</Label>
      <Label x={24} y={112} fill={C.fg}>last price</Label>
      {/* resting buy limit */}
      <line x1={20} x2={340} y1={160} y2={160} stroke={C.accent} strokeWidth={1.2} />
      <Label x={24} y={176} fill={C.accent}>buy limit — at your price or better</Label>
      {/* stop */}
      <line x1={20} x2={340} y1={206} y2={206} stroke={C.loss} strokeWidth={1.4} strokeDasharray="5 4" />
      <Label x={24} y={222} fill={C.loss}>stop-loss — the exit that must fill fast</Label>
      <Label x={20} y={244} fill={C.fg}>Limits pick price; stops pick speed; spread is the toll.</Label>
    </SvgFrame>
  );
}

function LeverageArcFigure() {
  return (
    <SvgFrame height={246}>
      <Label x={20} y={18} fill={C.fg}>SAME 1% MOVE, THREE LEVERAGES</Label>
      <Label x={58} y={38} fill={C.up}>if the move is yours</Label>
      <Label x={214} y={38} fill={C.loss}>if it is against you</Label>
      <line x1={190} x2={190} y1={28} y2={228} stroke={C.border} strokeWidth={1} />
      {/* zero line */}
      <line x1={20} x2={340} y1={150} y2={150} stroke={C.muted} strokeWidth={1} />
      <Label x={20} y={162} fill={C.muted}>0%</Label>
      {/* favorable bars */}
      <rect x={58} y={136} width={24} height={14} fill={C.up} opacity={0.7} rx={2} />
      <rect x={100} y={108} width={24} height={42} fill={C.up} opacity={0.7} rx={2} />
      <rect x={142} y={80} width={24} height={70} fill={C.up} opacity={0.7} rx={2} />
      <Label x={58} y={130} fill={C.up}>+1%</Label>
      <Label x={100} y={102} fill={C.up}>+5%</Label>
      <Label x={142} y={74} fill={C.up}>+10%</Label>
      {/* adverse bars */}
      <rect x={214} y={150} width={24} height={14} fill={C.loss} opacity={0.7} rx={2} />
      <rect x={256} y={150} width={24} height={42} fill={C.loss} opacity={0.7} rx={2} />
      <rect x={298} y={150} width={24} height={70} fill={C.loss} opacity={0.7} rx={2} />
      <Label x={214} y={176} fill={C.loss}>−1%</Label>
      <Label x={256} y={204} fill={C.loss}>−5%</Label>
      <Label x={298} y={228} fill={C.loss}>−10%</Label>
      <Label x={20} y={240} fill={C.fg}>Leverage multiplies the move — never the edge.</Label>
    </SvgFrame>
  );
}

/* ── Risk: R distribution, drawdown ──────────────────────────────────────── */

function ExpectancyRunFigure() {
  // The lesson's own sample: six −1R stop-outs, one 0R scratch, wins at
  // +1.2R / +2.4R / +3.1R → +0.7R. Steps trace the running total.
  const outcomes = [-1, -1, -1, -1, -1, -1, 0, 1.2, 2.4, 3.1];
  const cum = [-1, -2, -3, -4, -5, -6, -6, -4.8, -2.4, 0.7];
  const zero = 130;
  const pxPerR = 26;
  const stepX = 31;
  const barW = 16;
  const barX = (index: number) => 28 + stepX * index;
  const cx = (index: number) => barX(index) + barW / 2;
  return (
    <SvgFrame height={236}>
      <Label x={20} y={18} fill={C.fg}>TEN TRADES IN R — THE LESSON&apos;S OWN SAMPLE</Label>
      <line x1={20} x2={344} y1={zero} y2={zero} stroke={C.muted} strokeWidth={1} />
      <Label x={336} y={zero - 5} fill={C.muted} anchor="end">0R</Label>
      {outcomes.map((r, index) => {
        const h = Math.abs(r) * pxPerR;
        if (r === 0) {
          return <rect key={index} x={barX(index)} y={zero - 2} width={barW} height={4} fill={C.muted} opacity={0.5} rx={1} />;
        }
        return (
          <rect
            key={index}
            x={barX(index)}
            y={r > 0 ? zero - h : zero}
            width={barW}
            height={h}
            fill={r > 0 ? C.up : C.loss}
            opacity={0.65}
            rx={2}
          />
        );
      })}
      <polyline
        points={cum.map((c, index) => `${cx(index)},${zero - c * 8}`).join(" ")}
        fill="none"
        stroke={C.accent}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Label x={26} y={196} fill={C.loss}>×6 stop-outs — the fee</Label>
      <Label x={196} y={44} fill={C.up}>three wins dig it out</Label>
      <Label x={320} y={140} fill={C.accent}>+0.7R</Label>
      <Label x={20} y={222} fill={C.fg}>Three wins in ten, still +0.7R — win rate alone hides it.</Label>
    </SvgFrame>
  );
}

function DrawdownDepthFigure() {
  const peak: [number, number] = [124, 44];
  const trough: [number, number] = [214, 124];
  return (
    <SvgFrame height={244}>
      <Label x={20} y={18} fill={C.fg}>DRAWDOWN — THE ASYMMETRIC CLIMB</Label>
      <polygon
        points={`${peak[0]},${peak[1]} 152,64 184,100 ${trough[0]},${trough[1]} ${trough[0]},${peak[1]}`}
        fill={C.loss}
        opacity={0.1}
      />
      <polyline
        points="20,84 56,60 88,74 124,44 152,64 184,100 214,124 244,108 282,72 318,56 344,48"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <line x1={peak[0]} x2={344} y1={peak[1]} y2={peak[1]} stroke={C.muted} strokeWidth={1} strokeDasharray="3 3" />
      <Label x={340} y={38} fill={C.muted} anchor="end">peak</Label>
      <line x1={trough[0]} x2={trough[0]} y1={peak[1]} y2={trough[1]} stroke={C.border} strokeWidth={1} strokeDasharray="3 3" />
      <circle cx={peak[0]} cy={peak[1]} r={3.2} fill={C.accent} />
      <circle cx={trough[0]} cy={trough[1]} r={3.2} fill={C.loss} />
      <Label x={220} y={90} fill={C.loss}>−25%</Label>
      <Label x={trough[0]} y={140} fill={C.muted} anchor="middle">trough</Label>
      <Label x={246} y={120} fill={C.up}>recovery: +33.3%</Label>
      <Label x={28} y={196} fill={C.muted}>−10% → +11.1%</Label>
      <Label x={140} y={196} fill={C.warn}>−25% → +33.3%</Label>
      <Label x={252} y={196} fill={C.loss}>−50% → +100%</Label>
      <Label x={20} y={228} fill={C.fg}>The hole grows faster than the climb — cap it in advance.</Label>
    </SvgFrame>
  );
}

/* ── Technical: timeframes, regimes, breaks ─────────────────────────────── */

function TimeframeStackFigure() {
  return (
    <SvgFrame height={250}>
      <Label x={20} y={18} fill={C.fg}>THE DECLARED STACK — one job per row</Label>
      <Label x={24} y={58} fill={C.accent}>D1</Label>
      <polyline points="64,76 100,54 136,66 172,48 208,62 244,44 280,54 316,38" fill="none" stroke={C.fg} strokeWidth={1.6} strokeLinejoin="round" />
      <Label x={64} y={90} fill={C.muted}>CONTEXT — which side</Label>
      <line x1={16} x2={344} y1={96} y2={96} stroke={C.border} strokeWidth={1} />
      <Label x={24} y={128} fill={C.accent}>H1</Label>
      <polyline points="64,140 100,118 136,146 172,116 208,144 244,120 280,140 316,126" fill="none" stroke={C.fg} strokeWidth={1.6} strokeLinejoin="round" />
      <Label x={64} y={160} fill={C.muted}>SETUP — where</Label>
      <line x1={16} x2={344} y1={166} y2={166} stroke={C.border} strokeWidth={1} />
      <Label x={24} y={198} fill={C.accent}>M5</Label>
      <polyline points="64,208 100,216 136,196 172,204 208,188 244,196 280,180 316,188" fill="none" stroke={C.fg} strokeWidth={1.6} strokeLinejoin="round" />
      <Label x={64} y={230} fill={C.muted}>TRIGGER — when</Label>
      <Label x={20} y={242} fill={C.fg}>Direction from the top, location mid, entry below.</Label>
    </SvgFrame>
  );
}

function TrendRangePanelsFigure() {
  return (
    <SvgFrame height={236}>
      <Label x={20} y={18} fill={C.fg}>TWO REGIMES, TWO PLAYBOOKS</Label>
      <line x1={186} x2={186} y1={28} y2={200} stroke={C.border} strokeWidth={1} />
      {/* trend panel */}
      <Label x={24} y={40} fill={C.accent}>TREND</Label>
      <polyline points="24,176 52,132 78,150 114,104 140,124 178,80" fill="none" stroke={C.fg} strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={114} cy={104} r={3} fill={C.accent} />
      <circle cx={140} cy={124} r={3} fill={C.accent} />
      <Label x={120} y={96} fill={C.accent}>HH</Label>
      <Label x={146} y={138} fill={C.accent}>HL</Label>
      <Label x={24} y={196} fill={C.muted}>continuation logic — buy pullbacks</Label>
      {/* range panel */}
      <Label x={200} y={40} fill={C.accent}>RANGE</Label>
      <rect x={204} y={64} width={132} height={84} fill="none" stroke={C.muted} strokeWidth={1} strokeDasharray="4 3" />
      <polyline points="208,140 232,72 256,142 280,74 304,140 328,80" fill="none" stroke={C.fg} strokeWidth={1.8} strokeLinejoin="round" />
      <Label x={232} y={58} fill={C.loss}>sell the top</Label>
      <Label x={236} y={166} fill={C.up}>buy the bottom</Label>
      <Label x={204} y={196} fill={C.muted}>fade the edges, not middle</Label>
      <Label x={20} y={224} fill={C.fg}>Most failures are regime mismatches, not bad setups.</Label>
    </SvgFrame>
  );
}

function BreakoutRetestFigure() {
  return (
    <SvgFrame height={220}>
      <line x1={20} x2={204} y1={112} y2={112} stroke={C.muted} strokeWidth={1.4} />
      <Label x={24} y={104} fill={C.muted}>resistance</Label>
      <line x1={204} x2={344} y1={112} y2={112} stroke={C.accent} strokeWidth={1.4} strokeDasharray="5 4" />
      <Label x={340} y={104} fill={C.accent} anchor="end">role flip — new floor</Label>
      <polyline
        points="24,158 48,116 74,132 100,108 128,130 156,106 184,96 208,66 232,74 254,110 280,90 312,58 342,40"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx={100} cy={108} r={3} fill={C.accent} />
      <circle cx={156} cy={106} r={3} fill={C.accent} />
      <circle cx={208} cy={66} r={3.2} fill={C.up} />
      <circle cx={254} cy={110} r={3.2} fill={C.accent} />
      <Label x={172} y={52} fill={C.up}>close above = break</Label>
      <Label x={194} y={134} fill={C.accent}>RETEST — old roof, new floor</Label>
      <Label x={344} y={34} fill={C.up} anchor="end">continuation</Label>
      <Label x={20} y={206} fill={C.fg}>Wait for the close, then the return — the retest pays.</Label>
    </SvgFrame>
  );
}

/* ── Price action: rhythm & liquidity ────────────────────────────────────── */

function ImpulseCorrectiveFigure() {
  return (
    <SvgFrame height={240}>
      <Label x={20} y={18} fill={C.fg}>IMPULSE / CORRECTION — THE RHYTHM</Label>
      <polyline points="24,200 92,110" fill="none" stroke={C.up} strokeWidth={2.4} strokeLinecap="round" />
      <polyline points="92,110 114,128 130,122 152,140" fill="none" stroke={C.muted} strokeWidth={1.6} strokeLinejoin="round" />
      <polyline points="152,140 232,48" fill="none" stroke={C.up} strokeWidth={2.4} strokeLinecap="round" />
      <polyline points="232,48 254,66 270,60 290,78" fill="none" stroke={C.muted} strokeWidth={1.6} strokeLinejoin="round" />
      <polyline points="290,78 344,28" fill="none" stroke={C.up} strokeWidth={2.4} strokeLinecap="round" />
      <Label x={158} y={86} fill={C.up}>IMPULSE — large bodies, fast</Label>
      <Label x={92} y={158} fill={C.muted}>correction — overlap, drift</Label>
      <Label x={20} y={212} fill={C.fg}>Pullback = correction intact; reversal = structure broken.</Label>
      <Label x={20} y={228} fill={C.muted}>Energy lives in the impulse, hesitation in the correction.</Label>
    </SvgFrame>
  );
}

function LiquiditySweepFigure() {
  return (
    <SvgFrame height={238}>
      <Label x={20} y={18} fill={C.fg}>THE SWEEP — STOPS ARE THE FUEL</Label>
      <line x1={56} x2={240} y1={152} y2={152} stroke={C.muted} strokeWidth={1} strokeDasharray="4 3" />
      <Label x={58} y={168} fill={C.muted}>equal lows — the obvious shelf</Label>
      <polyline
        points="24,96 52,132 76,152 100,120 124,150 148,116 172,140 196,124 214,150 228,180 248,110 284,86 318,66 344,54"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx={76} cy={152} r={3} fill={C.accent} />
      <circle cx={124} cy={150} r={3} fill={C.accent} />
      <circle cx={214} cy={150} r={3} fill={C.accent} />
      <line x1={70} x2={78} y1={162} y2={162} stroke={C.loss} strokeWidth={1.6} />
      <line x1={118} x2={126} y1={162} y2={162} stroke={C.loss} strokeWidth={1.6} />
      <line x1={208} x2={216} y1={162} y2={162} stroke={C.loss} strokeWidth={1.6} />
      <Label x={246} y={166} fill={C.loss}>stops parked below</Label>
      <circle cx={228} cy={180} r={3.2} fill={C.loss} />
      <Label x={176} y={198} fill={C.loss}>sweep — the raid</Label>
      <Label x={262} y={122} fill={C.up}>reclaim</Label>
      <Label x={20} y={224} fill={C.fg}>Your stop is someone&apos;s fill — the raid is structural.</Label>
    </SvgFrame>
  );
}

/* ── Strategies: blueprints ──────────────────────────────────────────────── */

function BlueprintAnatomyFigure() {
  return (
    <SvgFrame height={250}>
      <Label x={20} y={18} fill={C.fg}>ONE BLUEPRINT, SIX FIELDS</Label>
      <Label x={24} y={44} fill={C.muted}>LOCATION — pullback in an uptrend</Label>
      <polyline
        points="24,196 56,158 84,176 122,132 150,150 186,118 204,140 232,104 260,114 292,78 330,58"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <line x1={196} x2={344} y1={140} y2={140} stroke={C.accent} strokeWidth={1.4} />
      <Label x={200} y={156} fill={C.accent}>entry — trigger closes</Label>
      <line x1={170} x2={344} y1={186} y2={186} stroke={C.loss} strokeWidth={1.3} strokeDasharray="5 4" />
      <Label x={174} y={202} fill={C.loss}>stop — beyond invalidation</Label>
      <line x1={230} x2={344} y1={48} y2={48} stroke={C.up} strokeWidth={1.3} strokeDasharray="5 4" />
      <Label x={344} y={42} fill={C.up} anchor="end">target — next liquidity</Label>
      <circle cx={204} cy={140} r={3.4} fill={C.accent} />
      <Label x={112} y={128} fill={C.up}>trigger</Label>
      <line x1={348} x2={348} y1={48} y2={186} stroke={C.muted} strokeWidth={1} />
      <Label x={342} y={100} fill={C.up} anchor="end">2R</Label>
      <Label x={342} y={168} fill={C.muted} anchor="end">1R</Label>
      <Label x={20} y={238} fill={C.fg}>The template doesn&apos;t predict — it prices the experiment.</Label>
    </SvgFrame>
  );
}

function PullbackTrendFigure() {
  return (
    <SvgFrame height={236}>
      <Label x={20} y={18} fill={C.fg}>PULLBACK IN AN UPTREND — LONG ONLY</Label>
      <Label x={24} y={60} fill={C.muted}>UPTREND — HH / HL intact</Label>
      <rect x={168} y={112} width={84} height={32} fill={C.accent} opacity={0.08} />
      <polyline
        points="24,196 64,148 96,166 144,110 180,132 216,122 252,90 284,100 316,66 344,52"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx={144} cy={110} r={3} fill={C.accent} />
      <circle cx={216} cy={122} r={3.2} fill={C.up} />
      <Label x={24} y={96} fill={C.accent}>the shelf — where buyers returned</Label>
      <Label x={206} y={162} fill={C.up}>trigger: buyers defend</Label>
      <Label x={20} y={222} fill={C.fg}>The trend gives the discount; the shelf proves demand.</Label>
    </SvgFrame>
  );
}

/* ── Registry ────────────────────────────────────────────────────────────── */

export const REGISTRY_EXTRA_A: Record<string, () => React.ReactElement> = {
  "orders-map": OrdersMapFigure,
  "leverage-arc": LeverageArcFigure,
  "expectancy-run": ExpectancyRunFigure,
  "drawdown-depth": DrawdownDepthFigure,
  "timeframe-stack": TimeframeStackFigure,
  "trend-range-panels": TrendRangePanelsFigure,
  "breakout-retest": BreakoutRetestFigure,
  "impulse-corrective": ImpulseCorrectiveFigure,
  "liquidity-sweep": LiquiditySweepFigure,
  "blueprint-anatomy": BlueprintAnatomyFigure,
  "pullback-trend": PullbackTrendFigure,
};
