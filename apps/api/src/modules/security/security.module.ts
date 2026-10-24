/**
 * Security bounded context (Phase 16) - security posture, security events,
 * security activity, security visibility (§3).
 *
 * This context OBSERVES and CONTROLS security concerns. It is NOT a second
 * implementation of authentication, sessions, MFA or authorization: those
 * remain owned by Identity, whose exported capabilities this module
 * orchestrates (final responsibility model of the Phase 16 mandate):
 *
 *   Identity          → identity, authentication, sessions, MFA, tokens
 *   Security (HERE)   → posture, audit trail, activity, visibility
 *   Monitoring        → operational observability (FUTURE phase - never here)
 *
 * Guard order note: the global ThrottlerGuard (RateLimitModule) runs BEFORE
 * JwtAuthGuard - unauthenticated probes are rate-limited before touching
 * the token verifier. Both are registered once via APP_GUARD in their home
 * modules (RateLimitModule / IdentityModule); importing IdentityModule here
 * does NOT duplicate them (Nest modules are singletons by token).
 */
import { Module } from "@nestjs/common";
import { SecurityEventModule } from "./security-event.module";
import { IdentityModule } from "../identity/identity.module";
import { SecurityCenterController } from "./security-center.controller";
import { SecurityCenterService } from "./security-center.service";

@Module({
  imports: [SecurityEventModule, IdentityModule],
  controllers: [SecurityCenterController],
  providers: [SecurityCenterService],
})
export class SecurityModule {}
