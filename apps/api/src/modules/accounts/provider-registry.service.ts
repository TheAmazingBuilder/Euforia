/**
 * Provider registry (Phase 3 §44).
 *
 * The single place that maps a providerId to its adapter. Adding a new
 * provider means: implement TradingProviderAdapter, register it here —
 * nothing else in the domain changes (§60).
 *
 * The registry is constructed with the adapters enabled for the current
 * environment (§57): the mock adapter is only registered when
 * config.accounts.mockProviderEnabled, so a production deployment without
 * real adapters simply has no connectable providers (honest 422 on connect)
 * instead of silently serving mock data.
 */
import { Injectable } from "@nestjs/common";
import type { TradingProviderDescriptor } from "../../shared/contracts";
import { BusinessRuleError } from "../../shared/errors/app-error";
import { TRADING_ERROR_CODES } from "../../shared/contracts";
import type { TradingProviderAdapter } from "./provider.types";

@Injectable()
export class ProviderRegistryService {
  constructor(private readonly adapters: readonly TradingProviderAdapter[]) {}

  /** All registered provider descriptors (metadata only — no secrets). */
  list(): TradingProviderDescriptor[] {
    return this.adapters.map((adapter) => adapter.descriptor);
  }

  get(providerId: string): TradingProviderAdapter | undefined {
    return this.adapters.find((adapter) => adapter.descriptor.providerId === providerId);
  }

  /** Resolve or fail with the stable UNSUPPORTED_PROVIDER code (§36). */
  require(providerId: string): TradingProviderAdapter {
    const adapter = this.get(providerId);
    if (!adapter) {
      throw new BusinessRuleError(
        "This trading provider is not supported.",
        TRADING_ERROR_CODES.UNSUPPORTED_PROVIDER,
      );
    }
    return adapter;
  }
}
