/**
 * Session controller (B5) - the timeline + logbook HTTP surface.
 * Global JwtAuthGuard, ZodValidationPipe on the note body, uuid-validated
 * params. Mirrors `mocks/handlers/session.ts` (3 routes + timeline).
 */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { createSessionNoteInputSchema, sessionNotesResponseSchema, sessionTimelineResponseSchema, uuidSchema } from "../../shared/contracts";
import type { z } from "zod";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { SessionService } from "./session.service";

@Controller("session")
export class SessionTimelineController {
  constructor(private readonly session: SessionService) {}

  /** GET /session/timeline - today's events + moods (server-resolved day). */
  @Get("timeline")
  async timeline(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.session.timeline(principal.userId);
    return sessionTimelineResponseSchema.parse(response);
  }
}

@Controller("session/notes")
export class SessionNotesController {
  constructor(private readonly session: SessionService) {}

  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    const response = await this.session.listNotes(principal.userId);
    return sessionNotesResponseSchema.parse(response);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(createSessionNoteInputSchema))
    payload: z.infer<typeof createSessionNoteInputSchema>,
  ) {
    return this.session.addNote(principal.userId, payload);
  }

  @Delete(":noteId")
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param("noteId") noteId: string,
  ) {
    const id = uuidSchema.parse(noteId);
    return this.session.deleteNote(principal.userId, id);
  }
}
