/**
 * /me controller — profile, the 9-domain preferences doc, deactivation and
 * scheduled deletion (shared api.ts profile section + settings.ts).
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import {
  profileUpdateInputSchema,
  preferenceDomainSchema,
  resetPreferencesInputSchema,
  deactivateAccountInputSchema,
  type ProfileUpdateInput,
  type PreferenceDomain,
  type ResetPreferencesInput,
  type DeactivateAccountInput,
} from "../../shared/contracts";
import { z } from "zod";
import { AccountService } from "./account.service";
import { IdentityRepository } from "./identity.repository";
import { UnauthorizedError } from "../../shared/errors/app-error";

const deleteConfirmationSchema = z.object({ confirmation: z.literal("DELETE") });

@Controller("me")
export class MeController {
  constructor(
    private readonly account: AccountService,
    private readonly repository: IdentityRepository,
  ) {}

  @Get()
  async profile(@CurrentUser() principal: AuthPrincipal) {
    return this.account.profile(await this.loadUser(principal.userId));
  }

  @Patch()
  async updateProfile(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(profileUpdateInputSchema)) input: ProfileUpdateInput,
  ) {
    const result = await this.account.updateProfile(await this.loadUser(principal.userId), input);
    return result.profile;
  }

  @Get("preferences")
  preferences(@CurrentUser() principal: AuthPrincipal) {
    return this.account.getPreferences(principal.userId);
  }

  @Patch("preferences/:domain")
  async updatePreferencesDomain(
    @CurrentUser() principal: AuthPrincipal,
    @Param("domain") domain: string,
    @Body() input: unknown,
  ) {
    const parsedDomain = preferenceDomainSchema.parse(domain) as PreferenceDomain;
    return this.account.updatePreferencesDomain(principal.userId, parsedDomain, input);
  }

  @Post("preferences/reset")
  @HttpCode(HttpStatus.OK)
  async resetPreferences(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(resetPreferencesInputSchema)) input: ResetPreferencesInput,
  ) {
    return this.account.resetPreferencesDomain(principal.userId, input.domain);
  }

  @Post("deactivate")
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(deactivateAccountInputSchema)) input: DeactivateAccountInput,
  ) {
    return this.account.deactivate(await this.loadUser(principal.userId), input.confirmation);
  }

  @Post("delete")
  @HttpCode(HttpStatus.OK)
  async requestDeletion(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(deleteConfirmationSchema)) input: { confirmation: "DELETE" },
  ) {
    return this.account.requestDeletion(await this.loadUser(principal.userId), input.confirmation);
  }

  private async loadUser(userId: string) {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedError("Not authenticated.", "INVALID_TOKEN");
    }
    return user;
  }
}
