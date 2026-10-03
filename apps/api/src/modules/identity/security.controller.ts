/**
 * Security controller — account-protection endpoints (shared security.ts).
 * Requires an authenticated session; sensitive mutations additionally
 * consume a single-use re-authentication token (body `reauthToken`).
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { z } from "zod";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { UnauthorizedError } from "../../shared/errors/app-error";
import {
  reauthInputSchema,
  passwordChangeInputSchema,
  twoFactorConfirmInputSchema,
  sensitiveActionInputSchema,
  sessionRevokeInputSchema,
  apiKeyCreateInputSchema,
  type ReauthInput,
  type PasswordChangeInput,
  type TwoFactorConfirmInput,
  type SensitiveActionInput,
  type SessionRevokeInput,
  type ApiKeyCreateInput,
} from "../../shared/contracts";
import { SecurityService } from "./security.service";
import { MfaService } from "./mfa.service";
import { IdentityRepository, type UserRow } from "./identity.repository";

/**
 * Missing reauthToken must reach the HANDLER (contract: 401
 * INVALID_REAUTH_TOKEN, mock §13) — so the pipe-level schemas accept it as
 * optional and ReauthService enforces presence/consumption.
 */
const sensitiveOptional = sensitiveActionInputSchema.extend({
  reauthToken: z.string().min(1).optional(),
});
const passwordChangeOptional = passwordChangeInputSchema.extend({
  reauthToken: z.string().min(1).optional(),
});

@Controller("security")
export class SecurityController {
  constructor(
    private readonly security: SecurityService,
    private readonly mfa: MfaService,
    private readonly repository: IdentityRepository,
  ) {}

  /** Load the full user row for services (they own reauth/session logic). */
  private async loadUser(userId: string): Promise<UserRow> {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      // Authenticated principal without a row — treat as unauthenticated.
      throw new UnauthorizedError("Not authenticated.", "INVALID_TOKEN");
    }
    return user;
  }

  @Get("overview")
  async overview(@CurrentUser() principal: AuthPrincipal) {
    return this.security.overview(await this.loadUser(principal.userId), principal.sessionId);
  }

  @Post("reauth")
  @HttpCode(HttpStatus.OK)
  async reauth(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(reauthInputSchema)) input: ReauthInput,
  ) {
    return this.security.reauthenticate(await this.loadUser(principal.userId), input.password);
  }

  @Post("password")
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(passwordChangeOptional)) input: PasswordChangeInput,
  ) {
    return this.security.changePassword(await this.loadUser(principal.userId), principal.sessionId, input);
  }

  @Post("2fa/enable")
  @HttpCode(HttpStatus.OK)
  async enable2fa(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(sensitiveOptional)) input: SensitiveActionInput,
  ) {
    return this.mfa.enable(await this.loadUser(principal.userId), input.reauthToken);
  }

  @Post("2fa/confirm")
  @HttpCode(HttpStatus.OK)
  async confirm2fa(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(twoFactorConfirmInputSchema)) input: TwoFactorConfirmInput,
  ) {
    return this.mfa.confirm(await this.loadUser(principal.userId), input.code);
  }

  @Post("2fa/disable")
  @HttpCode(HttpStatus.OK)
  async disable2fa(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(sensitiveOptional)) input: SensitiveActionInput,
  ) {
    return this.mfa.disable(await this.loadUser(principal.userId), input.reauthToken);
  }

  @Post("2fa/recovery/regenerate")
  @HttpCode(HttpStatus.OK)
  async regenerateRecoveryCodes(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(sensitiveOptional)) input: SensitiveActionInput,
  ) {
    return this.mfa.regenerateCodes(await this.loadUser(principal.userId), input.reauthToken);
  }

  @Post("api-keys")
  @HttpCode(HttpStatus.OK)
  async createApiKey(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(apiKeyCreateInputSchema)) input: ApiKeyCreateInput,
  ) {
    return this.security.createApiKey(await this.loadUser(principal.userId), input);
  }

  @Post("api-keys/:keyId/revoke")
  @HttpCode(HttpStatus.OK)
  async revokeApiKey(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(sensitiveOptional)) input: SensitiveActionInput,
    @Param("keyId") keyId: string,
  ) {
    return this.security.revokeApiKey(await this.loadUser(principal.userId), keyId, input.reauthToken);
  }

  @Post("sessions/revoke")
  @HttpCode(HttpStatus.OK)
  async revokeSessions(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(sessionRevokeInputSchema)) input: SessionRevokeInput,
  ) {
    return this.security.revokeSessions(await this.loadUser(principal.userId), principal.sessionId, input);
  }
}
