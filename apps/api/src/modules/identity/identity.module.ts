/**
 * Identity bounded context (Phase 2, refined Phase 16) — authentication,
 * sessions, MFA, authorization foundation, account lifecycle.
 *
 * Generic subdomain (Phase 0 §I): flat application services + one
 * repository + thin controllers — no ceremonial layering.
 *
 * Phase 16 boundary refinement: the Security center and the security-event
 * ledger now live in `modules/security` (SecurityModule + the shared
 * SecurityEventModule write port). Identity records auth events THROUGH
 * that port and keeps ownership of authentication, sessions, MFA and
 * authorization — it never implements security visibility itself.
 *
 * Guard order note: the global ThrottlerGuard (RateLimitModule, imported
 * before this module in AppModule) runs BEFORE JwtAuthGuard — unauthenticated
 * probes are rate-limited before touching the token verifier.
 */
import { Module, type Provider } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, APP_CONFIG } from "../../config/config.module";
import type { AppConfig } from "../../config/app-config";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { LoggingModule } from "../../infrastructure/logging/logging.module";
import { JwtAuthGuard } from "../../shared/auth/jwt-auth.guard";
import { SecurityEventModule } from "../security/security-event.module";
import { IDENTITY_GUARD_DEPS, type IdentityGuardDeps } from "./identity-guard-deps";
import { IdentityRepository } from "./identity.repository";
import { PasswordHasherService } from "./password-hasher.service";
import { TokenService } from "./token.service";
import { TotpService } from "./totp.service";
import { MailerService } from "./mailer.service";
import { AuthRateLimiterService, AUTH_RATE_LIMITS } from "./auth-rate-limiter.service";
import { ReauthService } from "./reauth.service";
import { AuthService } from "./auth.service";
import { MfaService } from "./mfa.service";
import { AccountService } from "./account.service";
import { AuthController } from "./auth.controller";
import { MeController } from "./me.controller";

const guardDepsProvider: Provider = {
  provide: IDENTITY_GUARD_DEPS,
  useFactory: (tokens: TokenService, repository: IdentityRepository): IdentityGuardDeps => ({
    verifyAccessToken: (token) => tokens.verifyAccessToken(token),
    resolvePrincipal: async (userId, sessionId) => {
      const session = await repository.findSessionById(sessionId);
      if (!session || session.userId !== userId || session.revokedAt) return null;
      if (session.expiresAt.getTime() <= Date.now()) return null;
      const user = await repository.findUserById(userId);
      if (!user) return null;
      return { userStatus: user.status };
    },
  }),
  inject: [TokenService, IdentityRepository],
};

const rateLimiterProvider: Provider = {
  provide: AuthRateLimiterService,
  useFactory: () => new AuthRateLimiterService(AUTH_RATE_LIMITS),
};

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PrismaModule,
    SecurityEventModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.auth.jwtSecret,
        signOptions: { expiresIn: config.auth.accessTtlSeconds, algorithm: "HS256" },
        verifyOptions: { algorithms: ["HS256"], ignoreExpiration: false },
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    IdentityRepository,
    // Factory provider: the hasher's OWASP options are constructor args, not
    // DI-resolved services (they may become env-configurable later).
    { provide: PasswordHasherService, useFactory: () => new PasswordHasherService() },
    TokenService,
    TotpService,
    MailerService,
    rateLimiterProvider,
    ReauthService,
    AuthService,
    MfaService,
    AccountService,
    guardDepsProvider,
    // Global authentication — after the throttler (module import order).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  // SecurityModule (the Security center) orchestrates these capabilities —
  // they stay OWNED here; exports are the narrow public contract (§33).
  exports: [IdentityRepository, TokenService, PasswordHasherService, ReauthService, MfaService],
})
export class IdentityModule {}
