/**
 * Trade Review + Goals controller - the review workspace surface
 * (/reviews*) and the computed goals engine (/goals*).
 */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put } from "@nestjs/common";
import {
  createGoalInputSchema,
  updateGoalInputSchema,
  upsertReviewInputSchema,
  uuidSchema,
} from "../../shared/contracts";
import type { z } from "zod";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ReviewsService } from "./reviews.service";

@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get("overview")
  overview(@CurrentUser() principal: AuthPrincipal) {
    return this.reviews.overview(principal.userId);
  }

  @Get()
  list(@CurrentUser() principal: AuthPrincipal) {
    return this.reviews.list(principal.userId);
  }

  @Get("lessons")
  lessons(@CurrentUser() principal: AuthPrincipal) {
    return this.reviews.lessons(principal.userId);
  }

  @Put(":tradeId")
  async upsert(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(upsertReviewInputSchema)) input: z.infer<typeof upsertReviewInputSchema>,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.reviews.upsert(principal.userId, { ...input, tradeId: id });
  }

  @Delete(":tradeId")
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() principal: AuthPrincipal, @Param("tradeId") tradeId: string) {
    return this.reviews.remove(principal.userId, uuidSchema.parse(tradeId));
  }
}

@Controller("goals")
export class GoalsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@CurrentUser() principal: AuthPrincipal) {
    return this.reviews.listGoals(principal.userId);
  }

  @Post()
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createGoalInputSchema)) input: z.infer<typeof createGoalInputSchema>,
  ) {
    return this.reviews.createGoal(principal.userId, input);
  }

  @Patch(":goalId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("goalId") goalId: string,
    @Body(new ZodValidationPipe(updateGoalInputSchema)) input: z.infer<typeof updateGoalInputSchema>,
  ) {
    return this.reviews.updateGoal(principal.userId, uuidSchema.parse(goalId), input);
  }

  @Delete(":goalId")
  async remove(@CurrentUser() principal: AuthPrincipal, @Param("goalId") goalId: string) {
    return this.reviews.deleteGoal(principal.userId, uuidSchema.parse(goalId));
  }
}
