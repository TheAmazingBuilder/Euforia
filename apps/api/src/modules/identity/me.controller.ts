/**
 * /me controller — profile, deactivation and scheduled deletion
 * (shared api.ts profile section + account actions).
 *
 * Phase 15: the preferences doc routes (GET/PATCH /me/preferences*,
 * POST /me/preferences/reset) moved to the dedicated Settings bounded
 * context (modules/settings) — wire-compatible, same paths.
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import {
  profileUpdateInputSchema,
  deactivateAccountInputSchema,
  type ProfileUpdateInput,
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
