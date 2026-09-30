import type {
  ConfirmationType,
  EntryConditionCategory,
  ExitType,
  MarketCondition,
  PlaybookRuleCategory,
  PlaybookSession,
  StrategyHealthFlag,
  StrategyStatus,
  TradingDay,
  TradingStyle,
} from "@cosmoz/shared";

import { cn } from "@/lib/utils";

/**
 * Human labels for the Playbook enums — one source of truth so chips, badges
 * and dialogs never drift apart. RETIRED is DISPLAYED as "Archived" (the
 * professional module's §6 vocabulary; the wire value keeps API stability).
 */

export const STATUS_LABELS: Record<StrategyStatus, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  PAUSED: "Paused",
  RETIRED: "Archived",
};

export const STATUS_DOT: Record<StrategyStatus, string> = {
  ACTIVE: "bg-accent",
  DRAFT: "bg-muted-foreground",
  PAUSED: "bg-warning",
  RETIRED: "bg-muted-foreground/50",
};

export const STYLE_LABELS: Record<TradingStyle, string> = {
  SCALPING: "Scalping",
  INTRADAY: "Intraday",
  SWING: "Swing",
  POSITION: "Position",
};

export const MARKET_CONDITION_LABELS: Record<MarketCondition, string> = {
  TRENDING: "Trending",
  RANGING: "Ranging",
  HIGH_VOLATILITY: "High volatility",
  LOW_VOLATILITY: "Low volatility",
  EXPANSION: "Expansion",
  COMPRESSION: "Compression",
  BULLISH_STRUCTURE: "Bullish structure",
  BEARISH_STRUCTURE: "Bearish structure",
  NEUTRAL_STRUCTURE: "Neutral structure",
};

export const ENTRY_CATEGORY_LABELS: Record<EntryConditionCategory, string> = {
  MARKET_STRUCTURE: "Structure",
  PRICE_ACTION: "Price action",
  INDICATOR: "Indicator",
  SESSION: "Session",
  VOLATILITY: "Volatility",
  ECONOMIC_EVENT: "Eco event",
  TIME: "Time",
  CUSTOM: "Custom",
};

export const CONFIRMATION_LABELS: Record<ConfirmationType, string> = {
  CANDLE_CLOSE: "Candle close",
  BREAK_OF_STRUCTURE: "Break of structure",
  RETEST: "Retest",
  VOLUME_CONFIRMATION: "Volume",
  MOMENTUM_CONFIRMATION: "Momentum",
  INDICATOR_CONFIRMATION: "Indicator",
  MULTI_TIMEFRAME_CONFIRMATION: "Multi-timeframe",
};

export const EXIT_TYPE_LABELS: Record<ExitType, string> = {
  TAKE_PROFIT: "Take profit",
  STOP_LOSS: "Stop loss",
  PARTIAL_EXIT: "Partial exit",
  TIME_EXIT: "Time exit",
  STRUCTURE_EXIT: "Structure exit",
  INDICATOR_EXIT: "Indicator exit",
  MANUAL_EXIT: "Manual exit",
  INVALIDATED_SETUP: "Invalidated setup",
};

export const RULE_CATEGORY_LABELS: Record<PlaybookRuleCategory, string> = {
  RISK: "Risk",
  SESSION: "Session",
  NEWS: "News",
  BEHAVIOR: "Behavior",
  EXECUTION: "Execution",
  CUSTOM: "Custom",
};

export const SESSION_LABELS: Record<PlaybookSession, string> = {
  ASIA: "Asia",
  LONDON: "London",
  NEW_YORK: "New York",
  OVERLAP_LN_NY: "London/NY overlap",
  OTHER: "Other",
};

export const DAY_LABELS: Record<TradingDay, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

export const HEALTH_FLAG_LABELS: Record<StrategyHealthFlag, string> = {
  DRAFT: "Draft",
  ARCHIVED: "Archived",
  NO_RECENT_TRADES: "No recent trades",
  MISSING_RISK: "Missing risk definition",
  MISSING_ENTRY_CONDITIONS: "Missing entry conditions",
  MISSING_INVALIDATION: "Missing invalidation",
  MISSING_CHECKLIST: "Missing checklist",
};

/** Multi-select chip — toggles `value` inside `selected`. */
export function toggleInArray<T>(array: T[], value: T): T[] {
  return array.includes(value) ? array.filter((item) => item !== value) : [...array, value];
}

/** One selectable chip (accent when selected, hairline otherwise). */
export function ChipToggle({
  selected,
  children,
  onClick,
  className,
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        selected
          ? "border-accent bg-accent/15 text-accent"
          : "border-border bg-surface text-muted-foreground hover:border-accent/40 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Comma-separated tags field → clean string array. */
export function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 12);
}
