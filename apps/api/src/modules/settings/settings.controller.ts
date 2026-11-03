/**
 * Settings presentation boundary (Phase 15 §12) - the preferences doc API.
 *
 * Routes are wire-compatible with the previous implementation inside the
 * Identity /me controller (frontend parity, §34): GET /me/preferences,
 * PATCH /me/preferences/:domain, POST /me/preferences/reset. The doc is a
 * per-user singleton aggregate - no POST/DELETE /settings, no :userId route
 * (§10: ownership always comes from the authenticated principal).
 *
 * Auth: the global JWT guard applies (no @Public here). Validation: the
 * domain route param is parsed against the shared domain enum; the body is
 * validated in the service against the per-domain shared schema so the
 * ValidationError → 400 mapping (with issues) stays centralized.
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { preferenceDomainSchema, type PreferenceDomain } from "../../shared/contracts";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { resetPreferencesInputSchema, type ResetPreferencesInput } from "../../shared/contracts";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { SettingsService } from "./settings.service";

@Controller("me/preferences")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async preferences(@CurrentUser() principal: AuthPrincipal) {
    return this.settings.getPreferences(principal.userId);
  }

  @Patch(":domain")
  async updateDomain(
    @CurrentUser() principal: AuthPrincipal,
    @Param("domain") domain: string,
    @Body() input: unknown,
  ) {
    const parsedDomain = preferenceDomainSchema.parse(domain) as PreferenceDomain;
    return this.settings.updatePreferencesDomain(principal.userId, parsedDomain, input);
  }

  @Post("reset")
  @HttpCode(HttpStatus.OK)
  async resetDomain(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(resetPreferencesInputSchema)) input: ResetPreferencesInput,
  ) {
    return this.settings.resetPreferencesDomain(principal.userId, input.domain);
  }
}
