import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
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
