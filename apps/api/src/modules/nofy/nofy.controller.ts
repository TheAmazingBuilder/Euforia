/**
 * Nofy HTTP surface (B11) — 23 routes mirroring the MSW handlers 1:1:
 * overview, note lists (scope + linked-entity + search), note CRUD with
 * soft-delete/restore/purge, duplicate, version history (list / get /
 * restore), folders, tags, templates (library / create / instantiate)
 * and the entity picker refs. All reads/writes are authenticated and
 * user-scoped (§34); bodies are validated against the shared Zod contracts.
 */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { CurrentUser } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import {
  nofyFolderCreateInputSchema,
  nofyFolderUpdateInputSchema,
  nofyNoteCreateInputSchema,
  nofyNoteDuplicateInputSchema,
  nofyNoteUpdateInputSchema,
  nofyRefKindSchema,
  nofyTemplateCreateInputSchema,
  nofyTemplateInstantiateInputSchema,
  uuidSchema,
} from "../../shared/contracts";
import { NofyService } from "./nofy.service";

const nofyListQuerySchema = z.object({
  view: z.string().optional(),
  folderId: z.string().optional(),
  tagId: z.string().optional(),
  q: z.string().optional(),
  sort: z.string().optional(),
  refKind: z.string().optional(),
  refId: z.string().optional(),
});
type NofyListQuery = z.infer<typeof nofyListQuerySchema>;

const nofyTagCreateInputSchema = z.object({ name: z.string().max(80) });

@Controller("nofy")
export class NofyController {
  constructor(private readonly nofy: NofyService) {}

  /** GET /nofy/overview — knowledge workspace aggregates. */
  @Get("overview")
  async overview(@CurrentUser() principal: AuthPrincipal) {
    return this.nofy.nofyOverview(principal.userId);
  }

  /**
   * GET /nofy/notes?view=&folderId=&tagId=&q=&sort= — filtered note lists.
   * ?refKind=&refId= instead returns the notes linked to an app entity
   * (the Playbook / Trade Review integration surface).
   */
  @Get("notes")
  async listNotes(
    @CurrentUser() principal: AuthPrincipal,
    @Query(new ZodValidationPipe(nofyListQuerySchema)) query: NofyListQuery,
  ) {
    if (query.refKind && query.refId) {
      const refKind = nofyRefKindSchema.parse(query.refKind);
      return this.nofy.listNotesLinkedTo(principal.userId, refKind, query.refId);
    }
    const view = query.view ?? "all";
    let scope: Parameters<NofyService["listNotes"]>[1];
    if (view === "folder" && query.folderId) scope = { view: "folder", folderId: query.folderId };
    else if (view === "tag" && query.tagId) scope = { view: "tag", tagId: query.tagId };
    else scope = { view: view === "favorites" || view === "trash" || view === "recent" ? view : "all" };
    return this.nofy.listNotes(principal.userId, scope, { q: query.q, sort: query.sort });
  }

  /** POST /nofy/notes — create (optionally from a template). */
  @Post("notes")
  @HttpCode(HttpStatus.CREATED)
  async createNote(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(nofyNoteCreateInputSchema)) payload: unknown,
  ) {
    return this.nofy.createNote(principal.userId, payload as z.infer<typeof nofyNoteCreateInputSchema>);
  }

  /** GET /nofy/notes/:noteId — full note (refs re-resolved, view tracked). */
  @Get("notes/:noteId")
  async getNote(@CurrentUser() principal: AuthPrincipal, @Param("noteId") noteId: string) {
    return this.nofy.getNote(principal.userId, uuidSchema.parse(noteId), { touchViewed: true });
  }

  /** PATCH /nofy/notes/:noteId — autosave + metadata (version snapshots inside). */
  @Patch("notes/:noteId")
  async updateNote(
    @CurrentUser() principal: AuthPrincipal,
    @Param("noteId") noteId: string,
    @Body(new ZodValidationPipe(nofyNoteUpdateInputSchema)) payload: unknown,
  ) {
    return this.nofy.updateNote(
      principal.userId,
      uuidSchema.parse(noteId),
      payload as z.infer<typeof nofyNoteUpdateInputSchema>,
    );
  }

  /** DELETE /nofy/notes/:noteId — soft delete → Trash. */
  @Delete("notes/:noteId")
  async trashNote(@CurrentUser() principal: AuthPrincipal, @Param("noteId") noteId: string) {
    return this.nofy.trashNote(principal.userId, uuidSchema.parse(noteId));
  }

  /** POST /nofy/notes/:noteId/duplicate. */
  @Post("notes/:noteId/duplicate")
  @HttpCode(HttpStatus.CREATED)
  async duplicateNote(
    @CurrentUser() principal: AuthPrincipal,
    @Param("noteId") noteId: string,
    @Body(new ZodValidationPipe(nofyNoteDuplicateInputSchema)) payload: unknown,
  ) {
    return this.nofy.duplicateNote(
      principal.userId,
      uuidSchema.parse(noteId),
      (payload ?? {}) as z.infer<typeof nofyNoteDuplicateInputSchema>,
    );
  }

  /** POST /nofy/notes/:noteId/restore — out of the trash. */
  @Post("notes/:noteId/restore")
  async restoreNote(@CurrentUser() principal: AuthPrincipal, @Param("noteId") noteId: string) {
    return this.nofy.restoreNote(principal.userId, uuidSchema.parse(noteId));
  }

  /** DELETE /nofy/notes/:noteId/permanent — irreversible purge from trash. */
  @Delete("notes/:noteId/permanent")
  async purgeNote(@CurrentUser() principal: AuthPrincipal, @Param("noteId") noteId: string) {
    return this.nofy.purgeNote(principal.userId, uuidSchema.parse(noteId));
  }

  /** GET /nofy/notes/:noteId/versions — version history list. */
  @Get("notes/:noteId/versions")
  async listVersions(@CurrentUser() principal: AuthPrincipal, @Param("noteId") noteId: string) {
    return this.nofy.listVersions(principal.userId, uuidSchema.parse(noteId));
  }

  /** GET /nofy/notes/:noteId/versions/:versionId — one version's blocks. */
  @Get("notes/:noteId/versions/:versionId")
  async getVersion(
    @CurrentUser() principal: AuthPrincipal,
    @Param("noteId") noteId: string,
    @Param("versionId") versionId: string,
  ) {
    return this.nofy.getVersion(principal.userId, uuidSchema.parse(noteId), uuidSchema.parse(versionId));
  }

  /** POST /nofy/notes/:noteId/versions/:versionId/restore — roll back. */
  @Post("notes/:noteId/versions/:versionId/restore")
  async restoreVersion(
    @CurrentUser() principal: AuthPrincipal,
    @Param("noteId") noteId: string,
    @Param("versionId") versionId: string,
  ) {
    return this.nofy.restoreVersion(principal.userId, uuidSchema.parse(noteId), uuidSchema.parse(versionId));
  }

  /** GET /nofy/folders — folders with live note counts. */
  @Get("folders")
  async listFolders(@CurrentUser() principal: AuthPrincipal) {
    return this.nofy.listFolders(principal.userId);
  }

  /** POST /nofy/folders. */
  @Post("folders")
  @HttpCode(HttpStatus.CREATED)
  async createFolder(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(nofyFolderCreateInputSchema)) payload: z.infer<typeof nofyFolderCreateInputSchema>,
  ) {
    return this.nofy.createFolder(principal.userId, payload);
  }

  /** PATCH /nofy/folders/:folderId — rename. */
  @Patch("folders/:folderId")
  async updateFolder(
    @CurrentUser() principal: AuthPrincipal,
    @Param("folderId") folderId: string,
    @Body(new ZodValidationPipe(nofyFolderUpdateInputSchema)) payload: z.infer<typeof nofyFolderUpdateInputSchema>,
  ) {
    return this.nofy.updateFolder(principal.userId, uuidSchema.parse(folderId), payload);
  }

  /** DELETE /nofy/folders/:folderId — notes fall back to "No folder". */
  @Delete("folders/:folderId")
  async deleteFolder(@CurrentUser() principal: AuthPrincipal, @Param("folderId") folderId: string) {
    return this.nofy.deleteFolder(principal.userId, uuidSchema.parse(folderId));
  }

  /** GET /nofy/tags — tags with live note counts. */
  @Get("tags")
  async listTags(@CurrentUser() principal: AuthPrincipal) {
    return this.nofy.listTags(principal.userId);
  }

  /** POST /nofy/tags — create-or-return (idempotent by name). */
  @Post("tags")
  @HttpCode(HttpStatus.CREATED)
  async createTag(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(nofyTagCreateInputSchema)) payload: z.infer<typeof nofyTagCreateInputSchema>,
  ) {
    return this.nofy.createTag(principal.userId, payload.name);
  }

  /** GET /nofy/templates — built-in + user templates. */
  @Get("templates")
  async listTemplates(@CurrentUser() principal: AuthPrincipal) {
    return this.nofy.listTemplates(principal.userId);
  }

  /** POST /nofy/templates — capture a reusable structure. */
  @Post("templates")
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(nofyTemplateCreateInputSchema)) payload: z.infer<typeof nofyTemplateCreateInputSchema>,
  ) {
    return this.nofy.createTemplate(principal.userId, payload);
  }

  /** POST /nofy/templates/instantiate — new note from a template. */
  @Post("templates/instantiate")
  @HttpCode(HttpStatus.CREATED)
  async instantiateTemplate(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(nofyTemplateInstantiateInputSchema)) payload: z.infer<typeof nofyTemplateInstantiateInputSchema>,
  ) {
    return this.nofy.instantiateTemplate(principal.userId, payload);
  }

  /** GET /nofy/search?q= — full-text across title/content/tags/folder. */
  @Get("search")
  async search(
    @CurrentUser() principal: AuthPrincipal,
    @Query(new ZodValidationPipe(z.object({ q: z.string().optional() }))) query: { q?: string },
  ) {
    return this.nofy.searchNofy(principal.userId, query.q ?? "");
  }

  /** GET /nofy/refs?q=&kind= — the entity picker's source. */
  @Get("refs")
  async listRefs(
    @CurrentUser() principal: AuthPrincipal,
    @Query(new ZodValidationPipe(z.object({ q: z.string().optional(), kind: z.string().optional() })))
    query: { q?: string; kind?: string },
  ) {
    return this.nofy.listRefs(principal.userId, query.q ?? "", query.kind);
  }
}
