import type { AuthoredCourse } from "./types";
import { text, tip, warn, risk, list, steps, table, example, candles, mc, tf, sc } from "./types";

/**
 * Candlestick Patterns — the most visual track. Every pattern lesson follows
 * the same discipline: definition → formation → context → confirmation →
 * invalidation → mistakes. Variants ("hammer", "morning-star", …) are rendered
 * as SVG candle diagrams by the client's visual registry.
 *
 * Teaching principle (spec §11): NEVER "pattern = signal". Pattern + context +
 * location + structure + confirmation + risk management = potential setup.
 */

export const CANDLE_COURSES: AuthoredCourse[] = [
  {
    id: "crs-candles-single",
    categoryId: "cat-candles",
    title: "Candle Anatomy & Single-Candle Patterns",
    description:
      "How a candle is built, the seven single-candle formations, and the contextual reading that separates signal from decoration.",
    level: "BEGINNER",
    objectives: [
      "Name every part of a candle and what it measures",
      "Recognize the seven classic single-candle patterns",
      "Grade every pattern by location, structure and confirmation",
    ],
    lessons: [
      {
        id: "lsn-candles-anatomy",
        title: "Anatomy of a Candle",
        summary: "Open, high, low, close - how one candle compresses a battle into four numbers.",
        minutes: 8,
        objectives: [
          "Identify body, wicks, and direction",
          "Relate candle parts to market behavior",
          "Read a candle series as a story of control",
        ],
        blocks: [
          text("One candle summarizes a slice of time with four prices. The open is where the period began, the close where it ended, the high and low the extremes visited. The body spans open→close: it shows who won the period. The wicks (shadows) span body→extremes: they show where price traveled but could not hold - rejected territory."),
          candles("anatomy-bull", "Bullish candle: close above open. Long lower wick = sellers rejected."),
          candles("anatomy-bear", "Bearish candle: close below open. Long upper wick = buyers rejected."),
          table(
            ["Part", "Means"],
            [
              ["Large body", "One side dominated the whole period"],
              ["Small body", "Indecision - balance between sides"],
              ["Long lower wick", "Sellers pushed, buyers took it back"],
              ["Long upper wick", "Buyers pushed, sellers took it back"],
              ["No wicks", "One-sided trend candle (marubozu-like)"],
            ],
          ),
          tip("Open the Candle Lab",
            "The Practice tab includes an interactive candle simulator - drag open, high, low and close and watch the candle rebuild. Ten minutes there cements what every pattern lesson assumes."),
        ],
        takeaways: [
          "Body = who won; wicks = where the loser fought back",
          "Bullish/bearish is close vs open, not price level",
          "Every later pattern is just candles combining these meanings",
        ],
      },
      {
        id: "lsn-candles-doji-family",
        title: "Doji, Spinning Top & Marubozu",
        summary: "The indecision extremes and the conviction extremes - reading balance and imbalance in one candle.",
        minutes: 8,
        objectives: [
          "Recognize doji, spinning top and marubozu",
          "State what each suggests about balance",
          "Resist trading them without context",
        ],
        blocks: [
          text("A doji has open ≈ close: perfect balance at the end of the period. A spinning top adds small wicks both sides - hesitation with movement. Both mean “the argument is even”, and their significance comes from where they appear: after a long trend, a doji hints the trend's fuel is burning out; in the middle of a range, it means nothing at all."),
          candles("doji", "Doji: open and close meet - balance."),
          candles("spinning-top", "Spinning top: small body, wicks both sides - hesitation."),
          text("The marubozu is the opposite pole: a candle with no meaningful wicks - open at one extreme, close at the other. It is one-sided control for the entire period. A bullish marubozu after a pullback shows buyers accepting no discount; a bearish marubozu at the top of a range shows sellers refusing any premium."),
          candles("marubozu-bull", "Bullish marubozu: full-body control, no rejection."),
          warn("Indecision candles are not reversal signals",
            "A doji “means” balance - that is all. The tradeable information arrives with the NEXT candles: the resolution candle that breaks the balance in one direction. Trading the doji itself is trading a coin."),
        ],
        takeaways: [
          "Doji/spinning top = balance; marubozu = control",
          "Location gives them meaning; the resolution candle gives them tradeability",
          "Never trade indecision before it resolves",
        ],
      },
      {
        id: "lsn-candles-hammer-family",
        title: "Hammer, Inverted Hammer, Shooting Star & Hanging Man",
        summary: "The wick family: same shapes, opposite meanings, decided entirely by location and trend context.",
        minutes: 10,
        objectives: [
          "Distinguish hammer vs hanging man (same shape, different context)",
          "Distinguish inverted hammer vs shooting star",
          "Grade each with location + confirmation",
        ],
        blocks: [
          text("These four patterns share a construction - small body, one dominant wick - and their names encode location. At the BOTTOM of a decline: a hammer (long lower wick) shows sellers pushed price down and buyers took it all back - potential bottoming. The same shape at the TOP of an advance is a hanging man: the push below and recovery hints supply is stirring - potential topping."),
          candles("hammer", "Hammer - after a decline: the lower wick is the recovery."),
          candles("hanging-man", "Hanging man - after an advance: same shape, different meaning."),
          text("The mirror pair: an inverted hammer (long upper wick) after a decline shows buyers probing upward for the first time; a shooting star after an advance shows buyers pushed and violently rejected - one of the most reliable topping hints when it lands at resistance after an extended run."),
          candles("inverted-hammer", "Inverted hammer - after a decline: buyers' first probe."),
          candles("shooting-star", "Shooting star - after an advance: the probe was rejected."),
          list(
            "Confirmation: the next candle closing in the new direction (spec §11 principle)",
            "Invalidation: beyond the pattern's wick extreme - if price takes the low of a hammer, buyers lost",
            "Common mistake: calling any long-wicked candle a hammer without trend context",
          ),
        ],
        takeaways: [
          "Shape describes the fight; location names the pattern",
          "Hammer/hanging man = lower wick; inverted hammer/shooting star = upper wick",
          "Invalidation lives at the wick extreme; confirmation is the next close",
        ],
      },
      {
        id: "lsn-candles-context",
        title: "Location, Structure & Confirmation",
        summary: "The course's capstone: the full grading checklist that turns a pattern into a potential setup.",
        minutes: 9,
        objectives: [
          "Apply the six-factor context checklist",
          "Explain invalidation for pattern trades",
          "Connect patterns to the journal's decision grades",
        ],
        blocks: [
          text("Spec §11 of this Academy says it plainly: pattern + market context + location + structure + confirmation + risk management = potential trading setup. A pattern is one factor of six. This lesson turns the formula into a checklist you can run on any candle signal in under a minute."),
          steps(
            "Context: what has the market been doing - trending, ranging, after a news spike?",
            "Location: does the candle print AT a level (support, broken resistance, supply zone) or in no-man's land?",
            "Structure: does the candle sit at a swing (an HL forming? a LH?) or randomly?",
            "Confirmation: does the next candle (or micro-shift) agree?",
            "Invalidation: where is the price that proves the read wrong - and can your stop live there cheaply?",
            "Risk: does the distance to invalidation fit your fixed risk budget?",
          ),
          example("Grading a shooting star",
            "Context: three straight bullish days after a two-week rally (extended).",
            "Location: at the top of a multi-week range, just under weekly resistance.",
            "Structure: at the highest high of the move - a potential LH forming.",
            "Confirmation: next candle closes bearish, below the star's body.",
            "Invalidation: above the star's high. Risk: fits the 1% budget.",
            "Verdict: a graded, reviewable setup - not a superstition.",
          ),
        ],
        takeaways: [
          "Six factors, one checklist - pattern is only the first domino",
          "If invalidation is far or risk doesn't fit, the trade doesn't exist",
          "The journal grades your decisions, so make them checkable",
        ],
      },
    ],
    quiz: {
      id: "qz-candles-single",
      questions: [
        sc("q1", "After a five-day rally, a candle prints with a small body at the bottom of its range and a very long upper wick, right at weekly resistance. Name it and its hint:",
          ["Hammer - bullish continuation", "Shooting star - buyers rejected near the top", "Doji - no information"], 1,
          "Long upper wick + small body at the low of the candle's range, after an advance and at resistance = shooting star."),
        tf("q2", "A hanging man and a hammer have the same shape; the trend context gives them opposite names.", true,
          "Shape is identical - lower wick, small body. Location after a decline = hammer; after an advance = hanging man."),
        mc("q3", "The proper invalidation for a long based on a hammer at support is:",
          ["A fixed 10-pip stop under entry", "Below the hammer's lower wick (structural)", "The session low"], 1,
          "If price takes the hammer's low, the buyers who defended it failed - the read is dead. Stops go at invalidation."),
        mc("q4", "Which candle shows one-sided control for the entire period?",
          ["Doji", "Spinning top", "Marubozu"], 2,
          "Marubozu: no meaningful wicks - open at one extreme, close at the other."),
      ],
    },
  },
  {
    id: "crs-candles-multi",
    categoryId: "cat-candles",
    title: "Multi-Candle Patterns",
    description:
      "Engulfing, tweezers, piercing/dark-cloud, stars and soldiers - two- and three-candle formations read with the same context discipline.",
    level: "INTERMEDIATE",
    objectives: [
      "Recognize the six two-candle and six three-candle formations",
      "Grade each by engulfing logic and location",
      "Set confirmation and invalidation per formation",
    ],
    lessons: [
      {
        id: "lsn-candles-two-candle",
        title: "Engulfing, Tweezers & the Piercing Pair",
        summary: "Two-candle conversations: full engulfment, matched extremes and partial retracements.",
        minutes: 10,
        objectives: [
          "Identify bullish/bearish engulfing precisely",
          "Read tweezer tops/bottoms as double-rejection",
          "Distinguish piercing line from dark cloud cover",
        ],
        blocks: [
          text("A bullish engulfing is a bearish candle followed by a larger bullish candle whose body swallows the prior body entirely - the argument flipped within one period. At a support zone after a decline it is one of the most cited reversal hints. The bearish mirror at resistance after an advance is equally cited. Note the definition: body engulfs body; wicks are secondary."),
          candles("bullish-engulfing", "Bullish engulfing at a pullback low: the body swallows the prior body."),
          candles("bearish-engulfing", "Bearish engulfing at resistance: sellers erase the prior body."),
          text("Tweezers are two candles matching extremes - two bottoms at the same low (tweezer bottom) or two tops at the same high (tweezer top). Their message is a double rejection of the same price. The piercing line is a bullish two-candle set: a strong bearish candle, then a bullish candle opening below the prior close and closing above the MIDPOINT of the prior body (not just above it). The dark cloud cover is its bearish mirror after an advance - open above the prior high, close below the prior body's midpoint."),
          candles("tweezer-bottom", "Tweezer bottom: two rejections at the same low."),
          candles("piercing-line", "Piercing line: bullish close back above the prior body's midpoint."),
          warn("Depth matters",
            "A close barely above the prior body is drift, not piercing. Textbook definitions demand the midpoint because halfway means the counterparty reclaimed real ground, not a rounding error."),
        ],
        takeaways: [
          "Engulfing = body swallows body; location completes the meaning",
          "Tweezers = double rejection at a shared extreme",
          "Piercing/dark-cloud = midpoint reclamation, a partial-engulfing signal",
        ],
      },
      {
        id: "lsn-candles-three-candle",
        title: "Stars, Soldiers & Crows",
        summary: "Three-candle narratives: the pause-then-turn of morning/evening stars and the staircases of soldiers and crows.",
        minutes: 9,
        objectives: [
          "Identify morning/evening star structures",
          "Recognize three white soldiers / three black crows",
          "Apply three-inside-up/down as conservative entries",
        ],
        blocks: [
          text("A morning star is a three-candle bottoming story: a strong bearish candle, a small-bodied pause (the star - often gapped or doji-like), then a strong bullish candle closing deep into the first body. It reads as: selling conviction, hesitation, then a buyer takeover. The evening star is its topping mirror after an advance."),
          candles("morning-star", "Morning star: sell, hesitate, buy - the middle candle is the turn."),
          candles("evening-star", "Evening star: buy, hesitate, sell."),
          text("Three white soldiers are three consecutive strong bullish candles with steady closes and small upper wicks - a staircase of control (three black crows mirror it downward). Three inside up/down are conservative variants: an engulfing-like pair followed by confirmation, trading earlier confirmation for a shallower signal."),
          candles("three-white-soldiers", "Three white soldiers: staircase of bodies, minimal wicks."),
          list(
            "Confirmation: the candle after the pattern closing in the signal direction",
            "Invalidation: beyond the pattern's extreme (the star's low, the soldiers' first open)",
            "Common mistake: accepting tiny-bodied 'soldiers' with long wicks - that is overlap, not control",
          ),
        ],
        takeaways: [
          "Stars = pause-then-turn; the middle candle is the story",
          "Soldiers/crows = sustained control; wicks betray it",
          "Three-candle patterns are slower but carry built-in context",
        ],
      },
      {
        id: "lsn-candles-grades",
        title: "Grading Patterns in the Wild",
        summary: "Real charts are messy: partial engulfments, wick collisions and pattern hybrids - how to grade honestly.",
        minutes: 8,
        objectives: [
          "Handle imperfect real-world patterns",
          "Combine pattern reading with structure levels",
          "Log pattern grades in the journal",
        ],
        blocks: [
          text("Textbook patterns are drawings; charts are weather. You will meet 80% engulfments, hammers with small upper wicks, stars whose middle candle leans one way. The professional response is grading, not name-hunting: does the sequence show the underlying transfer of control the pattern represents, at a location where it matters, with confirmation available?"),
          tip("Pattern + level = double context",
            "The strongest practical pairing: a reversal pattern AT a structural level (support, flip zone, supply). The pattern supplies timing; the level supplies reason. Both fail together - which is exactly the kind of honest, reviewable risk the journal is built to measure."),
          risk("Pattern-hunting is the beginner's trap",
            "Scanning charts for shapes and calling them signals produces random trades with confident captions. Every pattern trade in your log should name its location and invalidation - the decision grades will expose caption-trading quickly."),
        ],
        takeaways: [
          "Grade the transfer of control, not the drawing",
          "Pattern timing + structural location = the workable combo",
          "Log location and invalidation with every pattern trade",
        ],
      },
    ],
    quiz: {
      id: "qz-candles-multi",
      questions: [
        mc("q1", "A bullish candle opens below the prior bearish candle's close and closes above its MIDPOINT. This is:",
          ["Bullish engulfing", "Piercing line", "Morning star"], 1,
          "Open below prior close + close above the prior body's midpoint = piercing line. Engulfing requires the body to swallow the prior body entirely."),
        sc("q2", "Strong bearish candle, small doji, strong bullish candle closing into the first body - after a decline at support. Best read?",
          ["Morning star - potential bottoming", "Tweezer top", "Three black crows"], 0,
          "Sell → hesitate → buy at support: the classic morning star bottoming sequence."),
        tf("q3", "Three white soldiers require three consecutive large-bodied bullish candles with small upper wicks.", true,
          "The staircase of full bodies with minimal wicks is what distinguishes soldiers from ordinary overlapping drift."),
      ],
    },
  },
];
