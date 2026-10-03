/**
 * Accounts controller (Phase 3 §32) — thin HTTP boundary over the accounts
 * application services. Validation → authentication (global guard) →
 * application use case → response. No provider logic, no database business
 * logic, no credential handling here.
 *
 * All routes require authentication (global JwtAuthGuard — no @Public here).
 * Ownership is enforced inside the services: the userId always comes from
 * the auth principal, never from the client (§19).
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import {
  uuidSchema,
  tradingAccountConnectInputSchema,
  tradingReconnectInputSchema,
  type TradingAccountConnectInput,
  type TradingReconnectInput,
} from "../../shared/contracts";
import { TradingAccountService } from "./trading-account.service";
import { AccountsRateLimiterService } from "./accounts-rate-limiter.service";
import { IdentityRepository } from "../identity/identity.repository";
import { UnauthorizedError } from "../../shared/errors/app-error";

/** The correlation id attached by the request-id infrastructure (§50). */
function requestIdOf(request: FastifyRequest): string | null {
  const raw = (request as { id?: unknown }).id;
  return typeof raw === "string" ? raw : null;
}

@Controller("accounts")
export class AccountsController {
  constructor(
    private readonly accounts: TradingAccountService,
    private readonly limiter: AccountsRateLimiterService,
    private readonly identityRepository: IdentityRepository,
  ) {}

  /** Load the authenticated user row (services build audit context from it). */
  private async loadUser(userId: string) {
    const user = await this.identityRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedError("Not authenticated.", "INVALID_TOKEN");
    }
    return user;
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  /** Journal identity list — the exact contract the existing frontend consumes. */
  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    return this.accounts.list(principal.userId);
  }

  /** Provider registry listing (metadata only — future connect UI consumes this). */
  @Get("providers")
  listProviders() {
    return this.accounts.listProviders();
  }

  @Get(":accountId")
  async details(
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
  ) {
    const id = uuidSchema.parse(accountId);
    return this.accounts.getDetails(principal.userId, id);
  }

  @Get(":accountId/snapshot")
  async snapshot(
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
  ) {
    const id = uuidSchema.parse(accountId);
    return this.accounts.getSnapshot(principal.userId, id);
  }

  @Get(":accountId/positions")
  async positions(
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
  ) {
    const id = uuidSchema.parse(accountId);
    return this.accounts.getPositions(principal.userId, id);
  }

  @Get(":accountId/orders")
  async orders(
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
  ) {
    const id = uuidSchema.parse(accountId);
    return this.accounts.getOrders(principal.userId, id);
  }

  @Get(":accountId/deals")
  async deals(
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
  ) {
    const id = uuidSchema.parse(accountId);
    return this.accounts.getDeals(principal.userId, id);
  }

  // ── Connection lifecycle ──────────────────────────────────────────────────

  /** Connect: register + connect + initial synchronization (§17). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async connect(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(tradingAccountConnectInputSchema))
    payload: TradingAccountConnectInput,
  ) {
    const user = await this.loadUser(principal.userId);
    const account = await this.accounts.connect({
      userId: principal.userId,
      user,
      payload,
      requestId: requestIdOf(request),
      limiter: this.limiter,
    });
    return { account };
  }

  /** Health-check the stored connection — 200 with honest per-check results. */
  @Post(":accountId/connection/test")
  @HttpCode(HttpStatus.OK)
  async testConnection(
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
  ) {
    const id = uuidSchema.parse(accountId);
    return this.accounts.testConnection(principal.userId, id);
  }

  /** Reconnect a disconnected/errored connection with fresh credentials. */
  @Post(":accountId/connection")
  @HttpCode(HttpStatus.OK)
  async reconnect(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
    @Body(new ZodValidationPipe(tradingReconnectInputSchema))
    payload: TradingReconnectInput,
  ) {
    const id = uuidSchema.parse(accountId);
    const user = await this.loadUser(principal.userId);
    const account = await this.accounts.reconnect({
      userId: principal.userId,
      user,
      accountId: id,
      payload,
      requestId: requestIdOf(request),
    });
    return { account };
  }

  /** Disconnect — destroys credentials, preserves all history (§52). */
  @Delete(":accountId/connection")
  @HttpCode(HttpStatus.OK)
  async disconnect(
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
  ) {
    const id = uuidSchema.parse(accountId);
    const user = await this.loadUser(principal.userId);
    return this.accounts.disconnect(principal.userId, user, id);
  }

  /** Trigger a synchronization run (rate-limited, concurrency-guarded). */
  @Post(":accountId/sync")
  @HttpCode(HttpStatus.OK)
  async synchronize(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
  ) {
    const id = uuidSchema.parse(accountId);
    return this.accounts.synchronize({
      userId: principal.userId,
      accountId: id,
      requestId: requestIdOf(request),
      limiter: this.limiter,
    });
  }

  /** Latest synchronization run + derived synchronization status. */
  @Get(":accountId/sync")
  async syncStatus(
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
  ) {
    const id = uuidSchema.parse(accountId);
    return this.accounts.getSyncStatus(principal.userId, id);
  }
}
