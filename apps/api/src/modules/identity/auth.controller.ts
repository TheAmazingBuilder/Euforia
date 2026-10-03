/**
 * Auth controller — the 11 public auth endpoints (shared schemas/auth.ts).
 * All are @Public(): they authenticate via credentials, cookies or tokens.
 * The MFA challenge/recover endpoints complete a challenge-token login.
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, Req } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { Public } from "../../shared/auth/public.decorator";
import { CurrentUser } from "../../shared/auth/current-user.decorator";
import {
  loginInputSchema,
  registerInputSchema,
  mfaChallengeInputSchema,
  mfaRecoveryInputSchema,
  verifyEmailInputSchema,
  forgotPasswordInputSchema,
  resetPasswordInputSchema,
  type LoginInput,
  type RegisterInput,
  type MfaChallengeInput,
  type MfaRecoveryInput,
  type VerifyEmailInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "../../shared/contracts";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  async register(
    @Body(new ZodValidationPipe(registerInputSchema)) input: RegisterInput,
  ) {
    return this.auth.register(input);
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginInputSchema)) input: LoginInput,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Req() request: FastifyRequest,
  ) {
    return this.auth.login(input, request, reply);
  }

  @Public()
  @Post("mfa/challenge")
  @HttpCode(HttpStatus.OK)
  async mfaChallenge(
    @Body(new ZodValidationPipe(mfaChallengeInputSchema)) input: MfaChallengeInput,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Req() request: FastifyRequest,
  ) {
    return this.auth.mfaChallenge(input, request, reply);
  }

  @Public()
  @Post("mfa/recover")
  @HttpCode(HttpStatus.OK)
  async mfaRecover(
    @Body(new ZodValidationPipe(mfaRecoveryInputSchema)) input: MfaRecoveryInput,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Req() request: FastifyRequest,
  ) {
    return this.auth.mfaRecover(input, request, reply);
  }

  /** NOT exempt on the frontend — its 401 is the refresh trigger (§56). */
  @Get("me")
  me(@CurrentUser() principal: { userId: string; sessionId: string }) {
    return this.auth.me(principal);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Res({ passthrough: true }) reply: FastifyReply,
    @Req() request: FastifyRequest,
  ) {
    return this.auth.refresh(request, reply);
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Res({ passthrough: true }) reply: FastifyReply,
    @Req() request: FastifyRequest,
  ) {
    return this.auth.logout(request, reply);
  }

  @Public()
  @Post("email/verify")
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailInputSchema)) input: VerifyEmailInput) {
    return this.auth.verifyEmail(input.token);
  }

  @Public()
  @Post("email/resend")
  @HttpCode(HttpStatus.ACCEPTED)
  async resend(
    @Body(new ZodValidationPipe(forgotPasswordInputSchema)) input: ForgotPasswordInput,
  ) {
    return this.auth.resendVerification(input.email);
  }

  @Public()
  @Post("password/forgot")
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordInputSchema)) input: ForgotPasswordInput,
    @Req() request: FastifyRequest,
  ) {
    return this.auth.forgotPassword(input.email, request);
  }

  @Public()
  @Post("password/reset")
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body(new ZodValidationPipe(resetPasswordInputSchema)) input: ResetPasswordInput) {
    return this.auth.resetPassword(input);
  }
}
