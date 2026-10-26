/**
 * Trading Core controllers (Phase 4 §33) - thin HTTP boundaries over the
 * trades application service, following the exact repo conventions:
 * global JwtAuthGuard (no @Public), ZodValidationPipe on every body/query,
 * @CurrentUser principal, uuid-validated params, ownership resolved in the
 * service. No Prisma model ever crosses this boundary.
 *
 * GET /trades/:id/session-series (B3) returns a DETERMINISTIC SYNTHETIC
 * path anchored on the trade's real recorded points (entry/exit/MFE/MAE)
 * - no market-data provider exists, and the endpoint never pretends
 * otherwise (§68); see session-series.ts for the honesty contract.
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
} from "@nestjs/common";
import {
  addScreenshotInputSchema,
  bulkTradesInputSchema,
  closeTradeInputSchema,
  createSavedTradeViewInputSchema,
  createTagInputSchema,
  createTradeInputSchema,
  importTradesInputSchema,
  notesUpdateInputSchema,
  planUpdateInputSchema,
  psychologyUpdateInputSchema,
  resolveMistakeInputSchema,
  reviewUpdateInputSchema,
  savedTradeViewsResponseSchema,
  tagsResponseSchema,
  tradeDecisionInputSchema,
  tradeScreenshotsResponseSchema,
  tradeSessionSeriesResponseSchema,
  tradesListQuerySchema,
  tradesListResponseSchema,
  updateTradeInputSchema,
  uuidSchema,
} from "../../shared/contracts";
import type { z } from "zod";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { TradesService } from "./trades.service";

@Controller("instruments")
export class InstrumentsController {
  constructor(private readonly trades: TradesService) {}

  /** Catalog consumed by the capture form / instrument combobox. */
  @Get()
  list() {
    return this.trades.listInstruments();
  }
}

@Controller("trades")
export class TradesController {
  constructor(private readonly trades: TradesService) {}

  // ── reads ──────────────────────────────────────────────────────────────────

  @Get()
  async list(
    @CurrentUser() principal: AuthPrincipal,
    @Query(new ZodValidationPipe(tradesListQuerySchema))
    query: z.infer<typeof tradesListQuerySchema>,
  ) {
    const response = await this.trades.listTrades(principal.userId, {
      status: query.status,
      graded: query.graded === undefined ? undefined : query.graded === "true",
      accountId: query.accountId,
    });
    return tradesListResponseSchema.parse(response);
  }

  @Get(":tradeId/review")
  async review(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.trades.getReview(principal.userId, id);
  }

  @Get(":tradeId/screenshots")
  async screenshots(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
  ) {
    const id = uuidSchema.parse(tradeId);
    const response = await this.trades.listScreenshots(principal.userId, id);
    return tradeScreenshotsResponseSchema.parse(response);
  }

  // ── captures / lifecycle ─────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createTradeInputSchema))
    payload: z.infer<typeof createTradeInputSchema>,
  ) {
    return this.trades.createTrade(principal.userId, payload);
  }

  @Post(":tradeId/close")
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(closeTradeInputSchema))
    payload: z.infer<typeof closeTradeInputSchema>,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.trades.closeTrade(principal.userId, id, payload);
  }

  /** The ONLY endpoint that reveals stored results (trade-entry-ux §13). */
  @Post(":tradeId/decision")
  @HttpCode(HttpStatus.OK)
  async decision(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(tradeDecisionInputSchema))
    payload: z.infer<typeof tradeDecisionInputSchema>,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.trades.decide(principal.userId, id, payload);
  }

  // ── B3 - session series projection + mistake resolution ────────────────────

  /** Deterministic projection path anchored on the trade's real points. */
  @Get(":tradeId/session-series")
  async sessionSeries(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
  ) {
    const id = uuidSchema.parse(tradeId);
    const response = await this.trades.getTradeSessionSeries(principal.userId, id);
    return tradeSessionSeriesResponseSchema.parse(response);
  }

  /** Confirm/contest an auto-detected mistake (reveal + review screens). */
  @Patch(":tradeId/mistakes/:mistakeId")
  async resolveMistake(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Param("mistakeId") mistakeId: string,
    @Body(new ZodValidationPipe(resolveMistakeInputSchema))
    payload: z.infer<typeof resolveMistakeInputSchema>,
  ) {
    const id = uuidSchema.parse(tradeId);
    const rowId = uuidSchema.parse(mistakeId);
    return this.trades.resolveMistake(principal.userId, id, rowId, payload.confirmed);
  }

  @Post("import")
  @HttpCode(HttpStatus.CREATED)
  async import(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(importTradesInputSchema))
    payload: z.infer<typeof importTradesInputSchema>,
  ) {
    return this.trades.importTrades(principal.userId, payload);
  }

  @Post("bulk")
  @HttpCode(HttpStatus.OK)
  async bulk(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(bulkTradesInputSchema))
    payload: z.infer<typeof bulkTradesInputSchema>,
  ) {
    return this.trades.bulkTrades(principal.userId, payload);
  }

  // ── mutations ────────────────────────────────────────────────────────────────

  @Patch(":tradeId/review")
  async updateReview(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(reviewUpdateInputSchema))
    payload: z.infer<typeof reviewUpdateInputSchema>,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.trades.updateReview(principal.userId, id, payload);
  }

  @Patch(":tradeId/plan")
  async updatePlan(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(planUpdateInputSchema))
    payload: z.infer<typeof planUpdateInputSchema>,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.trades.updatePlan(principal.userId, id, payload);
  }

  @Patch(":tradeId/psychology")
  async updatePsychology(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(psychologyUpdateInputSchema))
    payload: z.infer<typeof psychologyUpdateInputSchema>,
  ) {
    const id = uuidSchema.parse(tradeId);
    return { trade: await this.trades.updatePsychology(principal.userId, id, payload) };
  }

  @Patch(":tradeId/notes")
  async updateNotes(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(notesUpdateInputSchema))
    payload: z.infer<typeof notesUpdateInputSchema>,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.trades.updateNotes(principal.userId, id, payload);
  }

  @Patch(":tradeId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(updateTradeInputSchema))
    payload: z.infer<typeof updateTradeInputSchema>,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.trades.updateTrade(principal.userId, id, payload);
  }

  @Delete(":tradeId")
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.trades.deleteTrade(principal.userId, id);
  }

  // ── screenshots ──────────────────────────────────────────────────────────────

  @Post(":tradeId/screenshots")
  @HttpCode(HttpStatus.CREATED)
  async addScreenshot(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(addScreenshotInputSchema))
    payload: z.infer<typeof addScreenshotInputSchema>,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.trades.addScreenshot(principal.userId, id, payload);
  }

  @Delete(":tradeId/screenshots/:screenshotId")
  async deleteScreenshot(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Param("screenshotId") screenshotId: string,
  ) {
    const id = uuidSchema.parse(tradeId);
    const screenshot = uuidSchema.parse(screenshotId);
    return this.trades.deleteScreenshot(principal.userId, id, screenshot);
  }
}

@Controller("trade-views")
export class TradeViewsController {
  constructor(private readonly trades: TradesService) {}

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.trades.listViews(principal.userId);
    return savedTradeViewsResponseSchema.parse(response);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createSavedTradeViewInputSchema))
    payload: z.infer<typeof createSavedTradeViewInputSchema>,
  ) {
    return this.trades.createView(principal.userId, payload);
  }

  @Delete(":viewId")
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param("viewId") viewId: string,
  ) {
    const id = uuidSchema.parse(viewId);
    return this.trades.deleteView(principal.userId, id);
  }
}

/** Tag catalog (B3, Domaine 4) - capture-form chips + inline creation. */
@Controller("tags")
export class TagsController {
  constructor(private readonly trades: TradesService) {}

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.trades.listTags(principal.userId);
    return tagsResponseSchema.parse(response);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createTagInputSchema))
    payload: z.infer<typeof createTagInputSchema>,
  ) {
    return this.trades.createTag(principal.userId, payload);
  }
}
