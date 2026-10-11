/**
 * Infrastructure adapters for the Trade Planning domain ports (Phase 5).
 *
 * CatalogInstrumentSpecsProvider — reads the InstrumentSpecification catalog
 * table (exact symbol match, active rows only). The catalog is the
 * authoritative source (§15): values live in reference data, never in code.
 *
 * PassthroughFxRateProvider — SAME-CURRENCY conversions only (rate = 1).
 * Cross-currency requests return null: Phase 5 will not fabricate exchange
 * rates (§16). A future FX bounded context plugs in behind the same port.
 *
 * NoRiskLimitsProvider — the §22 seam with NO invented portfolio rules:
 * a future Portfolio/Account Risk bounded context supplies real limits.
 */
import { Injectable } from "@nestjs/common";
import { Decimal } from "decimal.js";

import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type {
  FxRateProvider,
  InstrumentSpecification,
  InstrumentSpecificationProvider,
  RiskLimitProvider,
  RiskLimits,
} from "../domain/ports";

@Injectable()
export class CatalogInstrumentSpecsProvider implements InstrumentSpecificationProvider {
  constructor(private readonly prisma: PrismaService) {}

  async findSpecification(symbol: string): Promise<InstrumentSpecification | null> {
    const row = await this.prisma.instrumentSpecification.findFirst({
      where: { symbol, isActive: true },
    });
    if (row === null) return null;
    return {
      symbol: row.symbol,
      name: row.name,
      assetClass: row.assetClass,
      quoteCurrency: row.quoteCurrency,
      pipSize: new Decimal(row.pipSize.toFixed()),
      contractSize: new Decimal(row.contractSize.toFixed()),
      minVolume: row.minVolume === null ? null : new Decimal(row.minVolume.toFixed()),
      maxVolume: row.maxVolume === null ? null : new Decimal(row.maxVolume.toFixed()),
      volumeStep: row.volumeStep === null ? null : new Decimal(row.volumeStep.toFixed()),
    };
  }

  /** Phase 8: full active-catalog projection for Analytics symbol resolution. */
  async listSpecifications(): Promise<
    Array<{ id: string; symbol: string; name: string; assetClass: string; quoteCurrency: string }>
  > {
    const rows = await this.prisma.instrumentSpecification.findMany({
      where: { isActive: true },
      select: { id: true, symbol: true, name: true, assetClass: true, quoteCurrency: true },
      orderBy: { symbol: "asc" },
    });
    return rows;
  }
}

@Injectable()
export class PassthroughFxRateProvider implements FxRateProvider {
  async rate(fromCurrency: string, toCurrency: string): Promise<Decimal | null> {
    if (fromCurrency === toCurrency) return new Decimal(1);
    // No FX service exists yet (§16): never fabricate rates — the caller
    // surfaces CURRENCY_CONVERSION_UNAVAILABLE instead.
    return null;
  }
}

@Injectable()
export class NoRiskLimitsProvider implements RiskLimitProvider {
  async limitsFor(_userId: string, _accountId: string): Promise<RiskLimits> {
    return { maxRiskPercentPerTrade: null, maxRiskAmountPerTrade: null };
  }
}
