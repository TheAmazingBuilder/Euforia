import type { AuthoredCourse } from "./types";
import { text, tip, info, warn, list, steps, table, example, structure, zones, candles, mc, tf, sc } from "./types";

/**
 * Technical Analysis + Price Action + Market Structure — the chart-reading
 * track. Structure diagrams are data-driven SVG variants rendered client-side.
 */

export const TECHNICAL_COURSES: AuthoredCourse[] = [
  {
    id: "crs-ta-charts",
    categoryId: "cat-technical",
    title: "Charts, Trends & Key Levels",
    description:
      "What technical analysis can and cannot do, how timeframes compose, and how to read trends, ranges, support and resistance.",
    level: "BEGINNER",
    objectives: [
      "State what technical analysis measures — and its limits",
      "Combine timeframes top-down without contradiction",
      "Draw usable support and resistance zones",
    ],
    lessons: [
      {
        id: "lsn-ta-what-is",
        title: "What Technical Analysis Is (and Isn't)",
        summary: "Price, time and human behavior on one chart — a framework for probabilities, not a crystal ball.",
        minutes: 8,
        objectives: [
          "Define technical analysis and its core premise",
          "Distinguish observation from interpretation",
          "Explain why TA works sometimes and fails sometimes",
        ],
        blocks: [
          text("Technical analysis studies price and volume history to gauge the balance between supply and demand. Its premise: price aggregates everything participants know and feel, and human behavior under uncertainty repeats in patterns. It measures where price has been and where interest accumulated — it does not know where price will go."),
          text("Healthy technical reading separates three layers: observation (price made a lower low on expanding volume), terminology (some frameworks call that displacement or a breakdown), and interpretation (sellers are in control until proven otherwise). Confusing the last layer for fact is where most chart-reading mistakes begin."),
          info("Why it sometimes fails",
            "Patterns are probabilistic tendencies, not laws. New information, liquidity events and regime changes invalidate them without warning. That is why every technical idea in this app is paired with a stop: invalidation is part of the idea, not an admission of failure."),
        ],
        takeaways: [
          "TA reads past behavior to estimate probabilities — never certainties",
          "Observation ≠ interpretation; label both honestly",
          "Every setup includes its invalidation from the first minute",
        ],
      },
      {
        id: "lsn-ta-timeframes",
        title: "Timeframes & Top-Down Reading",
        summary: "Why the same chart lies differently on each timeframe, and how to align three of them.",
        minutes: 8,
        objectives: [
          "Explain what each timeframe aggregates",
          "Apply a 3-timeframe top-down routine",
          "Avoid the classic contradiction: long bias, short trigger",
        ],
        blocks: [
          text("A timeframe is a compression of price activity. A weekly candle contains five daily sessions of argument; a 5-minute candle contains one twentieth of an hour of noise. Higher timeframes carry more information and less noise; lower ones carry detail and deception. Reading one timeframe alone is reading one page of a book and calling it the story."),
          steps(
            "Higher frame (daily/4H): direction and major levels — “what is the market doing?”",
            "Middle frame (1H): the structure you trade inside — “where is the interesting zone?”",
            "Execution frame (15m/5m): the trigger — “when exactly do I act, and where am I wrong?”",
          ),
          warn("The contradiction trap",
            "A daily uptrend does not bless every intraday short — and a beautiful 5-minute pattern against a 4H wall of supply is a coin flip with fees. If your three frames disagree, the trade is either skipped or explicitly re-defined as a smaller-timeframe scalp with reduced size."),
        ],
        takeaways: [
          "Top-down: direction → zone → trigger",
          "Conflicting timeframes = skip or downsize, never rationalize",
          "The journal logs your execution timeframe — review which one pays you",
        ],
      },
      {
        id: "lsn-ta-trends-ranges",
        title: "Trends & Ranges",
        summary: "Two market states, two toolkits: higher highs and lows vs contained oscillation around value.",
        minutes: 9,
        objectives: [
          "Define trend and range operationally",
          "Choose the right tactics per state",
          "Recognize transitions early",
        ],
        blocks: [
          text("A trend is a persistent sequence of higher highs and higher lows (uptrend) or lower highs and lower lows (downtrend). A range is a sideways auction between two accepted prices. Most of the time the market is ranging; trends are the exception everyone is waiting for — which is exactly why they pay those who recognize them late but act correctly."),
          structure("uptrend", "Uptrend: HH/HL sequence — the market agrees price is worth more over time."),
          structure("range", "Range: price oscillates between accepted value boundaries."),
          list(
            "In trends: buy pullbacks to support/moving averages, avoid fading momentum",
            "In ranges: fade extremes toward the middle, avoid breakout chasing in dead volume",
            "Transitions: failed continuation (breakout that reverses) is the classic early tell",
          ),
        ],
        takeaways: [
          "Identify state first; tactics second",
          "Range tactics in trends (and vice versa) is a classic account leak",
          "A failed breakout often marks the transition — trade what you see",
        ],
      },
      {
        id: "lsn-ta-support-resistance",
        title: "Support, Resistance, Supply & Demand",
        summary: "Where orders historically rested: drawing zones that are useful, and letting price confirm them.",
        minutes: 10,
        objectives: [
          "Draw zones (not lines) from wicks and bodies",
          "Explain why old levels work and why they break",
          "Trade the retest instead of the first poke",
        ],
        blocks: [
          text("Support is a price area where demand has repeatedly overwhelmed supply; resistance is the reverse. They exist because orders and memories cluster at prices where many acted before. Draw them as zones — a band of wicks and closes — because exact prices never repeat twice; intentions do."),
          zones("support-resistance", "Zones from clustered extremes and closes — width is part of the level."),
          text("The first test of a level is the most likely to react; each additional touch consumes resting orders. When a level finally breaks, it often flips role — old resistance becomes new support — because the orders that defended it are gone and new participants anchor on the same visual line. Supply/demand language (SMC frameworks) describes the same physics with order-flow vocabulary."),
          example("Reading a retest",
            "Price breaks a daily resistance at 1.0910 and closes above on momentum.",
            "Instead of chasing, you mark 1.0905–1.0915 as the flip zone and wait.",
            "Price returns, prints a bullish rejection candle inside the zone, and your trigger fires — same trade, far better stop placement.",
          ),
        ],
        takeaways: [
          "Zones over lines — width is information",
          "First tests react most; retests after breaks are the classic entry",
          "Levels are hypotheses — price must confirm, stops must be set",
        ],
      },
    ],
    quiz: {
      id: "qz-ta-charts",
      questions: [
        mc("q1", "The 4H chart shows a downtrend; the 5-minute chart shows a bullish breakout pattern. What is the professional default?",
          ["Take the breakout with full size", "Skip, or treat as a small scalp with reduced size", "Reverse the daily bias"], 1,
          "Contradicting timeframes halve your odds — skip or explicitly downsize."),
        tf("q2", "The more times a support level is tested, the stronger it becomes.", false,
          "Each test consumes resting orders; later tests are progressively more likely to break. First tests carry the best reaction odds."),
        sc("q3", "Price breaks above resistance and closes strongly. Where is the textbook entry with the best stop location?",
          ["Chase the breakout at market", "Wait for the retest of the flip zone", "Sell the resistance instead"], 1,
          "The retest of broken resistance-as-support gives confirmed context and a tight, structural stop."),
      ],
    },
  },
  {
    id: "crs-ta-breakouts",
    categoryId: "cat-technical",
    title: "Breakouts, Retests & Momentum",
    description:
      "How moves accelerate and die: trendlines and channels, what separates a real break from a false one, and reading momentum honestly.",
    level: "INTERMEDIATE",
    objectives: [
      "Draw trendlines and channels without curve-fitting",
      "Grade breakout quality before entering",
      "Read momentum and volatility shifts from candles",
    ],
    lessons: [
      {
        id: "lsn-ta-trendlines",
        title: "Trendlines & Channels",
        summary: "Two touches sketch, three confirm — slope, angle and the channel's projection of fair value.",
        minutes: 7,
        objectives: [
          "Draw trendlines that survive scrutiny",
          "Use channels for pullback targets",
          "Respect breaks of the line as information",
        ],
        blocks: [
          text("A trendline connects successive higher lows (or lower highs) — two points sketch it, the third touch tests it. Useful lines are obvious: if you must bend the rule to make it fit, it is decoration, not analysis. Channels add a parallel line on the other side of price, projecting the corridor within which pullbacks and extensions resolve."),
          structure("channel", "An ascending channel: pullbacks toward the lower rail are the trend-following opportunity."),
          text("A break of a trendline is not a reversal signal by itself — it is a change of slope or a pause. Treat it as a yellow light: tighten management, re-assess the higher timeframe, and let structure (not the line) decide whether the trend is over."),
        ],
        takeaways: [
          "Three touches minimum before you trust a line",
          "Channels frame pullback targets in trends",
          "Line breaks inform; structure decides",
        ],
      },
      {
        id: "lsn-ta-breakout-quality",
        title: "Breakouts, Retests & False Breaks",
        summary: "Not all breaks are born equal: momentum, location and volume separate the real from the trap.",
        minutes: 9,
        objectives: [
          "Grade a breakout before entry",
          "Explain why false breaks occur",
          "Choose between breakout and breakout-retest execution",
        ],
        blocks: [
          text("A breakout is price leaving a defined area — a range boundary, a channel, a level. Quality checks: does it leave with displacement (large-bodied candles, expanding range), from a meaningful location (a level the whole chart can see), with participation (volume)? Weak versions of all three produce the false break: price pokes out, finds no follow-through, and snaps back into the range, trapping late chasers."),
          structure("breakout-retest", "Break → retest → continuation: the second chance to join the move."),
          table(
            ["Sign", "Real break", "False break"],
            [
              ["Candles", "Large bodies, small wicks", "Long wick beyond the level, close back inside"],
              ["Volume", "Expanding", "Flat or fading"],
              ["Context", "After compression", "At the extreme of an overextended move"],
            ],
          ),
          text("The retest variant trades confirmation for price: you enter when price returns to the broken level and holds, with a stop inside the range. You sacrifice some entries that never retest in exchange for materially better invalidation. Both approaches are legitimate — logging which style pays you is the journal's job."),
        ],
        takeaways: [
          "Displacement + location + participation = quality break",
          "False breaks trap chasers — the wick-back-close tells the story",
          "Breakout vs retest is a trade-off of entry price against invalidation quality",
        ],
      },
    ],
    quiz: {
      id: "qz-ta-breakouts",
      questions: [
        mc("q1", "Price spikes above range resistance on a long upper wick and closes back inside the range. This is best described as:",
          ["A confirmed breakout", "A potential false break / trap", "A guaranteed short"], 1,
          "The wick beyond the level with a close back inside is the classic failed-break signature — the trap, not the confirmation."),
        tf("q2", "A trendline break by itself proves the trend has reversed.", false,
          "It is a warning, not a verdict. Structure — the sequence of highs and lows — decides the trend's fate."),
      ],
    },
  },
];

export const PRICE_ACTION_COURSES: AuthoredCourse[] = [
  {
    id: "crs-pa-behavior",
    categoryId: "cat-price-action",
    title: "Reading Price Behavior",
    description:
      "Impulse and correction, pullbacks and rejections, consolidation and expansion — the raw behavior behind every framework.",
    level: "INTERMEDIATE",
    objectives: [
      "Classify candles into impulse vs correction phases",
      "Judge pullback depth and quality",
      "Read rejection and momentum from wicks and bodies",
    ],
    lessons: [
      {
        id: "lsn-pa-impulse-correction",
        title: "Impulse & Correction",
        summary: "Markets breathe: directional pushes and resting pauses — and the rhythm between them.",
        minutes: 8,
        objectives: [
          "Identify impulse vs corrective price action",
          "Compare correction depth by candles and fib levels",
          "Use the rhythm to anticipate continuation or failure",
        ],
        blocks: [
          text("Price moves in pulses: an impulse is a fast, directional push with large-bodied candles and expanding range; a correction is a slower, overlapping, smaller-bodied drift against it. Impulses show conviction; corrections show negotiation. The proportion between them is the heartbeat of a trend."),
          structure("impulse-correction", "Impulse (large bodies) → correction (overlapping small candles) → impulse."),
          text("Shallow corrections (roughly 23–38% of the prior impulse, or 2–3 candles) suggest urgency — buyers unwilling to let price go. Deep corrections (61%+) ask whether the impulse was real at all. Time matters as much as depth: a correction that takes longer than the impulse itself is losing the argument it pretends to still hold."),
        ],
        takeaways: [
          "Impulse = conviction; correction = negotiation",
          "Depth and duration of pullbacks grade the underlying trend",
          "Overlap and shrinking ranges warn before structure formally breaks",
        ],
      },
      {
        id: "lsn-pa-pullback-rejection",
        title: "Pullbacks, Retracements & Rejection",
        summary: "The trend trader's bread: where pullbacks end, and what rejection looks like when it happens.",
        minutes: 9,
        objectives: [
          "Define a tradeable pullback",
          "Read rejection candles in context",
          "Plan entries that tolerate imperfect timing",
        ],
        blocks: [
          text("A pullback is a corrective move within a trend toward a zone of prior interest — a broken level, a moving average, an origin of the last impulse. Tradeable pullbacks retrace into those zones and show refusal: wicks growing against the pullback direction, bodies closing back in trend direction, momentum drying up."),
          candles("bullish-engulfing", "A rejection candle at a pullback low: sellers pushed it, buyers took the whole candle back."),
          text("Rejection is context, not command. A hammer at the exact retest of broken resistance, after a shallow pullback, inside an obvious uptrend, is information. The same hammer in the middle of nowhere is a shape. Confirmation (the next candle closing in trend direction, or a micro-structure shift) converts “interesting” into “entry”."),
        ],
        takeaways: [
          "Pullbacks end at zones, not at arbitrary percentages",
          "Rejection = wicks + closes + location, never a shape alone",
          "Require confirmation; the market pays for patience in stop quality",
        ],
      },
      {
        id: "lsn-pa-consolidation-expansion",
        title: "Consolidation & Expansion",
        summary: "Compression precedes release: ranges, coils and the expansion that ends them.",
        minutes: 7,
        objectives: [
          "Recognize compression patterns of decreasing range",
          "Trade expansion with, not against, the release",
          "Avoid the fade trap in strong displacement",
        ],
        blocks: [
          text("Consolidation is a battle both sides postpone: ranges tighten, candles overlap, volume sleeps. The longer the compression, the more coiled the release. Expansion is its resolution — range and volume erupt in one direction, often with gap-like displacement candles that leave imbalances behind."),
          structure("consolidation-expansion", "Tightening range → expansion release with displacement."),
          warn("Do not fade displacement",
            "“It moved too much, I'll sell the spike” is the most expensive sentence in price action. Expansion phases reward joining strength on the first pullback and punish fading. Let the first correction after expansion be your entry, not your counterpunch."),
        ],
        takeaways: [
          "Compressions store energy; expansions release it",
          "Trade the release direction on its first pullback",
          "Fading strong displacement is fighting the tape",
        ],
      },
    ],
    quiz: {
      id: "qz-pa-behavior",
      questions: [
        mc("q1", "A correction lasts twice as long as the impulse it corrects, with heavy overlap. What does this suggest?",
          ["Strong continuation is imminent", "The impulse is losing the argument — lower conviction", "Nothing at all"], 1,
          "Time + overlap in corrections signal waning conviction behind the prior impulse."),
        tf("q2", "A hammer pattern is a buy signal wherever it appears.", false,
          "Patterns are contextual. Location, structure and confirmation decide whether a hammer is information or decoration."),
      ],
    },
  },
  {
    id: "crs-pa-smc",
    categoryId: "cat-price-action",
    title: "Liquidity & the SMC Framework",
    description:
      "Liquidity sweeps, order blocks, displacement and fair value gaps — presented as one specific methodology, with its interpretation limits stated plainly.",
    level: "ADVANCED",
    objectives: [
      "Define liquidity and describe sweep mechanics",
      "Use order blocks and displacement as a framework",
      "State clearly which parts are observation vs interpretation",
    ],
    lessons: [
      {
        id: "lsn-pa-liquidity",
        title: "Liquidity & Liquidity Sweeps",
        summary: "Where stops cluster, why price visits them, and how to read the visit as information.",
        minutes: 9,
        objectives: [
          "Locate liquidity pools (equal highs/lows, trendline touches)",
          "Describe the sweep-and-reverse sequence",
          "Separate the observable from the narrative",
        ],
        blocks: [
          text("Liquidity in trading jargon means clusters of orders — most visibly stop losses. Equal lows attract sell-stops below them; equal highs attract buy-stops above. These pools sit just beyond obvious levels, which is why price so often pierces an obvious line by a few ticks before moving the other way: the pierce can activate those stops, providing the counterparty volume a larger player needs."),
          structure("liquidity-sweep", "Equal lows swept → sharp reversal: the sweep supplied volume to the real move."),
          info("Observation vs interpretation — read this twice",
            "Observable: price traded beyond equal lows and reversed within a few candles. Interpretation (SMC/ICT vocabulary): “smart money swept liquidity to fill orders.” The sequence is real and tradeable; the institutional narrative behind it is a story you cannot verify. Trade the sequence, size it like any probabilistic setup, and do not mistake the vocabulary for a law of markets."),
        ],
        takeaways: [
          "Stops cluster beyond obvious points — that is the liquidity pool",
          "Sweep-then-reverse is an observable, tradeable sequence",
          "The framework's narrative is interpretation, not verified mechanism",
        ],
      },
      {
        id: "lsn-pa-order-blocks",
        title: "Order Blocks & Displacement",
        summary: "The last opposing candle before displacement: origin, retest and the rules practitioners use.",
        minutes: 9,
        objectives: [
          "Define an order block within the SMC framework",
          "Grade displacement and its aftermath",
          "Apply the retest entry model with honest invalidation",
        ],
        blocks: [
          text("Within the SMC framework, an order block is the last opposing candle before a strong move — typically the final bearish candle before displacement upward. Practitioners read it as the footprint of the initiative order flow, and expect that when price returns to that candle's range, remaining interest will defend it."),
          candles("displacement-ob", "Bearish candle, then displacement up: the bearish candle becomes the 'order block' zone."),
          text("Displacement is the quality filter: a genuine block comes with large-bodied candles and range expansion, not a drift. The entry model waits for the retest of the block zone with confirmation (rejection candle or micro-shift), stop beyond the zone, target at opposing structure. As with all framework tools: it is a consistency device for describing pullbacks to origins of moves — it does not improve odds by vocabulary alone."),
        ],
        takeaways: [
          "Order block = last opposing candle before displacement (framework term)",
          "Displacement quality decides whether the zone deserves attention",
          "Retest + confirmation + structural stop — same disciplines as any setup",
        ],
      },
      {
        id: "lsn-pa-fvg",
        title: "Fair Value Gaps & Imbalance",
        summary: "The three-candle hole in the book, how price tends to revisit it, and the limits of the concept.",
        minutes: 8,
        objectives: [
          "Identify a fair value gap on any chart",
          "Use gaps as magnets and as entries on retest",
          "State the concept's limitations honestly",
        ],
        blocks: [
          text("A fair value gap (FVG) — imbalance in older vocabulary — is a three-candle pattern where candle 1's high and candle 3's low do not overlap: an efficient one-directional move left a hole in traded range. Practitioners expect price to revisit such gaps, because resting interest allegedly remains unfilled there."),
          candles("fvg", "Candle 1's high sits below candle 3's low — the gap between them is the FVG."),
          text("Two operational uses: as a magnet (price approaching an unfilled gap may be drawn into it — useful for target placement), and as an entry context (a retest of the gap edge with confirmation, in the direction of the original displacement). Limits: gaps fill often but not always; strong trends leave gaps unfilled for days; and “fair value” is a metaphor, not a price discovery mechanism you can audit. Treat it as another lens on the same physics: pullbacks toward prior interest."),
        ],
        takeaways: [
          "FVG = non-overlapping 3-candle gap — a visible inefficiency",
          "Useful as magnet (targets) and retest context (entries)",
          "Metaphor ≠ mechanism; always pair with confirmation and stops",
        ],
      },
    ],
    quiz: {
      id: "qz-pa-smc",
      questions: [
        sc("q1", "Equal lows at 1.0800 across six touches. Price dips to 1.0794 and reverses hard upward within three candles. Framework interpretation?",
          ["Broken support — go short", "A liquidity sweep of resting sell-stops, then reversal", "Random noise — untradeable"], 1,
          "The observable sequence is a sweep of the obvious low with immediate reversal; the SMC framework reads it as liquidity taken. Either way the reversal sequence is the tradeable fact."),
        tf("q2", "An order block works because the framework's vocabulary changes market physics.", false,
          "It 'works' when the underlying sequence — displacement, retest, continuation — occurs with favorable statistics. Vocabulary organizes observation; it does not repeal probability."),
        mc("q3", "A fair value gap is identified when:",
          ["Any three candles overlap", "Candle 1's high and candle 3's low do not overlap", "Two consecutive doji appear"], 1,
          "The FVG is the non-overlap between candle 1's high and candle 3's low around a strong middle candle."),
      ],
    },
  },
];

export const STRUCTURE_COURSES: AuthoredCourse[] = [
  {
    id: "crs-structure-reading",
    categoryId: "cat-structure",
    title: "Market Structure Reading",
    description:
      "Swings, HH/HL/LH/LL, break of structure, change of character and structural invalidation — the skeleton under every chart.",
    level: "INTERMEDIATE",
    objectives: [
      "Mark swings and label HH/HL/LH/LL correctly",
      "Distinguish BOS (continuation) from CHoCH (warning/reversal)",
      "Define your invalidation point in structural terms",
    ],
    lessons: [
      {
        id: "lsn-structure-swings",
        title: "Swings: HH, HL, LH, LL",
        summary: "The four labels that describe every chart — and how to mark them without hindsight bias.",
        minutes: 8,
        objectives: [
          "Define swing highs/lows operationally",
          "Label a chart HH/HL/LH/LL in sequence",
          "Understand why swing definition depends on timeframe",
        ],
        blocks: [
          text("A swing high is a candle high with at least N lower highs on each side (N=1 or 2 are common conventions); a swing low mirrors it. Label them and every chart becomes a sentence: uptrends are sequences of Higher Highs and Higher Lows (HH/HL); downtrends are Lower Highs and Lower Lows (LH/LL); ranges are their oscillation."),
          structure("hhhl", "Uptrend labeled: HH, HL, HH, HL — the trend is the repetition."),
          text("Swing definition is timeframe-relative: a 5-minute swing is noise on the daily. Choose the swing parameter per timeframe and keep it consistent within an analysis — most structure confusion comes from mixing scales mid-argument. The practice zone has a structure drill to train exactly this."),
        ],
        takeaways: [
          "Swings = fractal pivots; N-candle rule keeps them objective",
          "HH/HL/LH/LL sequences are the trend's grammar",
          "Fix your timeframe and convention before labeling",
        ],
      },
      {
        id: "lsn-structure-trend-range",
        title: "Uptrends, Downtrends & Ranges",
        summary: "The three structural states and the transitions between them.",
        minutes: 7,
        objectives: [
          "Classify state from labeled swings",
          "Name the two transitions and their signatures",
          "Adjust tactics per state",
        ],
        blocks: [
          text("Once swings are labeled, state classification is mechanical: HH+HL = uptrend; LH+LL = downtrend; overlapping extremes without progression = range. The interesting moments are transitions: a range resolves into a trend via expansion (a decisive break of the range extreme), and a trend ends via a failure sequence — a first lower low in an uptrend, often preceded by a lower high."),
          structure("trend-range-states", "Range → breakout → uptrend; the range extremes become trend levels."),
          text("Tactics per state are not interchangeable. Trends reward pullback entries and punish fading; ranges reward fading extremes and punish chasing middle-range breakouts that die. The state you declare is a hypothesis — the market confirms or refunds it."),
        ],
        takeaways: [
          "Label → classify → apply state-appropriate tactics",
          "Transitions, not states, create most opportunity and most damage",
          "A first failed continuation is the classic transition tell",
        ],
      },
      {
        id: "lsn-structure-bos",
        title: "Break of Structure (BOS) & Continuation",
        summary: "When the trend renews itself: the break of the prior swing in the trend's direction.",
        minutes: 7,
        objectives: [
          "Define BOS in an uptrend and a downtrend",
          "Distinguish BOS from range breakout",
          "Use BOS for continuation entries with structural stops",
        ],
        blocks: [
          text("In an uptrend, a break of structure is price closing above the last swing high — the market proving the trend still has buyers willing to pay new highs. It is a continuation event: the HH updates and the HL that formed on the way up becomes the reference pullback low."),
          structure("bos-up", "Uptrend BOS: close above the prior swing high — continuation confirmed."),
          text("The continuation model: after BOS, wait for the pullback toward the origin of the break (the HL or the broken level), then enter with a stop below that structural low. BOS is meaningful only with a close — wick-pokes are traps the liquidity lesson already warned you about."),
        ],
        takeaways: [
          "BOS = decisive close beyond the prior swing in trend direction",
          "Trade its pullback, not its breakout candle",
          "Stops live at the structural low that the break invalidated",
        ],
      },
      {
        id: "lsn-structure-choch",
        title: "CHoCH, MSS & Structural Invalidation",
        summary: "The first crack: change of character, market structure shift, and where your thesis formally dies.",
        minutes: 9,
        objectives: [
          "Define CHoCH and its relationship to BOS",
          "Explain MSS as confirmation of reversal",
          "Set invalidation levels that end arguments",
        ],
        blocks: [
          text("A change of character (CHoCH) is the first break of structure against the prevailing trend — in an uptrend, a decisive close below the last higher low. It is a warning, not a reversal confirmation: trends survive first cracks regularly. The market structure shift (MSS) is the confirmation stage: after CHoCH, price pulls back, fails to make a new high, and breaks the swing low formed on the pullback — a lower high followed by a lower low, the downtrend's opening sentence."),
          structure("choch", "Uptrend → close below the last HL (CHoCH) → LH → LL: character changed."),
          text("Structural invalidation is the gift of this discipline: every thesis has a price. Long uptrend thesis is invalid below the swing low that the market just failed to defend — not “if it feels weak”. Write the invalidation with the entry; if it moves further away with each argument, the argument is the position."),
          tip("Journal connection",
            "The review flow asks “what was your invalidation and did you honor it?” — structure reading gives you a precise, chart-anchored answer instead of a feeling."),
        ],
        takeaways: [
          "CHoCH = first counter-trend structural break — a warning",
          "MSS = CHoCH + failed retest + break: the reversal's confirmation",
          "Invalidation is a price, decided before entry, honored after",
        ],
      },
    ],
    quiz: {
      id: "qz-structure-reading",
      questions: [
        mc("q1", "In a downtrend, price makes a lower high then closes below the prior swing low. Sequence?",
          ["BOS — continuation", "CHoCH then continuation of the downtrend", "Range forming"], 0,
          "In a downtrend, a close below the prior swing low IS the continuation break — a BOS. CHoCH is the first break AGAINST the trend."),
        sc("q2", "Uptrend prints HH/HL repeatedly. Price then closes decisively below the last HL. What is this event called?",
          ["BOS", "CHoCH", "Consolidation"], 1,
          "First structural break against the uptrend = change of character. It warns; MSS would confirm."),
        tf("q3", "A wick below a swing low, with the close back above, is a valid BOS.", false,
          "BOS requires a decisive close. Wicks through levels are the sweep/trap patterns covered in the liquidity lesson."),
        mc("q4", "Where does the continuation model place the stop after an uptrend BOS?",
          ["Fixed 20 pips below entry", "Below the structural pullback low that preceded the break", "Above the swing high"], 1,
          "Structure defines risk: if price takes the HL that launched the break, the continuation thesis is dead."),
      ],
    },
  },
];
