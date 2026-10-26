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

import type { PlaybookDict } from "@/i18n/dictionaries/en/playbook";
import { cn } from "@/lib/utils";

/**
 * Human labels for the Playbook enums - one source of truth so chips, badges
 * and dialogs never drift apart. The LABEL TEXT lives in the dict
 * (dict.playbook.labels.*, mirrored EN/FR); these builders only wire the
 * enum ids to the dict fragments. RETIRED is DISPLAYED as "Archived" (the
 * professional module's §6 vocabulary; the wire value keeps API stability).
 * Components call them inside their body (where useI18n is available) -
 * STATUS_DOT colors stay a plain const (class names are not copy).
 */

export function statusLabels(
  L: PlaybookDict["labels"]["status"],
): Record<StrategyStatus, string> {
  return { ACTIVE: L.ACTIVE, DRAFT: L.DRAFT, PAUSED: L.PAUSED, RETIRED: L.RETIRED };
}

export const STATUS_DOT: Record<StrategyStatus, string> = {
  ACTIVE: "bg-accent",
  DRAFT: "bg-muted-foreground",
  PAUSED: "bg-warning",
  RETIRED: "bg-muted-foreground/50",
};

export function styleLabels(L: PlaybookDict["labels"]["style"]): Record<TradingStyle, string> {
  return { SCALPING: L.SCALPING, INTRADAY: L.INTRADAY, SWING: L.SWING, POSITION: L.POSITION };
}

export function marketConditionLabels(
  L: PlaybookDict["labels"]["marketCondition"],
): Record<MarketCondition, string> {
  return {
    TRENDING: L.TRENDING,
    RANGING: L.RANGING,
    HIGH_VOLATILITY: L.HIGH_VOLATILITY,
    LOW_VOLATILITY: L.LOW_VOLATILITY,
    EXPANSION: L.EXPANSION,
    COMPRESSION: L.COMPRESSION,
    BULLISH_STRUCTURE: L.BULLISH_STRUCTURE,
    BEARISH_STRUCTURE: L.BEARISH_STRUCTURE,
    NEUTRAL_STRUCTURE: L.NEUTRAL_STRUCTURE,
  };
}

export function entryCategoryLabels(
  L: PlaybookDict["labels"]["entryCategory"],
): Record<EntryConditionCategory, string> {
  return {
    MARKET_STRUCTURE: L.MARKET_STRUCTURE,
    PRICE_ACTION: L.PRICE_ACTION,
    INDICATOR: L.INDICATOR,
    SESSION: L.SESSION,
    VOLATILITY: L.VOLATILITY,
    ECONOMIC_EVENT: L.ECONOMIC_EVENT,
    TIME: L.TIME,
    CUSTOM: L.CUSTOM,
  };
}

export function confirmationLabels(
  L: PlaybookDict["labels"]["confirmation"],
): Record<ConfirmationType, string> {
  return {
    CANDLE_CLOSE: L.CANDLE_CLOSE,
    BREAK_OF_STRUCTURE: L.BREAK_OF_STRUCTURE,
    RETEST: L.RETEST,
    VOLUME_CONFIRMATION: L.VOLUME_CONFIRMATION,
    MOMENTUM_CONFIRMATION: L.MOMENTUM_CONFIRMATION,
    INDICATOR_CONFIRMATION: L.INDICATOR_CONFIRMATION,
    MULTI_TIMEFRAME_CONFIRMATION: L.MULTI_TIMEFRAME_CONFIRMATION,
  };
}

export function exitTypeLabels(L: PlaybookDict["labels"]["exitType"]): Record<ExitType, string> {
  return {
    TAKE_PROFIT: L.TAKE_PROFIT,
    STOP_LOSS: L.STOP_LOSS,
    PARTIAL_EXIT: L.PARTIAL_EXIT,
    TIME_EXIT: L.TIME_EXIT,
    STRUCTURE_EXIT: L.STRUCTURE_EXIT,
    INDICATOR_EXIT: L.INDICATOR_EXIT,
    MANUAL_EXIT: L.MANUAL_EXIT,
    INVALIDATED_SETUP: L.INVALIDATED_SETUP,
  };
}

export function ruleCategoryLabels(
  L: PlaybookDict["labels"]["ruleCategory"],
): Record<PlaybookRuleCategory, string> {
  return {
    RISK: L.RISK,
    SESSION: L.SESSION,
    NEWS: L.NEWS,
    BEHAVIOR: L.BEHAVIOR,
    EXECUTION: L.EXECUTION,
    CUSTOM: L.CUSTOM,
  };
}

export function sessionLabels(L: PlaybookDict["labels"]["session"]): Record<PlaybookSession, string> {
  return {
    ASIA: L.ASIA,
    LONDON: L.LONDON,
    NEW_YORK: L.NEW_YORK,
    OVERLAP_LN_NY: L.OVERLAP_LN_NY,
    OTHER: L.OTHER,
  };
}

export function dayLabels(L: PlaybookDict["labels"]["day"]): Record<TradingDay, string> {
  return {
    MON: L.MON,
    TUE: L.TUE,
    WED: L.WED,
    THU: L.THU,
    FRI: L.FRI,
    SAT: L.SAT,
    SUN: L.SUN,
  };
}

export function healthFlagLabels(
  L: PlaybookDict["labels"]["healthFlag"],
): Record<StrategyHealthFlag, string> {
  return {
    DRAFT: L.DRAFT,
    ARCHIVED: L.ARCHIVED,
    NO_RECENT_TRADES: L.NO_RECENT_TRADES,
    MISSING_RISK: L.MISSING_RISK,
    MISSING_ENTRY_CONDITIONS: L.MISSING_ENTRY_CONDITIONS,
    MISSING_INVALIDATION: L.MISSING_INVALIDATION,
    MISSING_CHECKLIST: L.MISSING_CHECKLIST,
  };
}

/** Multi-select chip - toggles `value` inside `selected`. */
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
