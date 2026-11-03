/**
 * OCR retention (engine quality §4.2) - auto-purge of stored screenshot
 * binaries after the configured window.
 *
 * Discipline:
 *   - METADATA ROWS NEVER DIE: purging removes the BINARY only and stamps
 *     `screenshotPurgedAt`. Recognition records keep serving history,
 *     idempotency (§32) and analytics; the image route answers 404 once
 *     purged and the DTO reports `asset.purged`.
 *   - CONFIRMED and FAILED rows are purge-eligible after `retentionDays`;
 *     REVIEW_REQUIRED keeps a 2× grace window (the user may still need the
 *     screenshot to finish the review) - then it purges too. QUEUED/
 *     PROCESSING rows are never touched (live pipeline state).
 *   - The binary removal goes through the SAME storage port as everything
 *     else (§6) and happens AFTER the row stamp - a crash between the two
 *     leaves an orphan FILE, never a lying metadata row (§50 discipline).
 *   - 0 disables retention entirely (documented contract of the env var).
 *
 * Scheduling: a plain in-process interval (6 h cadence, first pass after
 * 1 min) - the same house tradeoff as the rate limiters (single-instance
 * monolith; no BullMQ/Redis in this build). Cleanup is idempotent, so a
 * restart re-running an interval is harmless.
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../../config/app-config";
import { SCREENSHOT_STORAGE, type ScreenshotStorage } from "./storage/screenshot-storage.port";
import { OcrRepository } from "./ocr.repository";

const PURGE_BATCH = 100;
const TICK_MS = 6 * 60 * 60 * 1000; // 6 hours
const FIRST_DELAY_MS = 60 * 1000; // 1 minute after boot

@Injectable()
export class OcrRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrRetentionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private firstPass: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly repository: OcrRepository,
    @Inject(SCREENSHOT_STORAGE) private readonly storage: ScreenshotStorage,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.ocr.retentionDays <= 0) {
      this.logger.log("screenshot retention disabled (OCR_RETENTION_DAYS=0)");
      return;
    }
    this.firstPass = setTimeout(() => {
      void this.purgeExpired();
    }, FIRST_DELAY_MS);
    this.timer = setInterval(() => {
      void this.purgeExpired();
    }, TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstPass) clearTimeout(this.firstPass);
  }

  /**
   * One purge pass - idempotent, batched, best-effort per row. Exposed as a
   * public method so tests and the runtime verification script can drive it
   * deterministically.
   */
  async purgeExpired(now = new Date()): Promise<{ purged: number; freedBytes: number }> {
    const retentionDays = this.config.ocr.retentionDays;
    if (retentionDays <= 0) return { purged: 0, freedBytes: 0 };

    const hardCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const graceCutoff = new Date(now.getTime() - 2 * retentionDays * 24 * 60 * 60 * 1000);

    let purged = 0;
    let freedBytes = 0;
    for (;;) {
      const rows = await this.repository.findPurgeable(hardCutoff, graceCutoff, PURGE_BATCH);
      if (rows.length === 0) break;
      for (const row of rows) {
        const stamped = await this.repository.markScreenshotPurged(row.id);
        if (!stamped) continue; // concurrent transition won - leave it be
        // AFTER the row stamp (§50): a storage failure here leaves an orphan
        // file, never a metadata row claiming a binary it no longer has.
        if (row.storageKey) {
          await this.storage.delete(row.storageKey).catch(() => undefined);
        }
        purged += 1;
        freedBytes += row.sizeBytes;
      }
      if (rows.length < PURGE_BATCH) break;
    }
    if (purged > 0) {
      this.logger.log(`retention purge: ${purged} screenshot(s) removed, ${freedBytes} bytes freed`);
    }
    return { purged, freedBytes };
  }
}
