import type { AuthoredCategory, AuthoredCourse } from "./types";
import { FUNDAMENTALS_COURSES, RISK_COURSES } from "./lessons-foundations";
import { TECHNICAL_COURSES, PRICE_ACTION_COURSES, STRUCTURE_COURSES } from "./lessons-technical";
import { CANDLE_COURSES } from "./lessons-candles";
import { CHART_PATTERN_COURSES, INDICATOR_COURSES } from "./lessons-patterns";
import { STRATEGY_COURSES, TRADE_MANAGEMENT_COURSES, PSYCHOLOGY_COURSES, ADVANCED_COURSES } from "./lessons-strategies";

/**
 * The Academy catalog — 12 course categories (Glossary is its own section).
 * Courses are grouped in lesson files by track; this file is the single
 * registry the engine serves through the API.
 */

export const CATEGORIES: AuthoredCategory[] = [
  { id: "cat-fundamentals", name: "Trading Fundamentals", description: "Markets, instruments, orders, leverage and sessions - the vocabulary every later lesson assumes.", level: "BEGINNER", icon: "Coins" },
  { id: "cat-risk", name: "Risk Management", description: "Survival first: risk per trade, position sizing, stops, drawdown math and risk of ruin.", level: "BEGINNER", icon: "ShieldAlert" },
  { id: "cat-technical", name: "Technical Analysis", description: "Charts, timeframes, trends, ranges, key levels and breakout quality.", level: "BEGINNER", icon: "TrendingUp" },
  { id: "cat-price-action", name: "Price Action", description: "Impulse and correction, rejection, liquidity and the SMC framework - with its limits stated plainly.", level: "INTERMEDIATE", icon: "Activity" },
  { id: "cat-candles", name: "Candlestick Patterns", description: "Anatomy, the single-candle family, and multi-candle formations - always graded by context.", level: "BEGINNER", icon: "CandlestickChart" },
  { id: "cat-chart-patterns", name: "Chart Patterns", description: "Reversal and continuation formations with measured-move targets and honest invalidation.", level: "INTERMEDIATE", icon: "ChartColumn" },
  { id: "cat-indicators", name: "Indicators", description: "Trend, momentum, volatility and volume tools - what each measures and when it lies.", level: "INTERMEDIATE", icon: "Gauge" },
  { id: "cat-strategies", name: "Trading Strategies", description: "A 13-field template, then trend, pullback, breakout, mean reversion and your own system's validation.", level: "INTERMEDIATE", icon: "Swords" },
  { id: "cat-trade-management", name: "Trade Management", description: "Everything after entry: break-even, partials, scaling, trailing and exit criteria.", level: "INTERMEDIATE", icon: "Layers" },
  { id: "cat-psychology", name: "Trading Psychology", description: "FOMO, revenge, tilt, fear and greed - and the routine that makes discipline cheap.", level: "BEGINNER", icon: "Brain" },
  { id: "cat-structure", name: "Market Structure", description: "Swings, HH/HL/LH/LL, BOS, CHoCH and structural invalidation - the chart's skeleton.", level: "INTERMEDIATE", icon: "GitBranch" },
  { id: "cat-advanced", name: "Advanced Trading", description: "Top-down systems, regimes, execution quality and statistical thinking.", level: "ADVANCED", icon: "FlaskConical" },
];

export const COURSES: AuthoredCourse[] = [
  ...FUNDAMENTALS_COURSES,
  ...RISK_COURSES,
  ...TECHNICAL_COURSES,
  ...PRICE_ACTION_COURSES,
  ...CANDLE_COURSES,
  ...CHART_PATTERN_COURSES,
  ...INDICATOR_COURSES,
  ...STRATEGY_COURSES,
  ...TRADE_MANAGEMENT_COURSES,
  ...PSYCHOLOGY_COURSES,
  ...STRUCTURE_COURSES,
  ...ADVANCED_COURSES,
];

/** Learning levels → a simple progression across the whole Academy. */
export const LEVEL_ORDER: Record<string, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

/**
 * Learning paths — guided cross-track sequences in pedagogical order.
 * Progress derives from the member courses' completion (engine-side join).
 */
export const PATHS: { id: string; title: string; description: string; icon: string; courseIds: string[] }[] = [
  {
    id: "path-foundations",
    title: "From zero to first trade",
    description: "The vocabulary, the account mechanics, the risk math and your first charts - in the order that compounds.",
    icon: "Coins",
    courseIds: ["crs-fund-markets", "crs-fund-account", "crs-risk-fundamentals", "crs-ta-charts", "crs-candles-single"],
  },
  {
    id: "path-risk-discipline",
    title: "Risk & the disciplined mind",
    description: "Position sizing, drawdown survival, the psychology of losses and managing what happens after entry.",
    icon: "ShieldAlert",
    courseIds: ["crs-risk-fundamentals", "crs-risk-advanced", "crs-psychology", "crs-trademgmt"],
  },
  {
    id: "path-price-reader",
    title: "Read price like a professional",
    description: "Charts, candle behavior, structure, and the formations that matter - pattern plus context, never pattern alone.",
    icon: "CandlestickChart",
    courseIds: ["crs-ta-charts", "crs-pa-behavior", "crs-candles-single", "crs-candles-multi", "crs-structure-reading", "crs-chartpatterns-reversal"],
  },
  {
    id: "path-system-builder",
    title: "Build & validate a system",
    description: "Indicators as filters, the 13-field strategy template, and the statistics to know whether it actually works.",
    icon: "FlaskConical",
    courseIds: ["crs-indicators-trend-momentum", "crs-strategies-core", "crs-strategies-styles", "crs-advanced-systematic", "crs-advanced-execution"],
  },
];
