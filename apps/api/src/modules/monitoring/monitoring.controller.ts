/**
 * Monitoring controller (Phase 17) - the user-facing observability surface.
 *
 * Access model: Monitoring is an administrator-only operational surface.
 * Global JwtAuthGuard authenticates every request; AdminGuard then checks the
 * persisted ADMIN role. Aggregates remain scoped to the authenticated admin.
 *
 * Rate limiting (§53): the existing global ThrottlerGuard covers these
 * endpoints (overview polling at 12 s sits far below the default budget) -
 * no second limiter is introduced.
 *
 * Mutation surface (§50): ONLY the caller's own threshold document
 * (PATCH). The job-run route deliberately accepts nothing - Monitoring
 * stays observational and never fabricates runs.
 */
import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { HttpStatus } from "@nestjs/common";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { AdminGuard } from "../../shared/auth/jwt-auth.guard";
import {
  monitoringThresholdsUpdateInputSchema,
  type MonitoringThresholdsUpdateInput,
} from "../../shared/contracts";
import { MonitoringService } from "./monitoring.service";

@Controller("monitoring")
@UseGuards(AdminGuard)
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get("overview")
  async overview(@CurrentUser() principal: AuthPrincipal) {
    return this.monitoring.overview(principal.userId);
  }

  @Patch("thresholds")
  async updateThresholds(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(monitoringThresholdsUpdateInputSchema)) input: MonitoringThresholdsUpdateInput,
  ) {
    return this.monitoring.updateThresholds(principal.userId, input);
  }

  @Post("jobs/:jobId/run")
  async runJob(@Param("jobId") jobId: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = this.monitoring.requestJobRun(jobId);
    // Honest gating (mock parity): an unaccepted run is a 409, not a 404 -
    // the client surfaces `accepted:false` with its message either way.
    reply.status(HttpStatus.CONFLICT);
    return result;
  }
}
