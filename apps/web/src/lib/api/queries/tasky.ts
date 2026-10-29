import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  TaskyKanbanAttachment,
  TaskyKanbanAttachmentDownload,
  TaskyKanbanAttachmentMime,
  TaskyKanbanBoardEnvelope,
  TaskyKanbanBoardSaveResponse,
  TaskyKanbanBoardState,
} from "@cosmoz/shared";
import { apiErrorMessage, apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** Loads the authenticated user's independent Tasky board from PostgreSQL. */
export function useTaskyBoard() {
  return useQuery({
    queryKey: queryKeys.taskyBoard,
    queryFn: () => apiRequest<TaskyKanbanBoardEnvelope>(apiPaths.taskyBoard),
  });
}

/** Persists one validated board snapshot; the caller serializes saves in order. */
export function useSaveTaskyBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (board: TaskyKanbanBoardState) =>
      apiRequest<TaskyKanbanBoardSaveResponse>(apiPaths.taskyBoard, {
        method: "PUT",
        body: board,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData<TaskyKanbanBoardEnvelope>(queryKeys.taskyBoard, {
        board: saved.board,
      });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, "Tasky could not save your board. Check the connection and try again.")),
  });
}


export interface TaskyAttachmentUploadPayload {
  cardId: string;
  fileName: string;
  mimeType: TaskyKanbanAttachmentMime;
  contentBase64: string;
}

/** Loads private file metadata for the selected card only. */
export function useTaskyCardAttachments(cardId: string | null) {
  return useQuery({
    queryKey: queryKeys.taskyAttachments(cardId),
    enabled: Boolean(cardId),
    queryFn: () => apiRequest<{ attachments: TaskyKanbanAttachment[] }>(
      apiPaths.taskyCardAttachments(cardId!),
    ),
  });
}

export function useUploadTaskyAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskyAttachmentUploadPayload) =>
      apiRequest<{ attachment: TaskyKanbanAttachment }>(
        apiPaths.taskyCardAttachments(input.cardId),
        {
          method: "POST",
          body: { fileName: input.fileName, mimeType: input.mimeType, contentBase64: input.contentBase64 },
        },
      ),
    onSuccess: (_result, input) => queryClient.invalidateQueries({
      queryKey: queryKeys.taskyAttachments(input.cardId),
    }),
    onError: (error) => toast.error(apiErrorMessage(error, "Tasky could not upload this attachment.")),
  });
}

export function useDeleteTaskyAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { cardId: string; attachmentId: string }) =>
      apiRequest<{ deleted: true; id: string }>(
        apiPaths.taskyCardAttachment(input.cardId, input.attachmentId),
        { method: "DELETE" },
      ),
    onSuccess: (_result, input) => queryClient.invalidateQueries({
      queryKey: queryKeys.taskyAttachments(input.cardId),
    }),
    onError: (error) => toast.error(apiErrorMessage(error, "Tasky could not delete this attachment.")),
  });
}

export function useDownloadTaskyAttachment() {
  return useMutation({
    mutationFn: (input: { cardId: string; attachmentId: string }) =>
      apiRequest<TaskyKanbanAttachmentDownload>(
        apiPaths.taskyCardAttachmentDownload(input.cardId, input.attachmentId),
      ),
    onError: (error) => toast.error(apiErrorMessage(error, "Tasky could not download this attachment.")),
  });
}
