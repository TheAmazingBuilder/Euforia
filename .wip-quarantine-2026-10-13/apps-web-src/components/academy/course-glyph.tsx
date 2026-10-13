import { cn } from "@/lib/utils";

/**
 * Catalog mini-figures — one tiny hand-set vignette per category, drawn in
 * the same token grammar as the lesson figures (no hex; inherits the row's
 * cycling ink through `currentColor`). Keyed by category id, so the Courses
 * shelf and the Overview category rows read as miniature shelves of the
 * same twelve domains.
 */

const STROKE = {
  main: "currentColor",
  sub: "var(--text-muted)",
} as const;

function FundamentalsGlyph() {
  return (
    <>
      {/* a bull candle and a bear candle — the raw material */}
      <line x1={14} x2={14} y1={4} y2={28} stroke={STROKE.main} strokeWidth={1.4} />
      <rect x={10} y={9} width={8} height={12} fill={STROKE.main} rx={1} />
      <line x1={34} x2={34} y1={6} y2={26} stroke={STROKE.main} strokeWidth={1.4} opacity={0.55} />
      <rect x={30} y={12} width={8} height={10} fill={STROKE.main} opacity={0.55} rx={1} />
    </>
  );
}

function RiskGlyph() {
  return (
    <>
      {/* rising equity with a shaded drawdown */}
      <polyline points="6,8 16,14 24,11 32,20 40,26" fill="none" stroke={STROKE.main} strokeWidth={1.6} strokeLinejoin="round" />
      <polygon points="32,20 40,26 40,20" fill={STROKE.main} opacity={0.18} />
      <polyline points="40,26 46,18" fill="none" stroke={STROKE.sub} strokeWidth={1.2} strokeDasharray="3 2" />
    </>
  );
}

function TechnicalGlyph() {
  return (
    <>
      {/* level shelf with a bouncing zigzag */}
      <line x1={5} x2={47} y1={8} y2={8} stroke={STROKE.sub} strokeWidth={1} strokeDasharray="3 2" />
      <line x1={5} x2={47} y1={25} y2={25} stroke={STROKE.sub} strokeWidth={1} strokeDasharray="3 2" />
      <polyline points="6,22 14,11 22,20 30,10 38,19 46,9" fill="none" stroke={STROKE.main} strokeWidth={1.6} strokeLinejoin="round" />
    </>
  );
}

function PriceActionGlyph() {
  return (
    <>
      {/* impulse, correction, impulse */}
      <polyline points="6,25 17,12" fill="none" stroke={STROKE.main} strokeWidth={2.2} strokeLinecap="round" />
      <polyline points="17,12 25,18 29,16 33,20" fill="none" stroke={STROKE.sub} strokeWidth={1.3} strokeLinejoin="round" />
      <polyline points="33,20 46,7" fill="none" stroke={STROKE.main} strokeWidth={2.2} strokeLinecap="round" />
    </>
  );
}

function CandlesGlyph() {
  return (
    <>
      {/* hammer, doji, marubozu — the pattern starters */}
      <line x1={12} x2={12} y1={5} y2={27} stroke={STROKE.main} strokeWidth={1.3} />
      <rect x={9} y={21} width={6} height={5} fill={STROKE.main} rx={1} />
      <line x1={26} x2={26} y1={6} y2={26} stroke={STROKE.main} strokeWidth={1.3} opacity={0.55} />
      <rect x={22.5} y={15} width={7} height={2} fill={STROKE.main} opacity={0.55} rx={0.5} />
      <line x1={40} x2={40} y1={7} y2={10} stroke={STROKE.main} strokeWidth={1.3} />
      <rect x={36} y={10} width={8} height={15} fill={STROKE.main} rx={1} />
    </>
  );
}

function ChartPatternsGlyph() {
  return (
    <>
      {/* the double top and its neckline */}
      <polyline points="6,26 14,11 22,16 30,11 38,26" fill="none" stroke={STROKE.main} strokeWidth={1.6} strokeLinejoin="round" />
      <line x1={5} x2={40} y1={20} y2={20} stroke={STROKE.sub} strokeWidth={1} strokeDasharray="3 2" />
    </>
  );
}

function IndicatorsGlyph() {
  return (
    <>
      {/* an oscillator wave between stretched bands */}
      <line x1={5} x2={47} y1={7} y2={7} stroke={STROKE.sub} strokeWidth={1} strokeDasharray="3 2" />
      <line x1={5} x2={47} y1={25} y2={25} stroke={STROKE.sub} strokeWidth={1} strokeDasharray="3 2" />
      <polyline points="6,18 14,10 21,15 28,23 34,16 46,9" fill="none" stroke={STROKE.main} strokeWidth={1.6} strokeLinejoin="round" />
    </>
  );
}

function StrategiesGlyph() {
  return (
    <>
      {/* target / entry / stop — the plan as three lines */}
      <line x1={8} x2={44} y1={6} y2={6} stroke={STROKE.main} strokeWidth={1.2} strokeDasharray="3 2" />
      <line x1={8} x2={44} y1={15} y2={15} stroke={STROKE.main} strokeWidth={1.6} />
      <line x1={8} x2={44} y1={25} y2={25} stroke={STROKE.main} strokeWidth={1.2} strokeDasharray="3 2" opacity={0.6} />
      <circle cx={22} cy={15} r={2} fill={STROKE.main} />
      <polyline points="10,28 18,18 26,21 40,8" fill="none" stroke={STROKE.sub} strokeWidth={1.2} strokeLinejoin="round" />
    </>
  );
}

function ManagementGlyph() {
  return (
    <>
      {/* a winner trailed by a ratcheting stop */}
      <polyline points="6,23 16,14 24,17 34,8 44,12" fill="none" stroke={STROKE.main} strokeWidth={1.6} strokeLinejoin="round" />
      <line x1={8} x2={16} y1={27} y2={27} stroke={STROKE.sub} strokeWidth={1.2} strokeDasharray="3 2" />
      <line x1={16} x2={26} y1={21} y2={21} stroke={STROKE.sub} strokeWidth={1.2} strokeDasharray="3 2" />
      <line x1={26} x2={36} y1={13} y2={13} stroke={STROKE.sub} strokeWidth={1.2} strokeDasharray="3 2" />
    </>
  );
}

function PsychologyGlyph() {
  return (
    <>
      {/* the tilt spike and the recovery — the mind's equity curve */}
      <polyline points="6,20 13,15 19,21 25,6 31,27 38,17 46,13" fill="none" stroke={STROKE.main} strokeWidth={1.6} strokeLinejoin="round" />
      <line x1={5} x2={47} y1={17} y2={17} stroke={STROKE.sub} strokeWidth={1} strokeDasharray="3 2" />
    </>
  );
}

function StructureGlyph() {
  return (
    <>
      {/* the HH/HL stair, marked at the turns */}
      <polyline points="6,25 14,17 20,21 30,12 36,16 46,7" fill="none" stroke={STROKE.main} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={14} cy={17} r={1.8} fill={STROKE.main} />
      <circle cx={30} cy={12} r={1.8} fill={STROKE.main} />
      <circle cx={46} cy={7} r={1.8} fill={STROKE.main} />
    </>
  );
}

function AdvancedGlyph() {
  return (
    <>
      {/* two correlated series breathing together */}
      <polyline points="6,21 16,13 26,17 36,8 46,12" fill="none" stroke={STROKE.main} strokeWidth={1.6} strokeLinejoin="round" />
      <polyline points="6,27 16,19 26,23 36,14 46,18" fill="none" stroke={STROKE.sub} strokeWidth={1.4} strokeDasharray="4 2" strokeLinejoin="round" />
    </>
  );
}

const GLYPHS: Record<string, () => React.JSX.Element> = {
  "cat-fundamentals": FundamentalsGlyph,
  "cat-risk": RiskGlyph,
  "cat-technical": TechnicalGlyph,
  "cat-price-action": PriceActionGlyph,
  "cat-candles": CandlesGlyph,
  "cat-chart-patterns": ChartPatternsGlyph,
  "cat-indicators": IndicatorsGlyph,
  "cat-strategies": StrategiesGlyph,
  "cat-management": ManagementGlyph,
  "cat-psychology": PsychologyGlyph,
  "cat-structure": StructureGlyph,
  "cat-advanced": AdvancedGlyph,
};

export function CourseGlyph({
  categoryId,
  className,
}: {
  categoryId: string;
  className?: string;
}) {
  const Glyph = GLYPHS[categoryId];
  return (
    <svg
      viewBox="0 0 52 32"
      className={cn("h-7 w-[45px]", className)}
      aria-hidden="true"
      data-testid="course-glyph"
      role="img"
    >
      {Glyph ? <Glyph /> : <FallbackGlyph />}
    </svg>
  );
}

function FallbackGlyph() {
  return (
    <>
      <line x1={8} x2={44} y1={10} y2={10} stroke={STROKE.main} strokeWidth={1.6} />
      <line x1={8} x2={44} y1={16} y2={16} stroke={STROKE.main} strokeWidth={1.6} opacity={0.6} />
      <line x1={8} x2={44} y1={22} y2={22} stroke={STROKE.main} strokeWidth={1.6} opacity={0.3} />
    </>
  );
}
