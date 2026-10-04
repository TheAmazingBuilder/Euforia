/**
 * OCR controller (Phase 19 §40) — the frontend-facing API surface, derived
 * from the product intent (the frontend has no OCR consumer yet; this is the
 * documented V1 contract the review UI will call — §2 smallest coherent
 * foundation).
 *
 * Conventions (house standard, mirrors accounts/security):
 *   - global JwtAuthGuard + ThrottlerGuard apply; the OCR-specific per-user
 *     vectors (§37) fire inside the service;
 *   - ZodValidationPipe on body/query — unknown fields stripped, malformed
 *     input → 400 with issues; path ids are parsed with the shared
 *     uuidSchema (forged ids → 400, unknown-but-valid ids → 404, §39);
 *   - ownership comes ONLY from the authenticated principal — ids in URLs
 *     are never trusted for authorization;
 *   - NO OCR logic lives here (§40): the controller is a thin adapter.
 *
 * Trade-boundary (§22/§42/§43): no route creates or modifies a Trade, no
 * route reaches broker execution — recognition + confirmation only.
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
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { uuidSchema } from "../../shared/contracts";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import {
  ocrConfirmInputSchema,
  ocrCreateInputSchema,
  ocrRecognitionPageQuerySchema,
  type OcrConfirmInput,
  type OcrCreateInput,
} from "../../shared/contracts";
import { OcrService } from "./ocr.service";

/** The correlation id attached by the request-id infrastructure (§57). */
function requestIdOf(request: FastifyRequest): string | null {
  const raw = (request as { id?: unknown }).id;
  return typeof raw === "string" ? raw : null;
}

/** Query strings arrive as strings — coerce `limit` like the security routes. */
const ocrPageQueryWire = ocrRecognitionPageQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

@Controller("ocr")
export class OcrController {
  constructor(private readonly ocr: OcrService) {}

  @Post("recognitions")
  async recognize(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(ocrCreateInputSchema)) input: OcrCreateInput,
  ) {
    return this.ocr.createRecognition({
      userId: principal.userId,
      imageDataUrl: input.imageDataUrl,
      requestedProfile: input.requestedProfile,
      requestId: requestIdOf(request),
    });
  }

  @Get("recognitions")
  async list(
    @CurrentUser() principal: AuthPrincipal,
    @Query(new ZodValidationPipe(ocrPageQueryWire)) query: {
      limit: number;
      cursor?: string;
      status?: "QUEUED" | "PROCESSING" | "REVIEW_REQUIRED" | "FAILED" | "CONFIRMED";
    },
  ) {
    return this.ocr.listRecognitions(principal.userId, query);
  }

  @Get("recognitions/:id")
  async get(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
  ) {
    return this.ocr.getRecognition(principal.userId, uuidSchema.parse(id));
  }

  /** Raw screenshot bytes — owner-scoped, private, never cached by proxies. */
  @Get("recognitions/:id/image")
  async image(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Res() reply: FastifyReply,
  ) {
    const image = await this.ocr.getRecognitionImage(principal.userId, uuidSchema.parse(id));
    return reply
      .header("content-type", image.mime)
      .header("cache-control", "private, no-store")
      .header("content-length", image.bytes.length)
      .send(image.bytes);
  }

  @Post("recognitions/:id/confirm")
  @HttpCode(HttpStatus.OK) // confirmation is idempotent — not a 201 creation
  async confirm(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ocrConfirmInputSchema)) input: OcrConfirmInput,
  ) {
    return this.ocr.confirmRecognition({
      userId: principal.userId,
      id: uuidSchema.parse(id),
      corrections: input.corrections,
    });
  }

  @Delete("recognitions/:id")
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
  ) {
    return this.ocr.deleteRecognition(principal.userId, uuidSchema.parse(id));
  }
}
