/**
 * Trading Core bounded context (Phase 4) — the canonical journal domain.
 *
 * The journal trade is a FIRST-CLASS business object distinct from both the
 * broker position and the broker deal (§1): Cosmoz owns its identity (§7),
 * the source is explicit (§8), external mappings stay separate (§9), and
 * every money computation flows through ONE authoritative implementation
 * (trade-calculations, §46).
 *
 * Reuse over reinvention (§3): the error taxonomy, ZodValidationPipe, auth
 * guard, shared wire contracts (@cosmoz/shared — the same schemas the
 * frontend and MSW mocks validate against), the magic-byte image sniffing
 * helper (OCR's pure utility) and the Accounts repository's narrow read
 * contract (ADR-0003) are all consumed — nothing is rebuilt. NO TradeExecution
 * table exists on purpose: the broker executions ARE Phase 3's TradingDeal
 * rows, read through the Accounts module boundary (§26).
 *
 * Security: routes are all authenticated (global guard), ownership is
 * enforced per use case from the auth principal (§23/§24), no execution
 * capability is introduced anywhere (§68), and screenshot binaries stay in
 * the storage adapter (§39) with magic-byte validation.
 */
import { Module } from "@nestjs/common";
import { join } from "node:path";
import { ConfigModule } from "../../config/config.module";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { LoggingModule } from "../../infrastructure/logging/logging.module";
import { IdentityModule } from "../identity/identity.module";
import { AccountsModule } from "../accounts/accounts.module";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import { TradesRepository } from "./trades.repository";
import { TradesService } from "./trades.service";
import { TradeReconstructionService } from "./trade-reconstruction.service";
import { TradeScreenshotStorage } from "./trade-screenshots.storage";
import { TradesController, InstrumentsController, TradeViewsController } from "./trades.controller";

const screenshotStorageProvider = {
  provide: TradeScreenshotStorage,
  useFactory: (config: AppConfig): TradeScreenshotStorage =>
    new TradeScreenshotStorage(join(process.cwd(), config.trades.screenshotsRoot)),
  inject: [APP_CONFIG],
};

@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, IdentityModule, AccountsModule],
  controllers: [InstrumentsController, TradesController, TradeViewsController],
  providers: [
    TradesRepository,
    TradesService,
    TradeReconstructionService,
    screenshotStorageProvider,
  ],
})
export class TradesModule {}
