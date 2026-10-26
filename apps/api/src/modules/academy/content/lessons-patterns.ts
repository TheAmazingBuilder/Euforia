import type { AuthoredCourse } from "./types";
import { text, tip, warn, list, formula, structure, table, mc, tf, sc, num } from "./types";

/**
 * Chart Patterns + Indicators - pattern geometry with measured-move targets,
 * then the indicator toolbox organized by purpose. Structure diagram variants
 * (double-top, head-shoulders, triangles, flags…) are rendered client-side.
 */

export const CHART_PATTERN_COURSES: AuthoredCourse[] = [
  {
    id: "crs-chartpatterns-reversal",
    categoryId: "cat-chart-patterns",
    title: "Reversal Patterns",
    description:
      "Double tops and bottoms, head and shoulders (and its inverse), triples - the geometry of trend exhaustion with measured targets.",
    level: "INTERMEDIATE",
    objectives: [
      "Identify reversal formations before they are complete",
      "Apply neckline/confirmation logic",
      "Project measured-move targets and place invalidation",
    ],
    lessons: [
      {
        id: "lsn-cp-double",
        title: "Double Top & Double Bottom",
        summary: "Two failures at the same price: the M and the W, confirmed by the mid-level break.",
        minutes: 8,
        objectives: [
          "Define the M/W formation and its neckline",
          "Distinguish double tops from mere ranges",
          "Compute the measured target and invalidation",
        ],
        blocks: [
          text("A double top is two pushes into the same resistance area separated by a pullback; the pattern completes when price breaks below the pullback low (the neckline). Geometrically it is a range that failed twice to advance - demand exhausted at a price the market has already accepted twice. The double bottom mirrors it after a decline."),
          structure("double-top", "Double top: two highs, one neckline - the break completes the M."),
          structure("double-bottom", "Double bottom: two lows, one neckline - the break completes the W."),
          formula("Measured move", "Target = Neckline ± (Peak − Neckline)", "Project the pattern's height from the break."),
          warn("Until the neckline breaks, it is a range",
            "Most 'double tops' drawn in real time never complete - price breaks out instead. The formation is a hypothesis; the neckline break is the event. Entering on the second top without confirmation is anticipation, not trading."),
        ],
        takeaways: [
          "Two extremes + neckline break = complete pattern",
          "Target = pattern height projected from the neckline",
          "Invalidation: beyond the second extreme",
        ],
      },
      {
        id: "lsn-cp-hs",
        title: "Head & Shoulders (+ Inverse)",
        summary: "Three pushes, the middle one strongest: the classic exhaustion topology and its neckline.",
        minutes: 9,
        objectives: [
          "Identify LS–head–RS topology",
          "Use neckline breaks and retests as entries",
          "Recognize the inverse formation after declines",
        ],
        blocks: [
          text("A head and shoulders top is three peaks: a left shoulder, a higher head, a right shoulder that fails to reach the head - each peak on a weakening ability to attract buyers. The neckline connects the two pullback lows between peaks; its decisive break is the pattern's completion, converting 'topping shape' into 'confirmed reversal'."),
          structure("head-shoulders", "LS - head - RS; the neckline break completes the top."),
          structure("inverse-head-shoulders", "Inverse head & shoulders after a decline - the bottoming mirror."),
          text("Entry conventions: the neckline break itself, or the retest of the neckline from below (better stop location, some entries missed). The measured move projects head-to-neckline distance from the break point. The pattern fails when price reclaims the head - a clean, structural invalidation."),
        ],
        takeaways: [
          "Three peaks, weakening right side, neckline verdict",
          "Break or retest entries; head-reclaim is the stop",
          "Target = head-to-neckline height from the break",
        ],
      },
      {
        id: "lsn-cp-triples",
        title: "Triple Tops/Bottoms & Pattern Failure",
        summary: "When two failures become three, and what every reversal pattern teaches about invalidation.",
        minutes: 7,
        objectives: [
          "Recognize triple formations as extended doubles",
          "State failure modes and their signals",
          "Choose confirmation depth per volatility",
        ],
        blocks: [
          text("A triple top is a double top that failed once more: three rejections at the same supply before the neckline finally gives. Each additional touch consumes more of the defending orders, so triples often produce sharper post-break moves - the defenders are spent. Confirmation rules are identical; patience requirements are higher."),
          structure("triple-top", "Three rejections, then the neckline breaks."),
          text("Failure modes matter as much as completions: neckline breaks that snap back (false breaks - see the breakout lesson), and formations that resolve into ranges. Your protection is always the same trio: confirmation (close-based breaks), location (patterns at significant levels), invalidation (beyond the pattern extreme - never moved)."),
        ],
        takeaways: [
          "More touches = more consumed defense = sharper resolutions",
          "Close-based neckline breaks filter most false breaks",
          "Every pattern's invalidation is its extreme - in writing, before entry",
        ],
      },
    ],
    quiz: {
      id: "qz-chartpatterns-reversal",
      questions: [
        num("q1", "Double top peaks at 105 and 105, neckline at 100. Measured-move target of the break?", 95, "points",
          "Pattern height 5 points projected from 100 → 95."),
        mc("q2", "In a head & shoulders top, what event completes the pattern?",
          ["The right shoulder forms", "The neckline breaks decisively", "The head prints"], 1,
          "The neckline break converts the shape into a completed, tradeable reversal pattern."),
        tf("q3", "It is safe to short the second top of a would-be double top before the neckline breaks.", false,
          "Until the neckline gives, the formation is just a range. The break is the event."),
      ],
    },
  },
  {
    id: "crs-chartpatterns-continuation",
    categoryId: "cat-chart-patterns",
    title: "Continuation Patterns",
    description:
      "Flags, pennants, triangles, wedges, rectangles and the cup and handle - pauses that reload the trend.",
    level: "INTERMEDIATE",
    objectives: [
      "Distinguish continuation shapes from reversal shapes",
      "Trade flags and triangles with correct triggers",
      "Respect wedge asymmetry and apex decay",
    ],
    lessons: [
      {
        id: "lsn-cp-flags",
        title: "Bull Flag, Bear Flag & Pennant",
        summary: "The trend catches its breath: sharp pole, tight drift, continuation on the break.",
        minutes: 8,
        objectives: [
          "Define pole and flag components",
          "Set entry triggers and stops for flags",
          "Distinguish pennants from flags",
        ],
        blocks: [
          text("A bull flag is a strong, near-vertical pole of momentum followed by a tight, slightly downward-drifting consolidation. The geometry says: buyers pressed hard, then price paused while supply was absorbed without giving back gains. The continuation trigger is the break of the flag's upper boundary; the stop lives under the flag's low."),
          structure("bull-flag", "Pole, tight flag, continuation break."),
          structure("bear-flag", "Bear mirror: pole down, upward-drifting pause, continuation."),
          text("A pennant is the same pole followed by a small symmetrical triangle - converging rather than parallel boundaries. Both are continuation patterns; measured targets typically re-project the pole's height from the breakout point. The failure signal is a flag that deepens into a full retracement - the 'reload' was actually distribution."),
        ],
        takeaways: [
          "Pole + tight pause + boundary break = continuation trigger",
          "Target ≈ pole height re-projected from the break",
          "Deep flags and shrinking poles warn the trend is tiring",
        ],
      },
      {
        id: "lsn-cp-triangles",
        title: "Triangles: Ascending, Descending, Symmetrical",
        summary: "Converging pressure: flat tops with rising lows, flat bottoms with falling highs, and the neutral coil.",
        minutes: 9,
        objectives: [
          "Classify the three triangle types",
          "Anticipate the likely resolution direction",
          "Respect apex decay and late-break risk",
        ],
        blocks: [
          text("An ascending triangle - flat resistance, rising lows - is pressure building against a fixed ceiling: buyers accept progressively worse pullback prices until supply breaks. A descending triangle mirrors it against a fixed floor. A symmetrical triangle is a neutral coil where both sides converge; resolution direction is read from context and the break itself."),
          structure("ascending-triangle", "Flat top, rising lows - pressure against the ceiling."),
          structure("descending-triangle", "Flat bottom, falling highs - pressure against the floor."),
          structure("symmetrical-triangle", "Neutral coil - trade the break, not the prediction."),
          warn("Apex decay",
            "Triangles lose potency as price approaches the apex (the point of convergence). Breaks in the final third of the pattern are frequently false; breaks before two-thirds through carry the cleaner follow-through."),
        ],
        takeaways: [
          "Flat side = the line being defended; rising/falling side = the pressure",
          "Ascending favors upside resolution; descending favors downside",
          "Trade early-to-mid pattern breaks; distrust apex pokes",
        ],
      },
      {
        id: "lsn-cp-wedges-rect",
        title: "Wedges, Rectangles & Cup and Handle",
        summary: "Sloped ranges that exhaust, flat ranges that reload, and the rounded base with its trigger lip.",
        minutes: 9,
        objectives: [
          "Read rising/falling wedges as exhaustion",
          "Trade rectangle breaks with volume confirmation",
          "Define the cup-and-handle trigger",
        ],
        blocks: [
          text("A rising wedge - both boundaries rising but converging - is an uptrend running out of generosity: each new high is bought with less enthusiasm. It often resolves downward even within a broader uptrend. The falling wedge mirrors it. Wedges are continuation-of-slope patterns that frequently act as reversals of the short-term move - treat their breaks as serious."),
          structure("rising-wedge", "Rising wedge: converging highs - momentum decaying upward."),
          structure("rectangle", "Rectangle: flat supply and demand - the break defines the trade."),
          text("A rectangle is a flat, extended range; its break direction (with participation) sets the continuation trade, target = pattern height. The cup and handle is a rounded base followed by a shallow drift - the handle - whose break above the lip triggers the measured move of the cup's depth. It is a patient accumulation story: one of the few patterns where the shape's narrative (time-based, not spike-based) is part of the edge."),
          structure("cup-handle", "Cup and handle: rounded base, shallow handle, lip break."),
        ],
        takeaways: [
          "Wedges = converging slope with decaying momentum",
          "Rectangles trade their break; height gives the target",
          "Cup & handle trigger is the handle's lip, not the cup's rim",
        ],
      },
    ],
    quiz: {
      id: "qz-chartpatterns-continuation",
      questions: [
        sc("q1", "After a strong rally, price consolidates in a tight, slightly downward channel. Next likely continuation?",
          ["Bearish reversal is certain", "Bull flag - continuation on the upper-boundary break", "Triple top forming"], 1,
          "Pole + tight downward-drifting pause = bull flag; the trigger is the upper boundary break."),
        mc("q2", "Which triangle has a flat resistance and rising support lows?",
          ["Descending", "Ascending", "Symmetrical"], 1,
          "Ascending triangle: fixed ceiling, rising floor - pressure upward."),
        tf("q3", "Breakouts in the final third of a triangle (near the apex) carry the cleanest follow-through.", false,
          "Apex-adjacent breaks decay - momentum has drained from the pattern. Earlier breaks are the cleaner ones."),
      ],
    },
  },
];

export const INDICATOR_COURSES: AuthoredCourse[] = [
  {
    id: "crs-indicators-trend-momentum",
    categoryId: "cat-indicators",
    title: "Trend & Momentum Indicators",
    description:
      "Moving averages, VWAP, MACD, ADX, RSI and stochastics - plus the wider trend and momentum family (Parabolic SAR, SuperTrend, Ichimoku, Stochastic RSI, CCI, Williams %R, Aroon, TRIX…): what each measures, how it is built, and when it lies.",
    level: "INTERMEDIATE",
    objectives: [
      "Explain each indicator's construction in one sentence",
      "Use indicators as context, not as commands",
      "Diagnose the classic misreadings (RSI 70, MA crosses in ranges)",
    ],
    lessons: [
      {
        id: "lsn-ind-ma-vwap",
        title: "Moving Averages & VWAP",
        summary: "Smoothed consensus and session-average price: the two reference lines most professionals actually watch.",
        minutes: 9,
        objectives: [
          "Compute SMA/EMA conceptually and choose periods",
          "Use MAs as dynamic support/resistance in trends",
          "Explain VWAP and its intraday role",
        ],
        blocks: [
          text("A simple moving average (SMA) is the mean of the last N closes; an exponential moving average (EMA) weights recent closes more, so it turns faster. Neither predicts: they describe consensus. In trends, a 20/50-EMA acts as dynamic support or resistance - pullbacks toward it are the trend-following entry context. In ranges, the same lines flatten and generate whipsaw crosses that mean nothing."),
          formula("SMA(N)", "SMA = mean(Close[1..N])", "EMA weights recent closes exponentially."),
          text("VWAP - volume-weighted average price - is the session's average price weighted by volume: the price the 'average participant' transacted at. Institutions benchmark execution against it; intraday traders use it as the day's gravity line - longs above, shorts below, as one contextual factor among several. It resets each session by definition."),
          warn("MA crosses in ranges are noise factories",
            "Golden/death crosses and fast/slow EMA crosses earn their reputation in trends and destroy it in ranges. Check the state (trend vs range) before you let any averaged line give you an order."),
        ],
        takeaways: [
          "MAs describe consensus; in trends they are dynamic levels",
          "VWAP = session gravity, reset daily, benchmarked by institutions",
          "Indicator tactics must match market state",
        ],
      },
      {
        id: "lsn-ind-macd-adx",
        title: "MACD & ADX",
        summary: "Momentum of the trend, and strength of the trend - two different questions with two different tools.",
        minutes: 8,
        objectives: [
          "Explain MACD's components and its histogram",
          "Use ADX to classify trending vs ranging regimes",
          "Combine: ADX filters, MACD times",
        ],
        blocks: [
          text("MACD is the difference between a fast and a slow EMA (typically 12−26), plus a signal line (9-EMA of that difference) and a histogram of the two. Rising MACD above zero says the fast consensus is pulling away - momentum with the trend. Crosses and divergences are its signals, and they inherit the same weakness as all smoothing: late in trends, early in reversals, noisy in ranges."),
          formula("MACD line", "MACD = EMA(12) − EMA(26)", "Signal = EMA(9) of MACD; histogram = MACD − signal."),
          text("ADX does not care about direction - it measures trend STRENGTH. Readings under ~20–25 describe ranging conditions; rising ADX confirms a trend gathering participation; falling ADX in a trend warns of exhaustion. The professional pairing: ADX decides whether trend tools apply at all; MACD (or structure) provides the timing inside that regime."),
        ],
        takeaways: [
          "MACD = trend momentum; ADX = trend strength (direction-blind)",
          "ADX filters regime; MACD times within it",
          "All smoothed indicators lag - they confirm, they don't predict",
        ],
      },
      {
        id: "lsn-ind-rsi-stoch",
        title: "RSI & Stochastic - Context Over Thresholds",
        summary: "Why 'RSI > 70 = sell' is a meme: momentum oscillators need trends, ranges and timeframes to mean anything.",
        minutes: 9,
        objectives: [
          "Explain what RSI and stochastic actually compute",
          "Diagnose why overbought stays overbought in trends",
          "Build a context-first oscillator checklist",
        ],
        blocks: [
          text("RSI compares the magnitude of recent up-closes to down-closes, normalized 0–100. Stochastic compares the close to the recent range, normalized similarly. Both are momentum thermometers: high readings mean recent buying has been strong - which in a genuine trend is not a sell signal at all. 'Overbought' markets stay overbought for weeks; the 70/30 threshold heuristic only behaves in ranges."),
          formula("RSI(14) - conceptually", "RSI = 100 − 100/(1 + AvgGain/AvgLoss)", "Momentum normalized - not a probability."),
          list(
            "In ranges: fade the extremes - 70/30 thresholds carry information",
            "In trends: treat 70/30 as confirmation of strength, use pullbacks for entries",
            "Divergence (price new high, RSI lower high) is a warning - confirm with structure before acting",
          ),
          tip("One sentence per indicator",
            "The exam of this lesson is simple: can you say what each tool measures in one sentence? If the answer is 'it gives buy signals', re-read the lesson - indicators measure, traders decide."),
        ],
        takeaways: [
          "Oscillators measure momentum strength, not reversal timing",
          "Range tactics ≠ trend tactics - state first, thresholds second",
          "Divergences warn; structure confirms",
        ],
      },
      {
        id: "lsn-ind-trend-followers",
        title: "Trend Followers: Parabolic SAR & SuperTrend",
        summary: "Two self-tightening trail lines: the stop-and-reverse dots and the ATR regime band that flips.",
        minutes: 8,
        objectives: [
          "Explain the SAR's stop-and-reverse mechanics and its acceleration factor",
          "Read SuperTrend's ATR-band flips as regime changes",
          "Use both as trailing-stop frameworks, not entry oracles",
        ],
        blocks: [
          text("The Parabolic SAR (Stop And Reverse) plots a trail of dots that hugs price and flips sides whenever price crosses it. Each new extreme in the run steps the acceleration factor up, so the trail tightens as the move matures - by design it wants to be stopped and reversed. That made it a complete mechanical system in its era; the professional borrow today is narrower: the dots as a trailing-stop skeleton, letting the market's own extremes ratchet your exit closer without you improvising."),
          formula("Parabolic SAR", "SAR(next) = SAR + AF × (EP − SAR)", "AF starts at 0.02, steps +0.02 per new extreme, caps at 0.20; EP = extreme point of the current run."),
          text("SuperTrend answers the same need with a volatility engine: an ATR-multiple band around the median price, drawn on one side of price at a time. A close beyond the band flips the line to the other side - so the tool's state IS the regime call. Above the line, the trend is bullish and the line is the trailing level; below, the mirror. Because the width is ATR-scaled, the same settings adapt naturally from a sleepy pair to a wild one."),
          formula("SuperTrend", "Band = Median ± k × ATR(10), k ≈ 3", "A close beyond the band flips the trend - and the line."),
          warn("Both are whipsaw machines in ranges",
            "SAR and SuperTrend assume a trend exists. In sideways tape the same mechanics that ratchet a trail also flip side to side, donating spread each time. Filter regime first (structure, ADX); only then let the trail manage the position."),
          list(
            "Trailing-stop framework: exit where the trail exits - mechanical, unemotional",
            "Regime filter: SuperTrend side confirms which pullback tactics are allowed",
            "Never fade a fresh flip: the first candle after a flip is the weakest place to argue with it",
          ),
        ],
        takeaways: [
          "SAR = self-tightening stop-and-reverse trail; borrow the exit, not the reversal",
          "SuperTrend = ATR regime line; its side is the trend call",
          "Both shine in trends and bleed in ranges - filter state first",
        ],
      },
      {
        id: "lsn-ind-ichimoku",
        title: "Ichimoku Kinko Hyo - Reading the Cloud",
        summary: "Five components, one glance: equilibrium lines, a projected cloud, and the discipline of confluence.",
        minutes: 9,
        objectives: [
          "Name the five components and what each averages",
          "Read the cloud (kumo) as support/resistance plus momentum",
          "Demand confluence instead of five separate signals",
        ],
        blocks: [
          text("Ichimoku packs an entire chart-reading system into five overlays, all computed from midpoints of highs and lows rather than closes. The Tenkan-sen (conversion, 9-period midpoint) is the fast equilibrium; the Kijun-sen (base, 26-period midpoint) is the slow one - the trend's 'fair value'. Senkou Span A and B are those equilibria projected 26 periods FORWARD, and the space between them is the cloud (kumo). The Chikou span is today's close plotted 26 periods BACK, letting you compare price directly against its own past structure."),
          table(
            ["Component", "Engine", "Role"],
            [
              ["Tenkan-sen", "(HH + LL) / 2 over 9", "Fast equilibrium, momentum tilt"],
              ["Kijun-sen", "(HH + LL) / 2 over 26", "Slow equilibrium, trend fair value"],
              ["Senkou Span A/B", "Equilibria shifted +26", "The cloud: projected S/R and regime"],
              ["Chikou Span", "Close shifted −26", "Price vs its own past - confirmation"],
            ],
          ),
          formula("Midpoint engine", "Component = (Highest High + Lowest Low) / 2 over N", "Ichimoku averages POSITION, not closes - it maps where the auction balanced."),
          text("The reading order matters: regime first, timing second. Price above a thick, green-ish cloud is a bullish regime where the cloud floor is the structural reference; price below a thick, red-ish cloud is the mirror. A cloud twist (Span A crossing Span B) marks projected momentum change; a kumo BREAK - price clearing the whole cloud and closing there - is the regime-change event. Inside the regime, the Tenkan/Kijun relationship provides timing, and Kijun acts as dynamic support in trends much like a slower moving average."),
          warn("Five signals at a glance tempt five conclusions",
            "Ichimoku's danger is conflation: a Tenkan/Kijun cross, a cloud twist and a Chikou break are three different statements about three different questions. The system earns its reputation only when they align - confluence first, or no trade."),
        ],
        takeaways: [
          "All five components are midpoint-based equilibria, two projected in time",
          "The cloud is regime + projected S/R; its thickness is the level's strength",
          "One glance, one conclusion: no confluence, no trade",
        ],
      },
      {
        id: "lsn-ind-oscillator-family",
        title: "The Wider Oscillator Family",
        summary: "Stoch RSI, Williams %R, CCI, ROC, Awesome, Ultimate, Aroon, TRIX - one map: what each normalizes, and where each lies.",
        minutes: 10,
        objectives: [
          "Place every oscillator on the 'what it normalizes' map",
          "Match oscillator speed to market context",
          "Recognize each tool's classic failure mode",
        ],
        blocks: [
          text("RSI and Stochastic are only the famous two of a large family. Every oscillator normalizes momentum somehow - against its own range, against a statistical mean, against time. The professional shortcut is a one-line identity per tool: what does it divide by, how fast does it react, and which regime makes it lie?"),
          list(
            "Stochastic RSI - an oscillator OF an oscillator: the fastest, most whipsaw-prone member; range tool only",
            "Williams %R - the stochastic in a 0 to −100 costume; same physics, inverted scale",
            "CCI - deviation from the statistical mean of typical price; unbounded, so 'extreme' is contextual, not fixed",
            "Momentum / ROC - raw percent rate of change; the family's honest ancestor, zero decoration",
            "Awesome Oscillator - 5/34 median-price histogram; momentum of the trend in one visual",
            "Ultimate Oscillator - blends 3 timeframes so a single-window spike can't fake a reversal",
            "Aroon - time SINCE the N-period high/low; measures freshness of extremes, not their size",
            "TRIX - triple-smoothed ROC; slow, trend-grade, almost noise-free and therefore late",
          ),
          table(
            ["Tool", "Normalizes", "Best context", "Classic trap"],
            [
              ["Stoch RSI", "Stochastic of RSI", "Tight ranges", "Signals everywhere in trends"],
              ["Williams %R", "Close vs N-range", "Ranges, timing", "Stays pinned in trends"],
              ["CCI", "Mean deviation", "Breakouts from balance", "Unbounded = no fixed 'overbought'"],
              ["ROC / Momentum", "N-period % change", "Regime confirmation", "Old-window distortion after gaps"],
              ["Aroon", "Time since extreme", "Trend freshness", "Lags regime turns by design"],
              ["TRIX", "Triple-smoothed ROC", "Position-trend grading", "Far too slow for tactical entries"],
            ],
          ),
          warn("Oscillators of oscillators compound lag AND noise",
            "Stochastic RSI inherits RSI's smoothing, then normalizes it again: the result reacts fast but swings to its rails constantly. Speed without context is not information - it is motion. Give every fast oscillator a regime filter and a slower confirmation, or it will trade you."),
        ],
        takeaways: [
          "Every oscillator = a normalization choice: range, mean, or time",
          "Fast oscillators belong to ranges; slow ones grade trends",
          "Learn each tool's trap before learning its signals",
        ],
      },
    ],
    quiz: {
      id: "qz-indicators-trend-momentum",
      questions: [
        sc("q1", "Strong uptrend for six weeks. RSI(14) prints 78 and stays above 70 for days. The correct reading:",
          ["Immediate short - overbought", "Strong momentum - use pullbacks for entries", "RSI is broken"], 1,
          "In trends, high RSI confirms strength. Fading it is fighting the regime - the classic misread."),
        mc("q2", "Which indicator is direction-blind and measures trend strength?",
          ["MACD", "ADX", "VWAP"], 1,
          "ADX quantifies trend strength regardless of direction; MACD is directional momentum."),
        tf("q3", "VWAP resets at the start of each trading session.", true,
          "VWAP is a session-anchored measure - it resets daily."),
        mc("q4", "A tool that draws an ATR-scaled line on one side of price and flips sides when price closes beyond it is:",
          ["Parabolic SAR", "SuperTrend", "Aroon"], 1,
          "SuperTrend is the ATR regime line; the SAR is a stop-and-reverse dot trail; Aroon measures time since extremes."),
        sc("q5", "Price trends strongly above a thick Ichimoku cloud. The professional read:",
          ["The cloud will pull price back - short it", "Bullish regime - the cloud floor is the structural reference, timing via Tenkan/Kijun", "Ichimoku gives five signals, take the first"], 1,
          "Regime first, timing second - and only on confluence. Five components are not five independent signals."),
      ],
    },
  },
  {
    id: "crs-indicators-volatility-volume",
    categoryId: "cat-indicators",
    title: "Volatility & Volume Tools",
    description:
      "ATR, Bollinger Bands, volume, OBV and volume profile - plus channel tools (Keltner, Donchian, envelopes) and money-flow measures (MFI, Chaikin, A/D): how much price moves, and where participation sits.",
    level: "INTERMEDIATE",
    objectives: [
      "Use ATR for stops and expectations, not signals",
      "Read Bollinger Band squeezes and walks",
      "Locate participation with volume and profile basics",
    ],
    lessons: [
      {
        id: "lsn-ind-atr-bb",
        title: "ATR & Bollinger Bands",
        summary: "Volatility rulers: average true range for sizing and stops, bands for stretch and squeeze.",
        minutes: 9,
        objectives: [
          "Apply ATR to stop placement and volatility adjustment",
          "Explain BB construction, squeeze and walk",
          "Avoid treating band touches as signals",
        ],
        blocks: [
          text("ATR is the average of each period's true range (accounting for gaps), typically 14 periods. It does not indicate direction - it prices movement. Its best uses are mechanical: stops set as a multiple of ATR (1.5–2×) adapt to the instrument's temperament; profit expectations and session targets scale with it; position sizing can even be normalized by it."),
          formula("ATR-based stop", "Stop distance = k × ATR (k ≈ 1.5–2)", "Adapts risk to the instrument instead of fixed pips."),
          text("Bollinger Bands wrap a 20-SMA with bands at ±2 standard deviations: a statistical envelope where ~95% of closes should land. A squeeze - bands pinching to multi-month lows - marks compressed volatility that often precedes expansion (see the consolidation lesson). A band walk - price riding the band for many periods - is a trend signature, not an overbought signal."),
          warn("Band touches are not reversal signals",
            "In strong trends price hugs a band for session after session. 'It touched the upper band, I'll short' is the oscillator mistake in envelope form. Squeeze and walk are the contexts that carry information; single touches carry noise."),
        ],
        takeaways: [
          "ATR measures movement - use it for stops, targets and sizing",
          "BB squeeze anticipates expansion; band walks mark strong trends",
          "Statistical envelopes describe, they never command",
        ],
      },
      {
        id: "lsn-ind-volume-obv",
        title: "Volume, OBV & Volume Profile",
        summary: "Where participation lives: confirming moves, cumulative flow, and the horizontal map of traded price.",
        minutes: 9,
        objectives: [
          "Use volume to confirm or question moves",
          "Explain OBV's accumulation logic and limits",
          "Read a volume profile's high/low volume nodes",
        ],
        blocks: [
          text("Volume is participation: moves on expanding volume have believers; moves on fading volume are negotiated by fewer and fewer hands. Its simplest, most reliable use is confirmation - breakouts on volume, reversals on climax volume - and questioning: a rally on shrinking participation invites suspicion, not certainty."),
          text("On-Balance Volume (OBV) accumulates volume by sign of the daily close - a running tally meant to reveal accumulation before price. It is a crude instrument (it ignores magnitude) whose divergences are best treated as hypothesis generators. Volume profile is the sharper tool: a horizontal histogram of volume by price level. High-volume nodes (HVN) mark prices the market spent time at - acceptance, often magnets; low-volume nodes (LVN) mark rejection - price tends to travel quickly through them."),
          tip("Profile reading in one line",
            "HVN = 'we agreed on value here'; LVN = 'we refused to trade here'. Breaks through LVNs extend; approaches to HVNs stall - one more contextual layer for targets and stops, never a standalone signal."),
        ],
        takeaways: [
          "Volume confirms or questions; it never predicts alone",
          "OBV divergences are hypotheses, weak ones",
          "Volume profile maps acceptance (HVN) and rejection (LVN) by price",
        ],
      },
      {
        id: "lsn-ind-channels",
        title: "Channel Tools: Keltner, Donchian & Envelopes",
        summary: "Three channel engines - fixed percent, ATR-scaled, pure extremes - and what each says about state.",
        minutes: 8,
        objectives: [
          "Distinguish the three channel engines and their scaling",
          "Use Donchian breakouts as the trend-following baseline",
          "Compare the Bollinger/Keltner squeeze read",
        ],
        blocks: [
          text("Channels answer one question - 'how far is too far?' - with three different engines. MA Envelopes take a moving average and offset it by a FIXED percent: simple, but blind to volatility changes. Keltner Channels scale the offset with ATR: the channel widens exactly when the instrument gets violent, narrows when it sleeps. Donchian Channels ignore averages entirely and plot the N-period HIGHEST high and LOWEST low: the raw envelope of what the market actually did."),
          formula("Donchian channel", "Upper = Highest(High, N) · Lower = Lowest(Low, N)", "The classic 20-period version was the Turtle traders' entire entry engine."),
          text("Donchian mechanics are the purest trend-following expression on a chart: price making a 20-period high IS the definition of an uptrend continuing, so breakouts of the upper channel are entries, not alarms to fade. Keltner, meanwhile, enables the sharper comparison with Bollinger Bands: when the standard-deviation bands (BB) contract INSIDE the ATR bands (Keltner), volatility has compressed below its average state - the squeeze that precedes expansion. The Donchian midline doubles as a dynamic level in trends."),
          warn("Channels are trend tools at the break - and only sometimes fade tools at the edges",
            "In trends, price walks one edge of every channel, and 'fading the edge' is the oscillator mistake in envelope form. Edge-fading belongs exclusively to proven ranges, where the fixed-percent envelope's blindness to volatility actually hurts least. State first, tool second."),
        ],
        takeaways: [
          "Envelopes = fixed percent; Keltner = ATR-scaled; Donchian = raw extremes",
          "Donchian breakouts are the trend definition, not a surprise to fade",
          "BB inside Keltner = volatility compression; expansion often follows",
        ],
      },
      {
        id: "lsn-ind-money-flow",
        title: "Money Flow: MFI, Chaikin & the A/D Line",
        summary: "Volume-weighted momentum and accumulation evidence: flow tools tell you WHO is paying for the move.",
        minutes: 9,
        objectives: [
          "Explain MFI as volume-weighted RSI",
          "Read Chaikin Money Flow and the A/D line as accumulation evidence",
          "Treat flow divergences as hypotheses, never triggers",
        ],
        blocks: [
          text("The Money Flow Index is RSI's volume-weighted sibling: instead of comparing up-closes to down-closes, it compares volume-dollar inflow to outflow (typical price × volume, signed by the day's direction), normalized 0–100 with 80/20 as the conventional rails. A price high with a weak MFI says the last leg was carried on thinner money - a hypothesis, not a sell order. It inherits RSI's regime problem wholesale: strong trends stay 'overbought' in MFI too."),
          formula("Money Flow Index", "MFI = 100 − 100 / (1 + PosFlow / NegFlow)", "Flow = typical price × volume; RSI's logic weighted by participation."),
          text("Chaikin Money Flow (CMF) measures WHERE the close lands inside the day's range, weighted by volume: closes near the high on heavy volume accumulate, closes near the low distribute. Averaged over ~20 periods it reads from +1 to −1 - sustained positive CMF is persistent demand evidence. The Accumulation/Distribution line accumulates the same close-location logic cumulatively, drawing a flow 'trend' under price; the Volume Oscillator watches participation expand or fade between fast and slow volume averages."),
          warn("The A/D line is blind to gaps",
            "Close-location math ignores the overnight jump: an instrument gapping down day after day can print a flat or even rising A/D if intraday closes land near session highs. Like OBV, flow lines are magnitude-blind to gaps - read them as weak evidence, always subordinate to price structure."),
        ],
        takeaways: [
          "MFI = volume-weighted RSI - same regime rules apply",
          "CMF/A-D grade WHERE closes land, volume-weighted: accumulation evidence",
          "Flow divergences generate hypotheses; structure decides",
        ],
      },
      {
        id: "lsn-ind-ma-variants",
        title: "The Moving-Average Family, Extended",
        summary: "WMA, DEMA, HMA, adaptive MAs and VWAP variants - a responsiveness ladder, and how to pick your lag.",
        minutes: 8,
        objectives: [
          "Rank the MA family on the responsiveness-vs-smoothness ladder",
          "Explain adaptive averages (KAMA) and when adaptivity earns its complexity",
          "Use anchored and rolling VWAP variants correctly",
        ],
        blocks: [
          text("Every moving average trades lag against smoothness, and the family is a ladder on that trade-off. The WMA weights recent closes linearly - faster than the SMA. The EMA weights exponentially - faster still. DEMA and TEMA subtract the smoothing error itself, chasing price harder at the cost of overshooting every reversal. The Hull MA (HMA) nests weighted averages to cut lag with less overshoot. Higher rungs react sooner and lie more often; pick the rung whose lag matches your holding period, not your impatience."),
          formula("Hull MA", "HMA(N) = WMA(2 × WMA(N/2) − WMA(N), √N)", "Lag reduction by double smoothing - still overshoots at turns."),
          text("Adaptive averages change speed by regime. Kaufman's KAMA scales its smoothing constant with an efficiency ratio: net directional travel divided by total path. A clean trend (high efficiency) makes KAMA fast; chop (low efficiency) makes it crawl - the average itself does the regime filtering. The GMMA fans a dozen EMAs from fast to slow: the ribbon's compression and expansion visualize the agreement (or disagreement) between short-term and long-term consensus."),
          tip("VWAP has variants - anchor them to questions",
            "Session VWAP answers 'where is today's average participant?'. ANCHORED VWAP resets from an event - earnings, a swing high, a policy shock - and maps value since THAT question began. Rolling VWAP replaces the session reset with an N-period window for instruments without session boundaries. The anchor is a question; choose it deliberately."),
        ],
        takeaways: [
          "MA family = one trade-off ladder: responsiveness vs smoothness",
          "Adaptive MAs (KAMA) build the regime filter into the line",
          "VWAP anchors are questions - session, event, or rolling window",
        ],
      },
    ],
    quiz: {
      id: "qz-indicators-volatility-volume",
      questions: [
        mc("q1", "Bollinger Bands are pinching to the narrowest range in eight months. This context suggests:",
          ["Immediate short", "Compressed volatility that often precedes expansion", "The trend is over"], 1,
          "A squeeze marks compression; expansion often follows - direction comes from the break, not the squeeze."),
        sc("q2", "You risk 1% and normally use a 30-pip stop. ATR says the instrument currently moves 80 pips per hour. Professional adjustment?",
          ["Keep 30 pips - it fits the budget", "Widen the stop relative to ATR and reduce size to keep $ risk constant", "Double the size"], 1,
          "Stops must respect the instrument's current temperament - widen per ATR, shrink size so the dollar risk stays fixed."),
        tf("q3", "A low-volume node in a volume profile usually acts as a price magnet.", false,
          "It is the reverse: HVNs (acceptance) attract, LVNs (rejection) are traversed quickly."),
        mc("q4", "Which channel engine plots the N-period highest high and lowest low?",
          ["Keltner Channels", "Donchian Channels", "MA Envelopes"], 1,
          "Donchian is the raw-extreme engine - the Turtle breakout logic; Keltner scales an EMA offset by ATR, envelopes use a fixed percent."),
        tf("q5", "The Accumulation/Distribution line fully accounts for overnight gaps.", false,
          "A/D is gap-blind - intraday close-location math never sees the jump; a known distortion shared with OBV."),
      ],
    },
  },
];
