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
  Query,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  tradingAccountConnectInputSchema,
  tradingAccountDetailsResponseSchema,
  tradingAccountUpdateInputSchema,
  tradingConnectionTestResponseSchema,
  tradingDisconnectResponseSchema,
  tradingReconnectInputSchema,
  tradingSyncRunsResponseSchema,
  brokerCatalogResponseSchema,
  brokerIdentifyInputSchema,
  brokerIdentifyResponseSchema,
  uuidSchema,
  isoDateTimeSchema,
} from "../../shared/contracts";
import type {
  BrokerIdentifyInput,
  TradingAccountConnectInput,
  TradingAccountUpdateInput,
  TradingReconnectInput,
} from "../../shared/contracts";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { Public } from "../../shared/auth/public.decorator";
import { TradingAccountService } from "./trading-account.service";
import { Mt5BridgeIngestService, bridgeIngestEnvelopeSchema } from "./mt5-bridge-ingest.service";
import { AccountsRateLimiterService } from "./accounts-rate-limiter.service";
import { IdentityRepository } from "../identity/identity.repository";
import {
  RateLimitError,
  UnauthorizedError,
} from "../../shared/errors/app-error";
import { TRADING_ERROR_CODES } from "../../shared/contracts";

function requestIdOf(request: FastifyRequest): string | null {
  const raw = (request as { id?: unknown }).id;
  return typeof raw === "string" ? raw : null;
}

@Controller("trading-accounts")
export class TradingAccountsController {
  constructor(
    private readonly accounts: TradingAccountService,
    private readonly bridgeIngest: Mt5BridgeIngestService,
    private readonly limiter: AccountsRateLimiterService,
    private readonly identity: IdentityRepository,
  ) {}

  /**
   * Phase 08 — the ONLY public route of the accounts surface: the MT5
   * terminal bridge ingest. Authentication is per-event HMAC (key locator +
   * timestamp + signature + event id — see Mt5BridgeIngestService); no JWT
   * exists on the terminal. Declared before the :accountId routes.
   */
  @Public()
  @Post("bridge/ingest")
  @HttpCode(HttpStatus.OK)
  async bridgeIngestPost(
    @Req() request: FastifyRequest,
    @Body(new ZodValidationPipe(bridgeIngestEnvelopeSchema))
    envelope: unknown,
  ) {
    const headers = request.headers as Record<string, string | string[] | undefined>;
    const header = (name: string): string => {
      const value = headers[name];
      if (typeof value !== "string" || value.length === 0) {
        throw new UnauthorizedError(
          `The ${name} header is required.`,
          "BRIDGE_HEADER_MISSING",
        );
      }
      return value;
    };
    const result = await this.bridgeIngest.ingest({
      keyId: header("x-bridge-key"),
      timestampMs: Number(header("x-bridge-timestamp")),
      signatureHex: header("x-bridge-signature"),
      envelope: envelope as Parameters<typeof this.bridgeIngest.ingest>[0]["envelope"],
    });
    return result;
  }

  /** Phase 08 — re-view the pairing sheet (owner-only). */
  @Get(":accountId/bridge/pairing")
  async bridgePairing(
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
  ) {
    const user = await this.loadUser(principal.userId);
    return this.accounts.getBridgePairing(user.id, accountId);
  }

  /** Phase 08 — rotate the bridge secret (invalidates the old terminal config). */
  @Post(":accountId/bridge/rotate")
  @HttpCode(HttpStatus.OK)
  async bridgeRotate(
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
  ) {
    const user = await this.loadUser(principal.userId);
    return this.accounts.rotateBridgeSecret(user.id, user, accountId);
  }

  @Get("providers")
  providers() {
    return this.accounts.listProviders();
  }

  /**
   * Phase 07 — the universal broker catalog (GET /trading-accounts/brokers).
   * Static identity metadata + honest connector status; declared BEFORE the
   * :accountId routes so "brokers" is never captured as an account id.
   */
  @Get("brokers")
  brokers() {
    return brokerCatalogResponseSchema.parse(this.accounts.listBrokers());
  }

  /**
   * Phase 07 — rule-based broker identification
   * (POST /trading-accounts/brokers/identify). No secrets accepted, no
   * provider call; rate-limited per user (30 / 15 min).
   */
  @Post("brokers/identify")
  @HttpCode(HttpStatus.OK)
  identifyBroker(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(brokerIdentifyInputSchema))
    hints: BrokerIdentifyInput,
  ) {
    const check = this.limiter.check("identify", principal.userId);
    if (!check.allowed) {
      throw new RateLimitError(
        "Too many identification attempts. Please wait before trying again.",
        TRADING_ERROR_CODES.RATE_LIMITED,
        check.retryAfterSeconds,
      );
    }
    this.limiter.hit("identify", principal.userId);
    return brokerIdentifyResponseSchema.parse(this.accounts.identifyBroker(hints));
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

  /**
   * Bounded synchronization history (Phase 05 §16) — newest first,
   * keyset-paginated via `before` (the previous page's nextCursor). Inputs
   * are schema-validated; ownership is enforced in the service (loadOwned).
   */
  @Get(":accountId/sync-runs")
  async syncRuns(
    @CurrentUser() principal: AuthPrincipal,
    @Param("accountId") accountId: string,
    @Query("limit") limit?: string,
    @Query("before") before?: string,
  ) {
    const parsedLimit =
      limit === undefined || limit === ""
        ? 20
        : z.coerce.number().int().min(1).max(50).parse(limit);
    const parsedBefore =
      before === undefined || before === ""
        ? null
        : new Date(isoDateTimeSchema.parse(before));
    return tradingSyncRunsResponseSchema.parse(
      await this.accounts.listSyncHistory({
        userId: principal.userId,
        accountId: uuidSchema.parse(accountId),
        limit: parsedLimit,
        before: parsedBefore,
      }),
    );
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
