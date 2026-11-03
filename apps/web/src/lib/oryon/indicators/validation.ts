import type { OryonIndicatorInstance } from "@cosmoz/shared";

/**
 * Indicator business rules beyond the Zod schema (Phase 3 spec §4C).
 *
 * A Zod discriminated union cannot cross-reference fields of one member
 * (MACD fast < slow, RSI lower < upper). These rules are enforced at:
 *  - store mutations (the settings UI shows the message, the last VALID
 *    configuration is retained - spec §9);
 *  - persistence load (rule-violating instances are dropped with a warning);
 *  - calculation (throws - a violation reaching the calc layer is a
 *    programmer error, never rendered as math).
 *
 * Returns null when valid, else a STABLE rule key (i18n maps it to copy).
 */
export type IndicatorRuleError =
  | "macdFastBelowSlow"
  | "rsiLowerBelowUpper";

export function indicatorRuleError(instance: OryonIndicatorInstance): IndicatorRuleError | null {
  switch (instance.type) {
    case "macd":
      return instance.fast >= instance.slow ? "macdFastBelowSlow" : null;
    case "rsi":
      return instance.lower >= instance.upper ? "rsiLowerBelowUpper" : null;
    default:
      return null;
  }
}
