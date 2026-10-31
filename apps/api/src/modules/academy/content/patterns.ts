import type { AcademyCandle } from "../../../shared/contracts";

/**
 * Pattern-identification drill exemplars. Each entry: a deterministic candle
 * series rendered by the client, its correct label, distractors and an
 * explanation. The engine serves these as randomized drills - answers are
 * graded server-side and the correct option is never leaked pre-submission.
 *
 * The library covers the complete professional canon: the single-, double-
 * and triple-candle reversal families plus the multi-candle continuation
 * methods. Every entry carries a `family` (how many candles take part) and a
 * `bias` (the directional teaching tag) so the drill can teach taxonomy -
 * patterns are classified by ANATOMY and LOCATION, never by candle color.
 */

export type PatternFamily = "Single candle" | "Double candle" | "Triple candle" | "Multi-candle";
export type PatternBias =
  | "Bullish reversal"
  | "Bearish reversal"
  | "Bullish continuation"
  | "Bearish continuation"
  | "Neutral";

export type PatternExemplar = {
  id: string;
  label: string;
  /** Family grouping - rendered as a chip in the drill UI. */
  family: PatternFamily;
  /** Directional teaching tag - rendered as a chip in the drill UI. */
  bias: PatternBias;
  context: string;
  /** Correct answer + 3 distractors (by pattern id). */
  answer: string;
  distractors: string[];
  explanation: string;
  candles: AcademyCandle[];
};

/** Compact candle helper - prices in abstract units, renderer normalizes. */
const c = (o: number, h: number, l: number, cl: number): AcademyCandle => ({ o, h, l, c: cl });

export const PATTERN_EXEMPLARS: PatternExemplar[] = [
  // ── Single-candle family ────────────────────────────────────────────────
  {
    id: "doji",
    label: "Doji",
    family: "Single candle",
    bias: "Neutral",
    context: "After a five-day rally, at the top of a multi-week range.",
    answer: "doji",
    distractors: ["spinning-top", "marubozu-bull", "hammer"],
    explanation:
      "Open and close meet at the same price: perfect balance. After an extended rally it hints the fuel is burning out - but it becomes tradeable only when the next candles resolve the balance.",
    candles: [c(10, 12.4, 9.6, 12), c(12, 13.2, 11.4, 12.6), c(12.6, 14.8, 12.5, 14.7)],
  },
  {
    id: "dragonfly-doji",
    label: "Dragonfly Doji",
    family: "Single candle",
    bias: "Bullish reversal",
    context: "After a decline, testing a support shelf.",
    answer: "dragonfly-doji",
    distractors: ["gravestone-doji", "hammer", "doji"],
    explanation:
      "Open and close meet at the session HIGH after a deep intraday plunge was fully bought back: sellers had their auction and lost it. After a decline, this is the doji family's most location-sensitive bullish hint - wait for the next candle's resolve.",
    candles: [c(12, 12.2, 11.4, 11.5), c(11.5, 11.6, 10.7, 10.9), c(10.9, 11.0, 9.0, 10.95)],
  },
  {
    id: "gravestone-doji",
    label: "Gravestone Doji",
    family: "Single candle",
    bias: "Bearish reversal",
    context: "After an advance, pressing into resistance.",
    answer: "gravestone-doji",
    distractors: ["dragonfly-doji", "shooting-star", "doji"],
    explanation:
      "Open and close sit at the session LOW after buyers pushed far above and were fully rejected: the whole rally was unwound within one period. At resistance it is the bearish mirror of the dragonfly doji.",
    candles: [c(10, 11.8, 9.9, 11.6), c(11.6, 12.9, 11.5, 12.7), c(12.9, 14.6, 12.85, 12.9)],
  },
  {
    id: "long-legged-doji",
    label: "Long-legged Doji",
    family: "Single candle",
    bias: "Neutral",
    context: "Mid-range, after a long and tired directional move.",
    answer: "long-legged-doji",
    distractors: ["doji", "spinning-top", "gravestone-doji"],
    explanation:
      "Long wicks on both sides with open and close nearly equal: a violent fight ending in balance. More dramatic than a plain doji - the longer the legs, the louder the disagreement - but still only a warning until the market resolves it.",
    candles: [c(12, 12.4, 10.2, 12.1), c(12.1, 13.4, 11.3, 13.2), c(13.2, 14.8, 11.6, 13.3)],
  },
  {
    id: "hammer",
    label: "Hammer",
    family: "Single candle",
    bias: "Bullish reversal",
    context: "At the end of a decline, retesting a daily support zone.",
    answer: "hammer",
    distractors: ["shooting-star", "doji", "hanging-man"],
    explanation:
      "Small body at the top of the candle's range with a long lower wick: sellers pushed hard, buyers took everything back. The name depends on location - after a decline it is a hammer.",
    candles: [c(12, 12.3, 11.5, 11.7), c(11.7, 11.8, 10.9, 11.1), c(11.1, 11.3, 9.4, 11.2)],
  },
  {
    id: "hanging-man",
    label: "Hanging Man",
    family: "Single candle",
    bias: "Bearish reversal",
    context: "After a strong six-week advance, just under weekly resistance.",
    answer: "hanging-man",
    distractors: ["hammer", "inverted-hammer", "marubozu-bear"],
    explanation:
      "Same shape as the hammer - long lower wick, small body - but printed after an ADVANCE: the intraday push below and recovery hints supply is stirring near the top.",
    candles: [c(10, 11.8, 9.9, 11.6), c(11.6, 12.9, 11.5, 12.7), c(12.7, 12.9, 11.2, 12.6)],
  },
  {
    id: "inverted-hammer",
    label: "Inverted Hammer",
    family: "Single candle",
    bias: "Bullish reversal",
    context: "At the end of a decline, first push UP into a broken level.",
    answer: "inverted-hammer",
    distractors: ["shooting-star", "hammer", "doji"],
    explanation:
      "Long upper wick, small body at the bottom of the candle's range - buyers probed upward for the first time after a decline. Confirmation from the next candle is required.",
    candles: [c(12, 12.2, 11.4, 11.5), c(11.5, 11.6, 10.7, 10.9), c(10.9, 12.4, 10.8, 11.1)],
  },
  {
    id: "shooting-star",
    label: "Shooting Star",
    family: "Single candle",
    bias: "Bearish reversal",
    context: "After an extended rally, right at weekly resistance.",
    answer: "shooting-star",
    distractors: ["inverted-hammer", "marubozu-bull", "spinning-top"],
    explanation:
      "Small body at the bottom of the range with a long upper wick after an advance: buyers pushed, sellers violently rejected. One of the most cited topping hints when located at resistance.",
    candles: [c(10.5, 11.9, 10.4, 11.7), c(11.7, 13.1, 11.6, 12.9), c(12.9, 14.9, 12.8, 13.1)],
  },
  {
    id: "spinning-top",
    label: "Spinning Top",
    family: "Single candle",
    bias: "Neutral",
    context: "Mid-range, after two days of overlapping candles.",
    answer: "spinning-top",
    distractors: ["doji", "hammer", "marubozu-bear"],
    explanation:
      "Small body with wicks on both sides: hesitation with movement, not balance as pure as a doji. In mid-range it carries little information - location gives patterns their meaning.",
    candles: [c(11, 12, 10.6, 11.8), c(11.8, 12.9, 11.2, 12.4), c(12.4, 13.4, 11.6, 12.6)],
  },
  {
    id: "marubozu-bull",
    label: "Bullish Marubozu",
    family: "Single candle",
    bias: "Bullish continuation",
    context: "Breaking a range high after a long compression.",
    answer: "marubozu-bull",
    distractors: ["doji", "bullish-engulfing", "three-white-soldiers"],
    explanation:
      "A full body with (almost) no wicks: one-sided control for the entire period. As a breakout candle it shows buyers refusing any discount - real displacement.",
    candles: [c(11.4, 11.5, 10.8, 10.9), c(10.9, 11, 10.4, 10.6), c(10.7, 13.2, 10.6, 13.1)],
  },
  {
    id: "marubozu-bear",
    label: "Bearish Marubozu",
    family: "Single candle",
    bias: "Bearish continuation",
    context: "Rejecting a range top, closing back below the level.",
    answer: "marubozu-bear",
    distractors: ["doji", "bearish-engulfing", "shooting-star"],
    explanation:
      "Full bearish body, no meaningful wicks: sellers controlled every minute of the period and refused any premium - a strong rejection candle at the level.",
    candles: [c(11, 12.5, 10.9, 12.3), c(12.3, 13.7, 12.2, 13.5), c(13.5, 13.6, 11, 11.1)],
  },
  {
    id: "belt-hold-bull",
    label: "Bullish Belt Hold",
    family: "Single candle",
    bias: "Bullish reversal",
    context: "A weak open at support that buyers owned for the rest of the session.",
    answer: "belt-hold-bull",
    distractors: ["marubozu-bull", "bullish-engulfing", "hammer"],
    explanation:
      "Opens ON the session low - no lower wick - then drives up all period in one long bullish body. Also called the yobuse: a one-sided rejection of the open. The meaning concentrates at support after a decline.",
    candles: [c(12.2, 12.4, 11.3, 11.4), c(11.4, 11.6, 10.6, 10.7), c(10.6, 12.3, 10.6, 12.1)],
  },
  {
    id: "belt-hold-bear",
    label: "Bearish Belt Hold",
    family: "Single candle",
    bias: "Bearish reversal",
    context: "A strong open at resistance that sellers owned for the rest of the session.",
    answer: "belt-hold-bear",
    distractors: ["marubozu-bear", "bearish-engulfing", "shooting-star"],
    explanation:
      "Opens ON the session high - no upper wick - then sells off all period in one long bearish body: the bearish mirror of the bullish belt hold.",
    candles: [c(11.2, 12.2, 11.1, 12.1), c(12.1, 13.2, 12.0, 13.1), c(13.1, 13.1, 11.4, 11.6)],
  },

  // ── Double-candle family ────────────────────────────────────────────────
  {
    id: "bullish-engulfing",
    label: "Bullish Engulfing",
    family: "Double candle",
    bias: "Bullish reversal",
    context: "At a support zone after a three-day pullback in an uptrend.",
    answer: "bullish-engulfing",
    distractors: ["piercing-line", "hammer", "three-inside-up"],
    explanation:
      "A bullish body that fully swallows the prior bearish body: the argument flipped within one period. Body engulfs BODY - wicks are secondary.",
    candles: [c(12.8, 12.9, 12.2, 12.3), c(12.3, 12.4, 11.6, 11.8), c(11.6, 13.1, 11.5, 13)],
  },
  {
    id: "bearish-engulfing",
    label: "Bearish Engulfing",
    family: "Double candle",
    bias: "Bearish reversal",
    context: "At resistance after a two-week advance.",
    answer: "bearish-engulfing",
    distractors: ["dark-cloud-cover", "shooting-star", "evening-star"],
    explanation:
      "A bearish body that swallows the prior bullish body at resistance: sellers erased the buyers' entire last argument.",
    candles: [c(11.6, 12.3, 11.5, 12.2), c(12.2, 13, 12.1, 12.9), c(13, 13.1, 11.4, 11.5)],
  },
  {
    id: "tweezer-bottom",
    label: "Tweezer Bottom",
    family: "Double candle",
    bias: "Bullish reversal",
    context: "Two consecutive candles rejecting the same support low.",
    answer: "tweezer-bottom",
    distractors: ["bullish-engulfing", "morning-star", "hammer"],
    explanation:
      "Two candles matching the same low: a double rejection of one price. The pair reads as sellers twice failing to break the level.",
    candles: [c(12.2, 12.4, 11.1, 11.3), c(11.3, 11.9, 11.05, 11.8), c(11.8, 12.1, 11.08, 12)],
  },
  {
    id: "tweezer-top",
    label: "Tweezer Top",
    family: "Double candle",
    bias: "Bearish reversal",
    context: "Two consecutive candles matching the same high at resistance.",
    answer: "tweezer-top",
    distractors: ["tweezer-bottom", "bearish-engulfing", "dark-cloud-cover"],
    explanation:
      "The bearish mirror of the tweezer bottom: two candles topping at one identical price - sellers rejecting the same level twice. The matching highs matter more than either candle's color.",
    candles: [c(11.2, 12.6, 11.1, 12.4), c(12.4, 13.4, 12.3, 13.3), c(13.3, 13.4, 12.1, 12.2)],
  },
  {
    id: "piercing-line",
    label: "Piercing Line",
    family: "Double candle",
    bias: "Bullish reversal",
    context: "After a sharp bearish candle, into a demand zone.",
    answer: "piercing-line",
    distractors: ["bullish-engulfing", "three-inside-up", "doji"],
    explanation:
      "Bullish candle opening below the prior close and closing above the prior body's MIDPOINT - buyers reclaimed real ground, not a rounding error.",
    candles: [c(13, 13.1, 11.5, 11.6), c(11.4, 12.6, 11.3, 12.4)],
  },
  {
    id: "dark-cloud-cover",
    label: "Dark Cloud Cover",
    family: "Double candle",
    bias: "Bearish reversal",
    context: "After a strong advance, at the top of the range.",
    answer: "dark-cloud-cover",
    distractors: ["bearish-engulfing", "shooting-star", "evening-star"],
    explanation:
      "Bearish candle opening above the prior high and closing below the prior body's midpoint - the bearish mirror of the piercing line.",
    candles: [c(11.5, 13.1, 11.4, 13), c(13.2, 13.3, 11.9, 12)],
  },
  {
    id: "bullish-harami",
    label: "Bullish Harami",
    family: "Double candle",
    bias: "Bullish reversal",
    context: "After a long bearish candle, inside a support zone.",
    answer: "bullish-harami",
    distractors: ["bearish-harami", "three-inside-up", "bullish-engulfing"],
    explanation:
      "A small bullish body printed entirely INSIDE the prior bearish body: selling stalled so hard the whole next period stayed within it. Harami means 'pregnant' - the inside candle is the hint, the next close is the confirmation.",
    candles: [c(13, 13.1, 11.6, 11.7), c(11.8, 11.95, 11.6, 12.05)],
  },
  {
    id: "bearish-harami",
    label: "Bearish Harami",
    family: "Double candle",
    bias: "Bearish reversal",
    context: "After a long bullish candle, at resistance.",
    answer: "bearish-harami",
    distractors: ["bullish-harami", "three-inside-down", "bearish-engulfing"],
    explanation:
      "A small bearish body contained inside the prior bullish body: buyers stopped making progress without heavy selling - hesitation at altitude. Confirmed by a close below the pattern's range.",
    candles: [c(11.6, 13, 11.5, 12.9), c(12.6, 12.85, 12.5, 12.2)],
  },
  {
    id: "bullish-kicker",
    label: "Bullish Kicker",
    family: "Double candle",
    bias: "Bullish reversal",
    context: "A bearish candle suddenly gapped up and kept going.",
    answer: "bullish-kicker",
    distractors: ["bullish-engulfing", "morning-star", "marubozu-bull"],
    explanation:
      "The second candle opens above the FIRST candle's open - a true gap over the entire prior body - and never looks back. Kickers are among the strongest two-candle reversal reads; they still demand location and confirmation like everything else.",
    candles: [c(12.8, 12.9, 11.4, 11.5), c(12.85, 14.2, 12.8, 14.1)],
  },
  {
    id: "bearish-kicker",
    label: "Bearish Kicker",
    family: "Double candle",
    bias: "Bearish reversal",
    context: "A bullish candle suddenly gapped down and kept falling.",
    answer: "bearish-kicker",
    distractors: ["bearish-engulfing", "evening-star", "marubozu-bear"],
    explanation:
      "The second candle opens below the FIRST candle's open and sells off without filling the gap - the bearish mirror of the bullish kicker.",
    candles: [c(11.4, 12.9, 11.3, 12.8), c(11.35, 11.45, 10.0, 10.1)],
  },

  // ── Triple-candle family ────────────────────────────────────────────────
  {
    id: "morning-star",
    label: "Morning Star",
    family: "Triple candle",
    bias: "Bullish reversal",
    context: "After a decline, bottoming at a support zone.",
    answer: "morning-star",
    distractors: ["evening-star", "bullish-engulfing", "three-white-soldiers"],
    explanation:
      "Strong bearish candle, small-bodied pause, then a strong bullish candle closing deep into the first body: selling conviction, hesitation, buyer takeover.",
    candles: [c(13, 13.1, 11.6, 11.7), c(11.5, 11.9, 11.2, 11.5), c(11.4, 12.9, 11.3, 12.7)],
  },
  {
    id: "evening-star",
    label: "Evening Star",
    family: "Triple candle",
    bias: "Bearish reversal",
    context: "After an advance, topping at resistance.",
    answer: "evening-star",
    distractors: ["morning-star", "dark-cloud-cover", "three-black-crows"],
    explanation:
      "Strong bullish candle, small-bodied pause, strong bearish candle closing into the first body: buy, hesitate, sell.",
    candles: [c(11.5, 13, 11.4, 12.9), c(12.9, 13.4, 12.7, 13), c(13, 13.1, 11.6, 11.8)],
  },
  {
    id: "morning-doji-star",
    label: "Morning Doji Star",
    family: "Triple candle",
    bias: "Bullish reversal",
    context: "After a decline, at a demand zone.",
    answer: "morning-doji-star",
    distractors: ["morning-star", "evening-doji-star", "three-inside-up"],
    explanation:
      "A morning star whose middle candle is a doji gapped below the first body: hesitation became full indecision. The third candle closing deep into the first body converts the indecision into a reversal read.",
    candles: [c(13, 13.1, 11.6, 11.7), c(11.35, 11.45, 11.2, 11.35), c(11.4, 12.9, 11.3, 12.7)],
  },
  {
    id: "evening-doji-star",
    label: "Evening Doji Star",
    family: "Triple candle",
    bias: "Bearish reversal",
    context: "After an advance, at resistance.",
    answer: "evening-doji-star",
    distractors: ["evening-star", "morning-doji-star", "three-black-crows"],
    explanation:
      "An evening star with a gapped doji middle: the topping process showed complete balance before the breakdown candle confirmed it.",
    candles: [c(11.5, 13, 11.4, 12.9), c(13.1, 13.25, 13.05, 13.1), c(13, 13.1, 11.6, 11.8)],
  },
  {
    id: "abandoned-baby-bull",
    label: "Abandoned Baby (Bullish)",
    family: "Triple candle",
    bias: "Bullish reversal",
    context: "A doji gapped down and left alone below the range, then a gap back up.",
    answer: "abandoned-baby-bull",
    distractors: ["morning-doji-star", "morning-star", "dragonfly-doji"],
    explanation:
      "The rarest star variant: a doji isolated by gaps on BOTH sides - an island of indecision nobody could trade into. Its scarcity is the point; when it prints at support, the reversal read is strong.",
    candles: [c(13, 13.1, 11.6, 11.7), c(11.15, 11.3, 11.0, 11.15), c(11.6, 12.9, 11.55, 12.75)],
  },
  {
    id: "three-white-soldiers",
    label: "Three White Soldiers",
    family: "Triple candle",
    bias: "Bullish reversal",
    context: "Reversing up from a base, breaking the prior swing high.",
    answer: "three-white-soldiers",
    distractors: ["marubozu-bull", "bullish-engulfing", "morning-star"],
    explanation:
      "Three consecutive strong bullish candles with steady closes and small upper wicks - a staircase of control, not overlapping drift.",
    candles: [c(11, 12, 10.9, 11.9), c(11.8, 12.9, 11.7, 12.8), c(12.7, 13.8, 12.6, 13.7)],
  },
  {
    id: "three-black-crows",
    label: "Three Black Crows",
    family: "Triple candle",
    bias: "Bearish reversal",
    context: "Rolling over from a top after a long advance.",
    answer: "three-black-crows",
    distractors: ["marubozu-bear", "bearish-engulfing", "evening-star"],
    explanation:
      "Three consecutive strong bearish candles with steady closes and small lower wicks - sustained seller control.",
    candles: [c(13.5, 13.6, 12.6, 12.7), c(12.8, 12.9, 11.8, 11.9), c(12, 12.1, 11, 11.1)],
  },
  {
    id: "three-inside-up",
    label: "Three Inside Up",
    family: "Triple candle",
    bias: "Bullish reversal",
    context: "At support, after a hammer-like reversal candle.",
    answer: "three-inside-up",
    distractors: ["morning-star", "piercing-line", "bullish-engulfing"],
    explanation:
      "A reversal candle, then a small bullish candle inside its body, then a close above the reversal candle's high - the conservative, confirmation-first variant.",
    candles: [c(12.6, 12.7, 11.2, 11.4), c(11.5, 11.7, 11.4, 11.6), c(11.6, 12.9, 11.5, 12.8)],
  },
  {
    id: "three-inside-down",
    label: "Three Inside Down",
    family: "Triple candle",
    bias: "Bearish reversal",
    context: "At resistance, after a strong bullish candle.",
    answer: "three-inside-down",
    distractors: ["three-inside-up", "bearish-harami", "evening-star"],
    explanation:
      "The bearish mirror of the three inside up: a small bearish body inside the prior bullish body, then a close below the first candle's low - the confirmation-first topping sequence.",
    candles: [c(11.6, 13, 11.5, 12.9), c(12.6, 12.8, 12.5, 12.2), c(12.5, 12.55, 11.2, 11.3)],
  },
  {
    id: "three-outside-up",
    label: "Three Outside Up",
    family: "Triple candle",
    bias: "Bullish reversal",
    context: "At support, after a bearish candle.",
    answer: "three-outside-up",
    distractors: ["bullish-engulfing", "three-inside-up", "morning-star"],
    explanation:
      "A bullish engulfing followed by a close above the engulfing candle's close: the reversal argument, then the proof. Stronger than the engulfing alone because it demanded follow-through.",
    candles: [c(12.3, 12.4, 11.6, 11.8), c(11.7, 13.1, 11.6, 13), c(13, 13.5, 12.9, 13.4)],
  },
  {
    id: "three-outside-down",
    label: "Three Outside Down",
    family: "Triple candle",
    bias: "Bearish reversal",
    context: "At resistance, after a bullish candle.",
    answer: "three-outside-down",
    distractors: ["bearish-engulfing", "three-inside-down", "evening-star"],
    explanation:
      "A bearish engulfing followed by a lower close: sellers took the argument and then proved it. The bearish mirror of the three outside up.",
    candles: [c(11.8, 12.4, 11.7, 12.3), c(12.4, 12.5, 11.5, 11.6), c(11.6, 11.65, 11.1, 11.15)],
  },
  {
    id: "upside-tasuki-gap",
    label: "Upside Tasuki Gap",
    family: "Triple candle",
    bias: "Bullish continuation",
    context: "In an uptrend: a gap up, then a small pullback candle that fails to close the gap.",
    answer: "upside-tasuki-gap",
    distractors: ["three-white-soldiers", "rising-three-methods", "bullish-engulfing"],
    explanation:
      "A bullish candle, a gap-up continuation candle, then a small bearish candle closing WITHOUT filling the gap: sellers probed the gap and were refused - the trend's argument stands.",
    candles: [c(11, 11.9, 10.9, 11.8), c(12.1, 13, 12.05, 12.9), c(12.85, 13.0, 12.3, 12.4)],
  },
  {
    id: "downside-tasuki-gap",
    label: "Downside Tasuki Gap",
    family: "Triple candle",
    bias: "Bearish continuation",
    context: "In a downtrend: a gap down, then a small bounce candle that fails to close the gap.",
    answer: "downside-tasuki-gap",
    distractors: ["three-black-crows", "falling-three-methods", "bearish-engulfing"],
    explanation:
      "A bearish candle, a gap-down continuation candle, then a small bullish candle closing without filling the gap: buyers probed and were refused. The bearish mirror of the upside tasuki gap.",
    candles: [c(13.5, 13.6, 12.6, 12.7), c(12.5, 12.65, 11.6, 11.7), c(11.65, 12.3, 11.6, 12.2)],
  },
  {
    id: "stick-sandwich",
    label: "Stick Sandwich",
    family: "Triple candle",
    bias: "Bullish reversal",
    context: "Two bearish candles closing at the SAME price, around a bullish candle.",
    answer: "stick-sandwich",
    distractors: ["tweezer-bottom", "morning-star", "bullish-harami"],
    explanation:
      "Bearish, bullish, bearish - with the two bearish candles closing at one identical price: the market tested the same close twice around a bounce. The matching closes form the double touch; the read is bullish while the level holds.",
    candles: [c(12.9, 13, 11.9, 12), c(12, 12.9, 11.95, 12.85), c(12.85, 12.9, 11.9, 12)],
  },
  {
    id: "advance-block",
    label: "Advance Block",
    family: "Triple candle",
    bias: "Bearish reversal",
    context: "Three rising candles near the end of an advance - with shrinking bodies.",
    answer: "advance-block",
    distractors: ["three-white-soldiers", "shooting-star", "evening-star"],
    explanation:
      "Three bullish candles that keep making highs while their bodies shrink and upper wicks stretch: each push is bought for less distance. A caution pattern - not a sell signal by itself, but a warning the advance is tiring. Structure confirms.",
    candles: [c(11, 12, 10.9, 11.9), c(11.8, 12.9, 11.7, 12.4), c(12.3, 13.4, 12.2, 12.5)],
  },

  // ── Multi-candle continuation methods ───────────────────────────────────
  {
    id: "rising-three-methods",
    label: "Rising Three Methods",
    family: "Multi-candle",
    bias: "Bullish continuation",
    context: "A strong advance pausing inside itself, then resuming.",
    answer: "rising-three-methods",
    distractors: ["three-white-soldiers", "falling-three-methods", "bullish-engulfing"],
    explanation:
      "A tall bullish candle, three small candles drifting down inside its range, then a tall bullish close above the first candle's high: the trend caught its breath without surrendering. One of the most trusted continuation reads - the pause is measured, not emotional.",
    candles: [c(11, 12, 10.9, 11.9), c(11.9, 12.1, 11.4, 11.6), c(11.7, 11.9, 11.35, 11.5), c(11.55, 11.8, 11.3, 11.45), c(11.5, 12.9, 11.45, 12.8)],
  },
  {
    id: "falling-three-methods",
    label: "Falling Three Methods",
    family: "Multi-candle",
    bias: "Bearish continuation",
    context: "A strong decline pausing inside itself, then resuming.",
    answer: "falling-three-methods",
    distractors: ["three-black-crows", "rising-three-methods", "bearish-engulfing"],
    explanation:
      "The bearish mirror: a tall bearish candle, three small candles drifting up inside its range, then a tall bearish close below the first candle's low - the decline resumed exactly where it left off.",
    candles: [c(13.5, 13.6, 12.6, 12.7), c(12.7, 12.95, 12.5, 12.85), c(12.8, 13, 12.7, 12.95), c(12.9, 13.05, 12.75, 13), c(12.85, 12.9, 11.3, 11.4)],
  },
];
