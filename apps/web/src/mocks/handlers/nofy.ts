import { http, HttpResponse } from "msw";
import type {
  NofyNoteCreateInput,
  NofyNoteDuplicateInput,
  NofyNoteUpdateInput,
  NofyRefKind,
  NofyTemplateCreateInput,
  NofyTemplateInstantiateInput,
} from "@cosmoz/shared";
import {
  nofyFolderCreateInputSchema,
  nofyFolderUpdateInputSchema,
  nofyNoteCreateInputSchema,
  nofyNoteDuplicateInputSchema,
  nofyNoteUpdateInputSchema,
  nofyTemplateCreateInputSchema,
  nofyTemplateInstantiateInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import type { NofyListScope } from "@/mocks/nofy-engine";
import {
  createFolder,
  createNote,
  createTag,
  createTemplate,
  deleteFolder,
  duplicateNote,
  getNote,
  getVersion,
  instantiateTemplate,
  listFolders,
  listNotes,
  listNotesLinkedTo,
  listRefs,
  listTags,
  listTemplates,
  listVersions,
  nofyOverview,
  purgeNote,
  restoreNote,
  restoreVersion,
  searchNofy,
  trashNote,
  updateFolder,
  updateNote,
} from "@/mocks/nofy-engine";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

/**
 * Nofy endpoints — the knowledge workspace's API surface. All reads serve
 * the engine's per-user state; writes are Zod-validated. Reference blocks
 * are re-resolved server-side on every read so entity labels/deep links
 * stay fresh (spec §24).
 */
export const nofyHandlers = [
  /** GET /nofy/overview — knowledge workspace aggregates. */
  http.get(endpoint(apiPaths.nofyOverview), async () => {
    await latency();
    try {
      return HttpResponse.json(nofyOverview());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /nofy/notes?view=&folderId=&tagId=&q=&sort= — filtered note lists.
   *  ?refKind=&refId= instead returns the notes linked to an app entity
   *  (the Playbook / Trade Review integration surface). */
  http.get(endpoint(apiPaths.nofyNotes), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      const refKind = url.searchParams.get("refKind");
      const refId = url.searchParams.get("refId");
      if (refKind && refId) {
        return HttpResponse.json(listNotesLinkedTo(refKind as NofyRefKind, refId));
      }
      const view = url.searchParams.get("view") ?? "all";
      const folderId = url.searchParams.get("folderId");
      const tagId = url.searchParams.get("tagId");
      const q = url.searchParams.get("q") ?? undefined;
      const sort = url.searchParams.get("sort") ?? undefined;
      let scope: NofyListScope;
      if (view === "folder" && folderId) scope = { view: "folder", folderId };
      else if (view === "tag" && tagId) scope = { view: "tag", tagId };
      else scope = { view: view === "favorites" || view === "trash" || view === "recent" ? view : "all" };
      return HttpResponse.json(listNotes(scope, { q, sort }));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /nofy/notes — create (optionally from a template). */
  http.post(endpoint(apiPaths.nofyNotes), async ({ request }) => {
    await latency();
    try {
      const body = parseBody(nofyNoteCreateInputSchema, await readJson(request));
      return HttpResponse.json(createNote(body as NofyNoteCreateInput), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /nofy/notes/:noteId — full note (refs re-resolved, view tracked). */
  http.get(endpoint(apiPaths.nofyNote(":noteId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(getNote(pathParam(params, "noteId"), { touchViewed: true }));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** PATCH /nofy/notes/:noteId — autosave + metadata (version snapshots inside). */
  http.patch(endpoint(apiPaths.nofyNote(":noteId")), async ({ params, request }) => {
    await latency();
    try {
      const body = parseBody(nofyNoteUpdateInputSchema, await readJson(request));
      return HttpResponse.json(updateNote(pathParam(params, "noteId"), body as NofyNoteUpdateInput));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** DELETE /nofy/notes/:noteId — soft delete → Trash. */
  http.delete(endpoint(apiPaths.nofyNote(":noteId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(trashNote(pathParam(params, "noteId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /nofy/notes/:noteId/duplicate. */
  http.post(endpoint(apiPaths.nofyNoteDuplicate(":noteId")), async ({ params, request }) => {
    await latency();
    try {
      const raw = await readJson(request);
      const body = raw === null || raw === undefined ? {} : parseBody(nofyNoteDuplicateInputSchema, raw);
      return HttpResponse.json(duplicateNote(pathParam(params, "noteId"), body as NofyNoteDuplicateInput), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /nofy/notes/:noteId/restore — out of the trash. */
  http.post(endpoint(apiPaths.nofyNoteRestore(":noteId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(restoreNote(pathParam(params, "noteId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** DELETE /nofy/notes/:noteId/permanent — irreversible purge from trash. */
  http.delete(endpoint(apiPaths.nofyNotePermanent(":noteId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(purgeNote(pathParam(params, "noteId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /nofy/notes/:noteId/versions — version history list. */
  http.get(endpoint(apiPaths.nofyNoteVersions(":noteId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(listVersions(pathParam(params, "noteId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /nofy/notes/:noteId/versions/:versionId — one version's blocks. */
  http.get(endpoint(apiPaths.nofyNoteVersion(":noteId", ":versionId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(getVersion(pathParam(params, "noteId"), pathParam(params, "versionId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /nofy/notes/:noteId/versions/:versionId/restore — roll back. */
  http.post(endpoint(apiPaths.nofyNoteVersionRestore(":noteId", ":versionId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(restoreVersion(pathParam(params, "noteId"), pathParam(params, "versionId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /nofy/folders — folders with live note counts. */
  http.get(endpoint(apiPaths.nofyFolders), async () => {
    await latency();
    try {
      return HttpResponse.json(listFolders());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /nofy/folders. */
  http.post(endpoint(apiPaths.nofyFolders), async ({ request }) => {
    await latency();
    try {
      const body = parseBody(nofyFolderCreateInputSchema, await readJson(request));
      return HttpResponse.json(createFolder(body), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** PATCH /nofy/folders/:folderId — rename. */
  http.patch(endpoint(apiPaths.nofyFolder(":folderId")), async ({ params, request }) => {
    await latency();
    try {
      const body = parseBody(nofyFolderUpdateInputSchema, await readJson(request));
      return HttpResponse.json(updateFolder(pathParam(params, "folderId"), body));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** DELETE /nofy/folders/:folderId — notes fall back to "No folder". */
  http.delete(endpoint(apiPaths.nofyFolder(":folderId")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(deleteFolder(pathParam(params, "folderId")));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /nofy/tags — tags with live note counts. */
  http.get(endpoint(apiPaths.nofyTags), async () => {
    await latency();
    try {
      return HttpResponse.json(listTags());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /nofy/tags — create-or-return (idempotent by name). */
  http.post(endpoint(apiPaths.nofyTags), async ({ request }) => {
    await latency();
    try {
      const body = (await readJson(request)) as { name?: unknown };
      const name = typeof body?.name === "string" ? body.name : "";
      return HttpResponse.json(createTag(name), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /nofy/templates — built-in + user templates. */
  http.get(endpoint(apiPaths.nofyTemplates), async () => {
    await latency();
    try {
      return HttpResponse.json(listTemplates());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /nofy/templates — capture a reusable structure. */
  http.post(endpoint(apiPaths.nofyTemplates), async ({ request }) => {
    await latency();
    try {
      const body = parseBody(nofyTemplateCreateInputSchema, await readJson(request));
      return HttpResponse.json(createTemplate(body as NofyTemplateCreateInput), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /nofy/templates/instantiate — new note from a template. */
  http.post(endpoint(apiPaths.nofyTemplatesInstantiate), async ({ request }) => {
    await latency();
    try {
      const body = parseBody(nofyTemplateInstantiateInputSchema, await readJson(request));
      return HttpResponse.json(instantiateTemplate(body as NofyTemplateInstantiateInput), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /nofy/search?q= — full-text across title/content/tags/folder. */
  http.get(endpoint(apiPaths.nofySearch), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      return HttpResponse.json(searchNofy(url.searchParams.get("q") ?? ""));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /nofy/refs?q=&kind= — the entity picker's source. */
  http.get(endpoint(apiPaths.nofyRefs), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      return HttpResponse.json(listRefs(url.searchParams.get("q") ?? "", url.searchParams.get("kind") ?? undefined));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
