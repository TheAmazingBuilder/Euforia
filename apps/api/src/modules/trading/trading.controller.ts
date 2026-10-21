/**
 * Trading Core controller (Phase 4 §33) — thin HTTP boundary over the
 * trading application service. Validation → authentication (global guard) →
 * application use case → response. No domain logic, no Prisma, no provider
 * logic here.
 *
 * All routes require authentication (global JwtAuthGuard — no @Public here).
 * Ownership is enforced inside the service: the userId always comes from the
 * auth principal, never from the client (§23/§24). No execution capability
 * exists anywhere in this API (§47 red line).
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
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import {
  closeManualTradeInputSchema,
  createManualTradeInputSchema,
  journalImportTradesInputSchema,
  journalTradeSyncInputSchema,
  journalTradesQuerySchema,
  updateJournalTradeInputSchema,
  uuidSchema,
  type CloseManualTradeInput,
  type CreateManualTradeInput,
  type JournalDeleteTradeResponse,
  type JournalImportTradesInput,
  type JournalTradeSyncInput,
  type JournalTradesQuery,
  type UpdateJournalTradeInput,
} from "../../shared/contracts";
import { TradingService } from "./trading.service";

/** The correlation id attached by the request-id infrastructure (§65). */
function requestIdOf(request: FastifyRequest): string | null {
  const raw = (request as { id?: unknown }).id;
  return typeof raw === "string" ? raw : null;
}

@Controller("trades")
export class TradingController {
  constructor(private readonly trading: TradingService) {}

  /** List journal trades — filters + server-side sorting + pagination (§34–§36). */
  @Get()
  list(@CurrentUser() principal: AuthPrincipal, @Query(new ZodValidationPipe(journalTradesQuerySchema)) query: JournalTradesQuery) {
    return this.trading.list(principal.userId, query);
  }

  /** Reconcile external activity into journal trades (idempotent, §27). */
  @Post("sync")
  @HttpCode(HttpStatus.OK)
  sync(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(journalTradeSyncInputSchema)) payload: JournalTradeSyncInput,
  ) {
    return this.trading.reconcileAccount(principal.userId, payload.accountId, requestIdOf(request));
  }

  /** Bulk import (client-mapped rows, source=IMPORT, content-idempotent). */
  @Post("import")
  @HttpCode(HttpStatus.CREATED)
  import(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(journalImportTradesInputSchema)) payload: JournalImportTradesInput,
  ) {
    return this.trading.importTrades(principal.userId, payload);
  }

  @Get(":tradeId")
  async details(@CurrentUser() principal: AuthPrincipal, @Param("tradeId") tradeId: string) {
    const id = uuidSchema.parse(tradeId);
    return this.trading.get(principal.userId, id);
  }

  /** Create a MANUAL journal trade (open or already-closed variant, §29). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createManualTradeInputSchema)) payload: CreateManualTradeInput,
  ) {
    return this.trading.createManual(principal.userId, payload);
  }

  /** Close a MANUAL open trade — single or partial exit legs (§10/§18). */
  @Post(":tradeId/close")
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(closeManualTradeInputSchema)) payload: CloseManualTradeInput,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.trading.closeManual(principal.userId, id, payload);
  }

  /** Update journal metadata (any source) + execution facts (MANUAL only, §30). */
  @Patch(":tradeId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(updateJournalTradeInputSchema)) payload: UpdateJournalTradeInput,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.trading.update(principal.userId, id, payload);
  }

  /** Soft delete (§57) — history is archived, never destroyed. */
  @Delete(":tradeId")
  async delete(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
  ): Promise<JournalDeleteTradeResponse> {
    const id = uuidSchema.parse(tradeId);
    return this.trading.delete(principal.userId, id);
  }
}
