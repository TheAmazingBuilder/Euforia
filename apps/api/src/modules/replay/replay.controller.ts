/**
 * Replay controller - the first-class historical replay module. Mirrors
 * `mocks/handlers/replay.ts` exactly. Global JwtAuthGuard, uuid-validated
 * params, Zod-validated bodies.
 *
 * SIMULATION ONLY (REPLAY MASTER PROMPT §37): there is deliberately NO
 * route here (and none in the whole module) that could reach a broker -
 * every endpoint documents the user's own replay records.
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
} from "@nestjs/common";
import {
  advanceReplayInputSchema,
  closeReplayTradeInputSchema,
  createReplayDecisionInputSchema,
  createReplayNoteInputSchema,
  createReplaySessionInputSchema,
  createReplayTradeInputSchema,
  updateReplaySessionInputSchema,
  uuidSchema,
} from "../../shared/contracts";
import type { z } from "zod";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { ReplayService } from "./replay.service";

@Controller("replay")
export class ReplayController {
  constructor(private readonly replay: ReplayService) {}

  // ── Overview & sessions ─────────────────────────────────────────────────────

  @Get("overview")
  overview(@CurrentUser() principal: AuthPrincipal) {
    return this.replay.overview(principal.userId);
  }

  @Get("sessions")
  list(@CurrentUser() principal: AuthPrincipal) {
    return this.replay.listSessions(principal.userId);
  }

  @Post("sessions")
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createReplaySessionInputSchema))
    payload: z.infer<typeof createReplaySessionInputSchema>,
  ) {
    return this.replay.createSession(principal.userId, payload);
  }

  @Get("sessions/:sessionId")
  detail(@CurrentUser() principal: AuthPrincipal, @Param("sessionId") sessionId: string) {
    const id = uuidSchema.parse(sessionId);
    return this.replay.detail(principal.userId, id);
  }

  @Post("sessions/:sessionId")
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(updateReplaySessionInputSchema))
    payload: z.infer<typeof updateReplaySessionInputSchema>,
  ) {
    const id = uuidSchema.parse(sessionId);
    return this.replay.updateSession(principal.userId, id, payload);
  }

  @Post("sessions/:sessionId/advance")
  @HttpCode(HttpStatus.OK)
  advance(
    @CurrentUser() principal: AuthPrincipal,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(advanceReplayInputSchema))
    payload: z.infer<typeof advanceReplayInputSchema>,
  ) {
    const id = uuidSchema.parse(sessionId);
    return this.replay.advance(principal.userId, id, payload);
  }

  @Post("sessions/:sessionId/complete")
  @HttpCode(HttpStatus.OK)
  complete(@CurrentUser() principal: AuthPrincipal, @Param("sessionId") sessionId: string) {
    const id = uuidSchema.parse(sessionId);
    return this.replay.complete(principal.userId, id);
  }

  @Post("sessions/:sessionId/archive")
  @HttpCode(HttpStatus.OK)
  archive(@CurrentUser() principal: AuthPrincipal, @Param("sessionId") sessionId: string) {
    const id = uuidSchema.parse(sessionId);
    return this.replay.archive(principal.userId, id);
  }

  @Delete("sessions/:sessionId")
  remove(@CurrentUser() principal: AuthPrincipal, @Param("sessionId") sessionId: string) {
    const id = uuidSchema.parse(sessionId);
    return this.replay.deleteSession(principal.userId, id);
  }

  // ── Simulated trades ────────────────────────────────────────────────────────

  @Post("sessions/:sessionId/trades")
  @HttpCode(HttpStatus.CREATED)
  createTrade(
    @CurrentUser() principal: AuthPrincipal,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(createReplayTradeInputSchema))
    payload: z.infer<typeof createReplayTradeInputSchema>,
  ) {
    const id = uuidSchema.parse(sessionId);
    return this.replay.createTrade(principal.userId, id, payload);
  }

  @Post("sessions/:sessionId/trades/:tradeId/close")
  @HttpCode(HttpStatus.OK)
  closeTrade(
    @CurrentUser() principal: AuthPrincipal,
    @Param("sessionId") sessionId: string,
    @Param("tradeId") tradeId: string,
    @Body(new ZodValidationPipe(closeReplayTradeInputSchema))
    payload: z.infer<typeof closeReplayTradeInputSchema>,
  ) {
    const sid = uuidSchema.parse(sessionId);
    const tid = uuidSchema.parse(tradeId);
    return this.replay.closeTrade(principal.userId, sid, tid, payload);
  }

  @Delete("sessions/:sessionId/trades/:tradeId")
  deleteTrade(
    @CurrentUser() principal: AuthPrincipal,
    @Param("sessionId") sessionId: string,
    @Param("tradeId") tradeId: string,
  ) {
    const sid = uuidSchema.parse(sessionId);
    const tid = uuidSchema.parse(tradeId);
    return this.replay.deleteTrade(principal.userId, sid, tid);
  }

  // ── Decisions ───────────────────────────────────────────────────────────────

  @Post("sessions/:sessionId/decisions")
  @HttpCode(HttpStatus.CREATED)
  createDecision(
    @CurrentUser() principal: AuthPrincipal,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(createReplayDecisionInputSchema))
    payload: z.infer<typeof createReplayDecisionInputSchema>,
  ) {
    const id = uuidSchema.parse(sessionId);
    return this.replay.createDecision(principal.userId, id, payload);
  }

  @Delete("sessions/:sessionId/decisions/:decisionId")
  deleteDecision(
    @CurrentUser() principal: AuthPrincipal,
    @Param("sessionId") sessionId: string,
    @Param("decisionId") decisionId: string,
  ) {
    const sid = uuidSchema.parse(sessionId);
    const did = uuidSchema.parse(decisionId);
    return this.replay.deleteDecision(principal.userId, sid, did);
  }

  // ── Notes ───────────────────────────────────────────────────────────────────

  @Post("sessions/:sessionId/notes")
  @HttpCode(HttpStatus.CREATED)
  createNote(
    @CurrentUser() principal: AuthPrincipal,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(createReplayNoteInputSchema))
    payload: z.infer<typeof createReplayNoteInputSchema>,
  ) {
    const id = uuidSchema.parse(sessionId);
    return this.replay.createNote(principal.userId, id, payload);
  }

  @Delete("sessions/:sessionId/notes/:noteId")
  deleteNote(
    @CurrentUser() principal: AuthPrincipal,
    @Param("sessionId") sessionId: string,
    @Param("noteId") noteId: string,
  ) {
    const sid = uuidSchema.parse(sessionId);
    const nid = uuidSchema.parse(noteId);
    return this.replay.deleteNote(principal.userId, sid, nid);
  }
}
