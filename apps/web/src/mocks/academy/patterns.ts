import type { AcademyCandle } from "@cosmoz/shared";

/**
 * Pattern-identification drill exemplars. Each entry: a deterministic candle
 * series rendered by the client, its correct label, distractors and an
 * explanation. The engine serves these as randomized drills — answers are
 * graded server-side and the correct option is never leaked pre-submission.
 */

export type PatternExemplar = {
  id: string;
  label: string;
  context: string;
  /** Correct answer + 3 distractors (by pattern id). */
  answer: string;
  distractors: string[];
  explanation: string;
  candles: AcademyCandle[];
};

/** Compact candle helper — prices in abstract units, renderer normalizes. */
const c = (o: number, h: number, l: number, cl: number): AcademyCandle => ({ o, h, l, c: cl });

export const PATTERN_EXEMPLARS: PatternExemplar[] = [
  {
    id: "doji",
    label: "Doji",
    context: "After a five-day rally, at the top of a multi-week range.",
    answer: "doji",
    distractors: ["spinning-top", "marubozu-bull", "hammer"],
    explanation:
      "Open and close meet at the same price: perfect balance. After an extended rally it hints the fuel is burning out — but it becomes tradeable only when the next candles resolve the balance.",
    candles: [c(10, 12.4, 9.6, 12), c(12, 13.2, 11.4, 12.6), c(12.6, 14.8, 12.5, 14.7)],
  },
  {
    id: "hammer",
    label: "Hammer",
    context: "At the end of a decline, retesting a daily support zone.",
    answer: "hammer",
    distractors: ["shooting-star", "doji", "hanging-man"],
    explanation:
      "Small body at the top of the candle's range with a long lower wick: sellers pushed hard, buyers took everything back. The name depends on location — after a decline it is a hammer.",
    candles: [c(12, 12.3, 11.5, 11.7), c(11.7, 11.8, 10.9, 11.1), c(11.1, 11.3, 9.4, 11.2)],
  },
  {
    id: "hanging-man",
    label: "Hanging Man",
    context: "After a strong six-week advance, just under weekly resistance.",
    answer: "hanging-man",
    distractors: ["hammer", "inverted-hammer", "marubozu-bear"],
    explanation:
      "Same shape as the hammer — long lower wick, small body — but printed after an ADVANCE: the intraday push below and recovery hints supply is stirring near the top.",
    candles: [c(10, 11.8, 9.9, 11.6), c(11.6, 12.9, 11.5, 12.7), c(12.7, 12.9, 11.2, 12.6)],
  },
  {
    id: "inverted-hammer",
    label: "Inverted Hammer",
    context: "At the end of a decline, first push UP into a broken level.",
    answer: "inverted-hammer",
    distractors: ["shooting-star", "hammer", "doji"],
    explanation:
      "Long upper wick, small body at the bottom of the candle's range — buyers probed upward for the first time after a decline. Confirmation from the next candle is required.",
    candles: [c(12, 12.2, 11.4, 11.5), c(11.5, 11.6, 10.7, 10.9), c(10.9, 12.4, 10.8, 11.1)],
  },
  {
    id: "shooting-star",
    label: "Shooting Star",
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
    context: "Mid-range, after two days of overlapping candles.",
    answer: "spinning-top",
    distractors: ["doji", "hammer", "marubozu-bear"],
    explanation:
      "Small body with wicks on both sides: hesitation with movement, not balance as pure as a doji. In mid-range it carries little information — location gives patterns their meaning.",
    candles: [c(11, 12, 10.6, 11.8), c(11.8, 12.9, 11.2, 12.4), c(12.4, 13.4, 11.6, 12.6)],
  },
  {
    id: "marubozu-bull",
    label: "Bullish Marubozu",
    context: "Breaking a range high after a long compression.",
    answer: "marubozu-bull",
    distractors: ["doji", "bullish-engulfing", "three-white-soldiers"],
    explanation:
      "A full body with (almost) no wicks: one-sided control for the entire period. As a breakout candle it shows buyers refusing any discount — real displacement.",
    candles: [c(11.4, 11.5, 10.8, 10.9), c(10.9, 11, 10.4, 10.6), c(10.7, 13.2, 10.6, 13.1)],
  },
  {
    id: "marubozu-bear",
    label: "Bearish Marubozu",
    context: "Rejecting a range top, closing back below the level.",
    answer: "marubozu-bear",
    distractors: ["doji", "bearish-engulfing", "shooting-star"],
    explanation:
      "Full bearish body, no meaningful wicks: sellers controlled every minute of the period and refused any premium — a strong rejection candle at the level.",
    candles: [c(11, 12.5, 10.9, 12.3), c(12.3, 13.7, 12.2, 13.5), c(13.5, 13.6, 11, 11.1)],
  },
  {
    id: "bullish-engulfing",
    label: "Bullish Engulfing",
    context: "At a support zone after a three-day pullback in an uptrend.",
    answer: "bullish-engulfing",
    distractors: ["piercing-line", "hammer", "three-inside-up"],
    explanation:
      "A bullish body that fully swallows the prior bearish body: the argument flipped within one period. Body engulfs BODY — wicks are secondary.",
    candles: [c(12.8, 12.9, 12.2, 12.3), c(12.3, 12.4, 11.6, 11.8), c(11.6, 13.1, 11.5, 13)],
  },
  {
    id: "bearish-engulfing",
    label: "Bearish Engulfing",
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
    context: "Two consecutive candles rejecting the same support low.",
    answer: "tweezer-bottom",
    distractors: ["bullish-engulfing", "morning-star", "hammer"],
    explanation:
      "Two candles matching the same low: a double rejection of one price. The pair reads as sellers twice failing to break the level.",
    candles: [c(12.2, 12.4, 11.1, 11.3), c(11.3, 11.9, 11.05, 11.8), c(11.8, 12.1, 11.08, 12)],
  },
  {
    id: "piercing-line",
    label: "Piercing Line",
    context: "After a sharp bearish candle, into a demand zone.",
    answer: "piercing-line",
    distractors: ["bullish-engulfing", "three-inside-up", "doji"],
    explanation:
      "Bullish candle opening below the prior close and closing above the prior body's MIDPOINT — buyers reclaimed real ground, not a rounding error.",
    candles: [c(13, 13.1, 11.5, 11.6), c(11.4, 12.6, 11.3, 12.4)],
  },
  {
    id: "dark-cloud-cover",
    label: "Dark Cloud Cover",
    context: "After a strong advance, at the top of the range.",
    answer: "dark-cloud-cover",
    distractors: ["bearish-engulfing", "shooting-star", "evening-star"],
    explanation:
      "Bearish candle opening above the prior high and closing below the prior body's midpoint — the bearish mirror of the piercing line.",
    candles: [c(11.5, 13.1, 11.4, 13), c(13.2, 13.3, 11.9, 12)],
  },
  {
    id: "morning-star",
    label: "Morning Star",
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
    context: "After an advance, topping at resistance.",
    answer: "evening-star",
    distractors: ["morning-star", "dark-cloud-cover", "three-black-crows"],
    explanation:
      "Strong bullish candle, small-bodied pause, strong bearish candle closing into the first body: buy, hesitate, sell.",
    candles: [c(11.5, 13, 11.4, 12.9), c(12.9, 13.4, 12.7, 13), c(13, 13.1, 11.6, 11.8)],
  },
  {
    id: "three-white-soldiers",
    label: "Three White Soldiers",
    context: "Reversing up from a base, breaking the prior swing high.",
    answer: "three-white-soldiers",
    distractors: ["marubozu-bull", "bullish-engulfing", "morning-star"],
    explanation:
      "Three consecutive strong bullish candles with steady closes and small upper wicks — a staircase of control, not overlapping drift.",
    candles: [c(11, 12, 10.9, 11.9), c(11.8, 12.9, 11.7, 12.8), c(12.7, 13.8, 12.6, 13.7)],
  },
  {
    id: "three-black-crows",
    label: "Three Black Crows",
    context: "Rolling over from a top after a long advance.",
    answer: "three-black-crows",
    distractors: ["marubozu-bear", "bearish-engulfing", "evening-star"],
    explanation:
      "Three consecutive strong bearish candles with steady closes and small lower wicks — sustained seller control.",
    candles: [c(13.5, 13.6, 12.6, 12.7), c(12.8, 12.9, 11.8, 11.9), c(12, 12.1, 11, 11.1)],
  },
  {
    id: "three-inside-up",
    label: "Three Inside Up",
    context: "At support, after a hammer-like reversal candle.",
    answer: "three-inside-up",
    distractors: ["morning-star", "piercing-line", "bullish-engulfing"],
    explanation:
      "A reversal candle, then a small bullish candle inside its body, then a close above the reversal candle's high — the conservative, confirmation-first variant.",
    candles: [c(12.6, 12.7, 11.2, 11.4), c(11.5, 11.7, 11.4, 11.6), c(11.6, 12.9, 11.5, 12.8)],
  },
];
