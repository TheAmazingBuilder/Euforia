import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSessionNoteInput,
  DeleteReviewResponse,
  SessionNote,
  SessionNotesResponse,
  SessionTimelineResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** GET /session/timeline - today's events + mood strip (server-assembled). */
export function useSessionTimeline() {
  return useQuery({
    queryKey: queryKeys.sessionTimeline,
    queryFn: () => apiRequest<SessionTimelineResponse>(apiPaths.sessionTimeline),
  });
}

// ── Session logbook (timestamped in-session notes) ─────────────────────────

/** GET /session/notes - today's logbook, oldest first (server-resolved day). */
export function useSessionNotes() {
  return useQuery({
    queryKey: queryKeys.sessionNotes,
    queryFn: () => apiRequest<SessionNotesResponse>(apiPaths.sessionNotes),
  });
}

/** POST /session/notes - the server stamps date + wall-clock time. */
export function useCreateSessionNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSessionNoteInput) =>
      apiRequest<SessionNote>(apiPaths.sessionNotes, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionNotes });
    },
  });
}

/** DELETE /session/notes/:noteId - undo a mistyped entry. */
export function useDeleteSessionNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      apiRequest<DeleteReviewResponse>(apiPaths.sessionNote(noteId), { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessionNotes }),
  });
}
