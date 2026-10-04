/**
 * Accounts bounded context (Phase 3) — Accounts / Trading Connectivity.
 *
 * Supporting subdomain (Phase 0 §I): follows the established flat
 * application-service + one-repository + thin-controllers discipline, with
 * the provider abstraction isolating ALL provider-specific code behind
 * TradingProviderAdapter (§9–§11).
 *
 * Reuse over reinvention: error taxonomy, ZodValidationPipe, auth guard +
 * principal decorator come from the Foundation; security-relevant facts are
 * recorded through the shared append-only ledger port (SecurityEventModule,
 * Phase 16) — never through a second audit system; the sliding-window rate
 * limiter class is reused with accounts-specific vectors; AES-256-GCM
 * encryption is parameterized per-domain (ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY
 * ≠ AUTH_MFA_ENCRYPTION_KEY). The repository is exported as the context's
 * narrow read contract — the Monitoring module (Phase 17 §26) consumes sync
 * health from HERE instead of duplicating synchronization state.
 *
 * Provider registration (§57): the mock adapter is only registered when
 * config.accounts.mockProviderEnabled (default: on outside production).
 * Registering a real adapter later = implement the interface + add it to the
 * factory below + register in the registry — nothing else changes (§60).
 */
import { Module, type Provider } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { LoggingModule } from "../../infrastructure/logging/logging.module";
import { SecurityEventModule } from "../security/security-event.module";
import { IdentityModule } from "../identity/identity.module";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import { AccountsRepository } from "./accounts.repository";
import { CredentialsEncryptionService } from "./credentials-encryption.service";
import { ProviderRegistryService } from "./provider-registry.service";
import { MockTradingProviderAdapter } from "./providers/mock-trading.provider";
import { TradingAccountService } from "./trading-account.service";
import { TradingSyncService } from "./trading-sync.service";
import { AccountsRateLimiterService } from "./accounts-rate-limiter.service";
import { AccountsController } from "./accounts.controller";
import { BrokerController } from "./broker.controller";

const providerRegistryProvider: Provider = {
  provide: ProviderRegistryService,
  useFactory: (config: AppConfig): ProviderRegistryService => {
    const adapters = [
      // V1: mock adapter only (§55/§57). Real adapters (MT5 bridge, Deriv,
      // cTrader, …) register here when their integrations actually exist —
      // never before (§56: do not fake real connectivity).
      ...(config.accounts.mockProviderEnabled ? [new MockTradingProviderAdapter()] : []),
    ];
    return new ProviderRegistryService(adapters);
  },
  inject: [APP_CONFIG],
};

@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, SecurityEventModule, IdentityModule],
  controllers: [AccountsController, BrokerController],
  providers: [
    AccountsRepository,
    CredentialsEncryptionService,
    providerRegistryProvider,
    TradingSyncService,
    TradingAccountService,
    AccountsRateLimiterService,
  ],
  exports: [AccountsRepository],
})
export class AccountsModule {}
