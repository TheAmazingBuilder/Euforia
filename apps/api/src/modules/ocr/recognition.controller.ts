/**
 * Recognition controller (OCR backend V1) - the frontend-derived API surface
 * (master prompt §7/§10/§75: the shipped frontend is the source of truth for
 * the contract; the exact endpoints mirror `apps/web/src/lib/api/endpoints.ts`
 * under the global /api/v1 prefix).
 *
 * Conventions (house standard, mirrors accounts/security/trades):
 *   - global JwtAuthGuard + ThrottlerGuard apply; the OCR-specific per-user
 *     vectors fire inside the service;
 *   - ZodValidationPipe on body - unknown fields stripped, malformed input
 *     → 400 with issues; path ids are parsed with the shared uuidSchema
 *     (forged ids → 400, unknown-but-valid ids → 404);
 *   - ownership comes ONLY from the authenticated principal - ids in URLs
 *     are never trusted for authorization (§34/§35/§73: IDOR-safe by
 *     construction);
 *   - NO recognition logic and NO trade logic live here (§112): the
 *     controller is a thin adapter.
 *
 * Trade boundary (§75/§101): the ONLY route that touches Trading Core is
 * POST jobs/:id/confirm - explicit user confirmation. There is no route that
 * places/modifies/cancels orders or touches broker state anywhere.
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
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { uuidSchema } from "../../shared/contracts";
import {
  createRecognitionJobInputSchema,
  recognitionCollectionAssetInputSchema,
  recognitionCollectionCreateInputSchema,
  recognitionConfirmInputSchema,
  recognitionGroupConfirmInputSchema,
  recognitionGroupCreateInputSchema,
  recognitionJobListQuerySchema,
  recognitionRecropInputSchema,
  recognitionUploadInputSchema,
  tradeDraftUpdateInputSchema,
  type CreateRecognitionJobInput,
  type RecognitionCollectionAssetInput,
  type RecognitionCollectionCreateInput,
  type RecognitionConfirmInput,
  type RecognitionGroupConfirmInput,
  type RecognitionGroupCreateInput,
  type RecognitionRecropInput,
  type RecognitionUploadInput,
  type TradeDraftUpdateInput,
} from "../../shared/contracts";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { RecognitionService } from "./recognition.service";

/** The correlation id attached by the request-id infrastructure (§57). */
function requestIdOf(request: FastifyRequest): string | null {
  const raw = (request as { id?: unknown }).id;
  return typeof raw === "string" ? raw : null;
}

function parseId(raw: string): string {
  return uuidSchema.parse(raw);
}

@Controller("recognition")
export class RecognitionController {
  constructor(private readonly recognition: RecognitionService) {}

  // ── Upload (bytes travel the validated data-URL envelope) ─────────────────

  @Post("uploads")
  async upload(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(recognitionUploadInputSchema)) input: RecognitionUploadInput,
  ) {
    return this.recognition.uploadScreenshot({
      userId: principal.userId,
      fileDataUrl: input.fileDataUrl,
      name: input.name,
      requestId: requestIdOf(request),
    });
  }

  // ── Jobs collection ────────────────────────────────────────────────────────

  @Post("jobs")
  async createJob(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createRecognitionJobInputSchema)) input: CreateRecognitionJobInput,
  ) {
    return this.recognition.createJob({
      userId: principal.userId,
      screenshotId: input.screenshotId,
      platform: input.platform,
      mode: input.mode,
      requestId: requestIdOf(request),
    });
  }

  @Get("jobs")
  async listJobs(
    @CurrentUser() principal: AuthPrincipal,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    // V3 history filters (spec §62) - Zod-validated facets; unknown query
    // keys are stripped, malformed values → 400 (house standard).
    const parsed = recognitionJobListQuerySchema.safeParse(query);
    return this.recognition.listJobs(principal.userId, parsed.success ? parsed.data : undefined);
  }

  // ── Per-job routes ─────────────────────────────────────────────────────────

  @Get("jobs/:id")
  async getJob(@CurrentUser() principal: AuthPrincipal, @Param("id") id: string) {
    return this.recognition.getJob(principal.userId, parseId(id));
  }

  @Delete("jobs/:id")
  async deleteJob(@CurrentUser() principal: AuthPrincipal, @Param("id") id: string) {
    return this.recognition.deleteJob(principal.userId, parseId(id));
  }

  @Get("jobs/:id/result")
  async getResult(@CurrentUser() principal: AuthPrincipal, @Param("id") id: string) {
    return this.recognition.getResult(principal.userId, parseId(id));
  }

  @Get("jobs/:id/draft")
  async getDraft(@CurrentUser() principal: AuthPrincipal, @Param("id") id: string) {
    return this.recognition.getDraft(principal.userId, parseId(id));
  }

  @Put("jobs/:id/draft")
  async putDraft(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(tradeDraftUpdateInputSchema)) draft: TradeDraftUpdateInput,
  ) {
    return this.recognition.saveDraft(principal.userId, parseId(id), draft);
  }

  /** THE human-in-the-loop gate (§6/§75): explicit confirmation only. */
  @Post("jobs/:id/confirm")
  @HttpCode(HttpStatus.OK) // idempotent replay returns the SAME trade id - not a 201
  async confirm(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recognitionConfirmInputSchema)) input?: RecognitionConfirmInput,
  ) {
    return this.recognition.confirmImport(principal.userId, parseId(id), input ?? {});
  }

  @Post("jobs/:id/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser() principal: AuthPrincipal, @Param("id") id: string) {
    return this.recognition.cancelJob(principal.userId, parseId(id));
  }

  @Post("jobs/:id/retry")
  @HttpCode(HttpStatus.OK)
  async retry(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
  ) {
    return this.recognition.retryJob(principal.userId, parseId(id), requestIdOf(request));
  }

  // ── V2 - multi-trade drafts, crop re-OCR, progress, quality & storage ─────

  /** One slot per detected trade (V2 multi-trade review). */
  @Get("jobs/:id/drafts")
  async getDrafts(@CurrentUser() principal: AuthPrincipal, @Param("id") id: string) {
    return this.recognition.getDrafts(principal.userId, parseId(id));
  }

  /** PUT …/drafts/:index - validated draft for ONE trade of the job. */
  @Put("jobs/:id/drafts/:index")
  async putDraftAtIndex(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Param("index") rawIndex: string,
    @Body(new ZodValidationPipe(tradeDraftUpdateInputSchema)) draft: TradeDraftUpdateInput,
  ) {
    const tradeIndex = z
      .number()
      .int()
      .positive()
      .max(20)
      .parse(Number(rawIndex));
    return this.recognition.saveDraftAtIndex(principal.userId, parseId(id), draft, tradeIndex);
  }

  /** Crop re-recognition - the engine re-reads the selected zone. */
  @Post("jobs/:id/recrop")
  @HttpCode(HttpStatus.OK)
  async recrop(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recognitionRecropInputSchema)) input: RecognitionRecropInput,
  ) {
    return this.recognition.recrop(principal.userId, parseId(id), input);
  }

  /**
   * SSE progress stream (V2): `data:` lines carry RecognitionProgressEvent
   * snapshots. The request-scoped build answers with the terminal state
   * immediately; the seam exists for async processing later (the mocked
   * client build keeps calm polling - MSW cannot intercept EventSource).
   */
  @Get("jobs/:id/progress")
  async progress(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Res() reply: FastifyReply,
  ) {
    void request;
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const writeEvent = (snapshot: {
      jobId: string;
      status: string;
      stage: string;
      progress: number;
      at: string;
      terminal: boolean;
    }) => {
      reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    };
    writeEvent(await this.recognition.getProgress(principal.userId, parseId(id)));
    reply.raw.end();
  }

  /** Correction-memory + instrument-catalog suggestions for the draft form. */
  @Get("suggestions")
  async suggestions(
    @CurrentUser() principal: AuthPrincipal,
    @Query("symbol") symbol?: string,
  ) {
    return this.recognition.getSuggestions(principal.userId, {
      symbol: symbol !== undefined && symbol !== "" ? symbol : null,
    });
  }

  /** Quality analytics - funnel, correction rates, duplicates, performance. */
  @Get("analytics")
  async analytics(@CurrentUser() principal: AuthPrincipal, @Query("days") rawDays?: string) {
    const parsed = Number(rawDays ?? "30");
    const days = Number.isFinite(parsed) ? Math.trunc(parsed) : 30;
    return this.recognition.getAnalytics(principal.userId, days);
  }

  /** Storage usage + retention configuration for the settings card. */
  @Get("storage")
  async storage(@CurrentUser() principal: AuthPrincipal) {
    return this.recognition.getStorage(principal.userId);
  }

  /** Raw screenshot bytes - owner-scoped, private, never cached by proxies. */
  @Get("jobs/:id/screenshot")
  async screenshot(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Res() reply: FastifyReply,
  ) {
    const image = await this.recognition.getScreenshotBytes(principal.userId, parseId(id));
    return reply
      .header("content-type", image.mime)
      .header("cache-control", "private, no-store")
      .header("content-length", image.bytes.length)
      .send(image.bytes);
  }

  // ── V3 - reprocess, fusion groups, collections ───────────────────────────

  /** Reprocess (spec §45): NEW job over the SAME asset; history untouched. */
  @Post("jobs/:id/reprocess")
  @HttpCode(HttpStatus.OK)
  async reprocess(
    @Req() request: FastifyRequest,
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
  ) {
    return this.recognition.reprocess(principal.userId, parseId(id), requestIdOf(request));
  }

  /** Creates a PROPOSED/ACTIVE fusion group from 2..8 reviewable jobs. */
  @Post("groups")
  async createGroup(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(recognitionGroupCreateInputSchema)) input: RecognitionGroupCreateInput,
  ) {
    return this.recognition.createGroup(principal.userId, input);
  }

  @Get("groups")
  async listGroups(@CurrentUser() principal: AuthPrincipal) {
    return this.recognition.listGroups(principal.userId);
  }

  @Get("groups/:id")
  async getGroup(@CurrentUser() principal: AuthPrincipal, @Param("id") id: string) {
    return this.recognition.getGroup(principal.userId, parseId(id));
  }

  /** Dissolve a group - members stay intact (spec §15). */
  @Delete("groups/:id")
  async discardGroup(@CurrentUser() principal: AuthPrincipal, @Param("id") id: string) {
    return this.recognition.discardGroup(principal.userId, parseId(id));
  }

  /** Edit the fused draft - SAME validated rules as a job draft (§74). */
  @Put("groups/:id/draft")
  async putGroupDraft(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(tradeDraftUpdateInputSchema)) draft: TradeDraftUpdateInput,
  ) {
    return this.recognition.updateGroupDraft(principal.userId, parseId(id), draft);
  }

  /** THE group human-in-the-loop gate - exactly ONE canonical trade (§70). */
  @Post("groups/:id/confirm")
  @HttpCode(HttpStatus.OK)
  async confirmGroup(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recognitionGroupConfirmInputSchema)) input?: RecognitionGroupConfirmInput,
  ) {
    return this.recognition.confirmGroup(principal.userId, parseId(id), input ?? {});
  }

  // ── V3 - screenshot collections (spec §41) ──────────────────────────────

  @Get("collections")
  async listCollections(@CurrentUser() principal: AuthPrincipal) {
    return this.recognition.listCollections(principal.userId);
  }

  @Post("collections")
  async createCollection(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(recognitionCollectionCreateInputSchema)) input: RecognitionCollectionCreateInput,
  ) {
    return this.recognition.createCollection(principal.userId, input);
  }

  @Get("collections/:id")
  async getCollection(@CurrentUser() principal: AuthPrincipal, @Param("id") id: string) {
    return this.recognition.getCollection(principal.userId, parseId(id));
  }

  /** Deleting a collection never touches the referenced assets. */
  @Delete("collections/:id")
  async deleteCollection(@CurrentUser() principal: AuthPrincipal, @Param("id") id: string) {
    return this.recognition.deleteCollection(principal.userId, parseId(id));
  }

  @Post("collections/:id/assets")
  async addCollectionAsset(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recognitionCollectionAssetInputSchema)) input: RecognitionCollectionAssetInput,
  ) {
    return this.recognition.addCollectionAsset(principal.userId, parseId(id), input.assetId);
  }

  @Delete("collections/:id/assets/:assetId")
  async removeCollectionAsset(
    @CurrentUser() principal: AuthPrincipal,
    @Param("id") id: string,
    @Param("assetId") assetId: string,
  ) {
    return this.recognition.removeCollectionAsset(principal.userId, parseId(id), parseId(assetId));
  }
}
