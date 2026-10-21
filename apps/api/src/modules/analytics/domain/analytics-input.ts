/**
 * Analytics engine input shapes (Phase 8) — normalized, pre-resolved rows.
 *
 * The application service owns resolution (catalog symbols → instrument
 * ids, review→plan strategy attribution, canonical planned RR) and hands
 * the PURE engine plain numbers/strings so aggregation stays deterministic
 * and unit-testable. All numbers are pre-parsed from Decimal strings with
 * the canonical "missing R = 0" rule; money stays null when unparsable.
 */

export interface AnalyticsAccountRow {
  id: string;
  name: string;
  currency: string;
  startingBalance: number;
  isDefault: boolean;
}

export interface AnalyticsInstrumentRow {
  /** Catalog id, or the deterministic v5 group id for uncataloged symbols. */
  id: string;
  symbol: string;
  assetClass: string;
  /** Quote currency of the CATALOG instrument (Phase 13 §21 join), null
   * when the symbol is uncataloged — uncataloged trades never correlate
   * with economic events (honest, mock parity: unknown instrument → no
   * phase classification). */
  quoteCurrency: string | null;
}

/**
 * One closed trade as the engine sees it — canonical Trading Core values
 * only (Phase 8 §2: Analytics consumes domain truth, it never re-derives
 * P&L/R). Behavioral/journal fields the backend does not own are honestly
 * absent (emotionBefore/confidence/mfe/mae/tags — §8: no speculative data).
 */
export interface AnalyticsTradeRow {
  id: string;
  accountId: string;
  /** Raw journal symbol (verbatim convention). */
  symbol: string;
  /** Catalog id by symbol match, else the deterministic v5 group id. */
  instrumentId: string;
  /** Catalog display symbol, else the raw journal symbol. */
  instrumentSymbol: string;
  /** Catalog asset class, else "?". */
  assetClass: string;
  /** Quote currency of the resolved instrument (Phase 13 §21 join), null
   * when uncataloged — uncataloged trades never correlate with economic
   * events (honest, mock parity: unknown instrument → unclassified). */
  quoteCurrency: string | null;
  direction: string;
  exitReason: string | null;
  /** ISO-8601 instants (UTC). */
  entryAtIso: string;
  exitAtIso: string | null;
  entryAtMs: number;
  exitAtMs: number | null;
  /** User trading-day key the journal already persisted (tz-resolved). */
  tradingDate: string;
  /** Pre-parsed pnlNet — missing = 0 (canonical R/P&L rule). */
  pnlNet: number;
  /** Pre-parsed rMultiple — missing = 0. */
  rMultiple: number;
  /** riskAmount strictly > 0 (parsed), else null. */
  riskMoney: number | null;
  /** Wire-faithful decimal strings for echo blocks (tilt timeline). */
  riskAmountRaw: string | null;
  rMultipleRaw: string | null;
  /**
   * Canonical planned RR: review.planSnapshot.rrRatio ?? origin plan
   * rrRatio — never recomputed here (§29: no second RR engine).
   */
  plannedRR: number | null;
  /** Review verdict when a COMPLETED review exists, else null. */
  followedPlan: boolean | null;
  /** Attribution through Trade → review.originTradePlanId → plan.strategyId. */
  strategyId: string | null;
}
