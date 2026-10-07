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
  ocrRecropInputSchema,
  ocrSetConfirmInputSchema,
  ocrSetCreateInputSchema,
  ocrSetPageQuerySchema,
  type OcrConfirmInput,
  type OcrCreateInput,
  type OcrRecropInput,
  type OcrSetConfirmInput,
  type OcrSetCreateInput,
} from "../../shared/contracts";
import { OcrService } from "./ocr.service";
import { OcrSetService } from "./ocr-set.service";
import { decodeOcrCursor } from "./ocr.repository";
import { OcrOpsService } from "./ocr-ops.service";
import {
  ocrAnalyticsQuerySchema,
  type OcrAnalyticsQuery,
} from "../../shared/contracts";

/** The correlation id attached by the request-id infrastructure (§57). */
function requestIdOf(request: FastifyRequest): string | null {
  const raw = (request as { id?: unknown }).id;
  return typeof raw === "string" ? raw : null;
}

/** Query strings arrive as strings — coerce `limit` like the security routes. */
const ocrPageQueryWire = ocrRecognitionPageQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const ocrAnalyticsQueryWire = ocrAnalyticsQuerySchema.extend({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

/** Same coercion discipline for the set list page (V2 §62). */
const ocrSetPageQueryWire = ocrSetPageQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

@Controller("ocr")
export class OcrController {
  constructor(
    private readonly ocr: OcrService,
    private readonly sets: OcrSetService,
    private readonly ops: OcrOpsService,
  ) {}

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
      accountId: input.accountId ?? undefined,
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
      batches: input.batches?.map((batch) => ({
        corrections: batch.corrections,
        include: batch.include,
      })),
      accountId: input.accountId,
      // V2 §58 — explicit duplicate acknowledgments (default false).
      acknowledgeDuplicateScreenshot: input.acknowledgeDuplicateScreenshot,
      acknowledgeDuplicateTrade: input.acknowledgeDuplicateTrade,
    });
  }

  /**
   * Re-OCR by crop (engine quality §2.4): targeted re-scan of a framed
   * region. Ephemeral guidance — never persisted, never authoritative.
   */
  @Post("recognitions/:id/recrop")
  @HttpCode(HttpStatus.OK)
  async recrop(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ocrRecropInputSchema)) input: OcrRecropInput,
  ) {
    return this.ocr.recropRecognition(principal.userId, uuidSchema.parse(id), input.region);
  }

  /**
   * Real-time progress (engine quality §4.1): a server-sent-events stream
   * of the job status. Emits the current state immediately, then follows
   * the repository until the job leaves QUEUED/PROCESSING (or a bounded
   * window elapses — the stream closes honestly instead of hanging).
   * Works in both live and mock frontends via fetch-stream readers (the
   * browser EventSource cannot carry an Authorization header).
   */
  @Get("recognitions/:id/events")
  async events(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Res() reply: FastifyReply,
  ) {
    const recognitionId = uuidSchema.parse(id);
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    reply.raw.write(`retry: 2000\n\n`);

    const write = (event: string, data: unknown): boolean => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    };

    const startedAt = Date.now();
    const MAX_WINDOW_MS = 60_000;
    const POLL_MS = 300;
    let closed = false;
    const close = () => {
      if (!closed) {
        closed = true;
        reply.raw.end();
      }
    };
    try {
      while (!closed && Date.now() - startedAt < MAX_WINDOW_MS) {
        const row = await this.ocr.getStatus(principal.userId, recognitionId);
        if (row === null) {
          write("gone", { id: recognitionId });
          break;
        }
        write("status", { id: recognitionId, status: row.status });
        if (row.status !== "QUEUED" && row.status !== "PROCESSING") break;
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    } catch {
      // client disconnect or transient repo failure — close honestly
    } finally {
      close();
    }
    return reply;
  }

  /** OCR quality analytics (engine quality §3.2) — the Analytics card feed. */
  @Get("analytics")
  async analytics(
    @CurrentUser() principal: AuthPrincipal,
    @Query(new ZodValidationPipe(ocrAnalyticsQueryWire)) query: OcrAnalyticsQuery,
  ) {
    return this.ops.getAnalytics(principal.userId, query.days);
  }

  /** Storage + retention indicator (engine quality §4.2). */
  @Get("storage")
  async storage(@CurrentUser() principal: AuthPrincipal) {
    return this.ops.getStorage(principal.userId);
  }

  // ── V2 §1/§2/§14/§15/§18 — multi-screenshot recognition sets ──────────────

  @Post("sets")
  async createSet(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(ocrSetCreateInputSchema)) input: OcrSetCreateInput,
  ) {
    return this.sets.createSet({
      userId: principal.userId,
      imageDataUrls: input.imageDataUrls,
      requestedProfile: input.requestedProfile,
      accountId: input.accountId ?? undefined,
      requestId: requestIdOf(request),
    });
  }

  @Get("sets")
  async listSets(
    @CurrentUser() principal: AuthPrincipal,
    @Query(new ZodValidationPipe(ocrSetPageQueryWire)) query: { limit: number; cursor?: string },
  ) {
    return this.sets.listSets({
      userId: principal.userId,
      limit: query.limit,
      cursor: query.cursor ? decodeOcrCursor(query.cursor) : null,
    });
  }

  @Get("sets/:id")
  async getSet(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
  ) {
    return this.sets.getSet({ userId: principal.userId, id: uuidSchema.parse(id) });
  }

  @Post("sets/:id/confirm")
  @HttpCode(HttpStatus.OK) // idempotent replay — not a 201 creation
  async confirmSet(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ocrSetConfirmInputSchema)) input: OcrSetConfirmInput,
  ) {
    return this.sets.confirmSet({
      userId: principal.userId,
      id: uuidSchema.parse(id),
      corrections: input.corrections,
      accountId: input.accountId ?? undefined,
      acknowledgeDuplicateScreenshot: input.acknowledgeDuplicateScreenshot,
      acknowledgeDuplicateTrade: input.acknowledgeDuplicateTrade,
    });
  }

  /** Deletes the SET only — member recognitions survive (V2 §15). */
  @Delete("sets/:id")
  async removeSet(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
  ) {
    return this.sets.deleteSet({ userId: principal.userId, id: uuidSchema.parse(id) });
  }

  @Delete("recognitions/:id")
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
  ) {
    return this.ocr.deleteRecognition(principal.userId, uuidSchema.parse(id));
  }
}
