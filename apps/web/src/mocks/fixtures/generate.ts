import {
  accountSchema,
  alertSchema,
  computeRiskAmount,
  computeRR,
  dailyStatSchema,
  instrumentSchema,
  mistakeSchema,
  ruleSchema,
  skippedTradeSchema,
  strategySchema,
  toDecimalString,
  toTradingDateKey,
  tradeEventSchema,
  tradeMistakeSchema,
  tradeSchema,
  type Account,
  type Alert,
  type DailyStat,
  type Direction,
  type Emotion,
  type Grade,
  type Instrument,
  type Mistake,
  type Rule,
  type SkippedTrade,
  type Strategy,
  type Trade,
  type TradeEvent,
  type TradeMistake,
} from "@cosmoz/shared";

import {
  ACCOUNT_DEFS,
  INSTRUMENT_DEFS,
  MISTAKE_DEFS,
  STRATEGY_DEFS,
  type InstrumentDef,
} from "./catalog";
import { chance, float, int, mulberry32, pick, uuid, weightedIndex, type Rng } from "./random";

/**
 * SEEDED, DETERMINISTIC fixture generator (Phase 3).
 * Same seed → identical data on every reload of the same UTC day, so
 * dashboards never "flicker" between refreshes. Dates are anchored to the
 * current UTC day so the dataset stays fresh while remaining day-stable.
 *
 * Engineered patterns (per Phase 3 brief):
 * - ~15% out-of-playbook trades, ~20% ungraded (the "to grade" queue)
 * - moved stops (finalStop ≠ initialStop + SL_MODIFIED events)
 * - oversized positions (size > sizer plan)
 * - a visible revenge pattern (loss → bigger-size re-entry, REVENGE emotion)
 * - net slightly positive with a clear drawdown episode around week 6
 */

export const SEED = 20260917;
/** Fixture user timezone — matches the sandbox session owner. */
export const USER_TZ = "America/Toronto";
const DAYS = 90;
const DAY_MS = 86_400_000;
const CLOSED_TRADES_COUNT = 50;

export interface FixtureUser {
  id: string;
  email: string;
  name: string;
  baseCurrency: "USD";
  timezone: string;
  theme: "DARK_BLUE";
}

export interface FixtureData {
  user: FixtureUser;
  accounts: Account[];
  instruments: Instrument[];
  strategies: Strategy[];
  mistakes: Mistake[];
  rules: Rule[];
  trades: Trade[];
  tradeEvents: TradeEvent[];
  tradeMistakes: TradeMistake[];
  alerts: Alert[];
  skippedTrades: SkippedTrade[];
  dailyStats: DailyStat[];
}

// ── Small helpers ────────────────────────────────────────────────────────────

const roundDigits = (value: number, digits: number): number =>
  Number(value.toFixed(digits));

const dayStartMs = (offset: number, nowDayStart: number): number =>
  nowDayStart - offset * DAY_MS;

/** Toronto-calendar date key for a given day offset (midday UTC → safe). */
const dateKeyForOffset = (offset: number, nowDayStart: number): string =>
  toTradingDateKey(new Date(dayStartMs(offset, nowDayStart) + 12 * 3_600_000).toISOString(), USER_TZ);

function priceAt(def: InstrumentDef, dayOffset: number, rng: Rng): number {
  // Deterministic per-symbol wave + slow trend + tiny noise.
  let hash = 0;
  for (const ch of def.symbol) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  const phase = hash % 13;
  const trend = ((hash % 9) - 4) / 100; // ±4% across the window
  const wave = Math.sin((dayOffset + phase) / 11) * 0.006;
  const noise = 1 + (rng() * 2 - 1) * 0.0025;
  return roundDigits(def.basePrice * (1 + wave + trend * (dayOffset / DAYS)) * noise, def.digits);
}

/** Price `r` stop-distances in the FAVORABLE direction (win side). */
const favorable = (direction: Direction, entry: number, distance: number, r: number, digits: number): number =>
  roundDigits(direction === "BUY" ? entry + r * distance : entry - r * distance, digits);

/** Price `r` stop-distances in the ADVERSE direction (stop side). */
const adverse = (direction: Direction, entry: number, distance: number, r: number, digits: number): number =>
  roundDigits(direction === "BUY" ? entry - r * distance : entry + r * distance, digits);

function drawEmotionBefore(rng: Rng): Emotion {
  const options: readonly Emotion[] = [
    "CALM", "CONFIDENT", "FOMO", "ANXIOUS", "TIRED",
    "BORED", "REVENGE", "EUPHORIC", "RELIEVED",
  ];
  return options[weightedIndex(rng, [30, 24, 12, 12, 9, 5, 4, 2, 2])] ?? "CALM";
}

function drawEmotionAfter(rng: Rng, r: number): Emotion {
  if (r > 0.2) return pick(rng, ["RELIEVED", "RELIEVED", "CALM", "EUPHORIC", "CONFIDENT"] as const);
  if (r < -0.2) return pick(rng, ["FRUSTRATED", "FRUSTRATED", "REVENGE", "TIRED", "ANXIOUS"] as const);
  return pick(rng, ["CALM", "RELIEVED"] as const);
}

function drawGrade(rng: Rng, r: number): Grade {
  if (r >= 0.2) return pick(rng, ["A", "A", "B", "B", "B", "C", "D"] as const);
  if (r <= -0.6) return pick(rng, ["A", "B", "B", "C", "C", "D", "F"] as const);
  return pick(rng, ["B", "C", "C"] as const);
}

function followedPlanForGrade(rng: Rng, grade: Grade): boolean {
  if (grade === "A" || grade === "B") return chance(rng, 0.9);
  if (grade === "C") return chance(rng, 0.6);
  return chance(rng, 0.25);
}

function checklistSnapshot(rng: Rng): { [key: string]: boolean } {
  return {
    setup_clear: true,
    risk_within_limits: true,
    news_checked: chance(rng, 0.7),
  };
}

function isWeekendDay(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

// ── Generator ────────────────────────────────────────────────────────────────

export function buildFixtureData(): FixtureData {
  const rng = mulberry32(SEED);
  const nowDayStart = new Date();
  nowDayStart.setUTCHours(0, 0, 0, 0);
  const nowMs = Date.now();

  const userId = uuid(rng);
  const user: FixtureUser = {
    id: userId,
    email: "dev@cosmoz.app",
    name: "Dev Trader",
    baseCurrency: "USD",
    timezone: USER_TZ,
    theme: "DARK_BLUE",
  };

  const accounts: Account[] = ACCOUNT_DEFS.map((def) => ({
    id: uuid(rng),
    userId,
    name: def.name,
    type: def.type,
    broker: def.broker,
    currency: def.currency,
    startingBalance: def.startingBalance,
    isDefault: def.isDefault,
    propConfig: def.propConfig ?? null,
    createdAt: new Date(nowDayStart.getTime() - 120 * DAY_MS).toISOString(),
  }));
  const mainAccount = accounts.find((a) => a.isDefault) ?? accounts[0]!;

  const instruments: Instrument[] = INSTRUMENT_DEFS.map((def) => ({
    id: uuid(rng),
    symbol: def.symbol,
    name: def.name,
    assetClass: def.assetClass,
    quoteCurrency: def.quoteCurrency,
    pipSize: def.pipSize,
    digits: def.digits,
    contractSize: def.contractSize,
    isActive: true,
  }));
  const instrumentBySymbol = new Map(instruments.map((i) => [i.symbol, i]));
  const defBySymbol = new Map(INSTRUMENT_DEFS.map((d) => [d.symbol, d]));

  const strategies: Strategy[] = STRATEGY_DEFS.map((def, index) => ({
    id: uuid(rng),
    userId,
    name: def.name,
    description: def.description,
    entryRules: `1. Wait for the ${def.name} precondition.\n2. Enter on the confirmation candle.\n3. Never chase — skip if gone.`,
    exitRules: "Stop to breakeven at +1R; scale out 50% at 1.5R; trail the rest.",
    riskRules: "Max 1% risk per trade. Max 2 concurrent positions.",
    grade: def.grade,
    status: "ACTIVE",
    color: ["#6E7BFF", "#34D399", "#FBBF24"][index] ?? null,
    createdAt: new Date(nowDayStart.getTime() - 110 * DAY_MS).toISOString(),
  }));

  const mistakes: Mistake[] = MISTAKE_DEFS.map((def) => ({
    id: uuid(rng),
    key: def.key,
    category: def.category,
    label: def.label,
    description: def.description,
    severity: def.severity,
    isSystem: true,
    userId: null,
    detectionHint: def.detectionHint,
  }));
  const mistakeByKey = new Map(mistakes.map((m) => [m.key, m]));

  const rules: Rule[] = [
    {
      id: uuid(rng),
      userId,
      type: "MAX_TRADES_PER_DAY",
      params: { limit: 3 },
      severity: "WARN",
      accountId: null,
      isActive: true,
      createdAt: new Date(nowDayStart.getTime() - 95 * DAY_MS).toISOString(),
    },
    {
      id: uuid(rng),
      userId,
      type: "MAX_LOSSES_PER_DAY",
      params: { limit: 2 },
      severity: "ALERT",
      accountId: null,
      isActive: true,
      createdAt: new Date(nowDayStart.getTime() - 95 * DAY_MS).toISOString(),
    },
    {
      id: uuid(rng),
      userId,
      type: "MAX_RISK_PCT_PER_TRADE",
      params: { limit: 2 },
      severity: "LOCK",
      accountId: null,
      isActive: true,
      createdAt: new Date(nowDayStart.getTime() - 95 * DAY_MS).toISOString(),
    },
  ];

  // ── Day plan: spread exactly 50 closed trades across the 90 days ──
  const dayPlan = new Map<number, number>();
  for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
    const weekday = new Date(dayStartMs(offset, nowDayStart.getTime())).getUTCDay();
    dayPlan.set(offset, isWeekendDay(weekday) ? (chance(rng, 0.2) ? 1 : 0) : int(rng, 0, 2));
  }
  let total = [...dayPlan.values()].reduce((a, b) => a + b, 0);
  const offsetsAsc = [...dayPlan.keys()].sort((a, b) => a - b);
  const offsetsDesc = [...offsetsAsc].reverse();
  while (total > CLOSED_TRADES_COUNT) {
    for (const offset of offsetsDesc) {
      const count = dayPlan.get(offset) ?? 0;
      if (count > 0 && total > CLOSED_TRADES_COUNT) {
        dayPlan.set(offset, count - 1);
        total -= 1;
      }
    }
  }
  let repairPasses = 0;
  while (total < CLOSED_TRADES_COUNT && repairPasses < 1000) {
    for (const offset of offsetsAsc) {
      const count = dayPlan.get(offset) ?? 0;
      const weekday = new Date(dayStartMs(offset, nowDayStart.getTime())).getUTCDay();
      if (!isWeekendDay(weekday) && count < 3 && total < CLOSED_TRADES_COUNT) {
        dayPlan.set(offset, count + 1);
        total += 1;
      }
    }
    repairPasses += 1;
  }
  dayPlan.set(0, 2); // today: 2 closed (+1 open below = 3 = at the MAX_TRADES_PER_DAY limit)
  // Compensate the extra trade so the total stays exactly CLOSED_TRADES_COUNT.
  for (const offset of offsetsDesc) {
    if (offset === 0) continue;
    const count = dayPlan.get(offset) ?? 0;
    if (total + 1 > CLOSED_TRADES_COUNT && count > 0) {
      dayPlan.set(offset, count - 1);
      break;
    }
  }
  const revengeDays = [55, 31, 12]
    .filter((offset) => (dayPlan.get(offset) ?? 0) >= 2)
    .slice(0, 3);
  for (const offset of revengeDays) dayPlan.set(offset, Math.max(2, dayPlan.get(offset) ?? 0));

  // Weighted instrument pool, deterministically shuffled.
  const instrumentPool: Instrument[] = [];
  for (const def of INSTRUMENT_DEFS) {
    const instrument = instrumentBySymbol.get(def.symbol)!;
    for (let i = 0; i < def.weight; i += 1) instrumentPool.push(instrument);
  }
  for (let i = instrumentPool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = instrumentPool[i]!;
    instrumentPool[i] = instrumentPool[j]!;
    instrumentPool[j] = a;
  }

  const oversizeSlots = new Set([5, 18, 36, 47]);
  const noStopSlots = new Set([9, 41]);

  const trades: Trade[] = [];
  const tradeEvents: TradeEvent[] = [];
  const tradeMistakes: TradeMistake[] = [];
  const revengeSecondTradeIds: { id: string; exitAt: string }[] = [];
  let balance = Number(mainAccount.startingBalance);
  let slot = 0;
  let revengeIndex = 0;

  // Chronological generation: oldest day first, hours ascending within a day.
  for (const offset of offsetsAsc) {
    const count = dayPlan.get(offset) ?? 0;
    const isRevengeDay = revengeDays.includes(offset);
    const inDrawdownZone = offset >= 36 && offset <= 48;
    let hourCursor = int(rng, 6, 9);

    for (let n = 0; n < count; n += 1) {
      const isRevengeSecond = isRevengeDay && n === 1 && revengeIndex < 3;
      const isRevengeFirst = isRevengeDay && n === 0 && revengeDays.indexOf(offset) < 3 && (dayPlan.get(offset) ?? 0) >= 2;

      const prevTrade = isRevengeSecond ? trades.at(-1) : undefined;
      const instrument = prevTrade
        ? instrumentBySymbol.get(instruments.find((i) => i.id === prevTrade.instrumentId)!.symbol)!
        : instrumentPool[slot % instrumentPool.length]!;
      const def = defBySymbol.get(instrument.symbol)!;
      const direction: Direction = prevTrade ? prevTrade.direction : chance(rng, 0.5) ? "BUY" : "SELL";
      const entry = prevTrade ? Number(prevTrade.entryPrice) : priceAt(def, offset, rng);
      const distance = roundDigits(float(rng, def.stopRange[0]!, def.stopRange[1]!), def.digits);

      const outOfPlaybook = chance(rng, 0.15);
      const isNoStop = noStopSlots.has(slot);
      const strategyId: string | null =
        (isNoStop || outOfPlaybook) ? null : pick(rng, strategies).id;

      const entryHour = Math.min(23, Math.max(hourCursor, def.assetClass === "FOREX" || def.assetClass === "METAL" ? int(rng, 13, 19) : 6));
      hourCursor = Math.min(23, entryHour + int(rng, 1, 3));
      const entryMs = dayStartMs(offset, nowDayStart.getTime()) + entryHour * 3_600_000 + int(rng, 0, 59) * 60_000;

      const revengeR = [-1.1, 0.45, -0.85][revengeIndex] ?? -1;
      const lossProb = isRevengeDay ? 0.5 : inDrawdownZone ? 0.7 : 0.42;
      const roll = rng();
      let rTarget: number;
      if (isRevengeSecond) {
        rTarget = revengeR;
        revengeIndex += 1;
      } else if (isRevengeFirst) {
        rTarget = -float(rng, 0.6, 1.0); // set up the pattern
      } else if (roll < 0.06) {
        rTarget = float(rng, -0.12, 0.12);
      } else if (roll < 0.06 + lossProb) {
        rTarget = -float(rng, 0.55, 1.05);
      } else {
        rTarget = float(rng, 0.4, 1.0) + Math.pow(rng(), 2) * 1.8;
      }

      const initialStop = isNoStop ? null : adverse(direction, entry, distance, 1, def.digits);
      const initialTP = !isNoStop && chance(rng, 0.7)
        ? favorable(direction, entry, distance, float(rng, 1.2, 3.0), def.digits)
        : null;
      const plannedRR = initialStop !== null && initialTP !== null
        ? toDecimalString(roundDigits(computeRR(String(entry), String(initialStop), String(initialTP), direction) ?? 0, 2))
        : null;

      const riskPct = isRevengeSecond ? float(rng, 1.6, 2.2) : float(rng, 0.4, 1.2);
      const sizeMult = isRevengeSecond ? float(rng, 2.0, 2.5) : oversizeSlots.has(slot) ? float(rng, 1.6, 2.4) : 1;
      const plannedQuantity = ((balance * riskPct) / 100) / (distance * Number(def.contractSize));
      const quantity = Math.max(0.01, Math.floor(plannedQuantity * sizeMult * 100) / 100);
      const quantityStr = toDecimalString(roundDigits(quantity, 2));
      const riskAmount = initialStop !== null
        ? (computeRiskAmount(String(entry), String(initialStop), quantityStr, def.contractSize) ?? "0")
        : toDecimalString(roundDigits(((balance * riskPct) / 100) * sizeMult, 2));
      const riskAmountNum = Number(riskAmount);

      const durationMin = rTarget > 0.2 ? int(rng, 25, 300) : rTarget < -0.2 ? int(rng, 35, 480) : int(rng, 10, 45);
      const entryAt = prevTrade
        ? new Date(Date.parse(prevTrade.exitAt ?? prevTrade.entryAt) + int(rng, 12, 35) * 60_000).toISOString()
        : new Date(entryMs).toISOString();
      const exitAt = new Date(Date.parse(entryAt) + (isRevengeSecond ? int(rng, 30, 140) : durationMin) * 60_000).toISOString();

      const exitPrice = favorable(direction, entry, distance, rTarget, def.digits);
      const pnlGross = rTarget * riskAmountNum;
      const fees = toDecimalString(roundDigits(
        def.assetClass === "CRYPTO" ? float(rng, 1, 12) : def.assetClass === "FOREX" ? float(rng, 2, 6) : float(rng, 0.5, 3),
        2,
      ));
      const swap = chance(rng, 0.3) ? toDecimalString(roundDigits(-float(rng, 0.2, 1.6), 2)) : "0";
      const pnlNet = pnlGross - Number(fees) - Number(swap);
      const rMultiple = riskAmountNum > 0 ? pnlNet / riskAmountNum : 0;
      const tradingDate = toTradingDateKey(entryAt, USER_TZ);

      const forceGraded = isRevengeSecond || oversizeSlots.has(slot);
      const isGraded = forceGraded || !chance(rng, 0.2);
      const grade: Grade | null = isGraded ? drawGrade(rng, rTarget) : null;
      const followedPlan = grade ? followedPlanForGrade(rng, grade) : null;

      const hasExcursion = chance(rng, 0.85);
      const mfeR = hasExcursion ? roundDigits(Math.max(rTarget, 0) + float(rng, 0.15, 1.1), 2) : null;
      const maeR = hasExcursion ? roundDigits(Math.max(-rTarget, 0) + float(rng, 0.08, 0.55), 2) : null;

      const emotionBefore: Emotion = isRevengeSecond ? "REVENGE" : drawEmotionBefore(rng);
      const emotionAfter: Emotion | null =
        isRevengeFirst ? "FRUSTRATED" : chance(rng, 0.65) ? drawEmotionAfter(rng, rTarget) : null;
      const confidence = isGraded ? int(rng, 2, 5) : null;

      const trade: Trade = {
        id: uuid(rng),
        userId,
        accountId: mainAccount.id,
        instrumentId: instrument.id,
        strategyId,
        status: "CLOSED",
        direction,
        entryPrice: toDecimalString(roundDigits(entry, def.digits)),
        entryAt,
        quantity: quantityStr,
        initialStop: initialStop === null ? null : toDecimalString(roundDigits(initialStop, def.digits)),
        initialTP: initialTP === null ? null : toDecimalString(roundDigits(initialTP, def.digits)),
        plannedRR,
        riskAmount,
        finalStop: null,
        exitPrice: toDecimalString(roundDigits(exitPrice, def.digits)),
        exitAt,
        exitReason:
          rTarget > 0.2 ? pick(rng, ["TP", "TRAILING", "MANUAL"] as const) : rTarget < -0.2 ? "SL" : "MANUAL",
        fees,
        swap,
        pnlGross: toDecimalString(roundDigits(pnlGross, 2)),
        pnlNet: toDecimalString(roundDigits(pnlNet, 2)),
        rMultiple: toDecimalString(roundDigits(rMultiple, 2)),
        mfePrice: mfeR === null ? null : toDecimalString(roundDigits(favorable(direction, entry, distance, mfeR, def.digits), def.digits)),
        maePrice: maeR === null ? null : toDecimalString(roundDigits(adverse(direction, entry, distance, maeR, def.digits), def.digits)),
        mfeR: mfeR === null ? null : toDecimalString(mfeR),
        maeR: maeR === null ? null : toDecimalString(maeR),
        emotionBefore,
        emotionAfter,
        confidence,
        decisionGrade: grade,
        followedPlan,
        checklistSnap: grade ? checklistSnapshot(rng) : null,
        notes: null,
        lessons: null,
        tradingDate,
        externalRef: chance(rng, 0.2) ? `MT5-${int(rng, 10_000_000, 99_999_999)}` : null,
        importBatchId: null,
        createdAt: entryAt,
        updatedAt: exitAt,
        deletedAt: null,
      };
      trades.push(trade);
      balance += pnlNet;

      if (oversizeSlots.has(slot) && initialStop !== null) {
        tradeMistakes.push({
          id: uuid(rng),
          tradeId: trade.id,
          mistakeId: mistakeByKey.get("oversized")!.id,
          detectedBy: "AUTO",
          userConfirmed: null,
          note: null,
          createdAt: exitAt,
        });
      }
      if (isNoStop) {
        tradeMistakes.push({
          id: uuid(rng),
          tradeId: trade.id,
          mistakeId: mistakeByKey.get("no_stop_loss")!.id,
          detectedBy: "AUTO",
          userConfirmed: null,
          note: null,
          createdAt: exitAt,
        });
      }
      if (isRevengeSecond) {
        revengeSecondTradeIds.push({ id: trade.id, exitAt });
        tradeMistakes.push({
          id: uuid(rng),
          tradeId: trade.id,
          mistakeId: mistakeByKey.get("revenge_trade")!.id,
          detectedBy: "AUTO",
          userConfirmed: revengeIndex === 2 ? true : null,
          note: revengeIndex === 2 ? "Confirmed — I saw it live and logged it." : null,
          createdAt: exitAt,
        });
      }
      slot += 1;
    }
  }

  // ── Moved stops (bad) and trailed stops (good) + SL_MODIFIED events ──
  const lossIdx: number[] = [];
  const winIdx: number[] = [];
  trades.forEach((trade, index) => {
    if ((Number(trade.rMultiple) ?? 0) <= -0.55 && trade.initialStop !== null) lossIdx.push(index);
    if ((Number(trade.rMultiple) ?? 0) >= 0.4 && trade.initialStop !== null) winIdx.push(index);
  });
  const pickNear = (candidates: number[], targets: number[], taken: Set<number>): number[] => {
    const chosen: number[] = [];
    for (const target of targets) {
      const sorted = [...candidates].sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
      const found = sorted.find((i) => !taken.has(i));
      if (found !== undefined) {
        chosen.push(found);
        taken.add(found);
      }
    }
    return chosen;
  };

  const takenIdx = new Set<number>();
  const movedTargets = pickNear(lossIdx, [12, 22, 33, 44], takenIdx);
  const trailedTargets = pickNear(winIdx, [8, 26], takenIdx);
  const affected = new Map<number, boolean>();
  for (const i of movedTargets) affected.set(i, true);
  for (const i of trailedTargets) affected.set(i, false);

  let movedStopCount = 0;
  for (const [index, worse] of [...affected.entries()].sort((a, b) => a[0] - b[0])) {
    const trade = trades[index]!;
    const def = defBySymbol.get(instruments.find((i) => i.id === trade.instrumentId)!.symbol)!;
    const direction = trade.direction;
    const entry = Number(trade.entryPrice);
    const initialStopNum = Number(trade.initialStop);
    const distance = Math.abs(entry - initialStopNum);
    const newStop = worse
      ? roundDigits(initialStopNum + (direction === "BUY" ? 1 : -1) * distance * float(rng, 0.5, 0.9), def.digits)
      : roundDigits(entry + (direction === "BUY" ? 1 : -1) * distance * 0.35, def.digits);
    const rNew = worse ? -float(rng, 1.25, 1.5) : (Number(trade.rMultiple) ?? 0) + 0.2;
    const exitPrice = favorable(direction, entry, distance, rNew, def.digits);
    const riskAmountNum = Number(trade.riskAmount ?? "0");
    const pnlGross = rNew * riskAmountNum;
    const pnlNet = pnlGross - Number(trade.fees) - Number(trade.swap);
    const rMultiple = riskAmountNum > 0 ? pnlNet / riskAmountNum : 0;
    trade.finalStop = toDecimalString(roundDigits(newStop, def.digits));
    trade.exitPrice = toDecimalString(roundDigits(exitPrice, def.digits));
    trade.exitReason = worse ? "SL" : "TRAILING";
    trade.pnlGross = toDecimalString(roundDigits(pnlGross, 2));
    trade.pnlNet = toDecimalString(roundDigits(pnlNet, 2));
    trade.rMultiple = toDecimalString(roundDigits(rMultiple, 2));
    tradeEvents.push({
      id: uuid(rng),
      tradeId: trade.id,
      type: "SL_MODIFIED",
      payload: { from: trade.initialStop, to: trade.finalStop },
      source: "USER",
      createdAt: trade.exitAt ?? trade.entryAt,
    });
    if (worse) {
      movedStopCount += 1;
      tradeMistakes.push({
        id: uuid(rng),
        tradeId: trade.id,
        mistakeId: mistakeByKey.get("moved_stop")!.id,
        detectedBy: "AUTO",
        userConfirmed: movedStopCount === 1 ? false : null,
        note: movedStopCount === 1 ? "Contested — it was a legitimate trailing stop." : null,
        createdAt: trade.exitAt ?? trade.entryAt,
      });
    }
  }

  // Rebuild the balance cursor chronologically after exit rewrites.
  balance = Number(mainAccount.startingBalance);
  for (const trade of trades) balance += Number(trade.pnlNet);

  // Cut-winner-early auto-detections on the widest MFE-vs-exit gaps.
  const earlyExits = trades
    .map((trade) => ({ trade, gap: (Number(trade.mfeR) ?? 0) - (Number(trade.rMultiple) ?? 0) }))
    .filter((x) => x.gap > 1.1 && (Number(x.trade.rMultiple) ?? 0) > 0.2)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3);
  for (const { trade } of earlyExits) {
    tradeMistakes.push({
      id: uuid(rng),
      tradeId: trade.id,
      mistakeId: mistakeByKey.get("cut_winner_early")!.id,
      detectedBy: "AUTO",
      userConfirmed: null,
      note: null,
      createdAt: trade.exitAt ?? trade.entryAt,
    });
  }

  // ── Open trades (2) ──
  const boomDef = INSTRUMENT_DEFS.find((d) => d.symbol === "BOOM500")!;
  const eurDef = INSTRUMENT_DEFS.find((d) => d.symbol === "EURUSD")!;
  const buildOpenTrade = (
    symbol: string,
    direction: Direction,
    entryMs: number,
    riskPct: number,
    emotionBefore: Emotion,
    strategyId: string,
  ): Trade => {
    const def = defBySymbol.get(symbol)!;
    const entry = priceAt(def, 0, rng);
    const distance = roundDigits(float(rng, def.stopRange[0]!, def.stopRange[1]!), def.digits);
    const initialStop = adverse(direction, entry, distance, 1, def.digits);
    const initialTP = favorable(direction, entry, distance, 2.0, def.digits);
    const plannedRR = computeRR(String(entry), String(initialStop), String(initialTP), direction);
    const plannedQuantity = ((balance * riskPct) / 100) / (distance * Number(def.contractSize));
    const quantityStr = toDecimalString(roundDigits(Math.max(0.01, Math.floor(plannedQuantity * 100) / 100), 2));
    const entryAt = new Date(entryMs).toISOString();
    return {
      id: uuid(rng),
      userId,
      accountId: mainAccount.id,
      instrumentId: instrumentBySymbol.get(symbol)!.id,
      strategyId,
      status: "OPEN",
      direction,
      entryPrice: toDecimalString(roundDigits(entry, def.digits)),
      entryAt,
      quantity: quantityStr,
      initialStop: toDecimalString(roundDigits(initialStop, def.digits)),
      initialTP: toDecimalString(roundDigits(initialTP, def.digits)),
      plannedRR: toDecimalString(roundDigits(plannedRR ?? 0, 2)),
      riskAmount: computeRiskAmount(String(entry), String(initialStop), quantityStr, def.contractSize),
      finalStop: null,
      exitPrice: null,
      exitAt: null,
      exitReason: null,
      fees: "0",
      swap: "0",
      pnlGross: null,
      pnlNet: null,
      rMultiple: null,
      mfePrice: null,
      maePrice: null,
      mfeR: null,
      maeR: null,
      emotionBefore,
      emotionAfter: null,
      confidence: null,
      decisionGrade: null,
      followedPlan: null,
      checklistSnap: null,
      notes: null,
      lessons: null,
      tradingDate: toTradingDateKey(entryAt, USER_TZ),
      externalRef: null,
      importBatchId: null,
      createdAt: entryAt,
      updatedAt: entryAt,
      deletedAt: null,
    };
  };
  let openEntry1 = dayStartMs(0, nowDayStart.getTime()) + Math.round(13.5 * 3_600_000);
  if (openEntry1 > nowMs) openEntry1 = nowMs - 45 * 60_000;
  const openEntry2 = dayStartMs(1, nowDayStart.getTime()) + 20 * 3_600_000;
  trades.push(
    buildOpenTrade("BOOM500", "BUY", openEntry1, 1.0, "FOMO", strategies[0]!.id),
    buildOpenTrade("EURUSD", "SELL", openEntry2, 0.8, "CALM", strategies[1]!.id),
  );

  // ── Ghost trades (8: 5 settled, 3 pending) ──
  const ghostSpecs = [
    { offset: 27, reason: "DISCIPLINE", outcome: "WOULD_HAVE_LOST", r: -0.8, dir: "BUY", notes: "Valid breakout, risk budget exhausted." },
    { offset: 18, reason: "FEAR", outcome: "WOULD_HAVE_WON", r: 1.1, dir: "SELL", notes: null },
    { offset: 10, reason: "DISCIPLINE", outcome: "WOULD_HAVE_LOST", r: -0.5, dir: "BUY", notes: "Chased price last time — skipped correctly." },
    { offset: 6, reason: "NO_SETUP", outcome: "WOULD_HAVE_LOST", r: -1.2, dir: "SELL", notes: null },
    { offset: 3, reason: "FEAR", outcome: "WOULD_HAVE_WON", r: 0.7, dir: "BUY", notes: "Hesitated at the retest." },
    { offset: 1, reason: "OUT_OF_PLAYBOOK", outcome: null, r: null, dir: "SELL", notes: null },
    { offset: 0, reason: "FEAR", outcome: null, r: null, dir: "BUY", notes: null },
    { offset: 0, reason: "MISSED_EXECUTION", outcome: null, r: null, dir: null, notes: null },
  ] as const;

  const skippedTrades: SkippedTrade[] = ghostSpecs.map((spec) => {
    const instrument = pick(rng, instruments);
    const seenAt = new Date(dayStartMs(spec.offset, nowDayStart.getTime()) + int(rng, 10, 20) * 3_600_000).toISOString();
    return {
      id: uuid(rng),
      userId,
      instrumentId: instrument.id,
      strategyId: chance(rng, 0.5) ? pick(rng, strategies).id : null,
      direction: spec.dir,
      seenAt,
      reason: spec.reason,
      outcomeGuess: spec.outcome,
      hypotheticalR: spec.r === null ? null : toDecimalString(spec.r),
      notes: spec.notes,
      createdAt: seenAt,
    };
  });

  // ── Alerts (6: severity WARN ×2, ALERT ×2, type DISCIPLINE_WIN ×2) ──
  const findTradeOnDay = (offset: number, wantLoss: boolean): Trade | undefined => {
    const key = dateKeyForOffset(offset, nowDayStart.getTime());
    return trades.find(
      (t) => t.tradingDate === key && (wantLoss ? (Number(t.pnlNet) ?? 0) < 0 : (Number(t.pnlNet) ?? 0) >= 0),
    );
  };
  const isoAt = (offset: number, hour: number): string =>
    new Date(dayStartMs(offset, nowDayStart.getTime()) + hour * 3_600_000).toISOString();
  const todayKeyStr = dateKeyForOffset(0, nowDayStart.getTime());
  const todayTrades = trades.filter((t) => t.tradingDate === todayKeyStr);
  const todayLastTrade = todayTrades[todayTrades.length - 1] ?? null;

  const alerts: Alert[] = [
    {
      id: uuid(rng),
      userId,
      type: "RULE_VIOLATION",
      severity: "ALERT",
      title: "Max trades per day reached",
      message: "3 trades logged today (limit 3). Every extra trade is a rule breach — consider stopping here.",
      payload: { tradesToday: 3, limit: 3 },
      tradeId: todayLastTrade?.id ?? null,
      readAt: null,
      dismissedAt: null,
      createdAt: isoAt(0, 18),
    },
    {
      id: uuid(rng),
      userId,
      type: "RISK_BUDGET",
      severity: "ALERT",
      title: "Weekly risk budget 72% consumed",
      message: "You have committed 7.2R of this week's 10R budget. Keep the remaining days within plan.",
      payload: { spentR: 7.2, budgetR: 10 },
      tradeId: null,
      readAt: null,
      dismissedAt: null,
      createdAt: isoAt(0, 19),
    },
    {
      id: uuid(rng),
      userId,
      type: "TILT_WARNING",
      severity: "WARN",
      title: "Bigger-size re-entry after a loss",
      message: "A larger-than-planned position was opened minutes after a loss — classic tilt pattern. Review the session before continuing.",
      payload: { pattern: "revenge", minutes: 30 },
      tradeId: revengeSecondTradeIds[0]?.id ?? null,
      readAt: null,
      dismissedAt: null,
      createdAt: revengeSecondTradeIds[0]?.exitAt ?? isoAt(2, 20),
    },
    {
      id: uuid(rng),
      userId,
      type: "STREAK",
      severity: "WARN",
      title: "4 wins in a row",
      message: "Four consecutive wins — watch for overconfidence sizing on the next entries.",
      payload: { streak: 4 },
      tradeId: findTradeOnDay(9, false)?.id ?? null,
      readAt: isoAt(9, 22),
      dismissedAt: null,
      createdAt: isoAt(9, 21),
    },
    {
      id: uuid(rng),
      userId,
      type: "DISCIPLINE_WIN",
      severity: "NOTIFY",
      title: "Discipline Saved: +1.2R this week",
      message: "Skipped setups that would have lost saved you 1.2R this week. Process pays.",
      payload: { savedR: "1.2" },
      tradeId: null,
      readAt: isoAt(5, 21),
      dismissedAt: null,
      createdAt: isoAt(5, 20),
    },
    {
      id: uuid(rng),
      userId,
      type: "DISCIPLINE_WIN",
      severity: "NOTIFY",
      title: "5 plan-following trades in a row",
      message: "Five graded trades in a row followed the plan. Cosmoz Index trending up.",
      payload: { streak: 5 },
      tradeId: null,
      readAt: isoAt(12, 21),
      dismissedAt: isoAt(13, 8),
      createdAt: isoAt(12, 20),
    },
  ];

  // ── Daily stats (derived from the trades + ghosts above → always consistent) ──
  const activityDays = new Set<string>();
  for (const trade of trades) activityDays.add(trade.tradingDate);
  for (const ghost of skippedTrades) activityDays.add(toTradingDateKey(ghost.seenAt, USER_TZ));

  const dailyStats: DailyStat[] = [...activityDays].sort().map((date) => {
    const dayTrades = trades.filter((t) => t.tradingDate === date && t.status === "CLOSED");
    const wins = dayTrades.filter((t) => (Number(t.pnlNet) ?? 0) > 0).length;
    const losses = dayTrades.filter((t) => (Number(t.pnlNet) ?? 0) < 0).length;
    const dayGhosts = skippedTrades.filter((g) => toTradingDateKey(g.seenAt, USER_TZ) === date);
    const dayMistakes = tradeMistakes.filter((m) => dayTrades.some((t) => t.id === m.tradeId)).length;
    const dayViolations = alerts.filter(
      (a) => a.tradeId !== null && dayTrades.some((t) => t.id === a.tradeId) && a.type === "RULE_VIOLATION",
    ).length;
    const savedR = dayGhosts
      .filter((g) => g.outcomeGuess === "WOULD_HAVE_LOST")
      .reduce((sum, g) => sum + Math.abs(Number(g.hypotheticalR ?? "0")), 0);
    const hesitatedR = dayGhosts
      .filter((g) => g.outcomeGuess === "WOULD_HAVE_WON")
      .reduce((sum, g) => sum + Number(g.hypotheticalR ?? "0"), 0);
    const graded = dayTrades.filter((t) => t.decisionGrade !== null);
    const followed = graded.filter((t) => t.followedPlan === true).length;
    const followedPct = graded.length > 0 ? followed / graded.length : null;
    const disciplineScore = followedPct === null
      ? null
      : roundDigits(
          Math.max(
            0,
            Math.min(
              100,
              100 * (0.55 * followedPct
                + 0.25 * (1 - Math.min(1, dayMistakes / Math.max(1, dayTrades.length)))
                + 0.2 * (1 - Math.min(1, dayViolations / Math.max(1, dayTrades.length)))),
            ),
          ),
          1,
        );
    const sleepHours = chance(rng, 0.75) ? roundDigits(float(rng, 5.4, 8.4), 1) : null;
    return {
      id: uuid(rng),
      userId,
      date,
      tradesCount: dayTrades.length,
      winsCount: wins,
      lossesCount: losses,
      pnlNet: toDecimalString(roundDigits(dayTrades.reduce((sum, t) => sum + (Number(t.pnlNet) ?? 0), 0), 2)),
      rEarned: toDecimalString(roundDigits(dayTrades.reduce((sum, t) => sum + (Number(t.rMultiple) ?? 0), 0), 2)),
      disciplineScore: disciplineScore === null ? null : toDecimalString(disciplineScore),
      mistakesCount: dayMistakes,
      violationsCount: dayViolations,
      ghostTradesCount: dayGhosts.length,
      savedR: savedR > 0 ? toDecimalString(roundDigits(savedR, 2)) : null,
      hesitatedR: hesitatedR > 0 ? toDecimalString(roundDigits(hesitatedR, 2)) : null,
      sleepHours: sleepHours === null ? null : toDecimalString(sleepHours),
      moodPre: sleepHours === null
        ? null
        : sleepHours < 6.2 ? pick(rng, ["TIRED", "BORED", "ANXIOUS"] as const) : pick(rng, ["CALM", "CONFIDENT"] as const),
    };
  });

  const data: FixtureData = {
    user,
    accounts,
    instruments,
    strategies,
    mistakes,
    rules,
    trades,
    tradeEvents,
    tradeMistakes,
    alerts,
    skippedTrades,
    dailyStats,
  };

  if (process.env.NODE_ENV !== "production") {
    validateFixtures(data);
  }
  return data;
}

// ── Dev-time contract validation (every fixture entity through zod) ─────────

function validateFixtures(data: FixtureData): void {
  const failures: string[] = [];
  type ParseResult = {
    success: boolean;
    error?: { issues: { message: string; path: PropertyKey[] }[] };
  };
  const check = (
    name: string,
    schema: { safeParse(v: unknown): ParseResult },
    items: unknown[],
  ): void => {
    items.forEach((item, index) => {
      const result = schema.safeParse(item);
      if (!result.success) {
        const issue = result.error?.issues[0];
        failures.push(
          `${name}[${index}]: ${issue?.message ?? "invalid"} at ${issue?.path.join(".") ?? "?"}`,
        );
      }
    });
  };

  check("accounts", accountSchema, data.accounts);
  check("instruments", instrumentSchema, data.instruments);
  check("strategies", strategySchema, data.strategies);
  check("mistakes", mistakeSchema, data.mistakes);
  check("rules", ruleSchema, data.rules);
  check("trades", tradeSchema, data.trades);
  check("tradeEvents", tradeEventSchema, data.tradeEvents);
  check("tradeMistakes", tradeMistakeSchema, data.tradeMistakes);
  check("alerts", alertSchema, data.alerts);
  check("skippedTrades", skippedTradeSchema, data.skippedTrades);
  check("dailyStats", dailyStatSchema, data.dailyStats);

  if (failures.length > 0) {
    console.error("[fixtures] contract validation failed:\n" + failures.join("\n"));
    throw new Error(`[fixtures] ${failures.length} entities violate @cosmoz/shared schemas (see console)`);
  }
}
