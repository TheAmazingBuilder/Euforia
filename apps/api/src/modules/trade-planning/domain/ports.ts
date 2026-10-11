/**
 * Trade Planning domain ports (Phase 5 §15/§16/§22).
 *
 * Pure TypeScript interfaces the DOMAIN depends on — implementations live in
 * the module's infrastructure adapters and are wired by the application layer.
 * The domain imports NO NestJS, NO Prisma, NO HTTP: the risk engine consumes
 * plain data + these port TYPES, which keeps §59's dependency direction
 * intact and lets future bounded contexts (Instrument Catalog, FX, Portfolio
 * Risk) plug in without touching the engine.
 */
import { Decimal } from "decimal.js";

/**
 * Provider/instrument parameters the risk engine needs (§15). Values come
 * from an authoritative source (catalog table / provider configuration) —
 * NEVER from constants inside business logic.
 */
export interface InstrumentSpecification {
  /** Exact ticker as entered on plans (verbatim symbol convention). */
  symbol: string;
  name: string;
  assetClass: string;
  /** Currency the instrument is quoted in. */
  quoteCurrency: string;
  /** Price increment of one pip (e.g. "0.0001" EURUSD). */
  pipSize: Decimal;
  /** Units per lot/contract (e.g. 100000 EURUSD, 100 XAUUSD, 1 indices). */
  contractSize: Decimal;
  /** Broker/provider volume constraints — null = unconstrained. */
  minVolume: Decimal | null;
  maxVolume: Decimal | null;
  volumeStep: Decimal | null;
}

/** Resolution seam for instrument specifications (§15 — injectable). */
export interface InstrumentSpecificationProvider {
  /** Exact symbol match; null when the catalog has no active row. */
  findSpecification(symbol: string): Promise<InstrumentSpecification | null>;
  /**
   * Full active catalog (Phase 8 additive): Analytics resolves journal
   * symbols to {id, symbol, assetClass} projections in ONE read. Consumers
   * must not mutate the returned rows.
   */
  listSpecifications(): Promise<
    Array<{ id: string; symbol: string; name: string; assetClass: string; quoteCurrency: string }>
  >;
}

/**
 * Currency conversion seam (§16). The architecture makes the dependency
 * explicit: when a plan's instrument quote currency differs from the account
 * currency, monetary risk requires a rate. Implementations must NEVER
 * fabricate rates — returning null surfaces CURRENCY_CONVERSION_UNAVAILABLE
 * instead of a fake number.
 */
export interface FxRateProvider {
  /**
   * Multiplier that converts an amount FROM `fromCurrency` TO `toCurrency`,
   * or null when no trustworthy rate is available. Same-currency converts
   * return exactly 1.
   */
  rate(fromCurrency: string, toCurrency: string): Promise<Decimal | null>;
}

/**
 * Account-level risk limits seam (§22). Phase 5 invents NO portfolio rules —
 * the default provider returns no limits; a future Portfolio/Account Risk
 * bounded context plugs in here without changing the planner.
 */
export interface RiskLimits {
  /** Maximum planned risk per trade, as % of account balance. */
  maxRiskPercentPerTrade: Decimal | null;
  /** Maximum planned money risk per trade, in account currency. */
  maxRiskAmountPerTrade: Decimal | null;
}

export interface RiskLimitProvider {
  limitsFor(userId: string, accountId: string): Promise<RiskLimits>;
}
