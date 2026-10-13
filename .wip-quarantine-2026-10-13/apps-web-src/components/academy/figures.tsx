"use client";

import * as React from "react";

import type { AcademyFigure } from "@cosmoz/shared";

import { REGISTRY_EXTRA_A } from "@/components/academy/figures-extra";
import { REGISTRY_EXTRA_B } from "@/components/academy/figures-extra-2";

/**
 * Lesson figure registry — token-driven SVG diagrams (CSS variables only;
 * the hex exception stays reserved for the CosmozMark brand tile). Two
 * engines do most of the work: a candle renderer fed with OHLC data and a
 * polyline renderer for structure diagrams, plus a few hand-set risk panels.
 */

export type Candle = { o: number; h: number; l: number; c: number };

export const C = {
  up: "var(--profit)",
  down: "var(--loss)",
  loss: "var(--loss)",
  accent: "var(--accent)",
  /* Le Registre's real ink tokens: --text-primary / --text-muted. The shadcn
     aliases (--foreground, --muted-foreground) are NOT defined as raw CSS
     variables — using them silently paints nothing (stroke falls back to
     none, fill to black). Found while wiring the t46 figures. */
  fg: "var(--text-primary)",
  muted: "var(--text-muted)",
  border: "var(--border)",
  warn: "var(--warning)",
  surface: "var(--surface)",
};

/** Shared candle engine — also consumed by the Practice pattern lab. */
export function CandleSvg({ candles, labels, height = 190 }: { candles: Candle[]; labels?: string[]; height?: number }) {
  const width = 340;
  const padX = 26;
  const padTop = 14;
  const padBottom = labels ? 30 : 14;
  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const span = max - min || 1;
  const plotH = height - padTop - padBottom;
  const slot = (width - padX * 2) / candles.length;
  const bodyW = Math.min(slot * 0.52, 26);
  const y = (price: number) => padTop + (1 - (price - min) / span) * plotH;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full max-w-md"
      role="img"
      aria-label="Candle diagram"
    >
      {candles.map((candle, index) => {
        const cx = padX + slot * index + slot / 2;
        const bull = candle.c >= candle.o;
        const color = bull ? C.up : C.down;
        const bodyTop = y(Math.max(candle.o, candle.c));
        const bodyBottom = y(Math.min(candle.o, candle.c));
        return (
          <g key={index}>
            <line
              x1={cx}
              x2={cx}
              y1={y(candle.h)}
              y2={y(candle.l)}
              stroke={color}
              strokeWidth={1.6}
            />
            <rect
              x={cx - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={Math.max(bodyBottom - bodyTop, 2)}
              fill={color}
              rx={1.5}
            />
            {labels?.[index] ? (
              <text
                x={cx}
                y={height - 8}
                textAnchor="middle"
                fontSize={9.5}
                fontFamily="var(--font-mono, monospace)"
                fill={C.muted}
              >
                {labels[index]}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function SvgFrame({ children, height = 210 }: { children: React.ReactNode; height?: number }) {
  return (
    <svg
      viewBox={`0 0 360 ${height}`}
      className="h-auto w-full max-w-md"
      role="img"
      aria-label="Diagram"
    >
      {children}
    </svg>
  );
}

export function Label({ x, y, children, fill = C.muted, anchor = "start" }: { x: number; y: number; children: React.ReactNode; fill?: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} fontSize={9.5} fontFamily="var(--font-mono, monospace)" fill={fill} textAnchor={anchor}>
      {children}
    </text>
  );
}

/* ── Figure library ──────────────────────────────────────────────────────── */

function AnatomyFigure() {
  // Two oversized candles with callouts on the bullish one.
  const candles: Candle[] = [
    { o: 30, h: 92, l: 8, c: 82 },
    { o: 78, h: 96, l: 22, c: 20 },
  ];
  const y = (price: number) => 20 + (1 - price / 100) * 160;
  return (
    <SvgFrame height={230}>
      {[0, 1].map((index) => {
        const candle = candles[index];
        const cx = 84 + index * 100;
        const bull = index === 0;
        const color = bull ? C.up : C.down;
        const bodyTop = y(Math.max(candle.o, candle.c));
        const bodyBottom = y(Math.min(candle.o, candle.c));
        return (
          <g key={index}>
            <line x1={cx} x2={cx} y1={y(candle.h)} y2={y(candle.l)} stroke={color} strokeWidth={2} />
            <rect x={cx - 16} y={bodyTop} width={32} height={Math.max(bodyBottom - bodyTop, 2)} fill={color} rx={2} />
          </g>
        );
      })}
      {/* callouts on the bullish candle */}
      <line x1={100} x2={200} y1={y(92)} y2={y(92)} stroke={C.muted} strokeDasharray="3 3" strokeWidth={1} />
      <Label x={205} y={y(92) + 3} fill={C.fg}>High — upper wick tip</Label>
      <line x1={100} x2={200} y1={y(82)} y2={y(82)} stroke={C.muted} strokeDasharray="3 3" strokeWidth={1} />
      <Label x={205} y={y(82) + 3} fill={C.fg}>Close (body top)</Label>
      <line x1={100} x2={200} y1={y(30)} y2={y(30)} stroke={C.muted} strokeDasharray="3 3" strokeWidth={1} />
      <Label x={205} y={y(30) + 3} fill={C.fg}>Open (body bottom)</Label>
      <line x1={100} x2={200} y1={y(8)} y2={y(8)} stroke={C.muted} strokeDasharray="3 3" strokeWidth={1} />
      <Label x={205} y={y(8) + 3} fill={C.fg}>Low — lower wick tip</Label>
      <Label x={64} y={222} fill={C.fg}>BULLISH</Label>
      <Label x={164} y={222} fill={C.fg}>BEARISH</Label>
    </SvgFrame>
  );
}

function SentimentFigure() {
  return (
    <CandleSvg
      labels={["Marubozu", "Strong", "Balanced", "Spinning top", "Doji"]}
      candles={[
        { o: 10, h: 91, l: 9, c: 90 },
        { o: 22, h: 88, l: 12, c: 80 },
        { o: 40, h: 74, l: 26, c: 58 },
        { o: 44, h: 78, l: 24, c: 56 },
        { o: 50, h: 72, l: 30, c: 51 },
      ]}
    />
  );
}

function HammerStarFigure() {
  return (
    <SvgFrame height={220}>
      {/* left: hammer at support after decline */}
      <polyline
        points="24,40 48,66 70,58 92,92 112,84"
        fill="none"
        stroke={C.muted}
        strokeWidth={1.6}
      />
      {/* hammer candle */}
      <line x1={134} x2={134} y1={96} y2={168} stroke={C.up} strokeWidth={2} />
      <rect x={124} y={96} width={20} height={14} fill={C.up} rx={2} />
      <line x1={20} x2={220} y1={168} y2={168} stroke={C.accent} strokeWidth={1.4} strokeDasharray="5 4" />
      <Label x={22} y={182} fill={C.accent}>SUPPORT ZONE</Label>
      <Label x={60} y={214} fill={C.fg}>HAMMER · after decline, at support</Label>
      {/* divider */}
      <line x1={240} x2={240} y1={16} y2={200} stroke={C.border} strokeWidth={1} />
      {/* right: shooting star at resistance after advance */}
      <polyline
        points="262,160 284,132 304,140 322,106 336,96"
        fill="none"
        stroke={C.muted}
        strokeWidth={1.6}
      />
      <line x1={352} x2={352} y1={32} y2={104} stroke={C.down} strokeWidth={2} />
      <rect x={342} y={104} width={20} height={14} fill={C.down} rx={2} transform="translate(-10,0)" />
      <line x1={252} x2={360} y1={32} y2={32} stroke={C.accent} strokeWidth={1.4} strokeDasharray="5 4" />
      <Label x={254} y={26} fill={C.accent}>RESISTANCE ZONE</Label>
      <Label x={256} y={214} fill={C.fg}>SHOOTING STAR · after advance</Label>
    </SvgFrame>
  );
}

function EngulfingFigure() {
  return (
    <CandleSvg
      labels={["decline", "last seller", "ENGULFING", "confirm next"]}
      candles={[
        { o: 72, h: 78, l: 46, c: 50 },
        { o: 52, h: 56, l: 34, c: 38 },
        { o: 36, h: 74, l: 34, c: 70 },
        { o: 68, h: 86, l: 62, c: 82 },
      ]}
      height={210}
    />
  );
}

function MorningStarFigure() {
  return (
    <CandleSvg
      labels={["1 · sell-off", "2 · equilibrium", "3 · reclaim", ""]}
      candles={[
        { o: 84, h: 90, l: 40, c: 44 },
        { o: 40, h: 48, l: 34, c: 43 },
        { o: 46, h: 82, l: 42, c: 78 },
        { o: 76, h: 92, l: 70, c: 88 },
      ]}
      height={210}
    />
  );
}

function SupportResistanceFigure() {
  return (
    <SvgFrame height={220}>
      {/* resistance zone */}
      <rect x={16} y={40} width={328} height={16} fill={C.accent} opacity={0.14} />
      <line x1={16} x2={344} y1={48} y2={48} stroke={C.accent} strokeWidth={1.2} strokeDasharray="5 4" />
      <Label x={20} y={34} fill={C.accent}>RESISTANCE ZONE</Label>
      {/* path: approach, reject, reject, break, retest, continue */}
      <polyline
        points="24,150 56,60 84,132 112,52 148,120 184,30 216,52 244,46 276,72 304,58 336,26"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.8}
      />
      <circle cx={56} cy={60} r={3} fill={C.accent} />
      <circle cx={112} cy={52} r={3} fill={C.accent} />
      <Label x={160} y={26} fill={C.up}>close above = break</Label>
      <Label x={210} y={84} fill={C.warn}>retest as support</Label>
      <Label x={288} y={28} fill={C.up}>continuation</Label>
      <Label x={66} y={190}>two touches, visible reaction each time</Label>
      {/* role flip line */}
      <line x1={200} x2={344} y1={48} y2={48} stroke={C.up} strokeWidth={1.2} strokeDasharray="5 4" />
      <Label x={252} y={44} fill={C.up}>role flip</Label>
    </SvgFrame>
  );
}

function UptrendFigure() {
  return (
    <SvgFrame height={220}>
      <polyline
        points="24,180 74,120 100,150 156,84 186,116 244,52 272,84 336,28"
        fill="none"
        stroke={C.fg}
        strokeWidth={2}
      />
      {[
        [74, 120, "HH"],
        [100, 150, "HL"],
        [156, 84, "HH"],
        [186, 116, "HL"],
        [244, 52, "HH"],
        [272, 84, "HL"],
      ].map(([x, yy, label], index) => (
        <g key={index}>
          <circle cx={x as number} cy={yy as number} r={3.4} fill={C.accent} />
          <Label x={(x as number) + 7} y={(yy as number) + 3} fill={C.accent}>
            {label as string}
          </Label>
        </g>
      ))}
      <Label x={24} y={206} fill={C.fg}>Higher highs + higher lows = uptrend, marked at turns.</Label>
    </SvgFrame>
  );
}

function BosChochFigure() {
  return (
    <SvgFrame height={230}>
      <polyline
        points="20,178 62,120 88,148 138,84 166,112 224,56 250,88 300,120 330,150"
        fill="none"
        stroke={C.fg}
        strokeWidth={2}
      />
      {/* BOS: close above the 224 swing high */}
      <line x1={20} x2={250} y1={56} y2={56} stroke={C.up} strokeWidth={1.3} strokeDasharray="5 4" />
      <Label x={24} y={50} fill={C.up}>BOS — close above swing high (continuation)</Label>
      {/* CHoCH: close below the last higher low (250,88) */}
      <line x1={210} x2={352} y1={88} y2={88} stroke={C.loss} strokeWidth={1.3} strokeDasharray="5 4" />
      <Label x={214} y={104} fill={C.loss}>CHoCH — close under the higher low</Label>
      <circle cx={224} cy={56} r={3.4} fill={C.accent} />
      <circle cx={250} cy={88} r={3.4} fill={C.accent} />
      <Label x={22} y={222} fill={C.fg}>Closes decide breaks; wicks are raids.</Label>
    </SvgFrame>
  );
}

function DoubleTopFigure() {
  return (
    <SvgFrame height={220}>
      <polyline
        points="24,180 70,90 104,60 138,92 172,62 208,96 244,132 292,140 336,150"
        fill="none"
        stroke={C.fg}
        strokeWidth={2}
      />
      <line x1={40} x2={330} y1={142} y2={142} stroke={C.accent} strokeWidth={1.3} strokeDasharray="5 4" />
      <Label x={44} y={156} fill={C.accent}>neckline</Label>
      <circle cx={104} cy={60} r={3.4} fill={C.accent} />
      <circle cx={172} cy={62} r={3.4} fill={C.accent} />
      <Label x={70} y={48}>left peak</Label>
      <Label x={150} y={52}>right peak (fails to exceed)</Label>
      <Label x={210} y={124} fill={C.warn}>close below confirms</Label>
      <Label x={24} y={206} fill={C.fg}>Two rejections of the same supply — the “M”.</Label>
    </SvgFrame>
  );
}

function BullFlagFigure() {
  return (
    <SvgFrame height={220}>
      {/* pole */}
      <polyline points="28,180 44,172 62,120 80,60" fill="none" stroke={C.fg} strokeWidth={2} />
      {/* flag channel */}
      <polyline points="80,60 104,74 124,66 148,84 168,74 190,92" fill="none" stroke={C.fg} strokeWidth={2} />
      <line x1={70} x2={196} y1={54} y2={86} stroke={C.border} strokeWidth={1} strokeDasharray="4 4" />
      <line x1={74} x2={198} y1={92} y2={126} stroke={C.border} strokeWidth={1} strokeDasharray="4 4" />
      {/* breakout */}
      <polyline points="190,92 226,54 260,40 336,24" fill="none" stroke={C.up} strokeWidth={2} />
      <Label x={34} y={202}>pole</Label>
      <Label x={112} y={144}>shallow drift = absorption</Label>
      <Label x={214} y={92} fill={C.up}>break of flag</Label>
      <Label x={186} y={202} fill={C.fg}>target ≈ pole length projected</Label>
    </SvgFrame>
  );
}

function RiskPerTradeFigure() {
  return (
    <SvgFrame height={140}>
      {/* account bar */}
      <rect x={24} y={56} width={312} height={26} fill="none" stroke={C.border} strokeWidth={1.2} rx={4} />
      <rect x={24} y={56} width={31} height={26} fill={C.loss} opacity={0.55} rx={4} />
      <Label x={60} y={47} fill={C.fg}>$9,900 — working capital</Label>
      <Label x={24} y={100} fill={C.loss}>$100 at risk (1%)</Label>
      <Label x={24} y={122} fill={C.fg}>Account $10,000 × 1% = $100 — decided before the entry.</Label>
      <Label x={24} y={30} fill={C.fg}>RISK PER TRADE</Label>
    </SvgFrame>
  );
}

function PositionSizingFigure() {
  return (
    <SvgFrame height={220}>
      {/* price ladder */}
      <line x1={60} x2={330} y1={60} y2={60} stroke={C.up} strokeWidth={1.6} />
      <Label x={64} y={52} fill={C.fg}>Entry 1.0850</Label>
      <line x1={60} x2={330} y1={150} y2={150} stroke={C.loss} strokeWidth={1.6} strokeDasharray="5 4" />
      <Label x={64} y={166} fill={C.fg}>Stop 1.0800 (50 pips)</Label>
      {/* bracket */}
      <line x1={44} x2={44} y1={60} y2={150} stroke={C.muted} strokeWidth={1.2} />
      <Label x={12} y={108} fill={C.muted}>50p</Label>
      <Label x={64} y={110} fill={C.fg}>Budget $100 ÷ (50 × $10/pip)</Label>
      <Label x={64} y={128} fill={C.accent}>= 0.20 lots — risk stays $100</Label>
      <Label x={24} y={30} fill={C.fg}>SIZE SERVES THE STOP</Label>
    </SvgFrame>
  );
}

function RMultipleFigure() {
  return (
    <SvgFrame height={220}>
      {/* zones */}
      <rect x={60} y={40} width={220} height={56} fill={C.up} opacity={0.12} />
      <rect x={60} y={124} width={220} height={56} fill={C.loss} opacity={0.12} />
      <line x1={40} x2={330} y1={120} y2={120} stroke={C.fg} strokeWidth={1.8} />
      <Label x={40} y={114} fill={C.fg}>Entry</Label>
      <Label x={70} y={70} fill={C.up}>+2R target ($200)</Label>
      <Label x={70} y={156} fill={C.loss}>−1R stop ($100)</Label>
      <Label x={70} y={116} fill={C.muted}>1R = the unit of account</Label>
      <Label x={24} y={202} fill={C.fg}>Speak in R: outcomes become comparable across any market.</Label>
      <Label x={24} y={30} fill={C.fg}>A 1:2 PLAN</Label>
    </SvgFrame>
  );
}

/* ── Indicator & zone figures (t46) ─────────────────────────────────────── */

export function PriceLabel({ points, color, label, lx, ly }: { points: [number, number][]; color: string; label: string; lx: number; ly: number }) {
  return (
    <g>
      <polyline
        points={points.map(([x, yy]) => `${x},${yy}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Label x={lx} y={ly} fill={color}>{label}</Label>
    </g>
  );
}

function SmaEmaFigure() {
  const price: [number, number][] = [
    [24, 190], [52, 150], [78, 168], [108, 110], [134, 128], [164, 84],
    [190, 100], [220, 70], [246, 88], [276, 58], [306, 74], [336, 44],
  ];
  const sma: [number, number][] = [
    [24, 198], [52, 186], [78, 174], [108, 162], [134, 150], [164, 138],
    [190, 126], [220, 114], [246, 102], [276, 90], [306, 78], [336, 66],
  ];
  const ema: [number, number][] = [
    [24, 194], [52, 172], [78, 162], [108, 140], [134, 134], [164, 110],
    [190, 106], [220, 88], [246, 88], [276, 72], [306, 72], [336, 56],
  ];
  return (
    <SvgFrame height={240}>
      <PriceLabel points={price} color={C.fg} label="PRICE" lx={300} ly={36} />
      <PriceLabel points={sma} color={C.accent} label="SMA 20 — trails" lx={232} ly={118} />
      <PriceLabel points={ema} color={C.warn} label="EMA 20 — turns first" lx={196} ly={142} />
      {/* the pullback where the EMA reacts before the SMA */}
      <circle cx={134} cy={128} r={3.4} fill={C.warn} />
      <line x1={134} x2={134} y1={128} y2={196} stroke={C.border} strokeWidth={1} strokeDasharray="3 3" />
      <Label x={140} y={208} fill={C.fg}>pullback — the EMA bends first,</Label>
      <Label x={140} y={220} fill={C.fg}>the SMA needs more closes</Label>
    </SvgFrame>
  );
}

function MacdFigure() {
  const price: [number, number][] = [
    [24, 100], [56, 64], [84, 80], [116, 44], [148, 60], [180, 32],
    [216, 74], [248, 58], [282, 100], [336, 92],
  ];
  const macd: [number, number][] = [
    [30, 196], [66, 176], [102, 152], [138, 144], [174, 154], [210, 184],
    [246, 206], [282, 220], [318, 210], [354, 196],
  ];
  const signal: [number, number][] = [
    [30, 200], [66, 188], [102, 172], [138, 160], [174, 156], [210, 170],
    [246, 192], [282, 210], [318, 216], [354, 206],
  ];
  const hist = [7, 14, 22, 29, 36, 29, 22, 14, 7, -4, -11, -18, -25, -22, -14, -7];
  const zero = 200;
  return (
    <SvgFrame height={272}>
      {/* top panel — price makes a higher high */}
      <PriceLabel points={price} color={C.fg} label="PRICE" lx={296} ly={44} />
      <circle cx={116} cy={44} r={3} fill={C.accent} />
      <circle cx={180} cy={32} r={3} fill={C.accent} />
      <Label x={122} y={40} fill={C.muted}>high 1</Label>
      <Label x={186} y={28} fill={C.muted}>high 2 — higher</Label>
      <line x1={16} x2={344} y1={118} y2={118} stroke={C.border} strokeWidth={1} />
      {/* bottom panel — MACD */}
      <line x1={20} x2={344} y1={zero} y2={zero} stroke={C.muted} strokeWidth={1} strokeDasharray="3 3" />
      <Label x={330} y={zero - 4} fill={C.muted}>0</Label>
      {hist.map((h, index) => (
        <rect
          key={index}
          x={30 + index * 19}
          y={h >= 0 ? zero - h : zero}
          width={10}
          height={Math.abs(h)}
          fill={h >= 0 ? C.up : C.loss}
          opacity={0.55}
          rx={1}
        />
      ))}
      <polyline
        points={macd.map(([x, yy]) => `${x},${yy}`).join(" ")}
        fill="none"
        stroke={C.accent}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <polyline
        points={signal.map(([x, yy]) => `${x},${yy}`).join(" ")}
        fill="none"
        stroke={C.warn}
        strokeWidth={1.6}
        strokeDasharray="4 3"
        strokeLinejoin="round"
      />
      <Label x={22} y={136} fill={C.accent}>MACD 12-26</Label>
      <Label x={126} y={136} fill={C.warn}>SIGNAL 9</Label>
      <Label x={214} y={136} fill={C.muted}>HISTOGRAM</Label>
      {/* the divergence — lower MACD high under the higher price high */}
      <line x1={130} x2={186} y1={140} y2={152} stroke={C.loss} strokeWidth={1.3} strokeDasharray="4 3" />
      <Label x={208} y={246} fill={C.loss}>lower high — trend tiring</Label>
      <Label x={22} y={264} fill={C.fg}>Divergence is a question — structure answers.</Label>
    </SvgFrame>
  );
}

function AdxFigure() {
  const price: [number, number][] = [
    [24, 80], [52, 62], [78, 86], [104, 66], [130, 88], [156, 64], [182, 84],
    [208, 60], [234, 44], [260, 52], [286, 34], [312, 40], [336, 24],
  ];
  const adx: [number, number][] = [
    [30, 228], [66, 220], [102, 212], [138, 206], [174, 198], [210, 184],
    [246, 172], [282, 158], [318, 150], [336, 146],
  ];
  const trendY = 176;
  const rangeY = 194;
  return (
    <SvgFrame height={272}>
      {/* top panel — range, then breakout */}
      <PriceLabel points={price} color={C.fg} label="PRICE" lx={300} ly={40} />
      <Label x={24} y={104} fill={C.muted}>range — no direction to pay for</Label>
      {/* vertical alignment: breakout and ADX rise together */}
      <line x1={208} x2={208} y1={20} y2={244} stroke={C.border} strokeWidth={1} strokeDasharray="3 3" />
      <Label x={214} y={72} fill={C.muted}>breakout</Label>
      <line x1={16} x2={344} y1={118} y2={118} stroke={C.border} strokeWidth={1} />
      {/* bottom panel — ADX with thresholds */}
      <rect x={16} y={132} width={328} height={trendY - 132} fill={C.accent} opacity={0.06} />
      <rect x={16} y={rangeY} width={328} height={244 - rangeY} fill={C.muted} opacity={0.05} />
      <line x1={16} x2={344} y1={trendY} y2={trendY} stroke={C.accent} strokeWidth={1.2} strokeDasharray="5 4" />
      <line x1={16} x2={344} y1={rangeY} y2={rangeY} stroke={C.muted} strokeWidth={1.2} strokeDasharray="5 4" />
      <polyline
        points={adx.map(([x, yy]) => `${x},${yy}`).join(" ")}
        fill="none"
        stroke={C.accent}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Label x={24} y={169} fill={C.accent}>25 — trend worth following</Label>
      <Label x={24} y={210} fill={C.muted}>20 — range, breakout logic suffers</Label>
      <Label x={22} y={148} fill={C.accent}>ADX</Label>
      <Label x={22} y={264} fill={C.fg}>ADX never says which way — pair it with structure.</Label>
    </SvgFrame>
  );
}

function RsiZonesFigure() {
  const y = (value: number) => 24 + (1 - value / 100) * 176;
  const rsi: [number, number][] = [
    [24, y(50)], [52, y(61)], [80, y(70)], [108, y(77)], [136, y(80)],
    [164, y(73)], [192, y(71)], [220, y(61)], [248, y(45)], [276, y(34)],
    [304, y(39)], [336, y(51)],
  ];
  return (
    <SvgFrame height={240}>
      {/* stretched zones */}
      <rect x={24} y={24} width={320} height={y(70) - 24} fill={C.loss} opacity={0.1} />
      <rect x={24} y={y(30)} width={320} height={200 - y(30)} fill={C.up} opacity={0.1} />
      <line x1={24} x2={344} y1={y(70)} y2={y(70)} stroke={C.muted} strokeWidth={1} strokeDasharray="5 4" />
      <line x1={24} x2={344} y1={y(30)} y2={y(30)} stroke={C.muted} strokeWidth={1} strokeDasharray="5 4" />
      <line x1={24} x2={344} y1={y(50)} y2={y(50)} stroke={C.border} strokeWidth={1} />
      <polyline
        points={rsi.map(([x, yy]) => `${x},${yy}`).join(" ")}
        fill="none"
        stroke={C.accent}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Label x={330} y={y(70) - 5} fill={C.loss} anchor="end">70 — stretched</Label>
      <Label x={330} y={y(30) + 12} fill={C.up} anchor="end">30 — stretched</Label>
      <Label x={330} y={y(50) - 4} fill={C.muted} anchor="end">50</Label>
      <Label x={64} y={y(80) - 8} fill={C.warn}>in a trend, 70+ is strength — not a sell</Label>
      <Label x={100} y={178} fill={C.fg}>range extremes: stretched, not reversed</Label>
      <Label x={24} y={226} fill={C.fg}>Regime first: trend or range changes the meaning.</Label>
    </SvgFrame>
  );
}

function BollingerVolumeFigure() {
  const upper: [number, number][] = [
    [24, 60], [60, 58], [96, 62], [130, 66], [160, 70], [190, 72],
    [220, 60], [250, 44], [280, 34], [312, 26], [336, 22],
  ];
  const lower: [number, number][] = [
    [24, 130], [60, 128], [96, 130], [130, 128], [160, 124], [190, 118],
    [220, 128], [250, 140], [280, 150], [312, 152], [336, 150],
  ];
  const price: [number, number][] = [
    [24, 96], [48, 84], [72, 104], [96, 90], [120, 100], [144, 94],
    [168, 98], [192, 95], [216, 86], [240, 62], [268, 50], [296, 42], [336, 30],
  ];
  const volume = [10, 14, 8, 12, 9, 11, 8, 10, 7, 9, 12, 34, 28, 22, 18];
  return (
    <SvgFrame height={272}>
      {/* bands — squeeze then expansion */}
      <polyline
        points={upper.map(([x, yy]) => `${x},${yy}`).join(" ")}
        fill="none"
        stroke={C.accent}
        strokeWidth={1.2}
        strokeDasharray="4 3"
      />
      <polyline
        points={lower.map(([x, yy]) => `${x},${yy}`).join(" ")}
        fill="none"
        stroke={C.accent}
        strokeWidth={1.2}
        strokeDasharray="4 3"
      />
      <rect x={130} y={20} width={80} height={130} fill={C.muted} opacity={0.05} />
      <line x1={130} x2={130} y1={20} y2={150} stroke={C.border} strokeWidth={1} strokeDasharray="3 3" />
      <line x1={210} x2={210} y1={20} y2={150} stroke={C.border} strokeWidth={1} strokeDasharray="3 3" />
      <PriceLabel points={price} color={C.fg} label="PRICE" lx={306} ly={44} />
      <Label x={118} y={16} fill={C.accent}>SQUEEZE — compression precedes expansion</Label>
      <Label x={216} y={100} fill={C.up}>close outside the band</Label>
      <line x1={16} x2={344} y1={160} y2={160} stroke={C.border} strokeWidth={1} />
      {/* volume — the witness test */}
      {volume.map((h, index) => {
        const breakout = index >= 11;
        return (
          <rect
            key={index}
            x={30 + index * 21}
            y={240 - h}
            width={11}
            height={h}
            fill={breakout ? C.up : C.muted}
            opacity={breakout ? 0.8 : 0.4}
            rx={1}
          />
        );
      })}
      <Label x={22} y={176} fill={C.muted}>VOLUME</Label>
      <Label x={244} y={200} fill={C.up}>witnesses arrive</Label>
      <Label x={22} y={264} fill={C.fg}>Volume answers &quot;did anyone care?&quot; — the witness test.</Label>
    </SvgFrame>
  );
}

function SupplyDemandFigure() {
  return (
    <SvgFrame height={240}>
      {/* zones */}
      <rect x={24} y={36} width={320} height={28} fill={C.loss} opacity={0.14} />
      <line x1={24} x2={344} y1={64} y2={64} stroke={C.loss} strokeWidth={1.2} strokeDasharray="5 4" />
      <Label x={28} y={30} fill={C.loss}>SUPPLY — sellers in control</Label>
      <rect x={24} y={168} width={320} height={28} fill={C.up} opacity={0.14} />
      <line x1={24} x2={344} y1={168} y2={168} stroke={C.up} strokeWidth={1.2} strokeDasharray="5 4" />
      <Label x={28} y={212} fill={C.up}>DEMAND — buyers step in</Label>
      <line x1={24} x2={344} y1={116} y2={116} stroke={C.border} strokeWidth={1} strokeDasharray="2 4" />
      <Label x={330} y={112} fill={C.muted} anchor="end">equilibrium</Label>
      {/* drift into demand */}
      <polyline
        points="24,120 60,142 84,168"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {/* base inside demand */}
      <polyline
        points="84,168 100,178 116,172"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {/* displacement out of demand — the intent leg */}
      <polyline
        points="116,172 140,150 168,116 196,92"
        fill="none"
        stroke={C.up}
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* approach and reaction at supply */}
      <polyline
        points="196,92 216,76 232,64"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <polyline
        points="232,64 248,88 262,74 278,62"
        fill="none"
        stroke={C.fg}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <circle cx={100} cy={178} r={3.2} fill={C.up} />
      <circle cx={232} cy={64} r={3.2} fill={C.loss} />
      <Label x={104} y={158} fill={C.up}>base → displacement = intent</Label>
      <Label x={240} y={100} fill={C.loss}>reaction at the edge</Label>
      <Label x={28} y={232} fill={C.fg}>Zones, not lines — origins mark where control changed.</Label>
    </SvgFrame>
  );
}

const REGISTRY: Record<string, () => React.ReactElement> = {
  ...REGISTRY_EXTRA_A,
  ...REGISTRY_EXTRA_B,
  anatomy: AnatomyFigure,
  sentiment: SentimentFigure,
  "hammer-star": HammerStarFigure,
  engulfing: EngulfingFigure,
  "morning-star": MorningStarFigure,
  "support-resistance": SupportResistanceFigure,
  "uptrend-hhhl": UptrendFigure,
  "bos-choch": BosChochFigure,
  "double-top": DoubleTopFigure,
  "bull-flag": BullFlagFigure,
  "risk-per-trade": RiskPerTradeFigure,
  "position-sizing": PositionSizingFigure,
  "r-multiple": RMultipleFigure,
  "sma-ema": SmaEmaFigure,
  macd: MacdFigure,
  adx: AdxFigure,
  "rsi-zones": RsiZonesFigure,
  "bollinger-volume": BollingerVolumeFigure,
  "supply-demand": SupplyDemandFigure,
};

export function LessonFigure({ figure }: { figure: AcademyFigure }) {
  const Renderer = REGISTRY[figure.ref];
  return (
    <figure
      data-testid="lesson-figure"
      className="my-5 rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      {Renderer ? (
        <div className="flex justify-center text-foreground">
          <Renderer />
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
          Figure “{figure.ref}” is on its way.
        </div>
      )}
      <figcaption className="mt-2 text-center font-mono text-[11px] leading-relaxed text-muted-foreground">
        {figure.caption}
      </figcaption>
    </figure>
  );
}
