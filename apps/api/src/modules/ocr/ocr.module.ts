/**
 * OCR / Screenshot Recognition bounded context (Phase 19).
 *
 * What OCR is (§4):
 *   - the ingestion + orchestration layer for trade screenshots: upload
 *     validation, storage, recognition job lifecycle, human review and
 *     confirmation;
 *   - the NestJS half of the Nest↔FastAPI boundary - NestJS stays
 *     authoritative (auth, ownership, persistence, audit, rate limiting,
 *     user-facing errors) while the FastAPI sidecar owns ONLY specialized
 *     image/OCR processing (§4).
 *
 * What OCR is NOT (§59 - architecture review):
 *   - not a second Trade entity: Trading Core owns the canonical Trade. The
 *     ONLY sanctioned OCR→Trade path is the Phase 21 confirmation bridge
 *     (OcrTradeImportService), which CALLS TradesService.createTrade - the
 *     canonical application service - and never writes a Trade row itself
 *     (§77); deleting a recognition never deletes the imported Trade.
 *   - not a second storage system (storage lives behind one port; the
 *     local-disk adapter ships in this build, MinIO/S3 can replace it);
 *   - not a second queue (processing is request-scoped, the Accounts-sync
 *     house pattern - no BullMQ/Redis in this build);
 *   - not a second audit system (SecurityEventService shared port, §48);
 *   - not a monitoring system (Phase 17 owns observability).
 *
 * Dependency graph (acyclic):
 *   OcrModule → TradesModule (canonical Trade creation - Phase 21 bridge)
 *             → AccountsModule (persisted default account resolution)
 *             → SecurityEventModule (shared event port)
 *             → PrismaModule (global), ConfigModule (global)
 *   Shared infrastructure: JwtAuthGuard, ThrottlerGuard, ZodValidationPipe,
 *   shared contracts barrel. The engine is resolved by factory:
 *     FastAPI sidecar (when OCR_SERVICE_URL + token are configured)
 *     else deterministic mock (test by default; explicit opt-in elsewhere)
 *     else an explicit unavailable adapter → OCR_UNAVAILABLE (honest
 *     degradation, never a fake result).
 */
import { Module, type Provider } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../../config/app-config";
import { AccountsModule } from "../accounts/accounts.module";
import { TradesModule } from "../trades/trades.module";
import { SecurityEventModule } from "../security/security-event.module";
import { ImageValidationService } from "./image/image-validation.service";
import { LocalDiskScreenshotStorage } from "./storage/local-disk-storage.adapter";
import { SCREENSHOT_STORAGE } from "./storage/screenshot-storage.port";
import {
  DeterministicOcrEngine,
  UnavailableOcrEngine,
} from "./engine/deterministic-ocr.engine";
import { FastApiOcrEngine } from "./engine/fastapi-ocr.engine";
import { OCR_ENGINE } from "./engine/ocr-engine.port";
import { OcrRateLimiterService } from "./ocr-rate-limiter.service";
import { OcrCollectionRepository, OcrRepository, OcrSetRepository } from "./ocr.repository";
import { OcrService } from "./ocr.service";
import { OcrSetService } from "./ocr-set.service";
import { OcrCollectionService } from "./ocr-collection.service";
import { OcrTradeImportService } from "./ocr-trade-import.service";
import { OcrOpsService } from "./ocr-ops.service";
import { OcrRetentionService } from "./ocr-retention.service";
import { OcrController } from "./ocr.controller";

/** One engine wins: the real sidecar when configured, else the mock, else "unavailable". */
export const ocrEngineProvider: Provider = {
  provide: OCR_ENGINE,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig) => {
    if (config.ocr.serviceUrl && config.ocr.serviceToken) {
      return new FastApiOcrEngine(config);
    }
    if (config.ocr.mockEngineEnabled) {
      return new DeterministicOcrEngine();
    }
    return new UnavailableOcrEngine();
  },
};

@Module({
  imports: [AccountsModule, TradesModule, SecurityEventModule],
  controllers: [OcrController],
  providers: [
    OcrService,
    OcrSetService,
    OcrCollectionService,
    OcrTradeImportService,
    OcrOpsService,
    OcrRetentionService,
    OcrRepository,
    OcrSetRepository,
    OcrCollectionRepository,
    OcrRateLimiterService,
    ImageValidationService,
    {
      provide: SCREENSHOT_STORAGE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new LocalDiskScreenshotStorage(config),
    },
    ocrEngineProvider,
  ],
  exports: [],
})
export class OcrModule {}
