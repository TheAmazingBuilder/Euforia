/**
 * Health & system module (infrastructure-oriented, Phase 1 mandate §17/§22).
 *
 * Endpoints (deliberately OUTSIDE /api/v1 versioning - infrastructure):
 *   GET /health        → app-level status (cheap, no DB): monitoring/UI target.
 *   GET /health/live   → liveness: process is up and able to respond.
 *   GET /health/ready  → readiness: app + required dependencies (database).
 *
 * Payloads never expose secrets, connection strings, or infrastructure
 * internals (§17). A failing database makes /health/ready return 503 with a
 * plain `down` status - raw errors are logged server-side only.
 *
 * This module must NOT become a general-purpose utility module: no business
 * logic, no domain concepts.
 */
import { Controller, Get, Inject, Optional, ServiceUnavailableException, VERSION_NEUTRAL } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../../shared/auth/public.decorator";
import { APP_CONFIG, type AppConfig } from "../../config/app-config";
import { COSMOZ_VERSION } from "../../shared/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { ROOT_LOGGER, type RootLogger } from "../logging/logger.factory";

const BOOTED_AT = Date.now();

@Controller({ path: "health", version: VERSION_NEUTRAL })
@SkipThrottle()
@Public()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
  ) {}

  /** App-level status - no dependency checks. */
  @Get()
  health() {
    return {
      status: "ok",
      service: "cosmoz-api",
      version: COSMOZ_VERSION,
      env: this.config.env,
      uptimeSeconds: Math.round((Date.now() - BOOTED_AT) / 1000),
    };
  }

  /** Liveness - if this fails, the process is beyond recovery. */
  @Get("live")
  live() {
    return { status: "ok" };
  }

  /** Readiness - includes required infrastructure (database). */
  @Get("ready")
  async ready() {
    const databaseUp = await this.prisma.ping();
    if (!databaseUp) {
      // Log details server-side; expose only a plain status to clients.
      this.logger?.warn({ requestId: "health" }, "readiness check failed: database unreachable");
      throw new ServiceUnavailableException();
    }
    return {
      status: "ok",
      checks: { database: "up" },
    };
  }
}
