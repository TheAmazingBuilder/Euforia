/**
 * Trade Review controllers (B8) — reviews workspace + goals, mirroring
 * `mocks/handlers/tradeReview.ts` exactly (9 routes). Global JwtAuthGuard,
 * ZodValidationPipe on every body, uuid-validated params.
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
  Put,
} from "@nestjs/common";
import {
  createGoalInputSchema,
  updateGoalInputSchema,
  upsertReviewInputSchema,
  goalsResponseSchema,
  lessonsResponseSchema,
  reviewsResponseSchema,
  uuidSchema,
} from "../../shared/contracts";
import type { z } from "zod";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { GoalService } from "./goal.service";
import { ReviewService } from "./review.service";

@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviews: ReviewService) {}

  /** GET /reviews/overview — the module's aggregate (stats + goals + lessons). */
  @Get("overview")
  async overview(@CurrentUser() principal: AuthPrincipal) {
    return this.reviews.overview(principal.userId);
  }

  /** GET /reviews — every review row (pending + reviewed), joined with trades. */
  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.reviews.listReviews(principal.userId);
    return reviewsResponseSchema.parse(response);
  }

  /** PUT /reviews/:tradeId — upsert the post-trade review (URL authoritative). */
  @Put(":tradeId")
  async upsert(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(upsertReviewInputSchema))
    payload: z.infer<typeof upsertReviewInputSchema>,
  ) {
    const id = uuidSchema.parse(tradeId);
    return this.reviews.upsertReview(principal.userId, id, payload);
  }

  /** DELETE /reviews/:tradeId — undo a review (trade returns to pending). */
  @Delete(":tradeId")
  async remove(@CurrentUser() principal: AuthPrincipal, @Param("tradeId") tradeId: string) {
    const id = uuidSchema.parse(tradeId);
    return this.reviews.deleteReview(principal.userId, id);
  }

  /** GET /reviews/lessons — the lessons library (union of all sources). */
  @Get("lessons")
  async lessons(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.reviews.listLessons(principal.userId);
    return lessonsResponseSchema.parse(response);
  }
}

@Controller("goals")
export class GoalsController {
  constructor(private readonly goals: GoalService) {}

  /** GET /goals — goals WITH computed progress (targets vs real behavior). */
  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.goals.listGoals(principal.userId);
    return goalsResponseSchema.parse(response);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createGoalInputSchema))
    payload: z.infer<typeof createGoalInputSchema>,
  ) {
    return this.goals.createGoal(principal.userId, payload);
  }

  @Patch(":goalId")
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("goalId") goalId: string,
    @Body(new ZodValidationPipe(updateGoalInputSchema))
    payload: z.infer<typeof updateGoalInputSchema>,
  ) {
    const id = uuidSchema.parse(goalId);
    return this.goals.updateGoal(principal.userId, id, payload);
  }

  @Delete(":goalId")
  async remove(@CurrentUser() principal: AuthPrincipal, @Param("goalId") goalId: string) {
    const id = uuidSchema.parse(goalId);
    return this.goals.deleteGoal(principal.userId, id);
  }
}
