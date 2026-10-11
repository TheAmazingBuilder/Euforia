import type { MarketInterval, OryonChartTemplate, OryonIndicatorInstance } from "@cosmoz/shared";

/**
 * Oryon chart template domain — pure apply-planning (Phase 6 spec §6, §7, §11).
 *
 * A template stores validated CONFIGURATION (chart type, optional timeframe,
 * indicator definitions with parameters and styles) — never runtime objects.
 * This module plans how a template lands on the live chart:
 *
 *  - indicator instances are re-checked against the SAME business rules the
 *    live chart enforces (MACD fast < slow, RSI lower < upper — injected as
 *    a validator so this module stays free of indicator-layer imports);
 *  - duplicate template-local ids collapse (first occurrence wins — a
 *    duplicate id is counted as skipped, never rendered twice);
 *  - the chart part applies wholesale (chart type) or partially (interval
 *    null = the timeframe is not part of the template).
 *
 * The plan lets the caller report an HONEST partial-application result
 * ("N of M indicators applied") instead of silently dropping entries.
 *
 * What applying NEVER touches (structurally — different stores entirely):
 * drawings, price alerts, broker positions, account state, panel
 * arrangement beyond the template's own chart fields (spec §11).
 */

export interface TemplateApplyPlan {
  /** Indicators that survived validation, ready for the chart's stack. */
  indicators: OryonIndicatorInstance[];
  /** Entries dropped (unsupported/invalid/duplicate) — reported, not silent. */
  skipped: number;
  /** How many entries the template carried in total. */
  total: number;
  /** Chart type the template restores (always defined). */
  chartType: OryonChartTemplate["chart"]["type"];
  /** Timeframe the template restores — null = leave the current one. */
  interval: MarketInterval | null;
}

/**
 * Plans a template application. `ruleError` is the indicator layer's
 * business-rule validator (returns a code or null) — the same function the
 * live store uses, so a template can never restore a configuration the
 * chart itself would reject.
 */
export function planTemplateApply(
  template: OryonChartTemplate,
  ruleError: (instance: OryonIndicatorInstance) => string | null,
): TemplateApplyPlan {
  const seenIds = new Set<string>();
  const indicators: OryonIndicatorInstance[] = [];
  let skipped = 0;

  for (const instance of template.indicators) {
    if (seenIds.has(instance.id)) {
      // Duplicate template-local identity — first occurrence wins.
      skipped += 1;
      continue;
    }
    seenIds.add(instance.id);
    if (ruleError(instance) !== null) {
      // Mathematically dishonest configuration — dropped, counted.
      skipped += 1;
      continue;
    }
    indicators.push(instance);
  }

  return {
    indicators,
    skipped,
    total: template.indicators.length,
    chartType: template.chart.type,
    interval: template.chart.interval,
  };
}
