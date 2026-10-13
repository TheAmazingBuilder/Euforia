"use client";

import * as React from "react";

import { C, Label, SvgFrame } from "@/components/academy/figures";

/**
 * Lesson figure library — extension B (t47). Range reversion, invalidation,
 * trade management, traps, multi-timeframe alignment, correlation, system
 * statistics and the process loop. Same grammar as figures.tsx: tokens only,
 * honest annotations, labels inside the 360 viewBox.
 */

/* ── Range reversion & invalidation ──────────────────────────────────────── */

function RangeReversionFigure() {
  return (
    <SvgFrame height={246}>
      <Label x={20} y={18} fill={C.fg}>RANGE — FADE THE EDGES</Label>
      <rect x={60} y={64} width={260} height={88} fill={C.muted} opacity={0.04} />
      <rect x={60} y={64} width={260} height={88} fill="none" stroke={C.border} strokeWidth={1.2} />
      <line x1={60} x2={320} y1={108} y2={108} stroke={C.muted} strokeWidth={1} strokeDasharray="4 3" />
      <Label x={326} y={111} fill={C.muted}>mean</Label>
      <polyline
        points="64,144 92,74 120,146 148,72 176,144 204,76 232,144 260,78 288,142 316,88"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx={148} cy={72} r={3.2} fill={C.loss} />
      <circle cx={260} cy={78} r={3.2} fill={C.loss} />
      <circle cx={120} cy={146} r={3.2} fill={C.up} />
      <circle cx={232} cy={144} r={3.2} fill={C.up} />
      <Label x={66} y={58} fill={C.loss}>sell fade</Label>
      <Label x={66} y={170} fill={C.up}>buy fade</Label>
      <Label x={20} y={226} fill={C.fg}>Fade the extremes; never chase the middle break.</Label>
      <Label x={20} y={240} fill={C.muted}>Edges compressing? The range is dying — switch playbooks.</Label>
    </SvgFrame>
  );
}

function InvalidationFigure() {
  return (
    <SvgFrame height={244}>
      <Label x={20} y={18} fill={C.fg}>WHERE THE THESIS DIES</Label>
      <polyline
        points="24,180 56,132 84,152 120,102 148,124 184,88 210,112 240,84 264,126 286,98 308,138 332,156 344,162"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx={210} cy={112} r={3.4} fill={C.accent} />
      <Label x={128} y={96} fill={C.accent}>the HL carrying the read</Label>
      <line x1={204} x2={344} y1={112} y2={112} stroke={C.accent} strokeWidth={1.3} strokeDasharray="5 4" />
      <Label x={340} y={106} fill={C.accent} anchor="end">the line</Label>
      <circle cx={286} cy={98} r={3.2} fill={C.up} />
      <Label x={232} y={70} fill={C.up}>raid — read survives</Label>
      <circle cx={308} cy={138} r={3.2} fill={C.loss} />
      <Label x={344} y={178} fill={C.loss} anchor="end">close below — thesis dead, exit</Label>
      <Label x={20} y={224} fill={C.fg}>A read without a line is a mood — closes decide.</Label>
    </SvgFrame>
  );
}

/* ── Trade management ────────────────────────────────────────────────────── */

function TrailingExitFigure() {
  return (
    <SvgFrame height={236}>
      <Label x={20} y={18} fill={C.fg}>TRAIL THE STRUCTURE</Label>
      <polyline
        points="28,150 66,110 94,130 142,86 172,106 228,60 258,80 310,42 340,36"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <line x1={56} x2={100} y1={140} y2={140} stroke={C.loss} strokeWidth={1.3} strokeDasharray="5 4" />
      <line x1={100} x2={176} y1={118} y2={118} stroke={C.loss} strokeWidth={1.3} strokeDasharray="5 4" />
      <line x1={176} x2={256} y1={92} y2={92} stroke={C.loss} strokeWidth={1.3} strokeDasharray="5 4" />
      <line x1={256} x2={344} y1={56} y2={56} stroke={C.loss} strokeWidth={1.3} strokeDasharray="5 4" />
      <line x1={100} x2={100} y1={140} y2={118} stroke={C.loss} strokeWidth={1} strokeDasharray="3 3" />
      <line x1={176} x2={176} y1={118} y2={92} stroke={C.loss} strokeWidth={1} strokeDasharray="3 3" />
      <line x1={256} x2={256} y1={92} y2={56} stroke={C.loss} strokeWidth={1} strokeDasharray="3 3" />
      <Label x={24} y={188} fill={C.loss}>stop ratchets with each HL — risk shrinks</Label>
      <Label x={200} y={34} fill={C.up}>still on — risk shrinking</Label>
      <Label x={20} y={222} fill={C.fg}>Protect the winner with a moved line, not with hope.</Label>
    </SvgFrame>
  );
}

function ExitLadderFigure() {
  return (
    <SvgFrame height={250}>
      <Label x={20} y={18} fill={C.fg}>THE EXIT LADDER, WRITTEN FIRST</Label>
      <line x1={30} x2={344} y1={58} y2={58} stroke={C.up} strokeWidth={1.3} strokeDasharray="5 4" />
      <Label x={34} y={52} fill={C.up}>T2 +2R — runner, trailed</Label>
      <line x1={30} x2={344} y1={104} y2={104} stroke={C.up} strokeWidth={1.3} strokeDasharray="5 4" />
      <Label x={34} y={98} fill={C.up}>T1 +1R — half off</Label>
      <line x1={30} x2={344} y1={150} y2={150} stroke={C.accent} strokeWidth={1.4} />
      <Label x={34} y={164} fill={C.accent}>entry · stop to break-even after T1</Label>
      <line x1={30} x2={344} y1={196} y2={196} stroke={C.loss} strokeWidth={1.3} strokeDasharray="5 4" />
      <Label x={34} y={212} fill={C.loss}>stop −1R</Label>
      <polyline
        points="30,172 64,150 96,128 124,108 150,104 178,120 210,96 238,62 266,72 300,50 330,40"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx={150} cy={104} r={3.2} fill={C.up} />
      <circle cx={238} cy={62} r={3.2} fill={C.up} />
      <Label x={20} y={236} fill={C.fg}>Exits priced before entry — the ladder is the position.</Label>
    </SvgFrame>
  );
}

function StopDisciplineFigure() {
  return (
    <SvgFrame height={244}>
      <Label x={20} y={18} fill={C.fg}>THE FIRST STOP IS THE CHEAPEST</Label>
      <line x1={186} x2={186} y1={28} y2={208} stroke={C.border} strokeWidth={1} />
      {/* left: honored */}
      <Label x={24} y={40} fill={C.up}>STOP HONORED</Label>
      <polyline points="24,116 52,138 80,124 108,150 128,158" fill="none" stroke={C.fg} strokeWidth={1.6} strokeLinejoin="round" />
      <line x1={30} x2={140} y1={158} y2={158} stroke={C.loss} strokeWidth={1.3} strokeDasharray="5 4" />
      <circle cx={128} cy={158} r={3.2} fill={C.loss} />
      <Label x={24} y={180} fill={C.muted}>exit clean, account intact</Label>
      <Label x={24} y={198} fill={C.fg}>−1R — the planned cost</Label>
      {/* right: widened */}
      <Label x={200} y={40} fill={C.loss}>STOP WIDENED ×3</Label>
      <polyline points="200,110 224,134 244,124 268,152 288,142 312,168 336,186" fill="none" stroke={C.fg} strokeWidth={1.6} strokeLinejoin="round" />
      <line x1={200} x2={248} y1={120} y2={120} stroke={C.loss} strokeWidth={1} strokeDasharray="4 3" />
      <line x1={248} x2={290} y1={142} y2={142} stroke={C.loss} strokeWidth={1} strokeDasharray="4 3" />
      <line x1={290} x2={336} y1={170} y2={170} stroke={C.loss} strokeWidth={1} strokeDasharray="4 3" />
      <Label x={204} y={206} fill={C.loss}>each widening = a fresh R</Label>
      <Label x={20} y={232} fill={C.fg}>Widen the stop, widen the loss — the move was yours.</Label>
    </SvgFrame>
  );
}

/* ── Psychology & advanced ───────────────────────────────────────────────── */

function BullTrapFigure() {
  return (
    <SvgFrame height={244}>
      <Label x={20} y={18} fill={C.fg}>THE BULL TRAP</Label>
      <line x1={20} x2={180} y1={104} y2={104} stroke={C.muted} strokeWidth={1.4} />
      <Label x={24} y={96} fill={C.muted}>resistance</Label>
      <line x1={180} x2={320} y1={104} y2={104} stroke={C.loss} strokeWidth={1.2} strokeDasharray="5 4" />
      <Label x={316} y={96} fill={C.loss} anchor="end">old level — new ceiling</Label>
      <polyline
        points="24,156 50,116 76,130 102,108 128,120 156,96 178,72 198,60 218,76 238,110 262,136 292,166 326,186 344,196"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx={198} cy={60} r={3.2} fill={C.warn} />
      <Label x={206} y={50} fill={C.warn}>the bait — closes above</Label>
      <circle cx={238} cy={110} r={3.2} fill={C.loss} />
      <Label x={246} y={88} fill={C.loss}>trap springs</Label>
      <Label x={24} y={222} fill={C.fg}>FOMO buys the break — wait for closes, not pokes.</Label>
    </SvgFrame>
  );
}

function MtfAlignmentFigure() {
  return (
    <SvgFrame height={252}>
      <Label x={20} y={18} fill={C.fg}>ALIGNMENT BEFORE RISK</Label>
      <Label x={24} y={58} fill={C.accent}>D1</Label>
      <polyline points="64,74 100,56 136,66 172,50 208,62 244,46 280,56 316,42" fill="none" stroke={C.fg} strokeWidth={1.6} strokeLinejoin="round" />
      <Label x={64} y={86} fill={C.up}>UP — trend</Label>
      <line x1={16} x2={344} y1={92} y2={92} stroke={C.border} strokeWidth={1} />
      <Label x={24} y={124} fill={C.accent}>H1</Label>
      <polyline points="64,132 100,116 136,140 172,124 208,142 244,128 280,146 316,132" fill="none" stroke={C.fg} strokeWidth={1.6} strokeLinejoin="round" />
      <Label x={64} y={152} fill={C.up}>PULLBACK in uptrend</Label>
      <line x1={16} x2={344} y1={158} y2={158} stroke={C.border} strokeWidth={1} />
      <Label x={24} y={190} fill={C.accent}>M5</Label>
      <polyline points="64,210 100,218 136,198 172,206 208,190 244,198 280,182 316,190" fill="none" stroke={C.fg} strokeWidth={1.6} strokeLinejoin="round" />
      <Label x={224} y={214} fill={C.up}>LONG TRIGGER — entry</Label>
      <Label x={20} y={240} fill={C.fg}>Three rows agree — risk on. One dissents — wait.</Label>
    </SvgFrame>
  );
}

function CorrelationClustersFigure() {
  return (
    <SvgFrame height={260}>
      <Label x={20} y={18} fill={C.fg}>THREE TICKETS, ONE BET</Label>
      <polyline
        points="24,86 56,72 88,82 120,62 152,74 184,54 216,66 248,48 280,58 312,44 344,50"
        fill="none"
        stroke={C.accent}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <polyline
        points="24,102 56,88 88,98 120,78 152,90 184,70 216,82 248,64 280,74 312,60 344,66"
        fill="none"
        stroke={C.warn}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeDasharray="5 3"
      />
      <Label x={344} y={38} fill={C.accent} anchor="end">EUR long</Label>
      <Label x={344} y={82} fill={C.warn} anchor="end">GBP long</Label>
      <Label x={24} y={122} fill={C.muted}>they breathe together — one shared driver</Label>
      <line x1={16} x2={344} y1={136} y2={136} stroke={C.border} strokeWidth={1} />
      {/* exposure math */}
      <rect x={56} y={176} width={30} height={34} fill={C.accent} opacity={0.7} rx={2} />
      <rect x={100} y={176} width={30} height={34} fill={C.warn} opacity={0.7} rx={2} />
      <rect x={144} y={176} width={30} height={34} fill={C.accent} opacity={0.7} rx={2} />
      <Label x={56} y={170} fill={C.muted}>0.5%</Label>
      <Label x={100} y={170} fill={C.muted}>0.5%</Label>
      <Label x={144} y={170} fill={C.muted}>0.5%</Label>
      <Label x={91} y={196} fill={C.fg}>+</Label>
      <Label x={135} y={196} fill={C.fg}>+</Label>
      <Label x={180} y={196} fill={C.fg}>=</Label>
      <rect x={194} y={162} width={60} height={48} fill={C.loss} opacity={0.75} rx={2} />
      <Label x={194} y={224} fill={C.loss}>1.5% on one driver</Label>
      <Label x={20} y={244} fill={C.fg}>Budget risk per driver — correlated stops fire together.</Label>
    </SvgFrame>
  );
}

function StatsCurveFigure() {
  return (
    <SvgFrame height={248}>
      <Label x={20} y={18} fill={C.fg}>JUDGE ON 100, NOT ON 10</Label>
      <rect x={112} y={96} width={66} height={72} fill={C.muted} opacity={0.06} />
      <polyline
        points="24,140 48,120 68,132 92,108 112,124 132,146 152,160 172,138 192,116 212,92 232,104 252,80 272,90 296,64 320,72 344,52"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Label x={108} y={184} fill={C.muted}>the streak — a fee, not a verdict</Label>
      <Label x={24} y={206} fill={C.muted}>WIN RATE 43%</Label>
      <Label x={124} y={206} fill={C.up}>EXPECTANCY +0.15R</Label>
      <Label x={258} y={206} fill={C.warn}>MAX DD 18%</Label>
      <Label x={20} y={234} fill={C.fg}>Six-to-eight loss runs are expected — size to survive.</Label>
    </SvgFrame>
  );
}

function ProcessLoopFigure() {
  return (
    <SvgFrame height={248}>
      <Label x={20} y={18} fill={C.fg}>THE LOOP THAT COMPOUNDS</Label>
      {/* four stations */}
      <rect x={36} y={44} width={88} height={34} rx={6} fill="none" stroke={C.accent} strokeWidth={1.4} />
      <Label x={80} y={64} fill={C.accent} anchor="middle">ROUTINE</Label>
      <rect x={236} y={44} width={88} height={34} rx={6} fill="none" stroke={C.fg} strokeWidth={1.4} />
      <Label x={280} y={64} fill={C.fg} anchor="middle">EXECUTE</Label>
      <rect x={236} y={156} width={88} height={34} rx={6} fill="none" stroke={C.warn} strokeWidth={1.4} />
      <Label x={280} y={176} fill={C.warn} anchor="middle">JOURNAL</Label>
      <rect x={36} y={156} width={88} height={34} rx={6} fill="none" stroke={C.up} strokeWidth={1.4} />
      <Label x={80} y={176} fill={C.up} anchor="middle">REVIEW</Label>
      {/* arrows */}
      <line x1={124} x2={228} y1={61} y2={61} stroke={C.muted} strokeWidth={1.3} />
      <polygon points="236,61 227,57 227,65" fill={C.muted} />
      <line x1={280} x2={280} y1={78} y2={148} stroke={C.muted} strokeWidth={1.3} />
      <polygon points="280,156 276,147 284,147" fill={C.muted} />
      <line x1={232} x2={132} y1={173} y2={173} stroke={C.muted} strokeWidth={1.3} />
      <polygon points="124,173 133,169 133,177" fill={C.muted} />
      <line x1={80} x2={80} y1={152} y2={86} stroke={C.muted} strokeWidth={1.3} />
      <polygon points="80,78 76,87 84,87" fill={C.muted} />
      <Label x={180} y={108} fill={C.muted} anchor="middle">score the process,</Label>
      <Label x={180} y={122} fill={C.muted} anchor="middle">not the P&amp;L</Label>
      <Label x={20} y={232} fill={C.fg}>Routine strips the morning; the journal closes the loop.</Label>
    </SvgFrame>
  );
}

/* ── Registry ────────────────────────────────────────────────────────────── */

export const REGISTRY_EXTRA_B: Record<string, () => React.ReactElement> = {
  "range-reversion": RangeReversionFigure,
  "invalidation-level": InvalidationFigure,
  "trailing-exit": TrailingExitFigure,
  "exit-ladder": ExitLadderFigure,
  "stop-discipline": StopDisciplineFigure,
  "bull-trap": BullTrapFigure,
  "mtf-alignment": MtfAlignmentFigure,
  "correlation-clusters": CorrelationClustersFigure,
  "stats-curve": StatsCurveFigure,
  "process-loop": ProcessLoopFigure,
};
