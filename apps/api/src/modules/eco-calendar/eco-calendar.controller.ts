/**
 * Eco-Calendar controller - the global macro calendar + per-user overlay.
 */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from "@nestjs/common";
import { dateKeySchema, upsertCalendarBlockInputSchema } from "../../shared/contracts";
import type { z } from "zod";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { EcoCalendarService } from "./eco-calendar.service";

@Controller()
export class EcoCalendarController {
  constructor(private readonly eco: EcoCalendarService) {}

  @Get("eco-events")
  listEcoEvents(@CurrentUser() _principal: AuthPrincipal) {
    return this.eco.listEcoEvents();
  }

  @Get("calendar-view")
  async calendarView(
    @CurrentUser() principal: AuthPrincipal,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const range = {
      from: from && from !== "" ? from : today,
      to: to && to !== "" ? to : today,
    };
    return this.eco.calendarView(principal.userId, range.from, range.to);
  }

  @Get("calendar-blocks")
  listBlocks(@CurrentUser() principal: AuthPrincipal) {
    return this.eco.listBlocks(principal.userId);
  }

  @Put("calendar-blocks/:date")
  @HttpCode(HttpStatus.OK)
  upsertBlock(
    @CurrentUser() principal: AuthPrincipal,
    @Param("date") date: string,
    @Body(new ZodValidationPipe(upsertCalendarBlockInputSchema.omit({ date: true })))
    input: Omit<z.infer<typeof upsertCalendarBlockInputSchema>, "date">,
  ) {
    const dateKey = dateKeySchema.parse(date);
    return this.eco.upsertBlock(principal.userId, { ...input, date: dateKey });
  }

  @Delete("calendar-blocks/:date")
  deleteBlock(@CurrentUser() principal: AuthPrincipal, @Param("date") date: string) {
    return this.eco.deleteBlock(principal.userId, dateKeySchema.parse(date));
  }

  @Post("calendar-blocks/import-eco")
  @HttpCode(HttpStatus.OK)
  importEcoBlockers(@CurrentUser() principal: AuthPrincipal) {
    return this.eco.importEcoBlockers(principal.userId);
  }
}
