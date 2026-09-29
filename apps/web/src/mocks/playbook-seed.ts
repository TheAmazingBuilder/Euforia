import type {
  ChecklistTemplate,
  CreateStrategyInput,
  MarketCondition,
  PlaybookRule,
  PlaybookTemplateCard,
  Setup,
  Strategy,
  TradingStyle,
} from "@cosmoz/shared";

/**
 * Professional Playbook module — deterministic seed + template library.
 *
 * Seeded ONCE per store creation (same lifecycle as the fixtures): the three
 * fixture strategies receive structured setups, pre-trade checklists and
 * scoped operating rules, so every tab of the module has honest content on
 * first paint. Everything here is DEFINITION data, never performance data —
 * aggregates stay derived from trades in the store (server-side).
 */

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

// ── Setups (§9) ──────────────────────────────────────────────────────────────

interface SetupSeed {
  strategyName: string;
  name: string;
  status: Setup["status"];
  description: string;
  context: string;
  marketCondition: MarketCondition | null;
  trigger: string | null;
  confirmation: string | null;
  entryModel: string | null;
  stopModel: string | null;
  targetModel: string | null;
  invalidation: string | null;
  notes: string | null;
  tags: string[];
}

const SETUP_SEEDS: SetupSeed[] = [
  {
    strategyName: "Breakout NY",
    name: "Breakout + Retest",
    status: "ACTIVE",
    description: "The bread-and-butter variant: enter on the retest of the broken level, never on the impulse candle.",
    context:
      "Use when the NY open drives price through a level that held at least twice. The level must be obvious on the 15m — if you have to look for it, it is not a level.",
    marketCondition: "EXPANSION",
    trigger: "15m candle body closes beyond the level, then pulls back to touch it within 6 candles.",
    confirmation: "Retest candle closes back in the breakout direction (no deep wick through the level).",
    entryModel: "Market order on the retest candle close, or limit at the level with a 2-candle validity window.",
    stopModel: "Beyond the retest extreme + 0.2 × ATR(14) — never inside the range of the level.",
    targetModel: "First target at 1.5R (partial 50%), runner trails the 15m structure.",
    invalidation: "Candle body closes back through the level before the retest — the breakout failed, stand down.",
    notes: "Best samples came from days when the pre-market was quiet — violent opens tend to run without retesting.",
    tags: ["retest", "ny-open", "a-plus"],
  },
  {
    strategyName: "Breakout NY",
    name: "Failed Breakout Reversal",
    status: "ACTIVE",
    description: "Trade the other side of the failure: level rejects after an obvious breakout trap.",
    context: "Only when the trapped breakout is VISIBLE (strong impulse + immediate rejection). No trap, no trade.",
    marketCondition: "COMPRESSION",
    trigger: "Breakout candle closes back inside the range within 2 candles.",
    confirmation: "Next candle makes a lower low than the breakout candle (trap confirmed).",
    entryModel: "Market on confirmation candle close; target the opposite side of the range.",
    stopModel: "Above the failed breakout extreme.",
    targetModel: "Range midpoint at 1R, range edge at 2R — flat beyond that.",
    invalidation: "Price re-accepts beyond the level (2 consecutive closes outside).",
    notes: null,
    tags: ["reversal", "trap"],
  },
  {
    strategyName: "Breakout NY",
    name: "Momentum Breakout",
    status: "DRAFT",
    description: "Direct entry on expansion candles — drafted, NOT validated yet. Needs 20 paper samples before going live.",
    context: "High-volatility regimes only (news-driven expansion). Currently a draft — the stop model is not defined.",
    marketCondition: "HIGH_VOLATILITY",
    trigger: "Two consecutive expansion candles close beyond the level.",
    confirmation: "Volume on the second candle ≥ 1.5 × 20-candle average.",
    entryModel: "Market on the second candle close — no chase beyond 0.3 × ATR.",
    stopModel: null,
    targetModel: null,
    invalidation: "First pullback that reclaims the pre-breakout consolidation.",
    notes: "Stop + target models intentionally left undefined while the setup is a draft — completeness check should flag it.",
    tags: ["draft", "momentum"],
  },
  {
    strategyName: "S&R Inversion",
    name: "Clean Inversion",
    status: "ACTIVE",
    description: "Support becomes resistance (or the reverse) with one clean sweep of the prior side.",
    context: "Swing timeframe context, execution on 15m. The prior level must have produced a reaction in the last 20 sessions.",
    marketCondition: "RANGING",
    trigger: "Price sweeps the level and closes back on the origin side.",
    confirmation: "The sweep candle's wick is ≥ 2× its body (rejection quality).",
    entryModel: "Limit at the level after the sweep, 3-candle validity.",
    stopModel: "Beyond the sweep extreme.",
    targetModel: "Previous swing point; scale out 50% at 1R.",
    invalidation: "Second consecutive close beyond the level.",
    notes: null,
    tags: ["inversion", "sweep"],
  },
  {
    strategyName: "S&R Inversion",
    name: "Inversion + News Filter",
    status: "PAUSED",
    description: "Same inversion but only outside the news window — paused until the news filter is proven on paper.",
    context: "Identical to Clean Inversion, with an additional news gate.",
    marketCondition: "RANGING",
    trigger: "Clean Inversion trigger AND no high-impact event within ±15 minutes.",
    confirmation: "Clean Inversion confirmation.",
    entryModel: "Clean Inversion entry model.",
    stopModel: "Clean Inversion stop model.",
    targetModel: "Clean Inversion target model.",
    invalidation: "Clean Inversion invalidation, plus: news hits inside the trade → flatten at market.",
    notes: "Paused on purpose — the news gate is evaluated by the Rules Engine before this reactivates.",
    tags: ["paused", "news"],
  },
  {
    strategyName: "Range Scalping",
    name: "Range Edge Fade",
    status: "ACTIVE",
    description: "Fade the edges of a mature range, scalp-size only.",
    context: "Range must show ≥ 3 alternations of edges on the 5m. Dead ranges only — no expanding ranges.",
    marketCondition: "RANGING",
    trigger: "Wick rejection at the edge with no follow-through candle.",
    confirmation: "Next candle closes back inside the range body.",
    entryModel: "Market on confirmation close.",
    stopModel: "Beyond the edge wick + spread.",
    targetModel: "Range midpoint — always. No runner.",
    invalidation: "Candle body closes beyond the edge — the range may be breaking, exit immediately.",
    notes: null,
    tags: ["scalp", "fade"],
  },
  {
    strategyName: "Range Scalping",
    name: "Compression Squeeze Entry",
    status: "DRAFT",
    description: "Draft: enter the range break after a compression at the edge.",
    context: "Needs a compression definition first — draft on purpose.",
    marketCondition: "COMPRESSION",
    trigger: null,
    confirmation: null,
    entryModel: null,
    stopModel: null,
    targetModel: null,
    invalidation: null,
    notes: "Empty on purpose: the completeness indicators should show a draft with missing entry/invalidation.",
    tags: ["draft"],
  },
];

// ── Checklist templates (§16) ────────────────────────────────────────────────

interface ChecklistSeed {
  strategyName: string | null;
  name: string;
  items: { label: string; required: boolean }[];
}

const CHECKLIST_SEEDS: ChecklistSeed[] = [
  {
    strategyName: null,
    name: "Universal pre-trade sanity",
    items: [
      { label: "Economic calendar checked for the next hour", required: true },
      { label: "Session aligns with the strategy's market profile", required: true },
      { label: "Position size calculated from risk, not from conviction", required: true },
      { label: "No rule violation open right now", required: true },
      { label: "Emotional state logged before entry", required: false },
      { label: "Screenshot of the setup taken", required: false },
    ],
  },
  {
    strategyName: "Breakout NY",
    name: "Breakout NY — pre-flight",
    items: [
      { label: "Level held at least twice before today", required: true },
      { label: "NY-open direction matches the higher-timeframe bias", required: true },
      { label: "Breakout candle BODY closed beyond the level", required: true },
      { label: "No high-impact news within 15 minutes", required: true },
      { label: "Retest kept the level intact (no deep wick)", required: true },
      { label: "Risk ≤ strategy max (2%) and planned R:R ≥ 1.5", required: true },
    ],
  },
  {
    strategyName: "S&R Inversion",
    name: "S&R Inversion — pre-flight",
    items: [
      { label: "Prior level produced a reaction in the last 20 sessions", required: true },
      { label: "Sweep wick ≥ 2× candle body", required: true },
      { label: "Higher-timeframe structure does not oppose the inversion", required: true },
      { label: "Limit order validity window defined (3 candles)", required: true },
      { label: "News filter active (Inversion + News Filter variant only)", required: false },
    ],
  },
  {
    strategyName: "Range Scalping",
    name: "Range Scalping — pre-flight",
    items: [
      { label: "Range mature: ≥ 3 edge alternations on the 5m", required: true },
      { label: "No expansion candles inside the range", required: true },
      { label: "Scalp size only (≤ half normal risk)", required: true },
      { label: "Target is the midpoint — no runner agreed with yourself", required: true },
    ],
  },
];

// ── Operating rules (§24) ────────────────────────────────────────────────────

interface RuleSeed {
  strategyName: string | null;
  title: string;
  detail: string;
  category: PlaybookRule["category"];
  evaluatable: boolean;
  evaluationHint: string | null;
  active: boolean;
}

const RULE_SEEDS: RuleSeed[] = [
  {
    strategyName: null,
    title: "No trade ±15 minutes around high-impact news",
    detail:
      "When the economic calendar shows a high-impact event for a traded symbol, no NEW position may be opened from 15 minutes before to 15 minutes after the release. Open positions follow the strategy's own news rule.",
    category: "NEWS",
    evaluatable: true,
    evaluationHint: "Evaluatable against the Calendar data feed.",
    active: true,
  },
  {
    strategyName: null,
    title: "Maximum 2 concurrent positions",
    detail:
      "Never hold more than 2 open positions at the same time, whatever the account size. Correlated exposure counts as ONE position slot when both positions share the underlying driver.",
    category: "RISK",
    evaluatable: true,
    evaluationHint: "Evaluatable against the open-position count.",
    active: true,
  },
  {
    strategyName: null,
    title: "Journal every trade before the session closes",
    detail:
      "Every executed trade is journaled (notes + feeling) before the trading session is closed. A trade without notes is an unfinished trade — the review gate stays open until it is written.",
    category: "BEHAVIOR",
    evaluatable: false,
    evaluationHint: null,
    active: true,
  },
  {
    strategyName: null,
    title: "Cooldown after a full-loss trade",
    detail:
      "After a trade closes at −1R or worse, the next entry waits at least 15 minutes. The point is not to punish a loss — it is to keep the revenge trade out of the same tape.",
    category: "BEHAVIOR",
    evaluatable: true,
    evaluationHint: "Evaluatable against the last closed trade outcome.",
    active: true,
  },
  {
    strategyName: "Breakout NY",
    title: "Breakout NY: only inside the NY-open window",
    detail:
      "This strategy trades 14:30–16:30 UTC only. A breakout signal outside the window is NOT this strategy — journal it as out-of-playbook instead of bending the rule.",
    category: "SESSION",
    evaluatable: true,
    evaluationHint: "Evaluatable against session windows.",
    active: true,
  },
  {
    strategyName: "Range Scalping",
    title: "Range Scalping: skip when volatility dies",
    detail:
      "When ATR(14) on the 5m drops under 60% of its 20-day average, the range is too dead to pay the spread — skip the session.",
    category: "CUSTOM",
    evaluatable: false,
    evaluationHint: null,
    active: false,
  },
];

// ── Template library (§18) — starting points, NOT profitability claims ──────

interface TemplateSeed extends PlaybookTemplateCard {
  payload: Omit<CreateStrategyInput, "name">;
}

const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    key: "breakout",
    name: "Breakout",
    description: "Trade direct breaks of tested levels during expansion windows.",
    tradingStyle: "INTRADAY" as TradingStyle,
    marketConditions: ["EXPANSION", "HIGH_VOLATILITY"] as MarketCondition[],
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
    tradingStyle: "INTRADAY" as TradingStyle,
    marketConditions: ["EXPANSION"] as MarketCondition[],
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
    tradingStyle: "SWING" as TradingStyle,
    marketConditions: ["TRENDING", "BULLISH_STRUCTURE", "BEARISH_STRUCTURE"] as MarketCondition[],
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
    tradingStyle: "INTRADAY" as TradingStyle,
    marketConditions: ["TRENDING"] as MarketCondition[],
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
    tradingStyle: "INTRADAY" as TradingStyle,
    marketConditions: ["RANGING", "LOW_VOLATILITY"] as MarketCondition[],
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
    tradingStyle: "SCALPING" as TradingStyle,
    marketConditions: ["EXPANSION", "HIGH_VOLATILITY"] as MarketCondition[],
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
    tradingStyle: "INTRADAY" as TradingStyle,
    marketConditions: ["RANGING"] as MarketCondition[],
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
    tradingStyle: "SWING" as TradingStyle,
    marketConditions: ["RANGING", "TRENDING"] as MarketCondition[],
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
    tradingStyle: "SCALPING" as TradingStyle,
    marketConditions: ["EXPANSION", "COMPRESSION"] as MarketCondition[],
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
    tradingStyle: "POSITION" as TradingStyle,
    marketConditions: ["TRENDING", "BULLISH_STRUCTURE", "BEARISH_STRUCTURE"] as MarketCondition[],
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
  return TEMPLATE_SEEDS.map(({ key, name, description, tradingStyle, marketConditions, tags }) => ({
    key,
    name,
    description,
    tradingStyle,
    marketConditions,
    tags,
  }));
}

/** POST /playbook/templates/instantiate → CreateStrategyInput for the store. */
export function templateToCreateInput(key: string, nameOverride?: string): CreateStrategyInput | null {
  const template = TEMPLATE_SEEDS.find((item) => item.key === key);
  if (!template) return null;
  return {
    name: (nameOverride ?? template.name).trim(),
    ...template.payload,
  };
}

export interface PlaybookSeed {
  setups: Setup[];
  checklists: ChecklistTemplate[];
  rules: PlaybookRule[];
}

/**
 * Build the deterministic Playbook seed tied to the fixture strategies.
 * Missing strategy name → the entity is skipped (never a dangling link).
 */
export function buildPlaybookSeed(userId: string, strategies: Strategy[]): PlaybookSeed {
  const byName = new Map(strategies.map((strategy) => [strategy.name, strategy]));
  const createdAt = (minutes: number) => minutesAgo(minutes);

  const setups: Setup[] = [];
  let setupIndex = 0;
  for (const seed of SETUP_SEEDS) {
    const strategy = byName.get(seed.strategyName);
    if (!strategy) continue;
    setupIndex += 1;
    setups.push({
      id: crypto.randomUUID(),
      userId,
      strategyId: strategy.id,
      name: seed.name,
      status: seed.status,
      description: seed.description,
      context: seed.context,
      marketCondition: seed.marketCondition,
      trigger: seed.trigger,
      confirmation: seed.confirmation,
      entryModel: seed.entryModel,
      stopModel: seed.stopModel,
      targetModel: seed.targetModel,
      invalidation: seed.invalidation,
      notes: seed.notes,
      tags: seed.tags,
      createdAt: createdAt(60 * 24 * setupIndex),
      updatedAt: createdAt(30 + setupIndex),
    });
  }

  const checklists: ChecklistTemplate[] = CHECKLIST_SEEDS.map((seed, index) => ({
    id: crypto.randomUUID(),
    userId,
    strategyId: seed.strategyName ? byName.get(seed.strategyName)?.id ?? null : null,
    name: seed.name,
    items: seed.items.map((item, itemIndex) => ({
      id: `chk${index + 1}-${itemIndex + 1}`,
      label: item.label,
      required: item.required,
    })),
    createdAt: createdAt(60 * 24 * (index + 1)),
    updatedAt: createdAt(120 + index),
  }));

  const rules: PlaybookRule[] = RULE_SEEDS.map((seed, index) => ({
    id: crypto.randomUUID(),
    userId,
    title: seed.title,
    detail: seed.detail,
    category: seed.category,
    scope: seed.strategyName === null ? "GLOBAL" : "STRATEGY",
    strategyId: seed.strategyName ? byName.get(seed.strategyName)?.id ?? null : null,
    evaluatable: seed.evaluatable,
    evaluationHint: seed.evaluationHint,
    active: seed.active,
    createdAt: createdAt(60 * 24 * (index + 2)),
    updatedAt: createdAt(240 + index),
  }));

  return { setups, checklists, rules };
}
