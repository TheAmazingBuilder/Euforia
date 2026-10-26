/**
 * Calendar controller (B7) - eco events, marked blocks and the trading
 * calendar overlay. Global JwtAuthGuard, ZodValidationPipe on the block
 * body, uuid/ISO-validated params. Mirrors `mocks/handlers/eco.ts` (6
 * routes). The `from`/`to` window is validated in the service (422 parity).
 */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from "@nestjs/common";
import {
  upsertCalendarBlockInputSchema,
  calendarBlocksResponseSchema,
  calendarBlockMutationResponseSchema,
  calendarViewResponseSchema,
  ecoEventsResponseSchema,
  importEcoBlockersResponseSchema,
} from "../../shared/contracts";
import type { z } from "zod";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CalendarService } from "./calendar.service";
import { BusinessRuleError } from "../../shared/errors/app-error";
import { TRADE_ERROR_CODES } from "../../shared/contracts";

const TRADING_ERROR = TRADE_ERROR_CODES;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Controller("eco-events")
export class EcoEventsController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  async list() {
    const response = await this.calendar.listEcoEvents();
    return ecoEventsResponseSchema.parse(response);
  }
}

@Controller("calendar-blocks")
export class CalendarBlocksController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.calendar.listBlocks(principal.userId);
    return calendarBlocksResponseSchema.parse(response);
  }

  /** PUT (upsert) - mark a day off / news blocked. */
  @Put()
  async upsert(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(upsertCalendarBlockInputSchema))
    payload: z.infer<typeof upsertCalendarBlockInputSchema>,
  ) {
    return this.calendar.upsertBlock(principal.userId, payload);
  }

  @Delete(":date")
  async remove(@CurrentUser() principal: AuthPrincipal, @Param("date") date: string) {
    if (!DATE_KEY_PATTERN.test(date)) {
      throw new BusinessRuleError("Invalid date key", TRADING_ERROR.INVALID_TRADE_DATA);
    }
    return calendarBlockMutationResponseSchema.parse(
      await this.calendar.deleteBlock(principal.userId, date),
    );
  }

  @Post("import-eco")
  @HttpCode(HttpStatus.OK)
  async importEco(@CurrentUser() principal: AuthPrincipal) {
    return importEcoBlockersResponseSchema.parse(
      await this.calendar.importEcoBlockers(principal.userId),
    );
  }
}

@Controller("calendar-view")
export class CalendarViewController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  async view(
    @CurrentUser() principal: AuthPrincipal,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    const response = await this.calendar.view(principal.userId, from ?? "", to ?? "");
    return calendarViewResponseSchema.parse(response);
  }
}
