import type { AuthoredCourse } from "./types";
import { text, tip, warn, list, formula, structure, mc, tf, sc, num } from "./types";

/**
 * Chart Patterns + Indicators — pattern geometry with measured-move targets,
 * then the indicator toolbox organized by purpose. Structure diagram variants
 * (double-top, head-shoulders, triangles, flags…) are rendered client-side.
 */

export const CHART_PATTERN_COURSES: AuthoredCourse[] = [
  {
    id: "crs-chartpatterns-reversal",
    categoryId: "cat-chart-patterns",
    title: "Reversal Patterns",
    description:
      "Double tops and bottoms, head and shoulders (and its inverse), triples — the geometry of trend exhaustion with measured targets.",
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
          text("A double top is two pushes into the same resistance area separated by a pullback; the pattern completes when price breaks below the pullback low (the neckline). Geometrically it is a range that failed twice to advance — demand exhausted at a price the market has already accepted twice. The double bottom mirrors it after a decline."),
          structure("double-top", "Double top: two highs, one neckline — the break completes the M."),
          structure("double-bottom", "Double bottom: two lows, one neckline — the break completes the W."),
          formula("Measured move", "Target = Neckline ± (Peak − Neckline)", "Project the pattern's height from the break."),
          warn("Until the neckline breaks, it is a range",
            "Most 'double tops' drawn in real time never complete — price breaks out instead. The formation is a hypothesis; the neckline break is the event. Entering on the second top without confirmation is anticipation, not trading."),
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
          text("A head and shoulders top is three peaks: a left shoulder, a higher head, a right shoulder that fails to reach the head — each peak on a weakening ability to attract buyers. The neckline connects the two pullback lows between peaks; its decisive break is the pattern's completion, converting 'topping shape' into 'confirmed reversal'."),
          structure("head-shoulders", "LS — head — RS; the neckline break completes the top."),
          structure("inverse-head-shoulders", "Inverse head & shoulders after a decline — the bottoming mirror."),
          text("Entry conventions: the neckline break itself, or the retest of the neckline from below (better stop location, some entries missed). The measured move projects head-to-neckline distance from the break point. The pattern fails when price reclaims the head — a clean, structural invalidation."),
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
          text("A triple top is a double top that failed once more: three rejections at the same supply before the neckline finally gives. Each additional touch consumes more of the defending orders, so triples often produce sharper post-break moves — the defenders are spent. Confirmation rules are identical; patience requirements are higher."),
          structure("triple-top", "Three rejections, then the neckline breaks."),
          text("Failure modes matter as much as completions: neckline breaks that snap back (false breaks — see the breakout lesson), and formations that resolve into ranges. Your protection is always the same trio: confirmation (close-based breaks), location (patterns at significant levels), invalidation (beyond the pattern extreme — never moved)."),
        ],
        takeaways: [
          "More touches = more consumed defense = sharper resolutions",
          "Close-based neckline breaks filter most false breaks",
          "Every pattern's invalidation is its extreme — in writing, before entry",
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
      "Flags, pennants, triangles, wedges, rectangles and the cup and handle — pauses that reload the trend.",
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
          text("A pennant is the same pole followed by a small symmetrical triangle — converging rather than parallel boundaries. Both are continuation patterns; measured targets typically re-project the pole's height from the breakout point. The failure signal is a flag that deepens into a full retracement — the 'reload' was actually distribution."),
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
          text("An ascending triangle — flat resistance, rising lows — is pressure building against a fixed ceiling: buyers accept progressively worse pullback prices until supply breaks. A descending triangle mirrors it against a fixed floor. A symmetrical triangle is a neutral coil where both sides converge; resolution direction is read from context and the break itself."),
          structure("ascending-triangle", "Flat top, rising lows — pressure against the ceiling."),
          structure("descending-triangle", "Flat bottom, falling highs — pressure against the floor."),
          structure("symmetrical-triangle", "Neutral coil — trade the break, not the prediction."),
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
          text("A rising wedge — both boundaries rising but converging — is an uptrend running out of generosity: each new high is bought with less enthusiasm. It often resolves downward even within a broader uptrend. The falling wedge mirrors it. Wedges are continuation-of-slope patterns that frequently act as reversals of the short-term move — treat their breaks as serious."),
          structure("rising-wedge", "Rising wedge: converging highs — momentum decaying upward."),
          structure("rectangle", "Rectangle: flat supply and demand — the break defines the trade."),
          text("A rectangle is a flat, extended range; its break direction (with participation) sets the continuation trade, target = pattern height. The cup and handle is a rounded base followed by a shallow drift — the handle — whose break above the lip triggers the measured move of the cup's depth. It is a patient accumulation story: one of the few patterns where the shape's narrative (time-based, not spike-based) is part of the edge."),
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
          ["Bearish reversal is certain", "Bull flag — continuation on the upper-boundary break", "Triple top forming"], 1,
          "Pole + tight downward-drifting pause = bull flag; the trigger is the upper boundary break."),
        mc("q2", "Which triangle has a flat resistance and rising support lows?",
          ["Descending", "Ascending", "Symmetrical"], 1,
          "Ascending triangle: fixed ceiling, rising floor — pressure upward."),
        tf("q3", "Breakouts in the final third of a triangle (near the apex) carry the cleanest follow-through.", false,
          "Apex-adjacent breaks decay — momentum has drained from the pattern. Earlier breaks are the cleaner ones."),
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
      "Moving averages, VWAP, MACD, ADX, RSI and stochastics — what each measures, how it is built, and when it lies.",
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
          text("A simple moving average (SMA) is the mean of the last N closes; an exponential moving average (EMA) weights recent closes more, so it turns faster. Neither predicts: they describe consensus. In trends, a 20/50-EMA acts as dynamic support or resistance — pullbacks toward it are the trend-following entry context. In ranges, the same lines flatten and generate whipsaw crosses that mean nothing."),
          formula("SMA(N)", "SMA = mean(Close[1..N])", "EMA weights recent closes exponentially."),
          text("VWAP — volume-weighted average price — is the session's average price weighted by volume: the price the 'average participant' transacted at. Institutions benchmark execution against it; intraday traders use it as the day's gravity line — longs above, shorts below, as one contextual factor among several. It resets each session by definition."),
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
        summary: "Momentum of the trend, and strength of the trend — two different questions with two different tools.",
        minutes: 8,
        objectives: [
          "Explain MACD's components and its histogram",
          "Use ADX to classify trending vs ranging regimes",
          "Combine: ADX filters, MACD times",
        ],
        blocks: [
          text("MACD is the difference between a fast and a slow EMA (typically 12−26), plus a signal line (9-EMA of that difference) and a histogram of the two. Rising MACD above zero says the fast consensus is pulling away — momentum with the trend. Crosses and divergences are its signals, and they inherit the same weakness as all smoothing: late in trends, early in reversals, noisy in ranges."),
          formula("MACD line", "MACD = EMA(12) − EMA(26)", "Signal = EMA(9) of MACD; histogram = MACD − signal."),
          text("ADX does not care about direction — it measures trend STRENGTH. Readings under ~20–25 describe ranging conditions; rising ADX confirms a trend gathering participation; falling ADX in a trend warns of exhaustion. The professional pairing: ADX decides whether trend tools apply at all; MACD (or structure) provides the timing inside that regime."),
        ],
        takeaways: [
          "MACD = trend momentum; ADX = trend strength (direction-blind)",
          "ADX filters regime; MACD times within it",
          "All smoothed indicators lag — they confirm, they don't predict",
        ],
      },
      {
        id: "lsn-ind-rsi-stoch",
        title: "RSI & Stochastic — Context Over Thresholds",
        summary: "Why 'RSI > 70 = sell' is a meme: momentum oscillators need trends, ranges and timeframes to mean anything.",
        minutes: 9,
        objectives: [
          "Explain what RSI and stochastic actually compute",
          "Diagnose why overbought stays overbought in trends",
          "Build a context-first oscillator checklist",
        ],
        blocks: [
          text("RSI compares the magnitude of recent up-closes to down-closes, normalized 0–100. Stochastic compares the close to the recent range, normalized similarly. Both are momentum thermometers: high readings mean recent buying has been strong — which in a genuine trend is not a sell signal at all. 'Overbought' markets stay overbought for weeks; the 70/30 threshold heuristic only behaves in ranges."),
          formula("RSI(14) — conceptually", "RSI = 100 − 100/(1 + AvgGain/AvgLoss)", "Momentum normalized — not a probability."),
          list(
            "In ranges: fade the extremes — 70/30 thresholds carry information",
            "In trends: treat 70/30 as confirmation of strength, use pullbacks for entries",
            "Divergence (price new high, RSI lower high) is a warning — confirm with structure before acting",
          ),
          tip("One sentence per indicator",
            "The exam of this lesson is simple: can you say what each tool measures in one sentence? If the answer is 'it gives buy signals', re-read the lesson — indicators measure, traders decide."),
        ],
        takeaways: [
          "Oscillators measure momentum strength, not reversal timing",
          "Range tactics ≠ trend tactics — state first, thresholds second",
          "Divergences warn; structure confirms",
        ],
      },
    ],
    quiz: {
      id: "qz-indicators-trend-momentum",
      questions: [
        sc("q1", "Strong uptrend for six weeks. RSI(14) prints 78 and stays above 70 for days. The correct reading:",
          ["Immediate short — overbought", "Strong momentum — use pullbacks for entries", "RSI is broken"], 1,
          "In trends, high RSI confirms strength. Fading it is fighting the regime — the classic misread."),
        mc("q2", "Which indicator is direction-blind and measures trend strength?",
          ["MACD", "ADX", "VWAP"], 1,
          "ADX quantifies trend strength regardless of direction; MACD is directional momentum."),
        tf("q3", "VWAP resets at the start of each trading session.", true,
          "VWAP is a session-anchored measure — it resets daily."),
      ],
    },
  },
  {
    id: "crs-indicators-volatility-volume",
    categoryId: "cat-indicators",
    title: "Volatility & Volume Tools",
    description:
      "ATR, Bollinger Bands, volume, OBV and volume profile — measuring how much price moves, and where participation sits.",
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
          text("ATR is the average of each period's true range (accounting for gaps), typically 14 periods. It does not indicate direction — it prices movement. Its best uses are mechanical: stops set as a multiple of ATR (1.5–2×) adapt to the instrument's temperament; profit expectations and session targets scale with it; position sizing can even be normalized by it."),
          formula("ATR-based stop", "Stop distance = k × ATR (k ≈ 1.5–2)", "Adapts risk to the instrument instead of fixed pips."),
          text("Bollinger Bands wrap a 20-SMA with bands at ±2 standard deviations: a statistical envelope where ~95% of closes should land. A squeeze — bands pinching to multi-month lows — marks compressed volatility that often precedes expansion (see the consolidation lesson). A band walk — price riding the band for many periods — is a trend signature, not an overbought signal."),
          warn("Band touches are not reversal signals",
            "In strong trends price hugs a band for session after session. 'It touched the upper band, I'll short' is the oscillator mistake in envelope form. Squeeze and walk are the contexts that carry information; single touches carry noise."),
        ],
        takeaways: [
          "ATR measures movement — use it for stops, targets and sizing",
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
          text("Volume is participation: moves on expanding volume have believers; moves on fading volume are negotiated by fewer and fewer hands. Its simplest, most reliable use is confirmation — breakouts on volume, reversals on climax volume — and questioning: a rally on shrinking participation invites suspicion, not certainty."),
          text("On-Balance Volume (OBV) accumulates volume by sign of the daily close — a running tally meant to reveal accumulation before price. It is a crude instrument (it ignores magnitude) whose divergences are best treated as hypothesis generators. Volume profile is the sharper tool: a horizontal histogram of volume by price level. High-volume nodes (HVN) mark prices the market spent time at — acceptance, often magnets; low-volume nodes (LVN) mark rejection — price tends to travel quickly through them."),
          tip("Profile reading in one line",
            "HVN = 'we agreed on value here'; LVN = 'we refused to trade here'. Breaks through LVNs extend; approaches to HVNs stall — one more contextual layer for targets and stops, never a standalone signal."),
        ],
        takeaways: [
          "Volume confirms or questions; it never predicts alone",
          "OBV divergences are hypotheses, weak ones",
          "Volume profile maps acceptance (HVN) and rejection (LVN) by price",
        ],
      },
    ],
    quiz: {
      id: "qz-indicators-volatility-volume",
      questions: [
        mc("q1", "Bollinger Bands are pinching to the narrowest range in eight months. This context suggests:",
          ["Immediate short", "Compressed volatility that often precedes expansion", "The trend is over"], 1,
          "A squeeze marks compression; expansion often follows — direction comes from the break, not the squeeze."),
        sc("q2", "You risk 1% and normally use a 30-pip stop. ATR says the instrument currently moves 80 pips per hour. Professional adjustment?",
          ["Keep 30 pips — it fits the budget", "Widen the stop relative to ATR and reduce size to keep $ risk constant", "Double the size"], 1,
          "Stops must respect the instrument's current temperament — widen per ATR, shrink size so the dollar risk stays fixed."),
        tf("q3", "A low-volume node in a volume profile usually acts as a price magnet.", false,
          "It is the reverse: HVNs (acceptance) attract, LVNs (rejection) are traversed quickly."),
      ],
    },
  },
];
