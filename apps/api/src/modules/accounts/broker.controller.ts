/**
 * Broker session controller (Phase 3) - the read-only Session-Live panel
 * aggregate (shared brokerSessionResponseSchema, unchanged from the mock
 * era). Served from the accounts domain's synchronized state: the provider
 * is the source of truth, this is the synchronized representation (§46).
 *
 * Honesty rules preserved: no connected account → NOT_CONFIGURED with a
 * credential-free reason; connection error → ERROR; unavailable metrics are
 * null - never invented (§57's spirit, shared schema's letter).
 */
import { Controller, Get } from "@nestjs/common";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { TradingAccountService } from "./trading-account.service";

@Controller("broker")
export class BrokerController {
  constructor(private readonly accounts: TradingAccountService) {}

  @Get("session")
  async session(@CurrentUser() principal: AuthPrincipal) {
    return this.accounts.getBrokerSession(principal.userId);
  }
}
