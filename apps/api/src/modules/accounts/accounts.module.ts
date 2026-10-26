/**
 * Accounts bounded context (Phase 3) - Accounts / Trading Connectivity.
 *
 * Supporting subdomain (Phase 0 §I): follows the established flat
 * application-service + one-repository + thin-controllers discipline, with
 * the provider abstraction isolating ALL provider-specific code behind
 * TradingProviderAdapter (§9–§11).
 *
 * Reuse over reinvention: error taxonomy, ZodValidationPipe, auth guard +
 * principal decorator come from the Foundation; security-relevant facts are
 * recorded through the shared append-only ledger port (SecurityEventModule,
 * Phase 16) - never through a second audit system; the sliding-window rate
 * limiter class is reused with accounts-specific vectors; AES-256-GCM
 * encryption is parameterized per-domain (ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY
 * ≠ AUTH_MFA_ENCRYPTION_KEY). The repository is exported as the context's
 * narrow read contract - the Monitoring module (Phase 17 §26) consumes sync
 * health from HERE instead of duplicating synchronization state.
 *
 * Provider registration (§57): the mock adapter is only registered when
 * config.accounts.mockProviderEnabled (default: on outside production).
 * Registering a real adapter later = implement the interface + add it to the
 * factory below + register in the registry - nothing else changes (§60).
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
import { BrokerIdentificationService } from "./broker-identification.service";
import { MockTradingProviderAdapter } from "./providers/mock-trading.provider";
import { OandaRestProviderAdapter } from "./providers/oanda/oanda-rest.provider";
import { DerivWsProviderAdapter } from "./providers/deriv/deriv-ws.provider";
import { Mt5BridgeProviderAdapter } from "./providers/mt5-bridge/mt5-bridge.provider";
import { Mt5BridgeIngestService } from "./mt5-bridge-ingest.service";
import { TradingAccountService } from "./trading-account.service";
import { TradingSyncService } from "./trading-sync.service";
import { AccountsRateLimiterService } from "./accounts-rate-limiter.service";
import { AccountsSyncSchedulerService } from "./accounts-sync-scheduler.service";
import { AccountsController } from "./accounts.controller";
import { TradingAccountsController } from "./trading-accounts.controller";
import { BrokerController } from "./broker.controller";

/**
 * Phase 04: the transport abort backstop fires ABOVE the orchestrator
 * watchdog (providerTimeoutMs → CONNECTION_TIMEOUT) so the watchdog stays
 * the authoritative error class while the socket is still guaranteed to be
 * released. The 2 s grace keeps the two timers from racing on slow responses.
 */
const TRANSPORT_ABORT_GRACE_MS = 2_000;

const providerRegistryProvider: Provider = {
  provide: ProviderRegistryService,
  useFactory: (
    config: AppConfig,
    repository: AccountsRepository,
  ): ProviderRegistryService => {
    const adapters = [
      // V1: mock adapter only (§55/§57). Real adapters (MT5 bridge, Deriv,
      // cTrader, …) register here when their integrations actually exist -
      // never before (§56: do not fake real connectivity).
      ...(config.accounts.mockProviderEnabled ? [new MockTradingProviderAdapter()] : []),
      // Phase 03: the FIRST real adapter - explicit opt-in per deployment
      // (a real provider is never enabled by default). No credential lives
      // here: the adapter receives the vault-decrypted token per request.
      ...(config.accounts.oandaEnabled
        ? [
            new OandaRestProviderAdapter({
              restUrlOverride: config.accounts.oandaRestUrlOverride,
              requestTimeoutMs: config.accounts.providerTimeoutMs + TRANSPORT_ABORT_GRACE_MS,
            }),
          ]
        : []),
      // Phase 07: the SECOND real adapter - same §57 opt-in posture. One
      // documented dependency install (ws, the official WS client), a
      // deployment-owned app id, and the user's Read-scope API token; the
      // adapter never holds a credential and never sends a write verb.
      ...(config.accounts.derivEnabled
        ? [
            new DerivWsProviderAdapter({
              wsUrlOverride: config.accounts.derivWsUrlOverride,
              appId: config.accounts.derivAppId,
              requestTimeoutMs: config.accounts.providerTimeoutMs + TRANSPORT_ABORT_GRACE_MS,
            }),
          ]
        : []),
      // Phase 08: the THIRD real adapter - the FIRST push-based one. Same
      // §57 opt-in posture. No outbound dependency at all: the user's MT5
      // terminal (EuforiaBridge EA) pushes signed events to the ingest
      // endpoint; the adapter serves the server-persisted log back to the
      // pull orchestrator. Broker credentials never leave the terminal.
      ...(config.accounts.mt5BridgeEnabled
        ? [new Mt5BridgeProviderAdapter(repository)]
        : []),
    ];
    return new ProviderRegistryService(adapters);
  },
  inject: [APP_CONFIG, AccountsRepository],
};

@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, SecurityEventModule, IdentityModule],
  // Phase 02 hygiene (Phase 00 "register-or-delete" decision): the rich
  // /trading-accounts surface (list-with-details + PATCH rename) is now
  // REGISTERED and consumed by the Accounts UI. GET /accounts remains the
  // journal identity list; the canonical documented surface stays
  // accounts.controller.ts (doc C §2.1) - /trading-accounts adds the two
  // routes /accounts lacks instead of duplicating them silently.
  controllers: [AccountsController, TradingAccountsController, BrokerController],
  providers: [
    AccountsRepository,
    CredentialsEncryptionService,
    providerRegistryProvider,
    // Phase 07 - universal broker layer: catalog + connect-time
    // identification ("which broker is this?"). Depends only on the registry.
    BrokerIdentificationService,
    TradingSyncService,
    TradingAccountService,
    // Phase 08 - the public bridge ingest (HMAC + idempotency + activation).
    Mt5BridgeIngestService,
    AccountsRateLimiterService,
    // Phase 05 - scheduled synchronization + stale-run recovery (§9/§15).
    // The timer itself is config-gated (ACCOUNTS_SYNC_SCHEDULER, default
    // off); the recovery sweep runs once at init regardless.
    AccountsSyncSchedulerService,
  ],
  exports: [AccountsRepository],
})
export class AccountsModule {}
