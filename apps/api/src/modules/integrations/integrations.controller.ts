import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import {
  integrationConnectInputSchema,
  integrationsOverviewResponseSchema,
  integrationProviderSchema,
  integrationSyncResponseSchema,
  integrationTestResponseSchema,
  integrationDisconnectResponseSchema,
  webhookDeliverResponseSchema,
  webhookSimulateInputSchema,
} from "../../shared/contracts";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { AppError } from "../../shared/errors/app-error";
import type { z } from "zod";
import { IntegrationsService, type Fail } from "./integrations.service";

/**
 * Integration Hub controller (B14) - HTTP surface over the platform layer.
 * Mirrors `mocks/handlers/integrations.ts` exactly (6 routes). Provider ids
 * are catalog SLUGS ("deriv", "wh-macro") - deliberately NOT uuids, matching
 * the shared contract.
 */

/** Discriminated Result → AppError (the taxonomy's only throw path). */
function toFailure(fail: Fail): never {
  throw new AppError("BusinessRule", fail.status, fail.message, fail.code);
}

@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  /** GET /integrations/overview - the hub's single aggregate. */
  @Get("overview")
  async overview(@CurrentUser() principal: AuthPrincipal) {
    const result = await this.integrations.overview(principal.userId);
    return integrationsOverviewResponseSchema.parse(result);
  }

  /** POST /integrations/providers/:providerId/connect { vaultRef } (§25). */
  @Post("providers/:providerId/connect")
  @HttpCode(HttpStatus.OK)
  async connect(
    @CurrentUser() principal: AuthPrincipal,
    @Param("providerId") providerId: string,
    @Body(new ZodValidationPipe(integrationConnectInputSchema))
    payload: z.infer<typeof integrationConnectInputSchema>,
  ) {
    const result = await this.integrations.connect(principal.userId, providerId, payload);
    if (!result.ok) toFailure(result);
    return integrationProviderSchema.parse(result.value);
  }

  /** POST /integrations/providers/:providerId/disconnect (§26). */
  @Post("providers/:providerId/disconnect")
  @HttpCode(HttpStatus.OK)
  async disconnect(
    @CurrentUser() principal: AuthPrincipal,
    @Param("providerId") providerId: string,
  ) {
    const result = await this.integrations.disconnect(principal.userId, providerId);
    if (!result.ok) toFailure(result);
    return integrationDisconnectResponseSchema.parse(result.value);
  }

  /** POST /integrations/providers/:providerId/test (§27 named checks). */
  @Post("providers/:providerId/test")
  @HttpCode(HttpStatus.OK)
  async test(
    @CurrentUser() principal: AuthPrincipal,
    @Param("providerId") providerId: string,
  ) {
    const result = await this.integrations.test(principal.userId, providerId);
    if (!result.ok) toFailure(result);
    return integrationTestResponseSchema.parse(result.value);
  }

  /** POST /integrations/providers/:providerId/sync (§13/§16/§17). */
  @Post("providers/:providerId/sync")
  @HttpCode(HttpStatus.OK)
  async sync(
    @CurrentUser() principal: AuthPrincipal,
    @Param("providerId") providerId: string,
  ) {
    const result = await this.integrations.sync(principal.userId, providerId);
    if (!result.ok) toFailure(result);
    return integrationSyncResponseSchema.parse(result.value);
  }

  /** POST /integrations/webhooks/:endpointId/simulate (§12 pipeline test). */
  @Post("webhooks/:endpointId/simulate")
  @HttpCode(HttpStatus.OK)
  async simulateWebhook(
    @CurrentUser() principal: AuthPrincipal,
    @Param("endpointId") endpointId: string,
    @Body(new ZodValidationPipe(webhookSimulateInputSchema))
    payload: z.infer<typeof webhookSimulateInputSchema>,
  ) {
    const result = await this.integrations.simulateWebhook(principal.userId, endpointId, payload);
    if (!result.ok) toFailure(result);
    return webhookDeliverResponseSchema.parse(result.value);
  }
}
