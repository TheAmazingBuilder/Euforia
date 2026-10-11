/**
 * Academy practice drills — engine-generated training rounds (support/
 * resistance reads, position-sizing arithmetic, supply/demand zones) and the
 * pattern-identification drill over the authored exemplars, with the
 * weakness-bank resurfacing rule.
 *
 * Randomness is INJECTED (rng) so the generators are unit-testable; runtime
 * uses Math.random (no security need — Phase 11 §41: educational simulations,
 * never real trades; no execution path exists in this module).
 *
 * DOCUMENTED CONTRACT LIMIT (Phase 11 §35/§37 vs shared contract): the
 * pattern/SR/position/zone drills are client-graded BY CONTRACT — the shared
 * shapes carry `answer` + `explanation` for immediate in-lesson feedback and
 * the practice log is self-reported (ledger only, no certification impact).
 * The server-graded surfaces are course quizzes, inline checkpoints and
 * category exams (grading.ts). This asymmetry is the product's contract, not
 * a backend gap; e2e asserts quiz/exam/checkpoint answers never leak.
 *
 * Parity source: mocks/academy-engine.ts (patternDrill/srDrill/positionDrill/
 * zoneDrill) — generation shapes ported verbatim.
 */
import type { AcademyCandle, AcademyPatternDrill, AcademyPositionDrill, AcademySrDrill, AcademyZoneDrill } from "../../../shared/contracts";
import { PATTERN_EXEMPLARS } from "../content/patterns";

export type Rng = () => number;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Safe random pick — throws only if the authored data is empty (never). */
function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error("academy drill source empty");
  return items[Math.floor(rng() * items.length)] as T;
}

/** Fisher–Yates over a copy (no mutation, indexed-access safe). */
export function shuffleWith<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = tmp;
  }
  return copy;
}

// ── Pattern identification (authored exemplars + weakness bank) ─────────────

/** Which authored pattern ids the learner currently owes (ledger-derived). */
export type WrongPatternIds = readonly string[];

export function patternDrill(input: {
  rng: Rng;
  wrongPatternIds: WrongPatternIds;
}): AcademyPatternDrill | null {
  if (PATTERN_EXEMPLARS.length === 0) return null;
  // Weakness bank first: ~50% of rounds resurface a missed pattern.
  const bank = input.wrongPatternIds
    .map((id) => PATTERN_EXEMPLARS.find((entry) => entry.id === id))
    .filter((entry): entry is (typeof PATTERN_EXEMPLARS)[number] => Boolean(entry));
  const fromBank = bank.length > 0 && input.rng() < 0.5;
  const exemplar = fromBank ? pick(bank, input.rng) : pick(PATTERN_EXEMPLARS, input.rng);

  const optionIds = shuffleWith(input.rng, [exemplar.answer, ...exemplar.distractors].slice(0, 4));
  let filler = 0;
  while (optionIds.length < 4) {
    const candidate = PATTERN_EXEMPLARS[optionIds.length % PATTERN_EXEMPLARS.length] ?? PATTERN_EXEMPLARS[filler % PATTERN_EXEMPLARS.length];
    if (candidate) optionIds.push(candidate.id);
    filler += 1;
  }
  return {
    patternId: exemplar.id,
    candles: exemplar.candles,
    context: exemplar.context,
    family: exemplar.family,
    bias: exemplar.bias,
    options: optionIds.map((id) => ({
      id,
      label: PATTERN_EXEMPLARS.find((entry) => entry.id === id)?.label ?? id,
    })),
    answer: optionIds.indexOf(exemplar.answer),
    explanation: exemplar.explanation,
  };
}

// ── Support/Resistance read (generated shape, ported verbatim) ──────────────

export function srDrill(rng: Rng): AcademySrDrill {
  const support = rng() < 0.5;
  const level = 100;
  const vol = 1.1;
  const candles: AcademyCandle[] = [];
  let price = support ? level + 9 : level - 9;

  const pushCandle = (o: number, c: number, wickHigh: number, wickLow: number) => {
    candles.push({
      o: round2(o),
      h: round2(Math.max(o, c) + wickHigh),
      l: round2(Math.min(o, c) - wickLow),
      c: round2(c),
    });
    price = c;
  };

  // First approach toward the level.
  for (let i = 0; i < 4; i += 1) {
    const drift = support ? -2.1 : 2.1;
    const c = price + drift + (rng() - 0.5) * vol;
    pushCandle(price, c, rng() * vol * 0.5, rng() * vol * 0.5);
  }
  // Prior touch + reversal away (this is what makes the level honest).
  for (let i = 0; i < 2; i += 1) {
    if (support) {
      const l = level - rng() * 1.1;
      const c = price + 1.6 + rng() * 0.8;
      pushCandle(price, c, rng() * vol * 0.5, price - l);
    } else {
      const h = level + rng() * 1.1;
      const c = price - 1.6 - rng() * 0.8;
      pushCandle(price, c, h - price, rng() * vol * 0.5);
    }
  }
  // Travel back toward the level.
  for (let i = 0; i < 3; i += 1) {
    const drift = support ? 1.8 : -1.8;
    const c = price + drift + (rng() - 0.5) * vol;
    pushCandle(price, c, rng() * vol * 0.5, rng() * vol * 0.5);
  }
  // The retest under examination — wicks probe the level.
  for (let i = 0; i < 2; i += 1) {
    if (support) {
      const l = level - rng() * 1.2;
      const c = price + 1.3 + rng() * 0.7;
      pushCandle(price, c, rng() * vol * 0.4, price - l);
    } else {
      const h = level + rng() * 1.2;
      const c = price - 1.3 - rng() * 0.7;
      pushCandle(price, c, h - price, rng() * vol * 0.4);
    }
  }
  // Resolution away from the level.
  const c = support ? price + 2.1 : price - 2.1;
  pushCandle(price, c, rng() * 0.4, rng() * 0.4);

  const options = shuffleWith(rng, [
    { id: "support", label: "Support — buyers defended the level, price bounced" },
    { id: "resistance", label: "Resistance — sellers capped the level, price turned down" },
  ]);
  const answerId = support ? "support" : "resistance";
  return {
    candles,
    level,
    context: "Intraday chart, no scheduled news. The dashed line is a horizontal level with a prior touch.",
    prompt: "Price is retesting the dashed level. What is the level doing in this sequence?",
    options,
    answer: options.findIndex((option) => option.id === answerId),
    explanation: support
      ? "Price descended into the level, probed below with wicks, and closed back above before bouncing — the footprint of buyers defending support. A level is a zone of interest, never a guarantee: the reaction is the evidence, and invalidation sits below the retest low."
      : "Price rallied into the level, probed above with wicks, and closed back below before turning down — the footprint of sellers capping resistance. A level is a zone of interest, never a guarantee: the reaction is the evidence, and invalidation sits above the retest high.",
  };
}

// ── Position sizing arithmetic (generated, ported verbatim) ─────────────────

export function positionDrill(rng: Rng): AcademyPositionDrill {
  const balances = [5000, 10000, 25000, 50000] as const;
  const percents = [0.5, 1, 1.5, 2] as const;
  const accountBalance = pick(balances, rng);
  const riskPercent = pick(percents, rng);
  const riskBudget = (accountBalance * riskPercent) / 100;
  const entry = round2(80 + rng() * 40);
  const stopDistance = round2(0.4 + rng() * 1.6);
  const stop = round2(entry - stopDistance);
  const answer = Math.round((riskBudget / stopDistance) * 10) / 10;

  return {
    accountBalance,
    riskPercent,
    entry,
    stop,
    pointValue: 1,
    prompt: `Account $${accountBalance.toLocaleString("en-US")}, risk rule ${riskPercent}% ($${riskBudget.toLocaleString("en-US", { maximumFractionDigits: 2 })}). Long entry ${entry}, stop ${stop}. Each unit loses $1 per point of adverse movement. What position size (units) keeps the loss at the stop exactly within the risk budget?`,
    unit: "units",
    answer,
    tolerance: 0.03,
    explanation: `Risk budget = $${accountBalance.toLocaleString("en-US")} × ${riskPercent}% = $${riskBudget.toLocaleString("en-US", { maximumFractionDigits: 2 })}. Stop distance = ${entry} − ${stop} = ${stopDistance}. Size = budget ÷ distance = ${riskBudget.toLocaleString("en-US", { maximumFractionDigits: 2 })} ÷ ${stopDistance} = ${answer} units. Confidence never sizes a position — the stop distance and the account rule do.`,
  };
}

// ── Supply/Demand zone read (generated, ported verbatim) ────────────────────

export function zoneDrill(rng: Rng): AcademyZoneDrill {
  const vol = 1.2;
  const candles: AcademyCandle[] = [];
  let price = 100;

  const pushCandle = (o: number, c: number, wickHigh: number, wickLow: number) => {
    candles.push({
      o: round2(o),
      h: round2(Math.max(o, c) + wickHigh),
      l: round2(Math.min(o, c) - wickLow),
      c: round2(c),
    });
    price = c;
  };

  // Drop into the demand band (91-94), base, then rally away with displacement.
  for (let i = 0; i < 3; i += 1) {
    const c = price - 2.4 - rng();
    pushCandle(price, c, rng() * vol * 0.4, rng() * vol * 0.5);
  }
  for (let i = 0; i < 2; i += 1) {
    const c = price + (rng() - 0.5) * 1.2;
    pushCandle(price, c, rng() * 0.8, rng() * 0.8);
  }
  for (let i = 0; i < 3; i += 1) {
    const c = price + 3.4 + rng();
    pushCandle(price, c, rng() * vol * 0.5, rng() * 0.4);
  }
  // Stall at the supply band (103-106): wicks above, closes back below.
  for (let i = 0; i < 2; i += 1) {
    const h = 105.2 + rng() * 1.2;
    const c = price - 1.8 - rng() * 0.8;
    pushCandle(price, c, h - price, rng() * vol * 0.4);
  }
  // Fall back to mid-range and drift sideways.
  for (let i = 0; i < 3; i += 1) {
    const c = price - 1.9 - rng() * 0.6;
    pushCandle(price, c, rng() * vol * 0.4, rng() * vol * 0.4);
  }
  for (let i = 0; i < 2; i += 1) {
    const c = price + (rng() - 0.5) * 1.4;
    pushCandle(price, c, rng() * 0.9, rng() * 0.9);
  }

  // Bands: demand where the rally was born, supply where it stalled.
  const bands = [
    { top: 106, bottom: 103, identity: "supply" },
    { top: 94, bottom: 91, identity: "demand" },
  ];
  const ordered = rng() < 0.5 ? bands : [bands[1] as (typeof bands)[number], bands[0] as (typeof bands)[number]];
  const zones = ordered.map((band, index) => ({
    top: band.top,
    bottom: band.bottom,
    tag: index === 0 ? "A" : "B",
  }));
  const demandTag = ordered[0]?.identity === "demand" ? "A" : "B";

  const options = [
    { id: "a", label: `Band A (${demandTag === "A" ? "the lower band" : "the upper band"}) is the demand zone` },
    { id: "b", label: `Band B (${demandTag === "B" ? "the lower band" : "the upper band"}) is the demand zone` },
  ];
  return {
    candles,
    zones,
    context: "Daily chart, trending leg followed by a pullback. Bands mark prior reaction areas.",
    prompt: "Which band is the demand zone — the area where buyers previously stepped in with displacement?",
    options,
    answer: demandTag === "A" ? 0 : 1,
    explanation:
      "Demand is where aggressive buying originated: the strong rally away from the lower band is displacement — the footprint of unfilled interest. Supply sits where the rally stalled and rolled over. Price returning toward a demand zone is where buyers may defend again — potential, never a promise.",
  };
}

// ── Practice stats (pure aggregation over the ledger rows) ──────────────────

export interface PracticeLedgerRow {
  drill: string;
  correct: boolean;
  at: Date;
  /** Target ref (pattern id, card id, scenario step) — weakness-bank input. */
  refId?: string | null;
}

export const DRILL_LABELS: Record<string, string> = {
  PATTERN_ID: "Pattern ID",
  CANDLE_LAB: "Candle Lab",
  STRUCTURE: "Structure",
  CHECKPOINT: "Checkpoints",
  SR_LEVEL: "Support/Resistance",
  POSITION_SIZE: "Position Sizing",
  ZONE_ID: "Supply/Demand",
  SCENARIO: "Scenarios",
  FLASHCARD: "Flashcards",
};

export function practiceStats(rows: readonly PracticeLedgerRow[]): {
  perDrill: { drill: string; label: string; attempts: number; correct: number; accuracy: number | null }[];
  recent: { drill: string; correct: boolean; at: string }[];
} {
  const perDrill = Object.entries(DRILL_LABELS).map(([drill, label]) => {
    const drillRows = rows.filter((row) => row.drill === drill);
    const attempts = drillRows.length;
    const correct = drillRows.filter((row) => row.correct).length;
    return {
      drill,
      label,
      attempts,
      correct,
      accuracy: attempts === 0 ? null : Math.round((correct / attempts) * 100),
    };
  });
  return {
    perDrill,
    recent: [...rows]
      .reverse()
      .slice(0, 8)
      .map(({ drill, correct, at }) => ({ drill, correct, at: at.toISOString() })),
  };
}

/**
 * Weakness bank (parity verbatim): the set of authored pattern ids whose
 * LATEST logged PATTERN_ID attempt was incorrect, oldest-first, capped at 12.
 * A later correct answer clears the pattern; the ledger is the single source.
 */
export function weaknessBank(rows: readonly PracticeLedgerRow[]): string[] {
  const lastCorrectAt = new Map<string, string>();
  const lastMissAt = new Map<string, string>();
  for (const row of rows) {
    if (row.drill !== "PATTERN_ID" || !row.refId) continue;
    const at = row.at.toISOString();
    if (row.correct) {
      if (!lastCorrectAt.has(row.refId) || at > (lastCorrectAt.get(row.refId) ?? "")) {
        lastCorrectAt.set(row.refId, at);
      }
    } else if (!lastMissAt.has(row.refId) || at > (lastMissAt.get(row.refId) ?? "")) {
      lastMissAt.set(row.refId, at);
    }
  }
  return [...lastMissAt.entries()]
    .filter(([refId, missAt]) => missAt > (lastCorrectAt.get(refId) ?? ""))
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([refId]) => refId)
    .slice(0, 12);
}
