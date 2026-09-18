import type { RuleType } from "../enums";
import type { JsonValue, JsonObject } from "../schemas/primitives";

/**
 * Rule param metadata — the pure, React-free description of what each
 * RuleType needs in its `params` JSON (data-model.md "Domaine 7").
 * The discipline UI renders its param editor FROM this table and the mock
 * store validates against it, so client and mock can never drift.
 */

export interface RuleParamField {
  /** Key inside the Rule.params object. */
  key: "limit" | "minutes" | "start" | "end";
  /** Human label for the editor input. */
  label: string;
  kind: "number" | "time";
  /** For numbers: input step. */
  step?: number;
  /** Unit suffix shown after the input (e.g. "%", "R", "min"). */
  suffix?: string;
}

const LIMIT: RuleParamField = {
  key: "limit",
  label: "Limit",
  kind: "number",
  step: 1,
};
const LIMIT_PCT: RuleParamField = {
  key: "limit",
  label: "Limit",
  kind: "number",
  step: 0.1,
  suffix: "%",
};
const LIMIT_R: RuleParamField = {
  key: "limit",
  label: "Limit",
  kind: "number",
  step: 0.5,
  suffix: "R",
};
const MINUTES: RuleParamField = {
  key: "minutes",
  label: "Cooldown",
  kind: "number",
  step: 5,
  suffix: "min",
};

/** Ordered param fields for a rule type — drives the [Add rule] editor. */
export function ruleParamFields(type: RuleType): RuleParamField[] {
  switch (type) {
    case "MAX_TRADES_PER_DAY":
    case "MAX_LOSSES_PER_DAY":
    case "MAX_DAILY_LOSS_PCT":
      return [type === "MAX_DAILY_LOSS_PCT" ? LIMIT_PCT : LIMIT];
    case "MAX_RISK_PCT_PER_TRADE":
      return [LIMIT_PCT];
    case "MAX_DAILY_RISK_R":
      return [LIMIT_R];
    case "MIN_RR":
      return [{ key: "limit", label: "Minimum R:R", kind: "number", step: 0.1, suffix: "R" }];
    case "COOLDOWN_AFTER_LOSSES":
      return [MINUTES];
    case "TRADING_WINDOW":
      return [
        { key: "start", label: "Session start", kind: "time" },
        { key: "end", label: "Session end", kind: "time" },
      ];
    case "MAX_OPEN_POSITIONS":
      return [LIMIT];
    case "NO_NEWS_WINDOW":
      return [{ ...MINUTES, label: "Buffer around news" }];
  }
}

/** Times "HH:MM" for TRADING_WINDOW, plain numbers otherwise. */
export function defaultRuleParams(type: RuleType): JsonObject {
  switch (type) {
    case "TRADING_WINDOW":
      return { start: "08:00", end: "17:00" };
    case "COOLDOWN_AFTER_LOSSES":
      return { minutes: 30 };
    case "NO_NEWS_WINDOW":
      return { minutes: 15 };
    case "MAX_DAILY_LOSS_PCT":
      return { limit: 4 };
    case "MAX_RISK_PCT_PER_TRADE":
      return { limit: 2 };
    case "MAX_DAILY_RISK_R":
      return { limit: 6 };
    case "MIN_RR":
      return { limit: 1.5 };
    default:
      return { limit: 3 };
  }
}

function paramSummary(type: RuleType, params: JsonObject): string {
  const num = (key: string): number | null => {
    const value = params[key];
    return typeof value === "number" ? value : null;
  };
  switch (type) {
    case "COOLDOWN_AFTER_LOSSES":
    case "NO_NEWS_WINDOW": {
      const minutes = num("minutes");
      return minutes !== null ? `${minutes} min` : "params unset";
    }
    case "TRADING_WINDOW": {
      const start = params.start;
      const end = params.end;
      return typeof start === "string" && typeof end === "string" ? `${start}–${end}` : "params unset";
    }
    default: {
      const limit = num("limit");
      if (limit === null) return "params unset";
      const isPct = type === "MAX_RISK_PCT_PER_TRADE" || type === "MAX_DAILY_LOSS_PCT";
      const isR = type === "MAX_DAILY_RISK_R" || type === "MIN_RR";
      return `${limit}${isPct ? "%" : isR ? "R" : ""}`;
    }
  }
}

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  MAX_TRADES_PER_DAY: "Max trades per day",
  MAX_LOSSES_PER_DAY: "Max losses per day",
  MAX_RISK_PCT_PER_TRADE: "Max risk % per trade",
  MAX_DAILY_LOSS_PCT: "Max daily loss %",
  MAX_DAILY_RISK_R: "Max daily risk R",
  MIN_RR: "Minimum R:R",
  COOLDOWN_AFTER_LOSSES: "Cooldown after losses",
  TRADING_WINDOW: "Trading window",
  MAX_OPEN_POSITIONS: "Max open positions",
  NO_NEWS_WINDOW: "No-news window",
};

/** "Max trades per day · 3" — compact one-line rule description. */
export function describeRule(type: RuleType, params: JsonValue | null): string {
  const object = params !== null && typeof params === "object" && !Array.isArray(params)
    ? (params as JsonObject)
    : {};
  return `${RULE_TYPE_LABELS[type]} · ${paramSummary(type, object)}`;
}

const ordinalSuffix = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
};

/**
 * Freeze-the-moment context → human sentence for the violation log.
 * Example: MAX_TRADES_PER_DAY with `{ tradesToday: 4, limit: 3 }` →
 * "4th trade of the day, limit 3". Unknown shapes fall back to a generic
 * `key: value` listing — the context JSON is the source of truth.
 */
export function describeViolationContext(type: RuleType, context: JsonValue | null): string {
  const object = context !== null && typeof context === "object" && !Array.isArray(context)
    ? (context as JsonObject)
    : {};
  const num = (key: string): number | null => {
    const value = object[key];
    return typeof value === "number" ? value : null;
  };
  const limit = num("limit");

  switch (type) {
    case "MAX_TRADES_PER_DAY": {
      const tradesToday = num("tradesToday");
      if (tradesToday !== null && limit !== null) {
        return `${tradesToday}${ordinalSuffix(tradesToday)} trade of the day, limit ${limit}`;
      }
      break;
    }
    case "MAX_LOSSES_PER_DAY": {
      const lossesToday = num("lossesToday");
      if (lossesToday !== null && limit !== null) {
        return `${lossesToday}${ordinalSuffix(lossesToday)} loss of the day, limit ${limit}`;
      }
      break;
    }
    case "MAX_RISK_PCT_PER_TRADE": {
      const riskPct = num("riskPct");
      if (riskPct !== null && limit !== null) {
        return `risk ${riskPct}% of balance on one trade, limit ${limit}%`;
      }
      break;
    }
    case "MAX_DAILY_LOSS_PCT": {
      const dayLossPct = num("dayLossPct");
      if (dayLossPct !== null && limit !== null) {
        return `day down ${dayLossPct}%, limit ${limit}%`;
      }
      break;
    }
    case "MAX_DAILY_RISK_R": {
      const riskR = num("riskR");
      if (riskR !== null && limit !== null) {
        return `${riskR}R committed today, limit ${limit}R`;
      }
      break;
    }
    case "MIN_RR": {
      const plannedRR = num("plannedRR");
      if (plannedRR !== null && limit !== null) {
        return `planned R:R ${plannedRR}, minimum ${limit}`;
      }
      break;
    }
    case "COOLDOWN_AFTER_LOSSES": {
      const minutes = num("minutes");
      const minutesAfterLoss = num("minutesAfterLoss");
      if (minutesAfterLoss !== null && minutes !== null) {
        return `re-entered ${minutesAfterLoss} min after a loss, cooldown ${minutes} min`;
      }
      break;
    }
    case "MAX_OPEN_POSITIONS": {
      const openPositions = num("openPositions");
      if (openPositions !== null && limit !== null) {
        return `${openPositions} open positions, limit ${limit}`;
      }
      break;
    }
    case "TRADING_WINDOW": {
      const entryHour = object.entryHour;
      if (typeof entryHour === "string" && typeof object.start === "string" && typeof object.end === "string") {
        return `entry at ${entryHour}, window ${object.start}–${object.end}`;
      }
      break;
    }
    case "NO_NEWS_WINDOW": {
      const minutesToNews = num("minutesToNews");
      if (minutesToNews !== null && limit !== null) {
        return `${minutesToNews} min from a red-folder event, buffer ${limit} min`;
      }
      break;
    }
  }

  const pairs = Object.entries(object)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .slice(0, 3);
  return pairs.length > 0 ? pairs.join(", ") : "context unavailable";
}
