/**
 * Trade Review controller (Phase 6 §34/§35/§70) - thin HTTP boundary over
 * the review application service. Validation → authentication (global
 * guard) → application use case → response. No domain logic, no Prisma here.
 *
 * Routing follows the repository conventions AND the frontend contract:
 * the Review workspace speaks review-centric paths (/reviews, one review per
 * trade - the tradeId identifies the review). Static paths are declared
 * before the :tradeId parameter routes.
 *
 * All routes require authentication (global JwtAuthGuard - no @Public).
 * Ownership is enforced inside the service: the userId always comes from the
 * auth principal, never from the client (§8/§24/§36 - IDOR battery in e2e).
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
  Put,
  Query,
} from "@nestjs/common";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import {
  patchReviewInputSchema,
  reviewsQuerySchema,
  upsertReviewInputSchema,
  uuidSchema,
  type DeleteReviewResponse,
  type LessonsResponse,
  type PatchReviewInput,
  type ReviewDetailResponse,
  type ReviewRow,
  type ReviewsQuery,
  type ReviewsResponse,
  type TradeReviewOverviewResponse,
  type UpsertReviewInput,
} from "../../shared/contracts";
import { TradeReviewService } from "./trade-review.service";

@Controller("reviews")
export class TradeReviewController {
  constructor(private readonly reviews: TradeReviewService) {}

  // ── Static paths first (Fastify resolves static over param) ──────────────

  /** The module's aggregate: stats + lessons + pending queue + streak. */
  @Get("overview")
  overview(@CurrentUser() principal: AuthPrincipal): Promise<TradeReviewOverviewResponse> {
    return this.reviews.getOverview(principal.userId);
  }

  /** The lessons library (REVIEW ∪ TRADE_NOTE). */
  @Get("lessons")
  lessons(@CurrentUser() principal: AuthPrincipal): Promise<LessonsResponse> {
    return this.reviews.getLessons(principal.userId);
  }

  /** Workspace list - REVIEWED ⊕ PENDING rows, paginated (§72). */
  @Get()
  list(
    @CurrentUser() principal: AuthPrincipal,
    @Query(new ZodValidationPipe(reviewsQuerySchema)) query: ReviewsQuery,
  ): Promise<ReviewsResponse> {
    return this.reviews.listReviews(principal.userId, query);
  }

  // ── Review-scoped paths (the tradeId identifies the 1:1 review) ──────────

  /** Review detail: payload + trade summary + plan summary + comparison (§70). */
  @Get(":tradeId")
  detail(@CurrentUser() principal: AuthPrincipal, @Param("tradeId") tradeId: string): Promise<ReviewDetailResponse> {
    return this.reviews.getReviewDetail(principal.userId, uuidSchema.parse(tradeId));
  }

  /**
   * Upsert the review (the product's create/complete/edit path). The URL
   * tradeId is authoritative; a body tradeId is ignored by design.
   */
  @Put(":tradeId")
  @HttpCode(HttpStatus.OK)
  upsert(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(upsertReviewInputSchema)) payload: UpsertReviewInput,
  ): Promise<ReviewRow> {
    return this.reviews.upsertReview(principal.userId, uuidSchema.parse(tradeId), payload);
  }

  /** Partial review update (merge semantics). */
  @Patch(":tradeId")
  patch(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(patchReviewInputSchema)) payload: PatchReviewInput,
  ): Promise<ReviewRow> {
    return this.reviews.patchReview(principal.userId, uuidSchema.parse(tradeId), payload);
  }

  /** Undo a review - the trade returns to PENDING; the row is archived. */
  @Delete(":tradeId")
  @HttpCode(HttpStatus.OK)
  archive(
    @CurrentUser() principal: AuthPrincipal,
    @Param("tradeId") tradeId: string,
  ): Promise<DeleteReviewResponse> {
    return this.reviews.archiveReview(principal.userId, uuidSchema.parse(tradeId));
  }
}
