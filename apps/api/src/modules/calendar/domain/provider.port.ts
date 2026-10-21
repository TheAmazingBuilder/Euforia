/**
 * Provider port (Phase 13 §5/§21) — the ONLY seam between the Calendar
 * domain and external economic-data providers.
 *
 * Architecture:
 *
 *     Calendar Domain
 *           │
 *     Provider Port  ← (this interface)
 *           │
 *   ┌───────┼────────┐
 *   │       │        │
 * Provider A  B     C      (infrastructure adapters)
 *
 * Providers own authentication, API requests, their own payloads, rate
 * limits, pagination and retries. The domain owns the normalized event.
 * Adapters are registered against {@link ECONOMIC_CALENDAR_PROVIDER} in
 * the module graph — swapping a provider never touches the domain.
 *
 * No external provider is assumed to exist (§4): the built-in adapter
 * ships deterministic sample data so the product works without
 * credentials, network access or vendor contracts.
 */
import type { ProviderEconomicEventPayload } from "./economic-event";

export interface EconomicCalendarProvider {
  /** Stable provider key used as sync identity (ex. "builtin-sample"). */
  readonly key: string;
  /**
   * Fetch the provider payload window [from, to] (UTC instants). Adapters
   * implement pagination/retries/rate limits internally; they return the
   * RAW wire payloads — normalization happens in the domain (§5).
   * Must never throw raw provider exceptions into callers: adapters map
   * failures to typed errors the sync run can record safely (§28).
   */
  fetchWindow(from: Date, to: Date): Promise<ProviderEconomicEventPayload[]>;
}

/** Injection token for the active economic-calendar provider adapter. */
export const ECONOMIC_CALENDAR_PROVIDER = Symbol("ECONOMIC_CALENDAR_PROVIDER");
