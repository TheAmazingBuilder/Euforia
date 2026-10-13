import type { AcademyLessonBody } from "./lessons-a";

/**
 * Academy lesson bodies — part B (Chart Patterns, Indicators, Strategies,
 * Trade Management, Psychology, Market Structure, Advanced).
 */

export const ACADEMY_LESSONS_B: Record<string, AcademyLessonBody> = {
  // ── Chart Patterns ───────────────────────────────────────────────────────
  "les-g-reversals": {
    title: "Reversal patterns: double tops, head and shoulders",
    durationMin: 7,
    objectives: [
      "Define double top/bottom with neckline logic",
      "Describe head and shoulders and its measured move",
      "State the failure modes that turn patterns into traps",
    ],
    sections: [
      {
        heading: "Double top and double bottom",
        paragraphs: [
          "A double top: price advances, pulls back, rallies to a similar high a second time, and fails — two rejections of the same supply zone, drawn as an 'M'. Confirmation is the close below the neckline (the low between the two peaks); the classic target is the pattern height projected down from the break. Double bottoms mirror it as a 'W'. Quality rises with the prominence of the prior trend and the cleanness of the two rejections; two wobbly peaks mid-range is a coincidence, not a pattern.",
        ],
      },
      {
        heading: "Head and shoulders",
        paragraphs: [
          "The head and shoulders: three highs where the middle (head) stands above two shoulders, connected by a neckline drawn through the lows between them. The right shoulder's failure to reach the head is the first warning; the neckline break confirms; the measured target is head-to-neckline distance projected from the break. The inverse formation calls bottoms. As always, location rules: a top pattern at resistance after an extended advance carries weight; the same shape in a quiet range is geometry practice.",
        ],
        bullets: [
          "Pattern = prior trend + structure + neckline break",
          "Target = height projected from the break (a guide, not a promise)",
          "Invalidation: price closing back inside the pattern beyond the neckline",
        ],
      },
    ],
    takeaways: [
      "Reversal patterns require a trend to reverse — no trend, no pattern",
      "Neckline closes confirm; wicks through it do not",
      "Measured moves are guides for R planning, not guarantees",
    ],
    mistakes: [
      "Drawing head-and-shoulders on every three-peak wiggle",
      "Entering on the neckline wick and being stopped by the retest that was always coming",
    ],
    figure: {
      kind: "structure",
      ref: "double-top",
      caption:
        "Two rejections, a neckline, a close below — then the retest that separates traders from hope.",
    },
  },
  "les-g-continuations": {
    title: "Continuation patterns: flags, pennants, triangles",
    durationMin: 7,
    objectives: [
      "Describe bull/bear flags and their pole logic",
      "Distinguish ascending, descending and symmetrical triangles",
      "Connect pattern breakout to trend continuation context",
    ],
    sections: [
      {
        heading: "Flags: the pause that reloads",
        paragraphs: [
          "A bull flag is a sharp advance (the pole) followed by a small, downward-drifting consolidation (the flag) that retraces little of it. The read: buyers regrouping, supply absorbed. Confirmation is the break of the flag's upper boundary; measured targets project the pole length from the break. Weakness signs — a flag that retraces over two-thirds of the pole, or drifts sideways for too long — turn 'continuation' into distribution. The bear flag mirrors after declines.",
        ],
      },
      {
        heading: "Triangles and their three moods",
        paragraphs: [
          "An ascending triangle is flat resistance over rising lows — buyers pressing into supply, classically resolved upward. A descending triangle is flat support over falling highs — the mirror. A symmetrical triangle has both sides converging and no built-in bias: it resolves with the break, and honest traders wait for the close rather than predicting. All triangles speak compression → expansion; the lesson from Technical Analysis repeats here at pattern scale.",
        ],
      },
    ],
    takeaways: [
      "Continuation patterns need a trend worth continuing",
      "Shallow retracement inside the flag is the quality tell",
      "Symmetrical triangles have no bias — the close decides, not hope",
    ],
    mistakes: [
      "Trading flag 'breakouts' that happen mid-range with no pole beneath them",
      "Assuming the triangle's direction from the shape instead of waiting for the break",
    ],
    figure: {
      kind: "structure",
      ref: "bull-flag",
      caption:
        "Pole, shallow drift, break — the bull flag with its measured-move guide.",
    },
  },
  "les-g-pattern-discipline": {
    title: "Pattern discipline: when patterns lie",
    durationMin: 5,
    objectives: [
      "List the conditions that make classic patterns unreliable",
      "Apply confirmation and invalidation rules to any pattern",
      "Design a personal checklist for pattern trades",
    ],
    sections: [
      {
        heading: "The reliability conditions",
        paragraphs: [
          "Patterns lie most reliably in three settings. First, no prior trend: reversals without trends are noise. Second, low timeframe amplification: a double top on the 1-minute is a different animal than on the daily; pattern statistics do not transfer between resolutions. Third, absence of confirmation: entering before the break because 'the shape is obvious' converts a defined setup into an opinion. Add volume/range expansion as the fourth witness where available.",
        ],
      },
      {
        heading: "The personal checklist",
        paragraphs: [
          "Write the pattern rules once and grade every pattern trade against them: prior trend present? level/structure context? confirmation criteria stated in advance? invalidation beyond the pattern (not inside it)? target method defined? risk sized to the invalidation? The journal makes the grades cumulative — after twenty pattern trades you will know which shapes, timeframes and contexts actually pay you, which is worth more than any textbook claim.",
        ],
      },
    ],
    takeaways: [
      "Trend, timeframe and confirmation gate every pattern's reliability",
      "Invalidation lives beyond the pattern, never inside it",
      "Your journal outranks any pattern statistics you read",
    ],
    mistakes: [
      "Trading pattern shapes on timeframes you never review in the journal",
      "Letting a 'textbook' pattern override your risk rules because it looks perfect",
    ],
  },

  // ── Indicators ───────────────────────────────────────────────────────────
  "les-i-trend": {
    title: "Trend tools: SMA, EMA, MACD, ADX",
    durationMin: 6,
    objectives: [
      "Explain what moving averages compute and how SMA/EMA differ",
      "Read MACD as momentum of the average, not a signal machine",
      "Use ADX for trend strength, not direction",
    ],
    sections: [
      {
        heading: "Moving averages: the smoothed truth",
        paragraphs: [
          "A simple moving average (SMA) is the mean close over N periods; an exponential moving average (EMA) weights recent closes more, so it turns faster. MAs smooth noise and describe the prevailing direction — the 20/50/200 EMAs are common reference points precisely because many eyes watch them, which self-fulfills some of their level behavior. Crossovers ('golden cross') are lagging by construction: they confirm trends after they exist. Their honest uses are regime filtering (only long above the 200) and dynamic support/resistance in trends.",
        ],
      },
      {
        heading: "MACD and ADX",
        paragraphs: [
          "MACD is the difference between two EMAs (12/26) plus a signal line (9-EMA of that difference) and a histogram. It is momentum-of-trend: rising histogram = trend accelerating; divergence between price highs and MACD highs = trend tiring. ADX measures trend strength on 0-100 without direction — above ~25 suggests a trend worth following, below ~20 a range where breakout logic suffers. ADX tells you which strategy family may apply; it never tells you which way.",
        ],
      },
    ],
    takeaways: [
      "MAs describe and smooth; they lag by design",
      "MACD reads trend momentum; divergence is a warning, not a trigger",
      "ADX = strength dial; pair it with a direction tool",
    ],
    mistakes: [
      "Stacking five moving averages and calling the pile confluence",
      "Trading MA crossovers in ranges where they whip-saw by design",
    ],
    figure: {
      kind: "indicator",
      ref: "sma-ema",
      caption:
        "Price with a 20-period SMA and EMA: both smooth the noise — the EMA hugs price and turns first, the SMA trails.",
    },
    figures: [
      {
        kind: "indicator",
        ref: "macd",
        caption:
          "MACD 12-26 with its 9-signal and histogram: momentum of the trend — the second price high makes a lower MACD high (divergence).",
      },
      {
        kind: "indicator",
        ref: "adx",
        caption:
          "ADX: strength without direction — under 20 the market ranges, above 25 a trend is worth following.",
      },
    ],
  },
  "les-i-momentum": {
    title: "Momentum tools: RSI and stochastic, beyond 70/30",
    durationMin: 6,
    objectives: [
      "Explain what RSI actually measures and its regime behavior",
      "Use divergence and range shifts instead of fixed thresholds",
      "Describe stochastic's faster, noisier role",
    ],
    sections: [
      {
        heading: "RSI: relative strength, relative context",
        paragraphs: [
          "RSI compares average gains to average losses over N periods (14 typical), mapped 0-100. The lazy reading — above 70 sell, below 30 buy — fails systematically: in a real trend RSI pins above 70 for weeks while price makes the move. The professional readings: in ranges, 70/30 extremes do mark exhaustion; in trends, the 40-50 zone acting as support (bull) or ceiling (bear) is the regime tell; and divergence — price makes a new high, RSI does not — flags weakening momentum worth investigation.",
        ],
      },
      {
        heading: "Stochastic: fast and humble",
        paragraphs: [
          "The stochastic oscillator tracks where the close sits inside the recent high-low range (%K/%D, 14/3 typical). It turns faster than RSI and is consequently noisier — useful for timing within an established read (e.g. a pullback entry) and unreliable as a standalone direction signal. The pattern across both tools: momentum oscillators grade the vigor of moves; they do not know where price is. Location (levels, structure) supplies the 'where'; oscillators supply the 'how hard'.",
        ],
      },
    ],
    takeaways: [
      "RSI > 70 in a trend is strength, not a sell — regime first",
      "Divergence questions momentum; it does not call reversals",
      "Oscillators answer 'how hard', levels answer 'where'",
    ],
    mistakes: [
      "Shorting strong trends because an oscillator is 'overbought'",
      "Running RSI, stochastic, CCI and MACD together — four copies of one idea",
    ],
    figure: {
      kind: "indicator",
      ref: "rsi-zones",
      caption:
        "RSI 0-100: 70/30 mark stretched, not buy/sell — in this trend the oscillator rides overbought while price runs.",
    },
  },
  "les-i-volatility-volume": {
    title: "Volatility and volume: ATR, Bollinger, volume tools",
    durationMin: 6,
    objectives: [
      "Use ATR to size stops to the market's actual behavior",
      "Read Bollinger Bands as a volatility envelope",
      "Interpret volume and its profile as participation evidence",
    ],
    sections: [
      {
        heading: "ATR: the market's own ruler",
        paragraphs: [
          "Average True Range measures the typical period's movement, including gaps (True Range extends the high-low range to account for gaps versus the prior close). Its best use is practical: stops and targets scaled to ATR live inside the market's real behavior. A 10-pip stop on an instrument whose hourly ATR is 30 pips is not discipline — it is a donation. 'Stop = 1.5 × ATR(14)' adapts automatically when volatility regimes shift.",
        ],
      },
      {
        heading: "Bands, volume and profile",
        paragraphs: [
          "Bollinger Bands wrap a 20-SMA with bands at ±2 standard deviations, so they widen in volatility expansions and squeeze in compressions — the squeeze itself is information (compression precedes expansion). Price tagging a band means stretched, not reversed: in trends, bands ride like dynamic support/resistance. Volume confirms participation: breakouts on expanding volume carry more witnesses; OBV cumulates it as a trend check. Volume profile splits the day's volume by price — high-volume nodes act as acceptance zones, low-volume nodes as fast-move vacuums.",
        ],
      },
    ],
    takeaways: [
      "Scale stops to ATR — risk fits the market's behavior, not your hope",
      "Band touches mean stretched; squeezes mean prepare",
      "Volume answers 'did anyone care?' — the witness test for breakouts",
    ],
    mistakes: [
      "Fixed-pip stops across instruments with wildly different ATRs",
      "Reading band touches as reversal signals inside strong trends",
    ],
    figure: {
      kind: "indicator",
      ref: "bollinger-volume",
      caption:
        "Bollinger Bands squeeze before expansion; the breakout that matters carries expanding volume — witnesses arrive.",
    },
  },
  "les-i-judgment": {
    title: "Indicator judgment: stacking, trust and the blank chart",
    durationMin: 5,
    objectives: [
      "Explain why redundant indicators add noise, not confirmation",
      "Define a minimal indicator stack per purpose",
      "Practice reading structure with indicators hidden",
    ],
    sections: [
      {
        heading: "Redundancy is not confirmation",
        paragraphs: [
          "RSI, stochastic and MACD all derive from the same closes — agreement between them is mostly mathematics agreeing with itself. Real confirmation comes from independent evidence classes: structure (price), participation (volume), volatility context (ATR). A defensible minimal stack: EMAs for regime, one oscillator at most for timing, ATR for stop calibration, volume for the witness test. Everything else must justify itself in your journal's statistics or go.",
        ],
      },
      {
        heading: "The blank-chart test",
        paragraphs: [
          "Once a month, open your main chart with indicators off and mark structure, levels and regime by hand, then compare with your indicator-driven read. Where they disagree, your eye usually found the regime change first. The goal is not to abandon tools — it is to keep them as advisors while the price structure remains the court of last resort. Indicators describe price; they do not outrank it.",
        ],
      },
    ],
    takeaways: [
      "Same-input indicators agree vacuously — seek independent evidence",
      "Minimal stack: regime, timing, ATR, volume",
      "Indicators advise; price decides",
    ],
    mistakes: [
      "Adding indicators after every loss, removing none",
      "Letting an oscillator veto a structural read without a reason",
    ],
  },

  // ── Strategies ───────────────────────────────────────────────────────────
  "les-s-blueprint-template": {
    title: "The blueprint format: one template for every strategy",
    durationMin: 6,
    objectives: [
      "Apply the standard template to any strategy you trade",
      "State invalidation and risk before entry, in writing",
      "Recognize when a 'strategy' is actually just an entry",
    ],
    sections: [
      {
        heading: "Fourteen fields, zero vibes",
        paragraphs: [
          "Every strategy in this course is written in the same template: overview, market conditions, required context, setup, entry conditions, stop loss, take profit, position management, invalidation, risk management, example, common mistakes, practice. The format forces completeness: most 'strategies' traders carry are actually entries — an idea about getting in, with everything after left to improvisation. A blueprint fills the whole board before the first order.",
        ],
        bullets: [
          "Market conditions: which regime does it live in?",
          "Invalidation: what exact event cancels the idea?",
          "Risk: fixed fraction sized to the stop, never the reverse",
          "Management: what happens at 1R, at 2R, into news?",
        ],
      },
      {
        heading: "Conditions attached",
        paragraphs: [
          "No strategy in this Academy is presented as guaranteed to be profitable — that claim would be dishonest. What a blueprint provides is a defined set of conditions under which the idea has historically made sense to traders, an exact invalidation, and a risk wrapper that survives being wrong. Whether YOUR execution of it has an edge is an empirical question your journal answers, setup by setup, in R.",
        ],
      },
    ],
    takeaways: [
      "A strategy is a full board — entry is one square",
      "Invalidation written in advance beats conviction every time",
      "The journal, not the backtest story, grants the strategy its place",
    ],
    mistakes: [
      "Trading a setup with no management or invalidation plan",
      "Changing the template rules mid-trade because price got uncomfortable",
    ],
    figure: {
      kind: "levels",
      ref: "blueprint-anatomy",
      caption:
        "Every field of the template on one chart: location, trigger, entry, stop beyond invalidation, target at the next liquidity — the R math reads itself on the right edge.",
    },
  },
  "les-s-breakout-retest": {
    title: "Blueprint: breakout + retest",
    durationMin: 7,
    objectives: [
      "State the full breakout-retest blueprint in template form",
      "Define the confirmation that qualifies the retest",
      "Identify the two classic failure modes",
    ],
    sections: [
      {
        heading: "The board",
        paragraphs: [
          "Market conditions: compression into a defined level after a directional approach — range edge, prior high, or consolidated consolidation boundary. Required context: higher-timeframe agreement (bias side), level drawn as a zone from at least two prior reactions. Setup: decisive break — close beyond the zone with expansion. Entry: on the retest of the broken zone, with a confirmation candle (rejection wick or engulfing close) in the break's direction. Stop: beyond the retest extreme, plus ATR buffer. Target: measured move or next structural level; partials optional at 1R. Invalidation: retest slices back through the zone and closes inside — the break is dead, and the failure itself is a signal in the opposite direction.",
        ],
      },
      {
        heading: "Failure modes and honest expectations",
        paragraphs: [
          "Failure one: the late chase — entering after the retest has already launched, buying the top of the bounce at triple the spread. Failure two: the no-context break — trading every range wiggle as a 'breakout' when the higher timeframe is itself ranging, feeding your losses to the faders. This setup can miss entire trends that never look back — that cost is structural and accepted in advance. The journal grades it by regime: expect the win rate to live or die with the trend filter you actually enforce.",
        ],
      },
    ],
    takeaways: [
      "Close + expansion qualifies the break; reaction qualifies the retest",
      "The failed retest is information — sometimes the better trade",
      "Missing some trends entirely is part of the blueprint, not a bug",
    ],
    mistakes: [
      "Treating any touch of the old level as a retest entry",
      "Skipping the higher-timeframe filter because the lower chart 'looks ready'",
    ],
    figure: {
      kind: "levels",
      ref: "breakout-retest",
      caption:
        "The momentum playbook in one drawing: require the close, wait for the return to the broken level, and let the old roof prove it is now a floor before risking anything.",
    },
  },
  "les-s-pullback-trend": {
    title: "Blueprint: trend pullback continuation",
    durationMin: 7,
    objectives: [
      "Write the pullback-continuation blueprint end to end",
      "Grade pullback depth against structure",
      "Manage the trade's stop after 1R",
    ],
    sections: [
      {
        heading: "The board",
        paragraphs: [
          "Market conditions: established trend on the execution timeframe with HH/HL (uptrend) or LL/LH (downtrend) intact. Required context: higher timeframe agrees; a defined level or moving average the pullback is reaching. Setup: correction against the trend that holds the last structural point (higher low in uptrends). Entry: continuation trigger at or inside the zone — rejection candle, engulfing, or structure-resumption break. Stop: below the pullback extreme (plus ATR buffer) — beyond the invalidation, not inside the noise. Target: prior extreme first, extension optional; partials at 1R common. Invalidation: the structural point breaks — trend thesis dead, exit in full.",
        ],
      },
      {
        heading: "Depth and honesty",
        paragraphs: [
          "Shallow pullbacks (barely a third of the last impulse) offer tight stops but lower confirmation; deep ones (past 61.8% of the impulse, flirting with the last higher low) offer better price and worse odds. Neither is free. The template's discipline is the same either way: the structural point is the line — not 'it feels deep enough'. This strategy's known cost is regime death: when the trend ends, consecutive small losses arrive; the daily loss limit from Risk Management is what turns that phase into a rounding error.",
        ],
      },
    ],
    takeaways: [
      "The last structural point is the invalidation — that is the whole line",
      "Stop beyond the pullback extreme + ATR, sized to budget",
      "Know the strategy's cost: dying trends pay you in small losses",
    ],
    mistakes: [
      "Buying 'pullbacks' that have already broken the higher low",
      "Holding for extension after the trend's regime visibly changed",
    ],
    figure: {
      kind: "levels",
      ref: "pullback-trend",
      caption:
        "Correction against an intact trend, into a shelf that has defended before: entry on the rejection inside the zone, stop below the pullback extreme, target the prior high.",
    },
  },
  "les-s-range-reversion": {
    title: "Blueprint: range trading and mean reversion",
    durationMin: 7,
    objectives: [
      "Write the range blueprint: fade edges, respect the middle",
      "Define when the range itself is invalidated",
      "Explain mean reversion's statistical honesty",
    ],
    sections: [
      {
        heading: "The board",
        paragraphs: [
          "Market conditions: a range you can draw — at least two reactions at each boundary, declining participation on approaches, no higher-timeframe expansion in progress. Setup: price reaches the boundary zone and shows rejection (wick cluster, engulfing, momentum stall). Entry: on the confirmation candle, stop beyond the boundary + ATR buffer, target the opposite boundary or the mid-range (mean). Partial exits at mid-range are standard; holding for the far edge is the aggressive version. Invalidation: a close beyond the boundary — the range thesis is dead, flip the lens.",
        ],
      },
      {
        heading: "Mean reversion, honestly",
        paragraphs: [
          "Mean reversion assumes stretch returns toward the average — true often enough in regimes where participation is balanced, and exactly wrong when a regime shift turns the range into a trend. The statistics are seductive (high win rate, small average win) and the tail risk is one trend day. That is why range systems pair with hard invalidation and why the '1 big loss erases 8 wins' pattern in the journal is the signature of a range trader ignoring it. The regime filter — ADX, structure, or simple boundary-quality — is not optional garnish; it is the system.",
        ],
      },
    ],
    takeaways: [
      "Fade edges with confirmation; never trade the middle of a range",
      "A boundary close is the thesis's death — act like it",
      "High win rate + unmanaged tail = one trend day from ruin",
    ],
    mistakes: [
      "Fading the third retest of a boundary whose reactions keep growing",
      "Removing the stop 'because the range held five times'",
    ],
    figure: {
      kind: "levels",
      ref: "range-reversion",
      caption:
        "The auction stuck between two agreement levels: feed at the edges, take profit at the mean, and retire the playbook when the edges start compressing.",
    },
  },

  // ── Trade Management ─────────────────────────────────────────────────────
  "les-m-winners": {
    title: "Managing winners: break-even, partials, trailing",
    durationMin: 6,
    objectives: [
      "Weigh break-even moves against their hidden cost",
      "Use partial exits as risk-reduction, not as a hedge on judgment",
      "Choose a trailing method that fits the strategy's shape",
    ],
    sections: [
      {
        heading: "Break-even: the double-edged gift",
        paragraphs: [
          "Moving the stop to entry at +1R converts some full winners into scratches — trades the plan wanted you to hold. The benefit is real too: risk removed. The honest rule is to predefine it: 'at +1R, stop to entry only on the B-grade version of this setup', written before the trade. What is not acceptable is improvising break-even at +0.4R because the candle scared you — that is fear wearing a management costume, and the journal's plan-adherence score will show it.",
        ],
      },
      {
        heading: "Partials and trails",
        paragraphs: [
          "Taking half at +1R and trailing the rest is the classic compromise: it banks variance while keeping optionality, at the mathematical cost of full-position winners. Trailing methods — swing-based (below each new higher low), ATR-based (1.5-2×ATR), or fixed-R — encode different beliefs about how far runs go. Swing trails respect structure; ATR trails adapt to volatility; fixed-R trails are simplest to audit. Pick the one matching the strategy's typical run length, write it in the blueprint, and let the journal grade the whole package — a management choice is part of the strategy, not a free variable to tune nightly.",
        ],
      },
    ],
    takeaways: [
      "Predefine break-even rules; improvised ones are fear in costume",
      "Partials buy peace with expectancy — price it consciously",
      "Trailing method = a belief about run length; audit it like any rule",
    ],
    mistakes: [
      "Trail so tight that normal noise retires every would-be 3R winner",
      "Taking partials at +0.3R 'to secure something' on every trade",
    ],
    figure: {
      kind: "risk",
      ref: "trailing-exit",
      caption:
        "The swing trail in action: each new higher low ratchets the stop up and the open risk down — the winner is protected by a moved line, not by hope.",
    },
  },
  "les-m-losers": {
    title: "Managing losers: invalidation, scaling and the sin list",
    durationMin: 6,
    objectives: [
      "Define invalidation as the only honest exit reason",
      "Explain why scaling into losers is a policy decision, not a reflex",
      "Build a personal sin list from real losses",
    ],
    sections: [
      {
        heading: "The stop is the plan's signature",
        paragraphs: [
          "A loss taken at the planned stop is a strategy working exactly as designed — the cost of doing business that expectancy already priced. Everything else is management of a dead position: widening stops ('give it room'), averaging down ('better price now'), or removing the stop ('it has to come back'). Each converts a small, planned loss into an open-ended bet sized by hope. The invalidation you wrote in the blueprint is the position's death certificate; when it fires, the position is over whether or not you closed it.",
        ],
      },
      {
        heading: "Scaling and the sin list",
        paragraphs: [
          "Scaling IN to a loser can be legitimate — but only as a pre-written policy with its own risk budget ('add at the retest only if the structural read is intact and total risk stays ≤1%'), never as an improvised rescue. The tool that fixes loser-management is embarrassingly simple: keep a sin list in the journal — every unplanned exit, widened stop and added unit, with the R damage attached. Patterns appear within weeks; the list becomes your personal rulebook, written by the only authority that knows your actual failure modes: your own record.",
        ],
      },
    ],
    takeaways: [
      "A stop-hit is the plan working — the alternative is betting hope",
      "Scaling into losers is legal only as pre-written policy",
      "The sin list converts mistakes into rules automatically",
    ],
    mistakes: [
      "Moving the stop the first time price 'gets close' — pre-surrender",
      "Treating averaging down as conviction when it is loss aversion",
    ],
    figure: {
      kind: "risk",
      ref: "stop-discipline",
      caption:
        "Same trade, two ledgers: the honored stop costs −1R once; the widened stop renegotiates with the market and pays −3R — the first stop is always the cheapest.",
    },
  },
  "les-m-exit-system": {
    title: "Exit criteria and the R ledger",
    durationMin: 5,
    objectives: [
      "Write exit criteria per strategy, not per mood",
      "Record every exit in R with its reason code",
      "Audit exits quarterly for systematic leakage",
    ],
    sections: [
      {
        heading: "Exits are rules, plural",
        paragraphs: [
          "Every position faces four possible exits: the target, the stop, the invalidation event, and the pre-defined management trigger (time stop, news cutoff, structure break). A complete blueprint names all four — 'no target hit in 3 sessions and structure flattens = exit at market' is as much an exit rule as the stop. Trades without exit rules default to a fifth, unwritten exit: whenever discomfort wins. The journal's reason codes exist to make that default visible and expensive.",
        ],
      },
      {
        heading: "The audit",
        paragraphs: [
          "Tag every exit with its reason and R, then read the ledger: if 'moved stop' trades average −1.8R while 'stop as planned' averages −1.0R, the leakage has a number — that is the exact cost of broken rules, in the only currency that matters. If 'time-stop' exits consistently precede 2R runs, the time stop is too tight. Exit quality is half of expectancy; auditing it is cheaper than finding a new strategy.",
        ],
      },
    ],
    takeaways: [
      "Four named exits per blueprint; the fifth (discomfort) is banned",
      "Reason codes turn exit behavior into data",
      "Exit leakage has a number — read it quarterly",
    ],
    mistakes: [
      "Recording P&L without exit reasons — data without diagnosis",
      "Changing exit rules the same week you introduced them",
    ],
    figure: {
      kind: "risk",
      ref: "exit-ladder",
      caption:
        "Entry, stop, T1 at +1R with the stop moved to break-even, T2 left running — every exit was priced before the entry, because the ladder is the position.",
    },
  },

  // ── Psychology ───────────────────────────────────────────────────────────
  "les-y-traps": {
    title: "The traps: FOMO, revenge and bias",
    durationMin: 6,
    objectives: [
      "Recognize FOMO, revenge trading and overtrading as sequences, not moods",
      "Name the biases that distort trading judgment",
      "Interrupt each trap with a concrete counter-move",
    ],
    sections: [
      {
        heading: "The three horsemen",
        paragraphs: [
          "FOMO: price is running, the setup never formed, and entering feels like missing life — the trade skips context, confirmation and often sizing. Revenge trading: a loss (especially an 'unfair' one) demands immediate repayment — risk doubles, standards drop, and the second loss is statistically likely to be worse. Overtrading: boundaries blur from trades to sessions; every wiggle looks actionable because activity feels like control. All three share a signature: the decision quality collapses while the urgency rises.",
        ],
        bullets: [
          "FOMO antidote: 'the move I missed is not a setup I had' — write it, close the chart",
          "Revenge antidote: after any loss, a mandatory pause and a one-line journal note before a new order",
          "Overtrading antidote: a daily trade cap and the loss limit from Risk Management",
        ],
      },
      {
        heading: "The quiet biases",
        paragraphs: [
          "Confirmation bias reads charts for evidence the idea is right; loss aversion makes a −0.5R scratch feel worse than a −1R planned stop, pushing stops 'just a bit'; recency bias weights this morning's loss over last month's statistics; overconfidence after a win streak sizes up exactly when expectancy says stay flat. None of these are cured by insight alone — they are routed around by pre-commitment: plans written before exposure, caps set before the session, sizes fixed before the entry.",
        ],
      },
    ],
    takeaways: [
      "Traps are sequences with early signatures — interrupt them early",
      "Biases are routed around by pre-commitment, not willpower",
      "The pause after a loss is a position, not a weakness",
    ],
    mistakes: [
      "Believing awareness is enough without changing the environment",
      "Browsing charts after a loss 'just to watch' — revenge loading its gun",
    ],
    figure: {
      kind: "structure",
      ref: "bull-trap",
      caption:
        "The break that closes back inside is the trap: late longs above the level are the fuel — the patient trader reads closes, not pokes, and neither chases nor averages.",
    },
  },
  "les-y-tilt-protocol": {
    title: "The tilt protocol: a system for bad days",
    durationMin: 6,
    objectives: [
      "Define tilt operationally and detect it early",
      "Build a written protocol that fires before tilt compounds",
      "Use the journal's emotion fields as tilt telemetry",
    ],
    sections: [
      {
        heading: "Tilt is mechanical",
        paragraphs: [
          "Tilt is the state where decisions serve emotion instead of the plan: sizing up after losses, skipping checklists, exits by feel. It is not a character flaw — it is a predictable response to losses plus urgency, and it responds to mechanics better than to resolve. Detection is telemetry: risk per trade drifting up, trade frequency doubling, mood tags hitting 'frustrated' twice before noon — the journal already records all three.",
        ],
        bullets: [
          "Trigger 1: daily loss limit reached → platform closed, flat until tomorrow",
          "Trigger 2: two consecutive rule-broken trades → 24h no-trade, review required",
          "Trigger 3: size drift >25% above plan → written justification or revert",
        ],
      },
      {
        heading: "Writing the protocol",
        paragraphs: [
          "Your protocol is a short, brutal document: the triggers above (calibrated to your history), the actions (log out, journal, walk), and — critically — the re-entry condition ('return only after writing the post-mortem and one flat trading day'). Write it while calm; sign it; let a trading partner or the journal's discipline score hold you to it. The traders who last are not the calmest — they are the ones whose systems assume they will not be.",
        ],
      },
    ],
    takeaways: [
      "Tilt is detectable in telemetry before it is obvious in P&L",
      "Triggers and re-entry conditions are written pre-exposure",
      "Design for the worst day; the good days need no protocol",
    ],
    mistakes: [
      "Setting tilt triggers during a losing day — negotiate with yourself while tilted, lose",
      "Treating the protocol as broken because it fired once and you 'felt fine'",
    ],
  },
  "les-y-process": {
    title: "Process over outcome: the routine that compounds",
    durationMin: 5,
    objectives: [
      "Score trades on process, not P&L",
      "Build a pre-market routine that removes morning decisions",
      "Connect routine → decision → journal → review as one loop",
    ],
    sections: [
      {
        heading: "The process grade",
        paragraphs: [
          "Every trade gets two grades: the R it produced and the process grade — did it match the playbook, respect sizing, use the checklist, record honestly? A +2R impulse trade with no setup is a bad trade that paid; a textbook A-setup that lost 1R is a good trade that didn't. Over samples, process-graded trades converge to real edge; P&L-graded trades converge to gambling with extra steps. The journal's discipline score is exactly this grade, computed for you.",
        ],
      },
      {
        heading: "The loop",
        paragraphs: [
          "The routine that compounds: pre-market (regime note, levels, risk caps, mood check) → trade only listed setups → journal every trade and skipped setup → end-of-session review (grades, tilt check, one lesson) → weekly review (expectancy by setup, rule adherence). Each step removes a decision from the emotional hours and hands it to the calm ones. Emotional state → decision → trade → journal → review: the loop either compounds discipline or compounds noise; the difference is only whether the steps are written down.",
        ],
      },
    ],
    takeaways: [
      "Two grades per trade: R and process — read them separately",
      "Routines move decisions to the calm hours",
      "The loop is the edge; each skipped step is a leak",
    ],
    mistakes: [
      "Journaling only wins — censored data teaches nothing",
      "Reviewing weekly P&L instead of weekly process adherence",
    ],
    figure: {
      kind: "structure",
      ref: "process-loop",
      caption:
        "Routine strips the morning down to execution; the journal and the review close the loop — score the process, and the outcomes take care of the ranking.",
    },
  },

  // ── Market Structure ─────────────────────────────────────────────────────
  "les-s-swings-trends": {
    title: "Swings and trends: the skeleton",
    durationMin: 6,
    objectives: [
      "Define swing highs/lows and the HH-HL / LH-LL logic",
      "Distinguish trend, range and transition by structure alone",
      "Mark structure honestly without hindsight",
    ],
    sections: [
      {
        heading: "Swings define everything",
        paragraphs: [
          "A swing high is a bar (or cluster) whose high stands above the highs of its neighbors; a swing low, below its neighbors' lows. String them together and structure appears: higher highs with higher lows = uptrend; lower lows with lower highs = downtrend; overlapping swings bound by horizontal levels = range. Every trend definition in technical analysis reduces to this — the rest is styling.",
        ],
      },
      {
        heading: "Marking without hindsight",
        paragraphs: [
          "The professional discipline is marking swings as they confirm — a swing high is only 'confirmed' when price has moved a meaningful amount (or closed) below the potential high, per a rule you fix in advance (e.g. 'two closes below the candle before it counts'). Hindsight marking makes every chart look tradeable; live marking with a fixed rule makes it honest. Mark on the higher timeframe first, then descend: structure on the daily is the ocean, the 15-minute is the waves on it.",
        ],
      },
    ],
    takeaways: [
      "Swings are the atoms; trend/range are the molecules",
      "Confirmation rules fixed in advance kill hindsight bias",
      "Higher timeframe owns the structure read",
    ],
    mistakes: [
      "Re-marking structure every bar to fit the current wish",
      "Calling an uptrend from one higher high without the higher low",
    ],
    figure: {
      kind: "structure",
      ref: "uptrend-hhhl",
      caption:
        "Higher highs and higher lows — the sequence that defines an uptrend, marked at confirmation.",
    },
  },
  "les-s-bos-choch": {
    title: "BOS and CHoCH: breaks and character shifts",
    durationMin: 6,
    objectives: [
      "Define break of structure and change of character precisely",
      "Separate structural breaks from noise (closes, swings, filters)",
      "Use the vocabulary as a framework, honestly labeled",
    ],
    sections: [
      {
        heading: "The definitions",
        paragraphs: [
          "A break of structure (BOS) is price closing beyond the defining swing in the trend's direction — in an uptrend, a close above the last confirmed swing high: continuation evidence. A change of character (CHoCH, sometimes MSS — market structure shift) is the first break AGAINST the trend: in an uptrend, a close below the last higher low. BOS says 'the move continues'; CHoCH says 'the argument against the trend just scored'. Neither is a promise — both are evidence.",
        ],
      },
      {
        heading: "Breaks versus noise",
        paragraphs: [
          "Wicks through swings are raids, not breaks — the close is the arbiter, and some traders add a filter (close beyond by X ATR, or a second confirming close). Vocabulary note, honestly: BOS/CHoCH are modern SMC-community labels for observations classical analysis called 'break of the last swing' and 'trend break'. The concepts are old and structural; the names are new and stylistic. What matters is that YOUR rule for what counts as a break is written down and applied identically every time — the journal grades the rule, not the jargon.",
        ],
      },
    ],
    takeaways: [
      "BOS = continuation break; CHoCH = first counter-trend break",
      "Closes (with your fixed filter) define breaks — wicks raid",
      "Labels are a framework; your written rule is the system",
    ],
    mistakes: [
      "Calling wick-throughs structural breaks and re-entering into sweeps",
      "Redefining 'valid break' whenever the last one failed",
    ],
    figure: {
      kind: "structure",
      ref: "bos-choch",
      caption:
        "BOS above the swing high (continuation), then CHoCH under the higher low (character shift).",
    },
  },
  "les-s-invalidation": {
    title: "Structural invalidation: where the thesis dies",
    durationMin: 5,
    objectives: [
      "Attach an invalidation level to every structural read",
      "Explain trend maturity and structural exhaustion",
      "Combine structure with the risk wrapper from Risk Management",
    ],
    sections: [
      {
        heading: "Every read has a line",
        paragraphs: [
          "If the trend is 'higher highs and higher lows', the thesis dies when the last higher low closes away — that price is the structural invalidation, and it doubles as the natural stop location for continuation trades. A read without a line is not a read; it is a mood. The professional sequence: mark structure → define the line where the read is wrong → only then ask whether the entry offers acceptable R to that line.",
        ],
      },
      {
        heading: "Maturity and exhaustion",
        paragraphs: [
          "Structure also ages: trends that extend far from their last higher low (extended structure) offer poor R to the structural line; late-stage trends show compressed swings, momentum divergence and shallower corrections. None of these call tops — they price the thesis. Combined with the risk course's limits, structural invalidation completes the picture: the line tells you where you are wrong; the sizing tells you what being wrong costs; the journal tells you how often your lines were honest.",
        ],
      },
    ],
    takeaways: [
      "Structural invalidation = last defining swing — stop there or skip",
      "Extended structure prices poor R; it does not call reversals",
      "Line, then size, then entry — in that order",
    ],
    mistakes: [
      "Trading continuation with stops unrelated to the structural line",
      "Ignoring trend age because the trend 'still looks strong'",
    ],
    figure: {
      kind: "levels",
      ref: "invalidation-level",
      caption:
        "The higher low carries the whole read: a wick through the line is a raid the close can reject — a close through it ends the thesis, and the position with it.",
    },
  },

  // ── Advanced ─────────────────────────────────────────────────────────────
  "les-a-multi-timeframe-regimes": {
    title: "Multi-timeframe context and regime awareness",
    durationMin: 6,
    objectives: [
      "Build a three-layer timeframe stack with defined roles",
      "Detect regime by volatility and structure, not by indicator alone",
      "Record regime in the journal and audit per-regime expectancy",
    ],
    sections: [
      {
        heading: "The stack",
        paragraphs: [
          "A working stack has three roles: bias (weekly/daily — longs, shorts or stand aside), context (4H/1H — the level map and regime), execution (15m/5m — triggers and stops). Each layer answers one question; conflicts resolve upward, never downward. The classic failure is inverting the stack — letting a 5-minute pattern overturn a daily bias — which feels nimble and is, statistically, just noise with confidence.",
        ],
      },
      {
        heading: "Regimes and the ledger",
        paragraphs: [
          "Regime has two axes: direction (trend/range per structure) and volatility (expansion/compression per ATR). The same breakout system lives in different universes across the four quadrants — trending-volatile favors continuation with wide targets; ranging-quiet favors fades with modest targets. Tag every trade with the quadrant it was taken in (the journal's session notes are the place), then read expectancy per quadrant after 30+ trades. Most traders discover one quadrant pays them and three quietly tax them — and that discovery alone can lift the whole book.",
        ],
      },
    ],
    takeaways: [
      "Bias → context → execution; conflicts resolve upward",
      "Regime = direction × volatility; tag it per trade",
      "Per-regime expectancy is where hidden leaks show",
    ],
    mistakes: [
      "Letting execution-timeframe excitement override the bias layer",
      "One expectancy number for four different markets",
    ],
    figure: {
      kind: "structure",
      ref: "mtf-alignment",
      caption:
        "Direction from the daily, pullback quality from the 1-hour, trigger from the 5-minute: three rows must agree before risk is allowed — one dissenter means wait.",
    },
  },
  "les-a-correlation-exposure": {
    title: "Correlation and portfolio exposure",
    durationMin: 5,
    objectives: [
      "Explain correlation as hidden risk multiplication",
      "Compute total exposure across correlated positions",
      "Set portfolio-level limits alongside per-trade risk",
    ],
    sections: [
      {
        heading: "Three positions, one bet",
        paragraphs: [
          "Long EUR/USD, short USD/CHF, long GBP/USD can look like three trades and behave like one — all are substantially dollar-shorts. Correlation means the positions share a driver; when the driver moves, the 'diversification' vanishes and three 0.5% risks arrive as 1.5% on one factor. Crypto majors versus BTC, tech stocks versus indices, oil versus CAD: the map of shared drivers matters more than the list of instruments.",
        ],
      },
      {
        heading: "Exposure budgeting",
        paragraphs: [
          "The fix is portfolio-level rules on top of per-trade risk: a cap on total open risk (e.g. 3%), a cap per driver ('no more than 1.5% net dollar-shorts'), and awareness that correlated stops hit together — your worst day is built from your most correlated day. The journal's account view shows open risk in R and currency; reviewing it before adding a position is the two-minute habit that prevents the one bad day that erases a good month.",
        ],
      },
    ],
    takeaways: [
      "Correlated positions are one bet wearing three tickets",
      "Budget exposure per driver, not per instrument",
      "Correlated stops fire together — size for the cluster, not the single",
    ],
    mistakes: [
      "Counting open risk by position count instead of by driver",
      "Discovering correlation from a drawdown instead of from the map",
    ],
    figure: {
      kind: "risk",
      ref: "correlation-clusters",
      caption:
        "Long EUR, long GBP, short USD/CHF: three tickets, one dollar-short — the shared driver merges three 0.5% risks into a single 1.5% bet that stops all at once.",
    },
  },
  "les-a-system-statistics": {
    title: "System thinking: validation and the statistics traders need",
    durationMin: 6,
    objectives: [
      "Distinguish backtest, forward test and live sample",
      "Estimate sample size before trusting a statistic",
      "Read drawdown and expectancy together, not separately",
    ],
    sections: [
      {
        heading: "Three evidences, three weaknesses",
        paragraphs: [
          "A backtest replays rules on history — fast, but vulnerable to hindsight fitting, spread assumptions and regime luck. A forward test (demo or micro size) removes hindsight and adds execution reality — slippage, hesitation — but runs on today's regime only. The live sample is the truth but the slowest. The professional chain is backtest → forward → live with the rules frozen at each stage; changing rules between stages resets the clock on all of them.",
        ],
      },
      {
        heading: "The humble math",
        paragraphs: [
          "Statistics need samples: a 20-trade win rate is a rumor; 100+ trades start to mean something; expectancy estimates need even more when wins are rare and large. Drawdown expectations scale with sample too — a system with +0.15R expectancy and 45% win rate should be EXPECTED to string 6-8 losses somewhere in a few hundred trades; if your sizing cannot survive that, the sizing is the bug, not the streak. The journal computes these numbers for you precisely so the audit is a look, not a project.",
        ],
        bullets: [
          "<30 trades: anecdote — change nothing based on it",
          "30-100: hypothesis forming — adjust cautiously",
          "100+: evidence — act on it",
        ],
      },
    ],
    takeaways: [
      "Freeze rules between validation stages or restart the clock",
      "Small samples manufacture false confidence",
      "Expectancy and drawdown are one sentence, not two",
    ],
    mistakes: [
      "Optimizing a backtest until it is a biography of past prices",
      "Quitting a system at trade 18 of the sample its own math required",
    ],
    figure: {
      kind: "risk",
      ref: "stats-curve",
      caption:
        "The equity curve of a working system still owes losing streaks — a 43% win rate, +0.15R expectancy and an 18% drawdown that is expected arithmetic, not failure.",
    },
  },
};
