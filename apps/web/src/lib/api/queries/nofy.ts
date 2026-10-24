import { toast } from "sonner";
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  NofyFolder,
  NofyFolderCreateInput,
  NofyFoldersResponse,
  NofyNote,
  NofyNoteCreateInput,
  NofyNoteResponse,
  NofyNotesResponse,
  NofyNoteUpdateInput,
  NofyOverviewResponse,
  NofyRefKind,
  NofyRefsResponse,
  NofySearchResponse,
  NofyTagsResponse,
  NofyTemplateCreateInput,
  NofyTemplateInstantiateInput,
  NofyTemplatesResponse,
  NofyVersionsResponse,
} from "@cosmoz/shared";

import { apiErrorMessage, apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Nofy hooks - the knowledge workspace's data layer. List queries key on
 * the full view/filter signature; every mutation invalidates the aggregates
 * so Overview, My Notes, Folders and Favorites stay in lockstep.
 */

export type NofyNotesParams = {
  view: "all" | "favorites" | "trash" | "folder" | "tag";
  folderId: string;
  tagId: string;
  q: string;
  sort: string;
};

export const NOFY_DEFAULT_PARAMS: NofyNotesParams = {
  view: "all",
  folderId: "",
  tagId: "",
  q: "",
  sort: "updated",
};

export function useNofyOverview() {
  return useQuery({
    queryKey: queryKeys.nofyOverview,
    queryFn: () => apiRequest<NofyOverviewResponse>(apiPaths.nofyOverview),
  });
}

export function useNofyNotes(params: NofyNotesParams) {
  const query: Record<string, string> = { view: params.view };
  if (params.view === "folder" && params.folderId) query.folderId = params.folderId;
  if (params.view === "tag" && params.tagId) query.tagId = params.tagId;
  if (params.q.trim() !== "") query.q = params.q;
  if (params.sort !== "updated") query.sort = params.sort;
  return useQuery({
    queryKey: queryKeys.nofyNotes(params.view, params.folderId, params.tagId, params.q, params.sort),
    queryFn: () => apiRequest<NofyNotesResponse>(apiPaths.nofyNotes, { query }),
  });
}

export function useNofyNote(noteId: string | null) {
  return useQuery({
    queryKey: queryKeys.nofyNote(noteId ?? "none"),
    queryFn: () => apiRequest<NofyNoteResponse>(apiPaths.nofyNote(noteId ?? "")),
    enabled: noteId !== null && noteId !== "",
  });
}

/**
 * Notes linked to an app entity (Playbook strategy, reviewed trade, …) -
 * the entity side of the Nofy↔Playbook/Trade-Review integration. Keyed
 * under the "nofy-notes" root so any note mutation invalidates it.
 */
export function useNofyLinkedNotes(kind: NofyRefKind, id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.nofyLinkedNotes(kind, id ?? "none"),
    queryFn: () =>
      apiRequest<NofyNotesResponse>(apiPaths.nofyNotes, { query: { refKind: kind, refId: id ?? "" } }),
    enabled: typeof id === "string" && id !== "",
  });
}

export function useNofyFolders() {
  return useQuery({
    queryKey: queryKeys.nofyFolders,
    queryFn: () => apiRequest<NofyFoldersResponse>(apiPaths.nofyFolders),
  });
}

export function useNofyTags() {
  return useQuery({
    queryKey: queryKeys.nofyTags,
    queryFn: () => apiRequest<NofyTagsResponse>(apiPaths.nofyTags),
  });
}

export function useNofyTemplates() {
  return useQuery({
    queryKey: queryKeys.nofyTemplates,
    queryFn: () => apiRequest<NofyTemplatesResponse>(apiPaths.nofyTemplates),
  });
}

export function useNofySearch(query: string) {
  return useQuery({
    queryKey: queryKeys.nofySearch(query),
    queryFn: () => apiRequest<NofySearchResponse>(apiPaths.nofySearch, { query: { q: query } }),
    enabled: query.trim().length > 0,
  });
}

export function useNofyRefs(query: string, kind: string) {
  return useQuery({
    queryKey: queryKeys.nofyRefs(query, kind),
    queryFn: () => apiRequest<NofyRefsResponse>(apiPaths.nofyRefs, { query: { q: query, kind: kind || undefined } }),
  });
}

export function useNofyVersions(noteId: string | null) {
  return useQuery({
    queryKey: queryKeys.nofyVersions(noteId ?? "none"),
    queryFn: () => apiRequest<NofyVersionsResponse>(apiPaths.nofyNoteVersions(noteId ?? "")),
    enabled: noteId !== null && noteId !== "",
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

function useNofyInvalidator() {
  const queryClient = useQueryClient();
  return React.useCallback(
    () => {
      for (const key of queryKeys.nofyAggregates) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [queryClient],
  );
}
export function useCreateNofyNote(options: { onCreated?: (note: NofyNote) => void } = {}) {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: (input: NofyNoteCreateInput) =>
      apiRequest<NofyNoteResponse>(apiPaths.nofyNotes, { method: "POST", body: input }),
    onSuccess: (data) => {
      invalidate();
      options.onCreated?.(data.note);
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to create the note.")),
  });
}

/**
 * The autosave PATCH - silent success (the editor shows its own save
 * status and remains the source of truth for the open note), toast only
 * on failure so content is never silently lost.
 */
export function useUpdateNofyNote() {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: ({ noteId, ...input }: NofyNoteUpdateInput & { noteId: string }) =>
      apiRequest<NofyNoteResponse>(apiPaths.nofyNote(noteId), { method: "PATCH", body: input }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to save your note. Your content is still available locally.")),
  });
}

export function useTrashNofyNote() {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: (noteId: string) =>
      apiRequest<{ ok: true }>(apiPaths.nofyNote(noteId), { method: "DELETE" }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to move the note to trash.")),
  });
}

export function useDuplicateNofyNote() {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: ({ noteId, title }: { noteId: string; title?: string }) =>
      apiRequest<NofyNoteResponse>(apiPaths.nofyNoteDuplicate(noteId), {
        method: "POST",
        body: title === undefined ? {} : { title },
      }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to duplicate the note.")),
  });
}

export function useRestoreNofyNote() {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: (noteId: string) =>
      apiRequest<{ ok: true }>(apiPaths.nofyNoteRestore(noteId), { method: "POST" }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to restore the note.")),
  });
}

export function usePurgeNofyNote() {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: (noteId: string) =>
      apiRequest<{ ok: true }>(apiPaths.nofyNotePermanent(noteId), { method: "DELETE" }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to delete the note permanently.")),
  });
}

export function useCreateNofyFolder() {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: (input: NofyFolderCreateInput) =>
      apiRequest<NofyFolder & { noteCount: number }>(apiPaths.nofyFolders, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to create the folder.")),
  });
}

export function useUpdateNofyFolder() {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: ({ folderId, ...input }: NofyFolderCreateInput & { folderId: string }) =>
      apiRequest<NofyFolder & { noteCount: number }>(apiPaths.nofyFolder(folderId), { method: "PATCH", body: input }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to rename the folder.")),
  });
}

export function useDeleteNofyFolder() {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: (folderId: string) =>
      apiRequest<{ ok: true }>(apiPaths.nofyFolder(folderId), { method: "DELETE" }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to delete the folder.")),
  });
}

export function useCreateNofyTag() {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: (name: string) =>
      apiRequest<{ id: string; name: string; noteCount: number }>(apiPaths.nofyTags, { method: "POST", body: { name } }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to create the tag.")),
  });
}

export function useCreateNofyTemplate() {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: (input: NofyTemplateCreateInput) =>
      apiRequest<NofyTemplatesResponse["templates"][number]>(apiPaths.nofyTemplates, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to save the template.")),
  });
}

export function useInstantiateNofyTemplate(options: { onCreated?: (note: NofyNote) => void } = {}) {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: (input: NofyTemplateInstantiateInput) =>
      apiRequest<NofyNoteResponse>(apiPaths.nofyTemplatesInstantiate, { method: "POST", body: input }),
    onSuccess: (data) => {
      invalidate();
      options.onCreated?.(data.note);
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to create a note from this template.")),
  });
}

export function useRestoreNofyVersion() {
  const invalidate = useNofyInvalidator();
  return useMutation({
    mutationFn: ({ noteId, versionId }: { noteId: string; versionId: string }) =>
      apiRequest<NofyNoteResponse>(
        apiPaths.nofyNoteVersionRestore(noteId, versionId),
        { method: "POST" },
      ),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(apiErrorMessage(error, "Unable to restore this version.")),
  });
}
