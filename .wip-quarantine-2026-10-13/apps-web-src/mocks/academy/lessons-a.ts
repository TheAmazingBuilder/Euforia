import type { AcademyLessonSection } from "@cosmoz/shared";

/**
 * Academy lesson bodies — part A (Fundamentals, Risk, Technical, Price
 * Action, Candlesticks). Every lesson teaches probabilistic, context-first
 * trading: no guaranteed outcomes, no signal without location and risk.
 */

export type AcademyLessonBody = {
  title: string;
  durationMin: number;
  objectives: string[];
  sections: AcademyLessonSection[];
  takeaways: string[];
  mistakes: string[];
  figure?: {
    kind: "candles" | "structure" | "levels" | "risk" | "indicator" | "zones";
    ref: string;
    caption: string;
  };
  /** Extra figures — each lands after section index+1 in the reader. */
  figures?: {
    kind: "candles" | "structure" | "levels" | "risk" | "indicator" | "zones";
    ref: string;
    caption: string;
  }[];
};

export const ACADEMY_LESSONS_A: Record<string, AcademyLessonBody> = {
  // ── Trading Foundations ──────────────────────────────────────────────────
  "les-f-what-is-trading": {
    title: "What trading really is",
    durationMin: 5,
    objectives: [
      "Define trading as repeated decisions under uncertainty",
      "Distinguish trading from investing by horizon and intent",
      "Name the main market participants and what they want",
    ],
    sections: [
      {
        heading: "A probability game with a scoreboard",
        paragraphs: [
          "Trading is buying and selling a financial instrument with the intent to profit from price changes over a short-to-medium horizon. Each individual trade has an unknowable outcome; what you can actually manage is the size of the risk you take, the conditions under which you take it, and how much you earn when you are right relative to what you lose when you are wrong. That is why professional trading is described as a probabilistic discipline: you are not predicting, you are positioning.",
          "Because outcomes repeat over a series of trades, the scoreboard that matters is not one trade but a distribution of them. Ten trades tell you very little; a hundred tell you something; the journal exists precisely to make that series visible. This is also why a single win or loss carries almost no information about whether you traded well.",
        ],
      },
      {
        heading: "Trading versus investing",
        paragraphs: [
          "Investors typically buy ownership or claims (stocks, bonds, funds) and hold through years, collecting growth and income. Traders take shorter, deliberate positions — long or short — and accept that most positions will be closed quickly. Neither is superior; they are different games with different skills. What matters for you as a trader is that the journal measures process quality per decision, not how long you held.",
        ],
      },
      {
        heading: "Who is on the other side",
        paragraphs: [
          "Markets host market makers quoting two prices, institutions moving size over hours or weeks, hedgers offsetting business risk, algorithms reacting in microseconds, and retail traders. Knowing who you are against is humbling and practical: your edge cannot be raw speed or information. It can be patience, selectivity and discipline — traits the fast money does not have to have.",
        ],
      },
    ],
    takeaways: [
      "You manage risk and process, not outcomes",
      "A trade is one sample; the journal reads the distribution",
      "Your realistic edge is selectivity and discipline, not speed",
    ],
    mistakes: [
      "Judging a trade by its P&L instead of by its process",
      "Copying investing logic (buy and hope) into short-term trading",
    ],
  },
  "les-f-instruments": {
    title: "Markets and instruments",
    durationMin: 5,
    objectives: [
      "List the main instrument families and their behaviors",
      "Explain what a pip, tick and contract size describe",
      "Choose instruments consciously instead of by accident",
    ],
    sections: [
      {
        heading: "The families you will meet",
        paragraphs: [
          "Forex pairs quote one currency against another and move in pips. Stocks represent company shares; indices bundle many of them. Commodities (gold, oil) and their CFD cousins react to supply and demand shocks. Crypto trades around the clock with high volatility. Futures are standardized contracts with defined sizes and expiries. CFDs let you trade price movement on margin without owning the underlying — they are a leveraged derivative, which cuts both ways.",
        ],
      },
      {
        heading: "Pips, ticks and size",
        paragraphs: [
          "A pip is the standard price increment for a forex pair (0.0001 on EUR/USD); a tick is the minimum move of a futures or stock quote. Contract size tells you how much notional exposure one unit carries. These three numbers convert price movement into money — the same 50-pip move is a different dollar outcome on a micro lot and a standard lot, which is why position sizing (Risk Management course) always comes before entry decisions.",
        ],
      },
      {
        heading: "Choosing your battlefield",
        paragraphs: [
          "Each instrument has a personality: session hours, typical daily range, spread, and how it reacts to news. Trading one or two instruments deeply beats sampling twenty shallowly — your journal's statistics only mean something when the game stays constant. Many disciplined traders specialize until their playbook is profitable, then diversify deliberately.",
        ],
      },
    ],
    takeaways: [
      "Pip, tick and contract size convert movement into money",
      "CFDs and futures are leveraged instruments — respect the notional",
      "Depth on one instrument beats shallowness on ten",
    ],
    mistakes: [
      "Hopping instruments every week, resetting your statistics",
      "Ignoring session hours and trading dead, spread-heavy hours",
    ],
  },
  "les-f-orders-costs": {
    title: "Orders and the cost of pressing the button",
    durationMin: 5,
    objectives: [
      "Distinguish market, limit and stop orders and their fills",
      "Explain spread, commission and slippage as a combined tax",
      "Estimate your round-trip cost before entering",
    ],
    sections: [
      {
        heading: "The three workhorses",
        paragraphs: [
          "A market order buys or sells now at the best available price — certainty of execution, uncertainty of price. A limit order executes only at your price or better — certainty of price, uncertainty of execution. A stop order sits dormant until price touches a trigger, then becomes a market order — this is how stop-losses work, and why violent gaps can fill them worse than the trigger.",
        ],
      },
      {
        heading: "Spread, commission, slippage",
        paragraphs: [
          "The spread is the gap between bid and ask: you cross it on every entry and exit. Commission is the broker's explicit fee. Slippage is the difference between your expected price and the fill you actually got — usually near zero on quiet liquid markets, painful on news spikes. Added up, these are a tax on every round trip. A 1-pip spread on a 15-pip target strategy is not a detail; it is a 7% haircut on gross edge before variance even starts.",
        ],
        bullets: [
          "Market order: fills now, price uncertain",
          "Limit order: price locked, fill not guaranteed",
          "Stop order: triggers a market order — gaps can hurt",
        ],
      },
    ],
    takeaways: [
      "Every strategy must clear its own costs before it can earn",
      "Limit orders save spread but can miss the move — a real trade-off",
      "Slippage concentrates exactly when you least want it: fast markets",
    ],
    mistakes: [
      "Backtesting on mid prices and ignoring spread entirely",
      "Market-ordering into news releases and paying 5-10 pips of slip",
    ],
    figure: {
      kind: "levels",
      ref: "orders-map",
      caption:
        "The order map of one planned long: resting buy limit and sell limit, the protective stop, the take-profit — and the bid-ask spread taxing every round trip.",
    },
  },
  "les-f-leverage-margin": {
    title: "Leverage and margin, without the myths",
    durationMin: 5,
    objectives: [
      "Define margin and required margin mathematically",
      "Explain why leverage amplifies results, not edge",
      "Connect position size — not leverage — to real risk",
    ],
    sections: [
      {
        heading: "The mechanics",
        paragraphs: [
          "Margin is the collateral your broker holds to open a position; leverage is the ratio between notional exposure and that collateral. 1:100 leverage on a $1,000 account lets you control $100,000 of notional. That changes nothing about the market's path — it only multiplies the P&L of every move, in both directions. A 1% adverse move on $100,000 is $1,000: your whole account.",
        ],
      },
      {
        heading: "Leverage is not the risk; size is",
        paragraphs: [
          "The dangerous belief is that high leverage is why accounts die. Accounts die because position size relative to capital was too large — leverage merely enables that mistake instantly. The same $100,000 notional at 1:10 leverage carries the identical risk. What protects you is deciding the dollar amount you can lose before entering, then letting the stop distance dictate the size (next course). Leverage is a capability, not a strategy.",
        ],
      },
    ],
    takeaways: [
      "Margin = collateral; leverage = notional ÷ collateral",
      "Leverage amplifies P&L symmetrically, never adds edge",
      "Risk is set by size and stop distance, not by the leverage number",
    ],
    mistakes: [
      "Using maximum available leverage because it is offered",
      "Confusing notional exposure with money at risk",
    ],
    figure: {
      kind: "risk",
      ref: "leverage-arc",
      caption:
        "One identical 1% move under three leverage settings: the P&L scales symmetrically while the market's path never changes — the ratio adds force, not foresight.",
    },
  },

  // ── Risk Management ──────────────────────────────────────────────────────
  "les-r-risk-per-trade": {
    title: "Risk per trade: the decision that rules them all",
    durationMin: 6,
    objectives: [
      "Express risk as a percentage of equity and a dollar amount",
      "Explain why fixed-fraction risk survives losing streaks",
      "Set a risk-per-trade default that matches your stage",
    ],
    sections: [
      {
        heading: "Percent first, dollars second",
        paragraphs: [
          "Risk per trade is the amount you lose if your stop is hit — expressed as a percent of equity, then as a dollar figure. A $10,000 account risking 1% risks $100 per trade. The percent framing scales automatically as equity changes; the dollar framing is what you hand to the position-sizing math. Both numbers are decided before the trade, never during.",
          "Why 1%? Because survival is the first edge. At 1% risk, ten consecutive losses — a bad but survivable month — cost about 9.6% of the account. At 10% risk, the same streak costs ~65% and psychologically ends most trading careers even if the account technically survives. Small risk does not just protect capital; it protects judgment.",
        ],
      },
      {
        heading: "Choosing your number",
        paragraphs: [
          "Common bands: 0.25-0.5% for proving a system or trading through a drawdown, 0.5-1% for a validated system, rarely above 2% even with a long record and high win rate. The number should reflect the worst realistic losing streak you can endure financially and emotionally. Write your default in the journal's risk settings — this app tracks it — and treat exceptions as exceptions that must be justified in writing.",
        ],
      },
    ],
    takeaways: [
      "Risk = the money lost at the stop, fixed before entry",
      "Fixed-fraction risk makes streaks survivable and compounding possible",
      "Lower risk during drawdowns is a feature, not cowardice",
    ],
    mistakes: [
      "Sizing by conviction ('this one is a sure thing')",
      "Risking more to 'win back' yesterday's loss — revenge before it starts",
    ],
    figure: {
      kind: "risk",
      ref: "risk-per-trade",
      caption:
        "1% of a $10,000 account = $100 at risk per trade — the input to every size calculation.",
    },
  },
  "les-r-position-sizing": {
    title: "Position sizing: the arithmetic of survival",
    durationMin: 6,
    objectives: [
      "Compute position size from risk, stop distance and pip value",
      "Run the $10,000 / 1% / 50-pip worked example",
      "Adapt the formula to any instrument",
    ],
    sections: [
      {
        heading: "The formula that never changes",
        paragraphs: [
          "Position size answers: how many units can I hold so that my stop equals my risk budget? The general form is Size = Risk amount ÷ (Stop distance × value per unit of distance). In forex, value per pip depends on lot size, so traders use Size (in lots) = Risk ÷ (Stop in pips × pip value per lot). In stocks or crypto, Size (units) = Risk ÷ (Entry − Stop). Same skeleton, different units.",
        ],
      },
      {
        heading: "Worked example — the $10,000 account",
        paragraphs: [
          "Account: $10,000. Risk: 1% = $100. Setup: long EUR/USD at 1.0850, stop 50 pips below at 1.0800. Pip value on a standard lot (100,000 units) is $10 per pip. Size = $100 ÷ (50 × $10) = 0.20 lots. If the stop is hit you lose $100 — by construction. If your strategy needs a tighter 25-pip stop, the same $100 budget allows 0.40 lots; a wider 100-pip stop allows 0.10. Risk stays constant while size flexes with structure — that is the entire trick.",
        ],
        bullets: [
          "Risk budget: $100 (1% of $10,000)",
          "Stop distance: 50 pips → size 0.20 lots",
          "Stop distance: 25 pips → size 0.40 lots (same $100 risk)",
          "Stop distance: 100 pips → size 0.10 lots (same $100 risk)",
        ],
      },
      {
        heading: "When the stop is far",
        paragraphs: [
          "Wide stops produce tiny sizes — that is not a problem to fix by widening risk; it is information that the setup's location is poor. If the resulting size is too small to trade meaningfully, the honest options are a tighter, structurally-justified stop, or skipping the trade. Oversizing to make a wide-stop trade 'worth it' is how fixed-fraction risk quietly dies.",
        ],
      },
    ],
    takeaways: [
      "Size = risk ÷ (stop distance × value per unit) — every time",
      "Same budget, different stops → different sizes, identical risk",
      "A wide stop shrinking your size is the system working, not failing",
    ],
    mistakes: [
      "Choosing lot size first and placing the stop wherever it fits",
      "Forgetting pip value differences between instruments",
    ],
    figure: {
      kind: "risk",
      ref: "position-sizing",
      caption:
        "Entry 1.0850, stop 50 pips below, $100 budget → 0.20 lots. Size serves the stop, never the reverse.",
    },
  },
  "les-r-risk-reward-r": {
    title: "Risk/Reward and the R multiple",
    durationMin: 6,
    objectives: [
      "Define R as one unit of risk and express outcomes in R",
      "Compute required win rate for a given reward:risk",
      "Read your journal's expectancy in R",
    ],
    sections: [
      {
        heading: "R: the common currency",
        paragraphs: [
          "R is the amount you risked on a trade. A −1R loss is a full stop-out; +2R means you earned twice what you risked. Expressing everything in R makes trades comparable across instruments and account sizes, which is why this journal grades in R. A strategy's quality becomes simple arithmetic: expectancy = (win rate × average win in R) − (loss rate × average loss in R).",
        ],
      },
      {
        heading: "Break-even win rates",
        paragraphs: [
          "At 1:1 reward-to-risk you need >50% wins to profit. At 1:2, break-even is ~33%; at 1:3, ~25%. Higher reward:risk lowers the required accuracy but usually lowers the hit rate too — the market charges for distance. Chasing 1:5 everywhere often produces a book of almost-wins; taking 1:1 everywhere requires near-perfect selectivity. Most durable systems live between 1:1.5 and 1:3 with win rates their structure can actually support.",
        ],
        bullets: [
          "1:1 → break-even above 50% wins",
          "1:2 → break-even ≈ 33% wins",
          "1:3 → break-even ≈ 25% wins",
        ],
      },
    ],
    takeaways: [
      "Speak in R — it normalizes every trade you will ever take",
      "Reward:risk and win rate trade off against each other",
      "Expectancy in R is the one number that summarizes a strategy",
    ],
    mistakes: [
      "Cutting winners early so often that realized R collapses below plan",
      "Judging a 1:3 system by a 10-trade losing patch it was built to survive",
    ],
    figure: {
      kind: "risk",
      ref: "r-multiple",
      caption:
        "One R below entry, two R above: a 1:2 plan where the stop is the unit of account.",
    },
  },
  "les-r-r-multiples": {
    title: "Reading a distribution of R",
    durationMin: 5,
    objectives: [
      "Compute expectancy from a sample of R outcomes",
      "Explain why a 40% win rate can be excellent",
      "Use the journal's R statistics to locate weaknesses",
    ],
    sections: [
      {
        heading: "Ten trades, one truth",
        paragraphs: [
          "Take ten trades: six stop-outs at −1R, one scratch at 0R, and three wins at +1.2R, +2.4R and +3.1R. Sum: −6 + 0 + 6.7 = +0.7R over ten trades → expectancy ≈ +0.07R per trade. Thin — but positive, and the sample says the wins carry the book. The same ten trades at 45% win rate and average loss of 1.8R would be deeply negative. Win rate alone never tells you which book you are holding; the R distribution does.",
        ],
      },
      {
        heading: "What the journal reveals",
        paragraphs: [
          "Cluster your R outcomes by setup, session and emotional state (this app links trades to journal entries for exactly this). Common patterns: expectancy positive except after losses (revenge sizing), positive on A-grade setups and negative on B-grade (selectivity leak), positive in trend days and negative in ranges (context filter missing). Each diagnosis points at a fixable rule, not at 'try harder'.",
        ],
      },
    ],
    takeaways: [
      "Expectancy per trade is the strategy's heartbeat",
      "Win rate without average R is a half-truth",
      "Segment your R's — the weakness is usually one slice of the book",
    ],
    mistakes: [
      "Evaluating expectancy on samples too small to mean anything",
      "Mixing setups in one statistic and calling the mess a system",
    ],
    figure: {
      kind: "risk",
      ref: "expectancy-run",
      caption:
        "The lesson's own sample drawn to scale: six stop-outs and one scratch dig a −6R hole before three wins close it at +0.7R — expectancy is the shape of the whole sequence, not the count of green bars.",
    },
  },
  "les-r-drawdown-ruin": {
    title: "Drawdown, risk of ruin and recovery math",
    durationMin: 6,
    objectives: [
      "Define drawdown and compute the gain needed to recover it",
      "Explain risk of ruin in plain terms",
      "Design loss limits that cap damage in advance",
    ],
    sections: [
      {
        heading: "The asymmetric climb back",
        paragraphs: [
          "Drawdown is the decline from the equity peak. Recovery is asymmetric: −10% needs +11.1%; −25% needs +33.3%; −50% needs +100% just to return to flat. That convexity is why capital preservation dominates return-seeking. A system that wins 60% of the time can still string eight losses in a row over a few hundred trades — plan for it rather than being surprised by it.",
        ],
        bullets: [
          "−10% → +11.1% to recover",
          "−25% → +33.3% to recover",
          "−50% → +100% to recover",
        ],
      },
      {
        heading: "Ruin is a sizing question",
        paragraphs: [
          "Risk of ruin is the probability of losing so much that you stop trading — technically or psychologically. It collapses toward zero as risk per trade shrinks. Daily and weekly loss limits are the practical implementation: 'after −3R today, done; after −6R this week, flat until Monday'. The limit is written when you are calm and enforced when you are not — the journal's risk settings and discipline score exist to make that visible.",
        ],
      },
    ],
    takeaways: [
      "Recovery gains grow non-linearly — avoid deep holes structurally",
      "Streaks happen to good systems; limits turn them into events, not endings",
      "A daily stop is a gift to tomorrow's judgment",
    ],
    mistakes: [
      "Raising size mid-drawdown to 'get back to the high-water mark' faster",
      "Setting loss limits after the loss instead of before",
    ],
    figure: {
      kind: "risk",
      ref: "drawdown-depth",
      caption:
        "From peak to trough the equity curve falls −25%; the climb back demands +33.3% — the hole deepens faster than it fills, which is why loss limits are written before the streak.",
    },
  },

  // ── Technical Analysis ───────────────────────────────────────────────────
  "les-t-charts-timeframes": {
    title: "Charts and timeframes",
    durationMin: 5,
    objectives: [
      "Read line, bar and candlestick charts",
      "Explain what a timeframe aggregates and how choice biases analysis",
      "Pick a working timeframe stack for journaling",
    ],
    sections: [
      {
        heading: "What a chart is",
        paragraphs: [
          "A chart plots price against time so structure becomes visible. Line charts connect closes — clean for level work. Bar charts show open, high, low and close per period. Candlesticks encode the same OHLC data but make body and wick visually immediate, which is why they dominate (and get their own course in this Academy). Every chart is the same data; the framing changes what you notice.",
        ],
      },
      {
        heading: "Timeframes are resolutions",
        paragraphs: [
          "A 5-minute candle averages out 5 minutes of fighting; a daily candle summarizes a war. Higher timeframes show dominant structure and major levels; lower ones show execution detail. The classic trap is analysis drift: bullish on the daily, bearish on the 15-minute, paralyzed. The professional fix is a declared stack — e.g. daily for bias, 1-hour for levels, 5-minute for execution — written into your plan and honored in the journal.",
        ],
      },
    ],
    takeaways: [
      "Same data, different resolutions — choose deliberately",
      "Declare a timeframe stack; let the higher one own the bias",
      "Switching timeframes mid-analysis is usually mood, not method",
    ],
    mistakes: [
      "Hunting a timeframe that agrees with the trade you already want",
      "Executing on the same timeframe that defines your bias",
    ],
    figure: {
      kind: "structure",
      ref: "timeframe-stack",
      caption:
        "A declared stack, one job per row: the daily says which side, the 1-hour says where, the 5-minute says when — analysis drift dies when the roles are written down.",
    },
  },
  "les-t-support-resistance": {
    title: "Support, resistance and zones",
    durationMin: 6,
    objectives: [
      "Mark levels that price has actually respected",
      "Think in zones, not hairlines",
      "Describe how levels flip role when broken",
    ],
    sections: [
      {
        heading: "Where memory lives",
        paragraphs: [
          "Support is a price area where buyers have repeatedly overwhelmed sellers; resistance is where sellers have overwhelmed buyers. What makes a level real is reaction: multiple touches, strong departures, and alignment with round numbers or prior day/week extremes. Two or three touches with visible response beat twenty tiny wicks in a chop zone — count quality of reaction, not quantity of touches.",
        ],
      },
      {
        heading: "Zones and role flips",
        paragraphs: [
          "Price is a range of trades, not a line; draw levels as zones a few pips/pixels wide and expect behavior inside the zone, not at a decimal. When resistance breaks decisively, it often becomes support on the retest — prior supply has been consumed and the level now marks the last buyers' cost basis. The retest of a broken level is one of the most traded contexts in technical analysis (and gets a full strategy lesson later).",
        ],
      },
    ],
    takeaways: [
      "Levels earn relevance through reaction, not repetition",
      "Draw zones; trade behavior at the zone's edge",
      "Broken resistance can become support — watch the retest",
    ],
    mistakes: [
      "Drawing levels through candle bodies instead of at reaction edges",
      "Treating every touch as confirmation even when reactions shrink",
    ],
    figure: {
      kind: "levels",
      ref: "support-resistance",
      caption:
        "A resistance zone tested twice, broken, then retested as support — role flip with reaction.",
    },
    figures: [
      {
        kind: "zones",
        ref: "supply-demand",
        caption:
          "Supply and demand as zones: bases before displacement mark where control changed — price returns to the origin and reacts.",
      },
    ],
  },
  "les-t-trends-ranges": {
    title: "Trends, ranges and momentum",
    durationMin: 5,
    objectives: [
      "Define trend and range operationally",
      "Recognize the transition states between them",
      "Match strategy family to current regime",
    ],
    sections: [
      {
        heading: "Two regimes, one chart",
        paragraphs: [
          "An uptrend is a sequence of higher highs and higher lows; a downtrend, lower lows and lower highs; a range is price oscillating between two horizontal boundaries. Trends reward continuation logic (buy pullbacks, avoid selling strength); ranges reward fading extremes (sell resistance, buy support, avoid chasing mid-range breakouts). Most strategy failures are regime mismatches: a breakout system applied to a range, or a fade system applied to a trend day.",
        ],
      },
      {
        heading: "Transitions are where the money hides",
        paragraphs: [
          "Ranges end; trends pause. The transition usually shows compression (narrowing swings), then expansion with a break. You do not need to predict which way — you need a plan for the break and honest criteria for accepting it (the Market Structure course formalizes this with BOS and CHoCH). The journal's session notes are the right place to record the regime you traded in; Analytics then shows which regime actually pays you.",
        ],
      },
    ],
    takeaways: [
      "Identify regime first; pick the strategy family second",
      "Compression → expansion is the transition signature",
      "Your best edge may be refusing to trade the regime you lose in",
    ],
    mistakes: [
      "Calling every move a 'trend' without HH/HL evidence",
      "Trading breakouts inside an obvious range, feeding the faders",
    ],
    figure: {
      kind: "structure",
      ref: "trend-range-panels",
      caption:
        "The stair-step pays continuation logic; the box pays edge-fading — same market, two regimes, and the costliest mistakes are playbooks applied to the wrong panel.",
    },
  },
  "les-t-breakouts-retests": {
    title: "Breakouts, failed breakouts and retests",
    durationMin: 6,
    objectives: [
      "Define what qualifies as a decisive break",
      "Explain why false breakouts exist and who they feed",
      "Compare breakout entry versus retest entry",
    ],
    sections: [
      {
        heading: "What counts as a break",
        paragraphs: [
          "A breakout is a close beyond the boundary with momentum — ideally expansion in range or volume, not a single wick. Closes matter more than pokes: a wick through resistance that closes back inside is exactly the liquidity event faders dream of. Timeframe matters: on your execution timeframe, require the close of the bar, not the tick.",
        ],
      },
      {
        heading: "The retest school",
        paragraphs: [
          "Two entry styles exist. Entering on the break buys immediacy at worse price and eats more false positives. Waiting for the retest — price returning to the broken level — buys better price and confirmation, at the cost of missing the moves that never look back. Neither is superior universally; the journal decides which style your market and personality actually pay. What is not acceptable is entering the retest after it has already failed and price is accelerating away — that is FOMO wearing a technical costume.",
        ],
        bullets: [
          "Break entry: earlier, noisier, more false positives",
          "Retest entry: cleaner price, fewer but better triggers, some misses",
          "A retest that slices back through the level is a failed break — a short idea in its own right",
        ],
      },
    ],
    takeaways: [
      "Demand closes and expansion, not wicks, for a valid break",
      "Retests convert breakouts from hope to structure",
      "Failed breakouts are setups too — in the opposite direction",
    ],
    mistakes: [
      "Chasing price three bars after the break, spread and all",
      "Moving the stop 'a bit further' when the retest fails — the definition of a planned loss becoming a big one",
    ],
    figure: {
      kind: "levels",
      ref: "breakout-retest",
      caption:
        "Two honest touches, a close beyond the level, then the return trip: the retest turns the old roof into a new floor — the second visit costs patience and saves false positives.",
    },
  },

  // ── Price Action ─────────────────────────────────────────────────────────
  "les-p-impulse-correction": {
    title: "Impulse and correction",
    durationMin: 5,
    objectives: [
      "Describe the impulse-correction rhythm of all markets",
      "Distinguish pullback from reversal by structure",
      "Use the rhythm to time entries rather than chase",
    ],
    sections: [
      {
        heading: "The heartbeat",
        paragraphs: [
          "Markets move in impulses — energetic moves in the dominant direction — separated by corrections — slower, overlapping moves against it. The rhythm exists at every timeframe. An impulse is characterized by large bodies, small wicks and quick progress; a correction by overlapping candles, wicks on both ends and slow drift. Reading which phase you are in is the first question before any entry.",
        ],
      },
      {
        heading: "Pullback is not reversal",
        paragraphs: [
          "A pullback is a correction inside an intact structure — in an uptrend, a move down that has not yet broken the last higher low. A reversal has broken structure. The distinction is structural, not emotional: how deep is the correction relative to prior impulses, and has any defining level or swing actually given way? Traders who cannot tell the difference buy every dip in a real reversal and short every pullback in a real trend. Structure (Market Structure course) is the tiebreaker.",
        ],
      },
    ],
    takeaways: [
      "Identify the phase — impulse or correction — before anything else",
      "Depth and structure separate pullback from reversal",
      "Corrections are where continuation traders earn their entry price",
    ],
    mistakes: [
      "Entering mid-impulse with a stop that a normal correction would reach",
      "Calling deep, structural declines 'just a pullback' because the bias says so",
    ],
    figure: {
      kind: "structure",
      ref: "impulse-corrective",
      caption:
        "Energetic one-sided legs separated by slow, overlapping drifts — reading which phase you are in is the first question any entry must answer.",
    },
  },
  "les-p-liquidity-imbalance": {
    title: "Liquidity and imbalance",
    durationMin: 5,
    objectives: [
      "Explain liquidity as resting orders around obvious prices",
      "Describe what a liquidity sweep looks like on a chart",
      "Define imbalance and a fair value gap as price vacuums",
    ],
    sections: [
      {
        heading: "Orders pool where eyes look",
        paragraphs: [
          "Stop losses and pending orders cluster just beyond obvious points: equal highs, round numbers, trendline touches. This pool is liquidity — fuel for larger players who need counterparties. A liquidity sweep is the sharp move that trades through such a point, triggers those orders, and often reverses: the equal-high raid that stops out breakout buyers right before price turns down. The chart signature is a wick beyond the obvious level followed by displacement the other way.",
        ],
      },
      {
        heading: "Imbalance and gaps in price",
        paragraphs: [
          "When price moves so fast that one-sided trading leaves few trades at intermediate prices, charts show imbalance — long wicks or a 'fair value gap' (three-candle pattern where candle 1's high and candle 3's low do not overlap). Some traders treat these vacuums as magnets or as support/resistance when revisited. These are interpretive frameworks, not physical laws — but they describe real order-flow scars that other participants also watch, which is what gives them any behavioral footing.",
        ],
      },
    ],
    takeaways: [
      "Obvious levels carry resting orders — and therefore gravity",
      "Sweeps, then reversal, is the classic raid signature",
      "Imbalance describes one-sided flow; treat the vocabulary as a lens, not a law",
    ],
    mistakes: [
      "Placing stops exactly beyond equal highs/lows — the most raided real estate in trading",
      "Believing every gap must fill and every sweep must reverse, immediately",
    ],
    figure: {
      kind: "structure",
      ref: "liquidity-sweep",
      caption:
        "Equal lows advertise where the stops rest; the wick raids them and price closes back above — the sweep is fuel for the move, not a broken chart.",
    },
  },
  "les-p-frameworks-not-laws": {
    title: "Frameworks, not laws: reading SMC vocabulary honestly",
    durationMin: 5,
    objectives: [
      "Separate observable behavior from methodology terminology",
      "Identify which claims in a framework are testable",
      "Use any vocabulary without surrendering judgment to it",
    ],
    sections: [
      {
        heading: "Three layers of any framework",
        paragraphs: [
          "Methodologies like SMC/ICT bundle three layers. First, observable behavior: price impulsing, sweeping prior highs, leaving gaps — visible on any chart. Second, terminology: order blocks, fair value gaps, displacement — labels a community agreed on. Third, interpretation: claims like 'the sweep grabs liquidity before reversal' — a story about intent that cannot be verified, only traded and measured. Professional usage keeps the layers distinct: the labels are fine, the stories are hypotheses.",
        ],
      },
      {
        heading: "Make it earn its place",
        paragraphs: [
          "If a framework concept helps you, translate it into a testable rule and let your journal grade it: 'entries at order-block retests after a CHoCH, fixed risk, 40 trades' — then read the R distribution. Concepts that survive your own data earn a place in the playbook; concepts that only produce confident language do not. The Academy teaches these vocabularies because they dominate modern price-action conversation, not because any of them is true by definition.",
        ],
      },
    ],
    takeaways: [
      "Behavior is observable; terminology is a label; interpretation is a hypothesis",
      "Test framework claims with your own journal, not someone's screenshots",
      "Vocabulary should sharpen decisions, never replace them",
    ],
    mistakes: [
      "Adopting a framework's certainty along with its vocabulary",
      "Redefining a failed concept's terms after every loss instead of measuring it",
    ],
  },

  // ── Candlestick Patterns ─────────────────────────────────────────────────
  "les-c-anatomy": {
    title: "Candle anatomy: open, close, body, wicks",
    durationMin: 5,
    objectives: [
      "Name every part of a candle and what it encodes",
      "Read body-to-wick proportion as a sentiment gauge",
      "Explain why color alone is nearly meaningless",
    ],
    sections: [
      {
        heading: "One candle, four prices",
        paragraphs: [
          "Each candle compresses a period into four prices: open (where trading began), close (where it ended), high and low (the extremes reached). The body spans open to close; the upper wick stretches from body top to the high; the lower wick from body bottom to the low. Bullish candles close above their open; bearish candles close below. That is the entire vocabulary.",
        ],
      },
      {
        heading: "Proportion tells the story",
        paragraphs: [
          "A long body with tiny wicks says one side controlled the whole period — conviction. A small body with long wicks on both ends says both sides pushed and neither won — indecision. A long lower wick with a small body at the top says sellers drove price down and buyers took it back — rejection of lows. The same anatomy reads differently by location: the rejection of lows means one thing at the bottom of a slide and nothing much mid-range.",
        ],
      },
    ],
    takeaways: [
      "Body = who won the period; wicks = where the fight happened",
      "Long wick one side = rejection of that extreme",
      "Location turns anatomy from trivia into information",
    ],
    mistakes: [
      "Reading candle color without reading body-to-wick proportion",
      "Memorizing pattern shapes before understanding what each part measures",
    ],
    figure: {
      kind: "candles",
      ref: "anatomy",
      caption:
        "The four prices, the body and the wicks — labeled on a bullish and a bearish candle.",
    },
  },
  "les-c-sentiment": {
    title: "Bodies, wicks and market sentiment",
    durationMin: 5,
    objectives: [
      "Grade candles from full conviction to full indecision",
      "Recognize the doji family and spinning tops",
      "Connect candle readings to the phase (impulse/correction)",
    ],
    sections: [
      {
        heading: "The conviction spectrum",
        paragraphs: [
          "At one extreme sits the marubozu: a full body, no meaningful wicks — open at the low, close at the high (or the reverse). It is the purest trend candle. Mid-spectrum are ordinary candles with modest wicks. At the other extreme is the doji: open and close virtually equal, so the body collapses to a line — the period ended where it began. Spinning tops (small body, wicks both sides) and high-wave candles are the indecision family in practice.",
        ],
      },
      {
        heading: "Indecision means 'wait', not 'reverse'",
        paragraphs: [
          "A doji says the balance of force momentarily reset — nothing more. Its meaning comes from context: a doji after a stretched impulse at a major level is a warning that continuation is tiring; the same doji mid-range is noise. The honest response to indecision is usually patience: let the next candle or the next structure test speak. The Practice zone has a simulator for building exactly this reading speed.",
        ],
      },
    ],
    takeaways: [
      "Marubozu → conviction; doji/spinning top → equilibrium",
      "Indecision candles reprice risk; they do not predict reversals",
      "Grade the candle, then ask where it happened",
    ],
    mistakes: [
      "Treating every doji as a reversal signal",
      "Reading sentiment from a single candle when the last three disagree with it",
    ],
    figure: {
      kind: "candles",
      ref: "sentiment",
      caption:
        "From marubozu (full body) to doji (no body): the conviction spectrum in five candles.",
    },
  },
  "les-c-single-candle": {
    title: "Single-candle patterns: hammer, star and friends",
    durationMin: 7,
    objectives: [
      "Define hammer, inverted hammer, shooting star and hanging man",
      "Explain why identical shapes carry different names by location",
      "State the confirmation and invalidation for each",
    ],
    sections: [
      {
        heading: "One shape, four names",
        paragraphs: [
          "The hammer: small body at the top, long lower wick at least twice the body — sellers pushed price down hard and buyers reclaimed it by the close. Appearing after a decline at support, it is read as potential bullish reversal — the classic 'hammer'. The same shape mid-uptrend is just a pullback candle. Flip it upside down — small body at the bottom, long upper wick — and after an advance at resistance it is a shooting star (potential bearish reversal); after a decline it is an inverted hammer (potential bullish turn); at the top of an uptrend mid-consolidation some texts call it a hanging man. The shape is constant; location writes the name.",
        ],
      },
      {
        heading: "Confirmation and invalidation",
        paragraphs: [
          "None of these candles is an entry. The working sequence: pattern appears at a meaningful level → next candle (or intraday break of the pattern's high/low) confirms → entry with stop beyond the wick → position sized to that stop. Invalidation is mechanical: for a hammer, a close below its low kills the bullish read; for a shooting star, a close above its high. If your stop cannot sit beyond the wick within your risk budget, the trade is not available at your size — skip it.",
        ],
        bullets: [
          "Hammer: lower wick ≥ 2× body, at support after decline",
          "Shooting star: upper wick ≥ 2× body, at resistance after advance",
          "Confirm with next candle close or level break; invalidate beyond the wick",
        ],
      },
    ],
    takeaways: [
      "Identical anatomy, different names — location is the classifier",
      "Wick = rejection; the market said 'not this price' and meant it",
      "Confirmation then entry; the wick extreme is the invalidation line",
    ],
    mistakes: [
      "Trading every hammer regardless of the level it formed at",
      "Placing the stop inside the wick — inside the very rejection being traded",
    ],
    figure: {
      kind: "candles",
      ref: "hammer-star",
      caption:
        "Hammer at support after a decline; shooting star at resistance after an advance — same anatomy, opposite locations.",
    },
  },
  "les-c-two-candle": {
    title: "Two-candle patterns: engulfing, tweezers and clouds",
    durationMin: 6,
    objectives: [
      "Define bullish and bearish engulfing with quality criteria",
      "Recognize tweezer tops/bottoms, piercing line and dark cloud cover",
      "Attach confirmation and invalidation to each",
    ],
    sections: [
      {
        heading: "Engulfing: the takeover",
        paragraphs: [
          "A bullish engulfing is a bearish candle fully swallowed by the next bullish one: open at or below the prior close, close above the prior open, body engulfs body. It shows the second period erasing the first entirely — buyers overrunning sellers within one bar. Quality checks: the engulfing body should be substantial (not a marginal 2-tick swallow), volume or range expansion helps, and location at a level after a decline matters more than the shape itself. The bearish mirror applies at tops. Invalidation: a close beyond the engulfing candle's opposite extreme.",
        ],
      },
      {
        heading: "Mirrors and partial covers",
        paragraphs: [
          "Tweezer bottoms/tops are two candles sharing (nearly) the same extreme — double rejection of one price, stronger when the two candles have opposite colors. The piercing line is a bullish candle closing above the midpoint of the prior bearish one after a decline; dark cloud cover is its bearish twin closing below the midpoint after an advance. All are the same family as the engulfing: second-candle reactions to first-candle extremes, graded by how much of the prior candle they recover.",
        ],
      },
    ],
    takeaways: [
      "Engulfing quality = body coverage + location + expansion",
      "Tweezers mark a price both periods refused — double rejection",
      "Midpoint closes (piercing / dark cloud) are graded versions of engulfing",
    ],
    mistakes: [
      "Counting a marginal 1-tick engulf as a pattern",
      "Reading tweezer wicks on a 1-minute chart as if they carried daily-level weight",
    ],
    figure: {
      kind: "candles",
      ref: "engulfing",
      caption:
        "Bullish engulfing at support: the second body swallows the first — takeover, then confirm.",
    },
  },
  "les-c-three-candle": {
    title: "Three-candle patterns: stars and soldiers",
    durationMin: 6,
    objectives: [
      "Define morning/evening star and three soldiers/crows",
      "Explain the middle candle's role in reversal stories",
      "Recognize three inside up/down as cautious versions",
    ],
    sections: [
      {
        heading: "The star formations",
        paragraphs: [
          "A morning star: a strong bearish candle, then a small-bodied candle (the star) gapping or pausing below it, then a strong bullish candle closing deep into the first body. The middle candle is the story — sellers pushed, then the period resolved flat: equilibrium. The third candle is the confirmation. An evening star is the bearish mirror at tops. Three white soldiers: three consecutive strong bullish candles with progressive closes and small wicks — sustained demand; three black crows, the bearish twin.",
        ],
      },
      {
        heading: "The cautious variants",
        paragraphs: [
          "Three inside up: a bullish harami (small body inside a large bearish one) followed by a bullish close above it — a slower, more conservative reversal claim than the morning star. Its bearish twin is three inside down. These matter because they show reversals do not have to be violent to be tradable; what they trade in drama they add in confirmability. As always: level, then pattern, then confirmation, then risk — never the pattern alone.",
        ],
      },
    ],
    takeaways: [
      "The star's middle candle is equilibrium; the third candle confirms",
      "Soldiers/crows = sustained one-sided pressure, best with expansion",
      "Inside variants trade drama for confirmability",
    ],
    mistakes: [
      "Requiring the textbook gap that most modern markets no longer produce",
      "Calling any three same-color candles 'soldiers' without checking wick control",
    ],
    figure: {
      kind: "candles",
      ref: "morning-star",
      caption:
        "Morning star: sell-off, equilibrium, reclaim — the middle candle is where the story turns.",
    },
  },
  "les-c-context-first": {
    title: "The context rule: pattern + location + confirmation + risk",
    durationMin: 6,
    objectives: [
      "Apply the full context checklist before any pattern trade",
      "Explain why 'hammer = buy' is a category error",
      "Write pattern trades as conditional plans",
    ],
    sections: [
      {
        heading: "The equation",
        paragraphs: [
          "Pattern + market context + location + structure + confirmation + risk management = potential setup. Remove any term and the equation fails. A hammer in a downtrend at untouched daily support after a liquidity sweep, confirmed by an engulfing close, traded at 0.5% risk with the stop under the wick — that is a setup. A hammer on a 5-minute chart in the middle of a range, taken because 'hammers are bullish' — that is a coin toss with a spread.",
        ],
        bullets: [
          "Context: which regime, which phase (impulse/correction)?",
          "Location: at a level price actually respects?",
          "Structure: does the read agree with the higher timeframe?",
          "Confirmation: what closes/level-break proves it?",
          "Risk: stop beyond invalidation, size within budget",
        ],
      },
      {
        heading: "Probabilities, not promises",
        paragraphs: [
          "Candlestick patterns are contextual signals — compressed evidence about who controlled a period and where. Their reliability depends entirely on where they appear and how they confirm; some contexts will grade positively in your journal and others negatively, and the split is discoverable data. The Academy's honest claim: patterns can tilt a decision that context already supports. They cannot create an edge where location and risk are absent.",
        ],
      },
    ],
    takeaways: [
      "No term of the equation is optional — especially risk",
      "The same pattern is a setup in one location and noise in another",
      "Let the journal grade your pattern trades by context",
    ],
    mistakes: [
      "Memorizing 'bullish patterns' and applying them as unconditional buys",
      "Skipping the confirmation step because the pattern 'looks strong'",
    ],
  },
};
