/**
 * Trading-accounts controller — the ACCOUNTS module's rich surface
 * (/trading-accounts*) mapped onto the existing connectivity services.
 * Route-for-route equivalent to the MSW handler group the frontend was
 * built against (Task 4 contract); every shape is validated against the
 * shared trading-account schemas.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  tradingAccountConnectInputSchema,
  tradingAccountDetailsResponseSchema,
  tradingAccountUpdateInputSchema,
  tradingConnectionTestResponseSchema,
  tradingDisconnectResponseSchema,
  tradingReconnectInputSchema,
  uuidSchema,
} from "../../shared/contracts";
import type {
  TradingAccountConnectInput,
  TradingAccountUpdateInput,
  TradingReconnectInput,
} from "../../shared/contracts";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { TradingAccountService } from "./trading-account.service";
import { AccountsRateLimiterService } from "./accounts-rate-limiter.service";
import { IdentityRepository } from "../identity/identity.repository";
import { UnauthorizedError } from "../../shared/errors/app-error";

function requestIdOf(request: FastifyRequest): string | null {
  const raw = (request as { id?: unknown }).id;
  return typeof raw === "string" ? raw : null;
}

@Controller("trading-accounts")
export class TradingAccountsController {
  constructor(
    private readonly accounts: TradingAccountService,
    private readonly limiter: AccountsRateLimiterService,
    private readonly identity: IdentityRepository,
  ) {}

  @Get("providers")
  providers() {
    return this.accounts.listProviders();
  }

  @Post("connect")
  @HttpCode(HttpStatus.CREATED)
  async connect(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(tradingAccountConnectInputSchema))
    payload: TradingAccountConnectInput,
  ) {
    const account = await this.accounts.connect({
      userId: principal.userId,
      user: await this.loadUser(principal.userId),
      payload,
      requestId: requestIdOf(request),
      limiter: this.limiter,
    });
    return { account };
  }

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    return this.accounts.listDetails(principal.userId, Date.now());
  }

  @Get(":accountId")
  async details(@CurrentUser() principal: AuthPrincipal, @Param("accountId") accountId: string) {
    const response = await this.accounts.getDetails(principal.userId, uuidSchema.parse(accountId));
    return tradingAccountDetailsResponseSchema.parse(response);
  }

  @Get(":accountId/positions")
  positions(@CurrentUser() principal: AuthPrincipal, @Param("accountId") accountId: string) {
    return this.accounts.getPositions(principal.userId, uuidSchema.parse(accountId));
  }

  @Get(":accountId/orders")
  orders(@CurrentUser() principal: AuthPrincipal, @Param("accountId") accountId: string) {
    return this.accounts.getOrders(principal.userId, uuidSchema.parse(accountId));
  }

  @Get(":accountId/deals")
  deals(@CurrentUser() principal: AuthPrincipal, @Param("accountId") accountId: string) {
    return this.accounts.getDeals(principal.userId, uuidSchema.parse(accountId));
  }

  @Post(":accountId/test")
  @HttpCode(HttpStatus.OK)
  async test(@CurrentUser() principal: AuthPrincipal, @Param("accountId") accountId: string) {
    const response = await this.accounts.testConnection(principal.userId, uuidSchema.parse(accountId));
    return tradingConnectionTestResponseSchema.parse(response);
  }

  @Post(":accountId/sync")
  @HttpCode(HttpStatus.OK)
  async sync(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
  ) {
    return this.accounts.synchronize({
      userId: principal.userId,
      accountId: uuidSchema.parse(accountId),
      requestId: requestIdOf(request),
      limiter: this.limiter,
    });
  }

  @Post(":accountId/reconnect")
  @HttpCode(HttpStatus.OK)
  async reconnect(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
    @Body(new ZodValidationPipe(tradingReconnectInputSchema))
    payload: TradingReconnectInput,
  ) {
    const account = await this.accounts.reconnect({
      userId: principal.userId,
      user: await this.loadUser(principal.userId),
      accountId: uuidSchema.parse(accountId),
      payload,
      requestId: requestIdOf(request),
    });
    return { account };
  }

  @Patch(":accountId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
    @Body(new ZodValidationPipe(tradingAccountUpdateInputSchema))
    input: TradingAccountUpdateInput,
  ) {
    // Phase 02 hygiene: updateAccount returns the details object itself —
    // wrap it in the standard `{ account }` response envelope (same shape
    // as connect/reconnect) before the contract re-validation. The
    // previously-dead controller parsed the unwrapped object against the
    // envelope and could only ever answer 400.
    return tradingAccountDetailsResponseSchema.parse({
      account: await this.accounts.updateAccount(
        principal.userId,
        uuidSchema.parse(accountId),
        input,
      ),
    });
  }

  @Delete(":accountId")
  @HttpCode(HttpStatus.OK)
  async disconnect(@CurrentUser() principal: AuthPrincipal, @Param("accountId") accountId: string) {
    const response = await this.accounts.disconnect(
      principal.userId,
      await this.loadUser(principal.userId),
      uuidSchema.parse(accountId),
    );
    return tradingDisconnectResponseSchema.parse(response);
  }

  /** Load the authenticated user row (services build audit context from it). */
  private async loadUser(userId: string) {
    const user = await this.identity.findUserById(userId);
    if (!user) {
      throw new UnauthorizedError("Not authenticated.", "INVALID_TOKEN");
    }
    return user;
  }
}
