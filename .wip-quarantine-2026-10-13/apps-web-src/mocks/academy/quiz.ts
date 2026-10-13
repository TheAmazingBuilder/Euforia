import type {
  AcademyQuizQuestion,
  AcademyQuizQuestionResult,
} from "@cosmoz/shared";

/**
 * Academy quizzes — questions stored WITH answers here (server side), served
 * WITHOUT them, graded server-side per attempt. Every option gets a verdict:
 * why it is right, or why the chosen wrong option is wrong.
 */

type QuizQuestionSeed = AcademyQuizQuestion & {
  answerIndex: number;
  explanation: string;
  wrong: Record<number, string>;
};

type QuizSeed = {
  id: string;
  courseId: string;
  title: string;
  questions: QuizQuestionSeed[];
};

export const ACADEMY_QUIZZES: QuizSeed[] = [
  {
    id: "quiz-foundations",
    courseId: "course-foundations",
    title: "Trading Foundations — check",
    questions: [
      {
        id: "qf1",
        kind: "mcq",
        prompt:
          "A market order and a limit order differ mainly in what they guarantee. Which pairing is correct?",
        options: [
          "Market: guaranteed price; limit: guaranteed fill",
          "Market: guaranteed fill now; limit: guaranteed price, fill not certain",
          "Both guarantee price and fill",
          "Neither can be filled outside regular hours",
        ],
        answerIndex: 1,
        explanation:
          "A market order fills now at the best available price; a limit order locks the price but may never fill. Certainty of one axis always costs certainty of the other.",
        wrong: {
          0: "Swapped — market orders guarantee the fill, not the price.",
          2: "Nothing in trading guarantees both; that is the whole trade-off.",
          3: "Session rules vary by venue and are not the defining difference.",
        },
      },
      {
        id: "qf2",
        kind: "true-false",
        prompt:
          "High leverage is dangerous mainly because it multiplies the market's moves against your account, regardless of your position size.",
        options: ["True", "False"],
        answerIndex: 1,
        explanation:
          "False — as stated it blames leverage itself. Risk comes from position size relative to capital; leverage only enables larger sizes. Same notional at 1:10 or 1:100 carries identical risk.",
        wrong: {
          0: "This is the popular myth. Same notional at lower leverage = same risk. Size is the lever that matters.",
        },
      },
      {
        id: "qf3",
        kind: "mcq",
        prompt:
          "Spread is 1 pip on an instrument where your strategy targets 15 pips per trade. Ignoring costs overstates the strategy's edge by roughly…",
        options: ["1%", "≈13% of gross target", "50%", "Nothing — spread is the broker's problem"],
        answerIndex: 1,
        explanation:
          "You cross the spread on entry AND exit; on a 15-pip target a ~2-pip round-trip cost is roughly 13% of gross edge. Costs are paid per round trip, before variance.",
        wrong: {
          0: "It is larger than 1% — remember you pay on both sides of the round trip.",
          2: "50% would only hold for a ~4-pip target strategy.",
          3: "Costs are paid by the trader on every fill; the broker collects them.",
        },
      },
      {
        id: "qf4",
        kind: "scenario",
        prompt:
          "You took ten trades this month with no written plan, mixed setups and one lucky +4R win. The journal shows the win funded six small losses. What did you actually learn?",
        options: [
          "The strategy works; scale up",
          "Nothing statistically — one win over an uncontrolled sample is anecdote",
          "You are a natural; keep improvising",
          "Win rate is high enough to quit the day job",
        ],
        answerIndex: 1,
        explanation:
          "An uncontrolled sample with mixed setups has no measurable expectancy. The honest read: anecdote, not evidence — freeze rules and collect a real sample first.",
        wrong: {
          0: "One win tells you nothing about a distribution.",
          2: "Improvisation is exactly what the sample cannot measure.",
          3: "Ten trades is a rumor, not a career decision.",
        },
      },
    ],
  },
  {
    id: "quiz-risk",
    courseId: "course-risk",
    title: "Risk Management Essentials — check",
    questions: [
      {
        id: "qr1",
        kind: "mcq",
        prompt:
          "Account $10,000, risk 1%, stop 50 pips, pip value $10 per standard lot. What position size keeps the loss at the stop equal to the budget?",
        options: ["1.00 lot", "0.50 lots", "0.20 lots", "0.10 lots"],
        answerIndex: 2,
        explanation:
          "$100 ÷ (50 pips × $10/pip) = 0.20 lots. The stop distance and pip value divide the budget — never the other way around.",
        wrong: {
          0: "1.00 lot would risk $500 — five times the budget.",
          1: "0.50 lots risks $250 — that is a 2.5% risk, not 1%.",
          3: "0.10 lots risks $50 — half the budget; the setup would be under-traded, not over-traded.",
        },
      },
      {
        id: "qr2",
        kind: "mcq",
        prompt:
          "Same $100 budget. The setup's structure only justifies a 100-pip stop instead of 50. What happens to the position size?",
        options: [
          "Doubles to 0.40 lots",
          "Halves to 0.10 lots",
          "Stays 0.20 lots with a wider mental stop",
          "Doubles the risk budget to compensate",
        ],
        answerIndex: 1,
        explanation:
          "Size = budget ÷ distance. Doubling the distance halves the size — risk stays $100. Widening risk to keep size is how accounts die politely.",
        wrong: {
          0: "Doubling size would double the dollar risk to $200.",
          2: "A 'mental stop' is not a stop; the real loss will be the real stop.",
          3: "The budget is policy. The structure sets the distance; size flexes.",
        },
      },
      {
        id: "qr3",
        kind: "mcq",
        prompt: "A strategy takes 1:2 reward-to-risk trades. Its break-even win rate is approximately…",
        options: ["50%", "45%", "≈33%", "25%"],
        answerIndex: 2,
        explanation:
          "At 1:2 you need wins ÷ (wins + losses) ≈ 33% to break even: two losers at −1R are paid by one winner at +2R.",
        wrong: {
          0: "50% is the break-even of a 1:1 system.",
          1: "45% would be comfortably profitable at 1:2.",
          3: "25% is the break-even of a 1:3 system.",
        },
      },
      {
        id: "qr4",
        kind: "scenario",
        prompt:
          "You are down 25% from the equity peak. To return to the previous high, the account needs to gain…",
        options: ["+25%", "≈+33%", "+50%", "+100%"],
        answerIndex: 1,
        explanation:
          "From 75 back to 100 requires +33.3%. Recovery is convex — each deeper drawdown demands disproportionately more gain, which is why preservation dominates.",
        wrong: {
          0: "Gaining 25% from 75 only reaches ~94 — still underwater.",
          2: "+50% from 75 reaches 112 — that overshoots; the exact figure is +33.3%.",
          3: "+100% is the recovery cost of a −50% drawdown, not −25%.",
        },
      },
    ],
  },
  {
    id: "quiz-technical",
    courseId: "course-technical",
    title: "Reading the Chart — check",
    questions: [
      {
        id: "qt1",
        kind: "mcq",
        prompt: "What most increases the reliability of a support/resistance level?",
        options: [
          "Many tiny touches inside one session",
          "Clear reactions (strong departures) at multiple separate times",
          "Being exactly at a round number",
          "Drawing it through the middle of the candle bodies",
        ],
        answerIndex: 1,
        explanation:
          "Levels earn relevance through reaction — visible rejection and departure. Quality of response beats quantity of touches.",
        wrong: {
          0: "Many tiny touches in a tight session often mean churn, not structure.",
          2: "Round numbers add confluence but never substitute for reaction.",
          3: "Levels belong at the reaction edge (wicks/extremes), not mid-body.",
        },
      },
      {
        id: "qt2",
        kind: "true-false",
        prompt: "A wick that pokes through resistance and closes back inside is usually a failed breakout — and often a liquidity sweep.",
        options: ["True", "False"],
        answerIndex: 0,
        explanation:
          "True — closes decide breaks. A poke-and-close-back is exactly the signature of trapped breakout buyers (swept liquidity) and is a classic fade context.",
        wrong: {
          1: "Closes decide. Wicks alone are raids on resting orders, not breaks.",
        },
      },
      {
        id: "qt3",
        kind: "mcq",
        prompt: "You are bullish on the daily, bearish on the 15-minute. Per the timeframe-stack rule, what wins?",
        options: [
          "The 15-minute — you execute there",
          "The daily — bias resolves upward in the stack",
          "Whichever changed most recently",
          "Split the difference with half size",
        ],
        answerIndex: 1,
        explanation:
          "Conflicts resolve upward: the higher timeframe owns bias, the lower owns triggers. Otherwise every mood overrides every plan.",
        wrong: {
          0: "Execution timeframe never owns the bias — that is the stack's whole point.",
          2: "Recency is not a hierarchy.",
          3: "Half-size on an unclarified read is still an unclarified read.",
        },
      },
      {
        id: "qt4",
        kind: "scenario",
        prompt:
          "Price compresses inside a symmetrical triangle on a quiet tape. What is the professional read?",
        options: [
          "Triangles resolve upward two times out of three — buy",
          "No built-in bias: wait for a decisive close beyond a boundary",
          "Short — compression after a rally is distribution",
          "Trade the middle of the triangle both ways",
        ],
        answerIndex: 1,
        explanation:
          "Symmetrical triangles carry no directional bias. Compression → expansion is the physics; the close beyond the boundary is the evidence.",
        wrong: {
          0: "That statistic is folklore; the break direction is the data.",
          2: "Distribution is one possibility among two — prediction without evidence.",
          3: "Mid-range is the no-man's land where both edges eat.",
        },
      },
    ],
  },
  {
    id: "quiz-candles",
    courseId: "course-candles",
    title: "Candlestick Mastery — check",
    questions: [
      {
        id: "qc1",
        kind: "mcq",
        prompt: "A candle has a small body at the TOP of its range and a very long LOWER wick. What happened?",
        options: [
          "Sellers controlled the whole period",
          "Buyers drove price down, sellers reclaimed it",
          "Sellers drove price down, buyers pushed it back up before the close",
          "Nothing — the candle is a doji",
        ],
        answerIndex: 2,
        explanation:
          "Long lower wick + body at top = deep intraperiod lows rejected by buyers. Location (support after a decline?) is what turns it into a hammer read.",
        wrong: {
          0: "Sellers controlling the period would print a full bearish body.",
          1: "That describes a long UPPER wick — the opposite shape.",
          3: "A doji has open ≈ close; this candle's body sits at the top with a real lower wick.",
        },
      },
      {
        id: "qc2",
        kind: "mcq",
        prompt: "The same small-body-long-upper-wick candle can be called 'shooting star' or 'inverted hammer'. What decides the name?",
        options: [
          "The wick's exact length ratio",
          "Where it appears — after an advance or after a decline",
          "The candle's color",
          "The timeframe it printed on",
        ],
        answerIndex: 1,
        explanation:
          "Location classifies: after an advance at resistance → shooting star; after a decline → inverted hammer. Shape is constant; context writes the name.",
        wrong: {
          0: "Both definitions share the ≥2× body wick ratio — not the discriminator.",
          2: "Color is secondary in these patterns; body position and location rule.",
          3: "The pattern concept exists on every timeframe; the name follows location.",
        },
      },
      {
        id: "qc3",
        kind: "true-false",
        prompt: "'Hammer = buy' is an acceptable shorthand once you have memorized the pattern library.",
        options: ["True", "False"],
        answerIndex: 1,
        explanation:
          "False — it is a category error. Pattern + context + location + structure + confirmation + risk = potential setup. Any term missing, the equation fails.",
        wrong: {
          0: "The shorthand skips everything that makes the pattern meaningful: where, what before, and what confirms it.",
        },
      },
      {
        id: "qc4",
        kind: "scenario",
        prompt:
          "A textbook bullish engulfing prints mid-range on the 1-minute, no level in sight. What is the disciplined action?",
        options: [
          "Buy — engulfings are 70% reliable",
          "Buy with half size because context is unclear",
          "No trade — pattern without location and structure is not a setup",
          "Buy and hide the stop under the engulfing body",
        ],
        answerIndex: 2,
        explanation:
          "The context rule is absolute: no level, no structure, no trade. The pattern is one term of the equation, not the equation.",
        wrong: {
          0: "Reliability claims without location are marketing, not statistics.",
          1: "Half size on a coin toss is still a coin toss.",
          3: "Hiding a stop inside the pattern being traded is the classic way to lose more than 1R.",
        },
      },
    ],
  },
  {
    id: "quiz-indicators",
    courseId: "course-indicators",
    title: "Indicators With Judgment — check",
    questions: [
      {
        id: "qi1",
        kind: "mcq",
        prompt: "In a strong uptrend, RSI pins above 70 for many sessions. The professional reading is…",
        options: [
          "Overbought — short into strength",
          "Strength — trend regimes make 70 a floor/zone, not a sell signal",
          "RSI is broken — recalibrate",
          "Buy immediately, RSI confirms the top is far",
        ],
        answerIndex: 1,
        explanation:
          "In trends, oscillators stay pinned. 70/30 exhaustion readings belong to ranges; in trends, the 40-50 zone behavior and divergence carry the signal.",
        wrong: {
          0: "Shorting pinned oscillators in trends is the classic way to fight the tape.",
          2: "The indicator behaves exactly as designed; the regime misread is the problem.",
          3: "Strength is information about regime — not an unconditional entry trigger.",
        },
      },
      {
        id: "qi2",
        kind: "mcq",
        prompt: "Your stop is 10 pips. The instrument's 1-hour ATR is 30 pips. What does the ATR lesson conclude?",
        options: [
          "Tight stops are always better discipline",
          "The stop is smaller than normal noise — scale it to ATR or skip the trade",
          "ATR is irrelevant to stop placement",
          "Double the position to compensate for the tight stop",
        ],
        answerIndex: 1,
        explanation:
          "Stops must live outside normal noise. A 10-pip stop under 30-pip hourly ATR is a donation; scale the stop (and the size) or pass.",
        wrong: {
          0: "'Tight' without reference to volatility is just 'random'.",
          2: "ATR is the market's own ruler — the primary input for stop calibration.",
          3: "Doubling size doubles the donation.",
        },
      },
      {
        id: "qi3",
        kind: "true-false",
        prompt: "Running RSI, stochastic and MACD together gives three independent confirmations.",
        options: ["True", "False"],
        answerIndex: 1,
        explanation:
          "False — all three derive from the same closes; they agree mostly because the math agrees with itself. Independent evidence means different input classes (structure, volume, volatility).",
        wrong: {
          0: "Same input, same opinion. Agreement here is correlation, not confirmation.",
        },
      },
      {
        id: "qi4",
        kind: "scenario",
        prompt: "A breakout triggers with volume noticeably BELOW the 20-day average. The honest read:",
        options: [
          "Volume is irrelevant on breakouts",
          "Low participation weakens the witness case — demand closer confirmation or skip",
          "Low volume guarantees a false breakout — fade it",
          "Double size since fewer traders are in",
        ],
        answerIndex: 1,
        explanation:
          "Volume is the witness test: breakouts on thin participation fail more often and offer worse follow-through. Weaken conviction, demand more confirmation — do not invent a counter-signal.",
        wrong: {
          0: "Participation is the only independent witness breakouts have.",
          2: "Low volume weakens; it does not invert the signal into a fade.",
          3: "Fewer witnesses is a reason for less size, not more.",
        },
      },
    ],
  },
  {
    id: "quiz-strategies",
    courseId: "course-strategies",
    title: "Strategy Blueprints — check",
    questions: [
      {
        id: "qs1",
        kind: "mcq",
        prompt: "Which field is MANDATORY in the blueprint template before any entry is allowed?",
        options: [
          "A Profit Factor estimate from a paid course",
          "Invalidation — the exact event that cancels the idea",
          "A social-media sentiment score",
          "The broker's maximum leverage",
        ],
        answerIndex: 1,
        explanation:
          "Invalidation is the line where the thesis is wrong — the stop's anchor and the plan's signature. No invalidation, no trade.",
        wrong: {
          0: "Borrowed statistics are not a plan field.",
          2: "Sentiment scores are not part of the template's discipline.",
          3: "Leverage offers are capabilities, never plan fields.",
        },
      },
      {
        id: "qs2",
        kind: "mcq",
        prompt: "In the breakout+retest blueprint, what qualifies the RETEST for entry?",
        options: [
          "Any touch of the old level",
          "A rejection/confirmation candle at the zone holding in the break's direction",
          "Three sessions of sideways drift",
          "A gap open beyond the level",
        ],
        answerIndex: 1,
        explanation:
          "The retest must show the broken zone ACCEPTING its new role: a rejection wick or engulfing close in the break's direction. Touches alone are noise.",
        wrong: {
          0: "Every level gets touched constantly; touches carry no information.",
          2: "Drift is waiting, not confirmation — the move can die during it.",
          3: "A gap is an entry-style variant, not the retest confirmation.",
        },
      },
      {
        id: "qs3",
        kind: "scenario",
        prompt:
          "You fade a range's upper boundary for the third time. Each prior rejection was smaller and price approaches faster now. What is the disciplined read?",
        options: [
          "The range is stronger each time — add size",
          "Shrinking rejections + accelerating approach = rising breakout risk — stand down or flip the lens",
          "Fades never fail — remove the stop",
          "Switch to scalping the middle",
        ],
        answerIndex: 1,
        explanation:
          "Diminishing rejection force is the range's death rattle — the textbook prelude to a genuine break. The fade's edge was the reaction; the reaction is leaving.",
        wrong: {
          0: "Weaker rejections argue the opposite: supply is thinning.",
          2: "Removing stops is the one universal rule of ruin.",
          3: "Mid-range is where both edges feed — the worst seat in the house.",
        },
      },
      {
        id: "qs4",
        kind: "true-false",
        prompt: "A blueprint guarantees the strategy is profitable if executed exactly.",
        options: ["True", "False"],
        answerIndex: 1,
        explanation:
          "False — the blueprint defines conditions, invalidation and risk. Whether YOUR execution carries edge is an empirical question the journal answers in R.",
        wrong: {
          0: "No honest template can promise outcomes; it can only discipline decisions.",
        },
      },
    ],
  },
  {
    id: "quiz-psychology",
    courseId: "course-psychology",
    title: "The Trader's Mind — check",
    questions: [
      {
        id: "qy1",
        kind: "mcq",
        prompt: "Right after a full stop-out, your most dangerous next action is…",
        options: [
          "Writing the journal entry",
          "Re-entering immediately with double size to win it back",
          "Reviewing the setup against the playbook",
          "Closing the platform for a walk",
        ],
        answerIndex: 1,
        explanation:
          "Immediate re-entry at doubled size is revenge — the sequence where decision quality collapses while urgency peaks. Pause, journal, then decide from the plan.",
        wrong: {
          0: "Journaling immediately is exactly right — it interrupts the loop.",
          2: "Reviewing against the playbook is the professional move.",
          3: "Walking away flat is the classic tilt-protocol action.",
        },
      },
      {
        id: "qy2",
        kind: "mcq",
        prompt: "You won three trades in a row and feel invincible. The statistical risk is…",
        options: [
          "None — streaks prove the edge",
          "Overconfidence sizing-up exactly when the sample says stay flat",
          "The market is about to close",
          "Win streaks reset your expectancy to zero",
        ],
        answerIndex: 1,
        explanation:
          "Three wins are noise at most sample sizes. The danger is the mood: size drift, skipped checklists, more trades — the classic pre-drawdown posture.",
        wrong: {
          0: "Short streaks carry almost no information about edge.",
          2: "Market hours are irrelevant to the psychological mechanism.",
          3: "Streaks don't change expectancy — your behavior around them does.",
        },
      },
      {
        id: "qy3",
        kind: "true-false",
        prompt: "A +2R trade taken with no setup, oversized, is a good trade because it made money.",
        options: ["True", "False"],
        answerIndex: 1,
        explanation:
          "False — process grades separate from P&L. A paid impulse trade is a bad trade that got lucky; over samples, process grade predicts, luck does not.",
        wrong: {
          0: "Outcome worship is how one lucky trade funds a hundred bad habits.",
        },
      },
      {
        id: "qy4",
        kind: "scenario",
        prompt:
          "The journal shows: risk/size drifting up 30% above plan, mood tags hitting 'frustrated' twice before noon, trade count doubled. What fires?",
        options: [
          "Nothing — those are normal Tuesday metrics",
          "The tilt protocol's triggers: stop trading, follow the written re-entry conditions",
          "Increase size to recover faster",
          "Delete the mood tags — they are noise",
        ],
        answerIndex: 1,
        explanation:
          "Size drift + frequency spike + frustration tags is textbook tilt telemetry. The protocol (written while calm) exists for exactly this moment.",
        wrong: {
          0: "Three simultaneous deviations is a pattern, not a Tuesday.",
          2: "Recovering faster is the tilt talking.",
          3: "Deleting telemetry because it is uncomfortable ends the journal's value.",
        },
      },
    ],
  },
  {
    id: "quiz-structure",
    courseId: "course-structure",
    title: "Market Structure — check",
    questions: [
      {
        id: "qv1",
        kind: "mcq",
        prompt: "An uptrend is defined by which sequence of confirmed swings?",
        options: [
          "Higher lows only",
          "Higher highs and higher lows",
          "Equal highs and equal lows",
          "Any three rising candles",
        ],
        answerIndex: 1,
        explanation:
          "Both: HH + HL. One higher high without a confirmed higher low is a wiggle, not a trend.",
        wrong: {
          0: "Higher lows alone can print inside a range or a downtrend pullback.",
          2: "Equal highs/lows define a range, not a trend.",
          3: "Candle counts are not structure; confirmed swings are.",
        },
      },
      {
        id: "qv2",
        kind: "mcq",
        prompt: "In an uptrend, price closes below the last confirmed higher low. In structure vocabulary this is…",
        options: [
          "A BOS — continuation",
          "A CHoCH — first break against the trend",
          "A liquidity sweep — ignore it",
          "A pullback — buy it",
        ],
        answerIndex: 1,
        explanation:
          "The first counter-trend structural break is the change of character: the argument against the trend just scored. BOS is the continuation break.",
        wrong: {
          0: "BOS would be a close ABOVE the last swing high — with the trend.",
          2: "Sweeps are wick raids; a close below the defining swing is evidence.",
          3: "Buying a confirmed structural break is averaging into a dead thesis.",
        },
      },
      {
        id: "qv3",
        kind: "true-false",
        prompt: "A wick through the last swing high counts as a BOS as soon as it prints.",
        options: ["True", "False"],
        answerIndex: 1,
        explanation:
          "False — closes (with your fixed filter) decide breaks. Wicks raid resting orders; treating them as breaks re-enters you into sweeps.",
        wrong: {
          0: "Wick-throughs are exactly what the close rule exists to filter.",
        },
      },
      {
        id: "qv4",
        kind: "scenario",
        prompt:
          "Your continuation long has its structural invalidation 80 pips below entry, but your per-trade budget only supports a 40-pip stop. What now?",
        options: [
          "Keep the 40-pip stop and hope",
          "Skip the trade — the R to the structural line doesn't fit the budget",
          "Widen the risk to 2% for this one",
          "Move the invalidation line to 40 pips",
        ],
        answerIndex: 1,
        explanation:
          "The line where the read is wrong is the market's, not yours. If the R to that line cannot fit the budget, the trade is not available — skipping IS the discipline.",
        wrong: {
          0: "A stop inside the structure is a scheduled donation.",
          2: "Doubling risk to force a trade is how fixed-fraction dies.",
          3: "You cannot vote the market's structure to a friendlier location.",
        },
      },
    ],
  },
];

/** Quiz seed → client-facing quiz (answers stripped). */
export function toClientQuiz(
  seed: QuizSeed,
  courseTitle: string,
  bestPercent: number | null,
  attempts: number,
) {
  return {
    id: seed.id,
    courseId: seed.courseId,
    courseTitle,
    title: seed.title,
    bestPercent,
    attempts,
    questions: seed.questions.map(({ id, kind, prompt, options }) => ({
      id,
      kind,
      prompt,
      options,
    })),
  };
}

/** Grade an attempt server-side, producing per-question verdicts. */
export function gradeAttempt(
  seed: QuizSeed,
  answers: Array<{ questionId: string; choiceIndex: number }>,
): AcademyQuizQuestionResult[] {
  const byId = new Map(answers.map((a) => [a.questionId, a.choiceIndex]));
  return seed.questions.map((question) => {
    const chosen = byId.get(question.id) ?? -1;
    const correct = chosen === question.answerIndex;
    let explanation = question.explanation;
    if (!correct && question.wrong[chosen] !== undefined) {
      explanation = question.wrong[chosen];
    }
    return {
      questionId: question.id,
      correct,
      correctIndex: question.answerIndex,
      chosenIndex: chosen,
      explanation,
    };
  });
}
