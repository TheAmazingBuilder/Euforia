/**
 * Playbook template library (product contract §18) — REFERENCE DATA owned by
 * the Playbook domain. Templates are starting points, NOT profitability
 * claims: instantiating one creates a DRAFT strategy the trader must make
 * their own before trading it.
 *
 * The content mirrors the product template library verbatim (the frontend
 * mock currently carries its own copy — documented Phase 7 duplication, to
 * be converged onto a shared source when the frontend is wired to the API).
 */

import type { CreateStrategyInput, PlaybookTemplateCard } from "../../../shared/contracts";

interface PlaybookTemplate extends PlaybookTemplateCard {
  payload: Omit<CreateStrategyInput, "name">;
}

export const PLAYBOOK_TEMPLATES: PlaybookTemplate[] = [
  {
    key: "breakout",
    name: "Breakout",
    description: "Trade direct breaks of tested levels during expansion windows.",
    tradingStyle: "INTRADAY",
    marketConditions: ["EXPANSION", "HIGH_VOLATILITY"],
    tags: ["breakout"],
    payload: {
      description: "Direct breakout of tested levels.",
      detailedDescription:
        "Define the level (held ≥ 2×), the expansion window, and the maximum chase distance before the entry is allowed. Created from the Cosmoz template library — make it yours before trading it.",
      tags: ["breakout", "template"],
      marketConditions: ["EXPANSION", "HIGH_VOLATILITY"],
      marketProfile: { assetClass: null, symbols: [], market: null, accountLabel: null, timeframe: "15m", tradingStyle: "INTRADAY", sessions: ["NEW_YORK"], tradingDays: ["MON", "TUE", "WED", "THU", "FRI"] },
      entryConditions: [{ id: "t1", category: "PRICE_ACTION", text: "Candle body closes beyond the level (wick alone is not a break).", group: null }],
      confirmations: [{ id: "t1", type: "CANDLE_CLOSE", note: "Body close, not a wick poke." }],
      invalidations: ["Price re-accepts inside the level before entry."],
      risk: { defaultRiskPct: 1, maxRiskPct: 2, fixedRiskAmount: null, stopMethodology: "Beyond the level + volatility buffer", targetMethodology: "Measured move or 1.5R", minRR: 1.5, maxConcurrentTrades: 2, maxCorrelatedExposure: 2, dailyRiskRestriction: null, newsRestriction: "No entry 15 min around high-impact news." },
    },
  },
  {
    key: "breakout-retest",
    name: "Breakout + Retest",
    description: "Let the break happen, enter on the return to the level.",
    tradingStyle: "INTRADAY",
    marketConditions: ["EXPANSION"],
    tags: ["breakout", "retest"],
    payload: {
      description: "Breakout entry on the retest, not the impulse.",
      detailedDescription:
        "Wait for the break, then the pullback to the level. The retest candle must hold. Created from the Cosmoz template library — make it yours before trading it.",
      tags: ["breakout", "retest", "template"],
      marketConditions: ["EXPANSION"],
      marketProfile: { assetClass: null, symbols: [], market: null, accountLabel: null, timeframe: "15m", tradingStyle: "INTRADAY", sessions: ["NEW_YORK"], tradingDays: ["MON", "TUE", "WED", "THU", "FRI"] },
      entryConditions: [
        { id: "t1", category: "PRICE_ACTION", text: "Level broken with a body close.", group: null },
        { id: "t2", category: "PRICE_ACTION", text: "Retest touches the level within 6 candles and holds.", group: null },
      ],
      confirmations: [{ id: "t1", type: "RETEST", note: "Retest candle closes in breakout direction." }],
      invalidations: ["Body close back through the level before the retest."],
      risk: { defaultRiskPct: 1, maxRiskPct: 2, fixedRiskAmount: null, stopMethodology: "Beyond the retest extreme", targetMethodology: "1.5R partial, trail the rest", minRR: 1.5, maxConcurrentTrades: 2, maxCorrelatedExposure: 2, dailyRiskRestriction: null, newsRestriction: null },
    },
  },
  {
    key: "trend-following",
    name: "Trend Following",
    description: "Stay with the prevailing structure until it breaks.",
    tradingStyle: "SWING",
    marketConditions: ["TRENDING", "BULLISH_STRUCTURE", "BEARISH_STRUCTURE"],
    tags: ["trend"],
    payload: {
      description: "Trade with the prevailing structure, exit on structure break.",
      detailedDescription:
        "Define the higher-timeframe trend, the pullback depth you accept, and the structure break that ends the trade. Created from the Cosmoz template library — make it yours before trading it.",
      tags: ["trend", "template"],
      marketConditions: ["TRENDING"],
      marketProfile: { assetClass: null, symbols: [], market: null, accountLabel: null, timeframe: "4H", tradingStyle: "SWING", sessions: [], tradingDays: ["MON", "TUE", "WED", "THU", "FRI"] },
      entryConditions: [{ id: "t1", category: "MARKET_STRUCTURE", text: "Higher-timeframe structure intact (higher highs / lower lows).", group: null }],
      confirmations: [{ id: "t1", type: "MULTI_TIMEFRAME_CONFIRMATION", note: "HTF trend + LTF trigger agree." }],
      invalidations: ["Higher-timeframe structure breaks against the position."],
      risk: { defaultRiskPct: 1, maxRiskPct: 2, fixedRiskAmount: null, stopMethodology: "Beyond the last structure point", targetMethodology: "Trail the structure", minRR: 2, maxConcurrentTrades: 3, maxCorrelatedExposure: 2, dailyRiskRestriction: null, newsRestriction: null },
    },
  },
  {
    key: "pullback",
    name: "Pullback",
    description: "Buy weakness in uptrends, sell strength in downtrends.",
    tradingStyle: "INTRADAY",
    marketConditions: ["TRENDING"],
    tags: ["pullback"],
    payload: {
      description: "Enter on controlled pullbacks inside a trend.",
      detailedDescription:
        "Define the trend (structure or moving average), the pullback zone, and the trigger that resumes the trend. Created from the Cosmoz template library — make it yours before trading it.",
      tags: ["pullback", "template"],
      marketConditions: ["TRENDING"],
      marketProfile: { assetClass: null, symbols: [], market: null, accountLabel: null, timeframe: "15m", tradingStyle: "INTRADAY", sessions: [], tradingDays: ["MON", "TUE", "WED", "THU", "FRI"] },
      entryConditions: [{ id: "t1", category: "PRICE_ACTION", text: "Pullback into the defined zone without breaking structure.", group: null }],
      confirmations: [{ id: "t1", type: "CANDLE_CLOSE", note: "Resumption candle closes in trend direction." }],
      invalidations: ["Pullback turns into a structure break."],
      risk: { defaultRiskPct: 1, maxRiskPct: 2, fixedRiskAmount: null, stopMethodology: "Beyond the pullback extreme", targetMethodology: "Prior swing point", minRR: 1.5, maxConcurrentTrades: 2, maxCorrelatedExposure: 2, dailyRiskRestriction: null, newsRestriction: null },
    },
  },
  {
    key: "mean-reversion",
    name: "Mean Reversion",
    description: "Fade stretched moves back to the average.",
    tradingStyle: "INTRADAY",
    marketConditions: ["RANGING", "LOW_VOLATILITY"],
    tags: ["reversion"],
    payload: {
      description: "Fade statistical extremes back to the mean.",
      detailedDescription:
        "Define what 'stretched' means (distance from average, bands, RSI) and the average you fade to. Never fade a trending tape. Created from the Cosmoz template library — make it yours before trading it.",
      tags: ["reversion", "template"],
      marketConditions: ["RANGING", "LOW_VOLATILITY"],
      marketProfile: { assetClass: null, symbols: [], market: null, accountLabel: null, timeframe: "15m", tradingStyle: "INTRADAY", sessions: [], tradingDays: ["MON", "TUE", "WED", "THU", "FRI"] },
      entryConditions: [{ id: "t1", category: "INDICATOR", text: "Price stretched ≥ 2σ from the mean, no trend context.", group: null }],
      confirmations: [{ id: "t1", type: "MOMENTUM_CONFIRMATION", note: "Momentum stalls at the extreme." }],
      invalidations: ["Expansion continues — one more leg away from the mean."],
      risk: { defaultRiskPct: 0.5, maxRiskPct: 1, fixedRiskAmount: null, stopMethodology: "Beyond the stretch extreme", targetMethodology: "The mean", minRR: 1, maxConcurrentTrades: 1, maxCorrelatedExposure: 1, dailyRiskRestriction: null, newsRestriction: null },
    },
  },
  {
    key: "momentum",
    name: "Momentum",
    description: "Join bursts of directional volume with tight invalidation.",
    tradingStyle: "SCALPING",
    marketConditions: ["EXPANSION", "HIGH_VOLATILITY"],
    tags: ["momentum"],
    payload: {
      description: "Join momentum bursts with strict invalidation.",
      detailedDescription:
        "Define the momentum trigger (volume, range expansion) and the exact invalidation — momentum dies fast. Created from the Cosmoz template library — make it yours before trading it.",
      tags: ["momentum", "template"],
      marketConditions: ["EXPANSION"],
      marketProfile: { assetClass: null, symbols: [], market: null, accountLabel: null, timeframe: "5m", tradingStyle: "SCALPING", sessions: [], tradingDays: ["MON", "TUE", "WED", "THU", "FRI"] },
      entryConditions: [{ id: "t1", category: "VOLATILITY", text: "Range expansion ≥ 1.5× ATR with volume.", group: null }],
      confirmations: [{ id: "t1", type: "VOLUME_CONFIRMATION", note: "Volume ≥ 1.5× average." }],
      invalidations: ["Momentum candle fully retraced."],
      risk: { defaultRiskPct: 0.5, maxRiskPct: 1, fixedRiskAmount: null, stopMethodology: "Beyond the momentum candle", targetMethodology: "Fixed 1R scalp", minRR: 1, maxConcurrentTrades: 1, maxCorrelatedExposure: 1, dailyRiskRestriction: null, newsRestriction: null },
    },
  },
  {
    key: "range",
    name: "Range Trading",
    description: "Fade the edges of a mature, breathing range.",
    tradingStyle: "INTRADAY",
    marketConditions: ["RANGING"],
    tags: ["range"],
    payload: {
      description: "Trade the edges of a defined range.",
      detailedDescription:
        "The range must be mature (≥ 3 alternations). Fade edges toward the midpoint; stop beyond the edge; never argue with a body close outside. Created from the Cosmoz template library — make it yours before trading it.",
      tags: ["range", "template"],
      marketConditions: ["RANGING"],
      marketProfile: { assetClass: null, symbols: [], market: null, accountLabel: null, timeframe: "5m", tradingStyle: "INTRADAY", sessions: [], tradingDays: ["MON", "TUE", "WED", "THU", "FRI"] },
      entryConditions: [{ id: "t1", category: "MARKET_STRUCTURE", text: "Mature range (≥ 3 edge alternations) identified on the execution timeframe.", group: null }],
      confirmations: [{ id: "t1", type: "CANDLE_CLOSE", note: "Rejection candle closes back inside." }],
      invalidations: ["Body close beyond the edge."],
      risk: { defaultRiskPct: 1, maxRiskPct: 2, fixedRiskAmount: null, stopMethodology: "Beyond the edge + spread", targetMethodology: "Range midpoint", minRR: 1, maxConcurrentTrades: 1, maxCorrelatedExposure: 1, dailyRiskRestriction: null, newsRestriction: null },
    },
  },
  {
    key: "support-resistance",
    name: "Support / Resistance",
    description: "Reactions at levels the market respects.",
    tradingStyle: "SWING",
    marketConditions: ["RANGING", "TRENDING"],
    tags: ["levels"],
    payload: {
      description: "Trade reactions at respected levels.",
      detailedDescription:
        "A level only exists if it produced a reaction before. Define reaction quality (wick/body), the invalidation, and what you do when the level breaks. Created from the Cosmoz template library — make it yours before trading it.",
      tags: ["levels", "template"],
      marketConditions: ["RANGING"],
      marketProfile: { assetClass: null, symbols: [], market: null, accountLabel: null, timeframe: "4H", tradingStyle: "SWING", sessions: [], tradingDays: ["MON", "TUE", "WED", "THU", "FRI"] },
      entryConditions: [{ id: "t1", category: "PRICE_ACTION", text: "Level produced a visible reaction within the last 20 sessions.", group: null }],
      confirmations: [{ id: "t1", type: "RETEST", note: "Wick rejection at the level." }],
      invalidations: ["Two consecutive body closes beyond the level."],
      risk: { defaultRiskPct: 1, maxRiskPct: 2, fixedRiskAmount: null, stopMethodology: "Beyond the reaction extreme", targetMethodology: "Next structural level", minRR: 1.5, maxConcurrentTrades: 2, maxCorrelatedExposure: 2, dailyRiskRestriction: null, newsRestriction: null },
    },
  },
  {
    key: "scalping",
    name: "Scalping",
    description: "Small targets, many reps, strict costs control.",
    tradingStyle: "SCALPING",
    marketConditions: ["EXPANSION", "COMPRESSION"],
    tags: ["scalp"],
    payload: {
      description: "High-frequency small-target execution.",
      detailedDescription:
        "Scalping lives and dies on costs and discipline: define the spread ceiling, the minimum R:R after fees, and the daily stop. Created from the Cosmoz template library — make it yours before trading it.",
      tags: ["scalp", "template"],
      marketConditions: ["EXPANSION"],
      marketProfile: { assetClass: null, symbols: [], market: null, accountLabel: null, timeframe: "1m", tradingStyle: "SCALPING", sessions: [], tradingDays: ["MON", "TUE", "WED", "THU", "FRI"] },
      entryConditions: [{ id: "t1", category: "TIME", text: "Only inside the defined liquid window.", group: null }],
      confirmations: [{ id: "t1", type: "CANDLE_CLOSE", note: "Trigger candle closes in direction." }],
      invalidations: ["Spread widens beyond the ceiling."],
      risk: { defaultRiskPct: 0.5, maxRiskPct: 1, fixedRiskAmount: null, stopMethodology: "Fixed small stop", targetMethodology: "Fixed small target, no runner", minRR: 1, maxConcurrentTrades: 1, maxCorrelatedExposure: 1, dailyRiskRestriction: "Stop after 3 consecutive losses.", newsRestriction: "No scalping through releases." },
    },
  },
  {
    key: "swing",
    name: "Swing Trading",
    description: "Multi-day positions carried on structure.",
    tradingStyle: "POSITION",
    marketConditions: ["TRENDING", "BULLISH_STRUCTURE", "BEARISH_STRUCTURE"],
    tags: ["swing"],
    payload: {
      description: "Multi-day swing positions managed on structure.",
      detailedDescription:
        "Define the swing context (daily structure), the entry timing, the overnight risk rules and the structural exit. Created from the Cosmoz template library — make it yours before trading it.",
      tags: ["swing", "template"],
      marketConditions: ["TRENDING"],
      marketProfile: { assetClass: null, symbols: [], market: null, accountLabel: null, timeframe: "1D", tradingStyle: "POSITION", sessions: [], tradingDays: ["MON", "TUE", "WED"] },
      entryConditions: [{ id: "t1", category: "MARKET_STRUCTURE", text: "Daily structure supports the direction.", group: null }],
      confirmations: [{ id: "t1", type: "MULTI_TIMEFRAME_CONFIRMATION", note: "Daily + 4H agree." }],
      invalidations: ["Daily structure breaks.", "Time stop: 10 sessions without progress."],
      risk: { defaultRiskPct: 1, maxRiskPct: 2, fixedRiskAmount: null, stopMethodology: "Beyond the daily structure point", targetMethodology: "Measured move / trail", minRR: 2, maxConcurrentTrades: 3, maxCorrelatedExposure: 2, dailyRiskRestriction: null, newsRestriction: null },
    },
  },
];

/** Read model for GET /playbook/templates — cards without payloads. */
export function playbookTemplateCards(): PlaybookTemplateCard[] {
  return PLAYBOOK_TEMPLATES.map(({ key, name, description, tradingStyle, marketConditions, tags }) => ({
    key,
    name,
    description,
    tradingStyle,
    marketConditions,
    tags,
  }));
}

/** POST /playbook/templates/instantiate → full create payload (or null). */
export function templateToCreateInput(key: string, nameOverride?: string): CreateStrategyInput | null {
  const template = PLAYBOOK_TEMPLATES.find((item) => item.key === key);
  if (!template) return null;
  return {
    name: (nameOverride ?? template.name).trim(),
    ...template.payload,
  };
}
