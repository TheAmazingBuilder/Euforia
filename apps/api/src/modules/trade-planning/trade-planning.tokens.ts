/**
 * DI tokens for the Trade Planning domain ports (Phase 5).
 * The application layer wires infrastructure adapters into the domain seams;
 * symbols keep the domain free of framework imports (§59).
 */
export const INSTRUMENT_SPECIFICATION_PROVIDER = Symbol("INSTRUMENT_SPECIFICATION_PROVIDER");
export const FX_RATE_PROVIDER = Symbol("FX_RATE_PROVIDER");
export const RISK_LIMIT_PROVIDER = Symbol("RISK_LIMIT_PROVIDER");
