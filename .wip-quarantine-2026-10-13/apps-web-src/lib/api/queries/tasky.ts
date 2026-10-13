import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  TaskyBoardResponse,
  TaskyCreateInput,
  TaskyDeleteInput,
  TaskyMoveInput,
  TaskyTask,
  TaskyUpdateInput,
} from "@cosmoz/shared";

import { apiErrorMessage, apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Tasky hooks — the independent kanban board's data layer. One board query;
 * every mutation refreshes it so columns, counts and orders stay in
 * lockstep after a drag, a quick-add or a delete.
 */

export function useTaskyBoard() {
  return useQuery({
    queryKey: queryKeys.taskyBoard,
    queryFn: () => apiRequest<TaskyBoardResponse>(apiPaths.taskyBoard),
  });
}

export function useTaskyCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskyCreateInput) =>
      apiRequest<TaskyTask>(apiPaths.taskyTasks, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskyBoard });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not create the task")),
  });
}

export function useTaskyMoveTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskyMoveInput) =>
      apiRequest<TaskyTask>(apiPaths.taskyTaskMove, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskyBoard });
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskyBoard });
      toast.error(apiErrorMessage(error, "Could not move the task"));
    },
  });
}

export function useTaskyUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskyUpdateInput) =>
      apiRequest<TaskyTask>(apiPaths.taskyTaskUpdate, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskyBoard });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not update the task")),
  });
}

export function useTaskyDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskyDeleteInput) =>
      apiRequest<{ ok: boolean }>(apiPaths.taskyTaskDelete, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskyBoard });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not delete the task")),
  });
}
