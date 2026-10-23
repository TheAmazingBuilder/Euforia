import type { Goal, Trade, TradeReview } from "@cosmoz/shared";

/**
 * Trade Review module — deterministic seed.
 *
 * GOALS are target definitions (the trader's intent); every progress number
 * is computed server-side from real trading behavior in the store — the seed
 * never fabricates progress.
 *
 * REVIEWS are seeded on the most recent graded closed trades so the review
 * workflow, the lessons library and the streak are alive on first paint.
 * Older closed trades stay PENDING — there is honest work waiting in the
 * queue, which is exactly what the module is for.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;

// ── Goals ─────────────────────────────────────────────────────────────────────

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

export function buildGoalSeed(userId: string): Goal[] {
  const now = new Date().toISOString();
  const base = { userId, active: true, createdAt: hoursAgoIso(24 * 30), updatedAt: now };
  return [
    { ...base, id: crypto.randomUUID(), title: "Keep win rate at 50% or above", metric: "WIN_RATE", target: 50, period: "MONTH", color: "VIOLET" },
    { ...base, id: crypto.randomUUID(), title: "Earn 15R this month", metric: "R_EARNED", target: 15, period: "MONTH", color: "EMERALD" },
    { ...base, id: crypto.randomUUID(), title: "Discipline score of 80+", metric: "DISCIPLINE_SCORE", target: 80, period: "MONTH", color: "CYAN" },
    { ...base, id: crypto.randomUUID(), title: "Follow the plan 90% of the time", metric: "FOLLOWED_PLAN_PCT", target: 90, period: "QUARTER", color: "SKY" },
    { ...base, id: crypto.randomUUID(), title: "Never exceed 3 trades in a day", metric: "MAX_TRADES_PER_DAY", target: 3, period: "WEEK", color: "AMBER" },
    { ...base, id: crypto.randomUUID(), title: "Worst day no worse than −2R", metric: "MAX_DAILY_LOSS_R", target: -2, period: "WEEK", color: "ROSE" },
    { ...base, id: crypto.randomUUID(), title: "Grow the account by $2,000", metric: "PROFIT_TARGET", target: 2000, period: "QUARTER", color: "FUCHSIA" },
  ];
}

// ── Reviews ───────────────────────────────────────────────────────────────────

const LESSONS_WIN_CLEAN = [
  "Setup matched the playbook exactly - waited for the confirmation candle instead of anticipating. Let the runner work instead of grabbing the first target.",
  "Textbook execution: level held twice, retest was clean, stop never in danger. Nothing to fix, everything to repeat.",
  "Entered on the retest close as written. The patience before the entry is where this trade was won.",
];

const LESSONS_WIN_FRICTION = [
  "Profitable, but I cut the move earlier than the plan called for. The edge allows more room - trail the structure, don't fix a target out of fear.",
  "Win on the board, yet the entry was early - the candle had not closed beyond the level. Being paid for a broken rule is how bad habits get funded.",
  "Followed the setup but sized up slightly after two green trades. The plan sets size, not the streak.",
];

const LESSONS_LOSS_PLANNED = [
  "Stopped out on the retest wick - entry was valid, stop was one tick inside the noise. Place the stop beyond the structure extreme, not at a round number.",
  "Clean loss: setup valid, risk respected, thesis invalidated as written. This is the cost of doing business, not a mistake.",
  "Plan was right, timing was off - entered before the session trigger fired. The calendar matters as much as the chart.",
];

const LESSONS_LOSS_BROKEN = [
  "Chased the move after the first signal failed. The playbook demands the retest - the impulse was never the entry. Cost me 1R to relearn it.",
  "Traded outside the playbook on a boredom signal: no setup, no stop model, no edge. This trade does not get to happen again.",
  "Moved the stop to give it room. The invalidation was hit - the trade was over the moment the level broke. Widening a stop only widens the loss.",
];

const IMPROVEMENT_NOTES = [
  "Next time: screenshot the setup before entry and check every checklist item out loud.",
  "Next time: set a hard rule - if the first signal fails, wait for the full retest before considering entry.",
  "Next time: journal the invalidation level at entry and treat its break as the exit, not a suggestion.",
];

/** The seeded review band — recent closed graded trades get a review. */
const REVIEW_BAND_SIZE = 16;

export function buildReviewSeed(userId: string, trades: Trade[]): TradeReview[] {
  const rng = mulberry32(20260930);
  const gradeOrder = ["A", "B", "C", "D", "F"] as const;
  type Grade = (typeof gradeOrder)[number];

  const candidates = trades
    .filter((t) => t.status === "CLOSED" && t.deletedAt === null && t.decisionGrade !== null)
    .sort((a, b) => (b.exitAt ?? b.entryAt).localeCompare(a.exitAt ?? a.entryAt))
    .slice(0, REVIEW_BAND_SIZE);

  return candidates.map((trade) => {
    const decision = gradeOrder.indexOf(trade.decisionGrade as Grade);
    // Execution grade correlates with the decision grade, ±1 step of noise.
    const shift = rng() < 0.65 ? 0 : rng() < 0.5 ? -1 : 1;
    const index = Math.min(gradeOrder.length - 1, Math.max(0, decision + shift));
    const executionGrade = gradeOrder[index]!;

    const isWin = (Number(trade.pnlNet) ?? 0) > 0;
    const clean = index <= 1;
    const playbookMatch = trade.strategyId === null ? "OFF_PLAYBOOK" : clean ? "MATCHED" : index === 2 ? "PARTIAL" : "OFF_PLAYBOOK";

    const lessons = isWin
      ? pick(rng, clean ? LESSONS_WIN_CLEAN : LESSONS_WIN_FRICTION)
      : pick(rng, clean || index === 2 ? LESSONS_LOSS_PLANNED : LESSONS_LOSS_BROKEN);

    const quality = (base: number): number => Math.min(5, Math.max(1, base + (rng() < 0.5 ? 0 : 1)));
    const checklistResults =
      trade.checklistSnap && typeof trade.checklistSnap === "object" && !Array.isArray(trade.checklistSnap)
        ? Object.entries(trade.checklistSnap as Record<string, boolean>).map(([label, passed]) => ({ label, passed: Boolean(passed) }))
        : null;

    const exitIso = trade.exitAt ?? trade.entryAt;
    const reviewedAt = new Date(Date.parse(exitIso) + (2 + rng() * 3) * 3_600_000).toISOString();

    return {
      id: crypto.randomUUID(),
      userId,
      tradeId: trade.id,
      executionGrade,
      followedPlan: executionGrade === "F" ? false : trade.followedPlan ?? !clean,
      playbookMatch,
      checklistResults,
      entryQuality: quality(clean ? 4 : 2),
      exitQuality: quality(isWin === clean ? 4 : 3),
      riskManagement: quality(index <= 1 ? 4 : index <= 3 ? 3 : 2),
      lessons,
      improvementNote: index >= 2 ? pick(rng, IMPROVEMENT_NOTES) : null,
      reviewedAt,
      updatedAt: reviewedAt,
    } satisfies TradeReview;
  });
}
