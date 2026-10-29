import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  TaskyKanbanAttachment,
  TaskyKanbanAttachmentDownload,
  TaskyKanbanAttachmentMime,
  TaskyKanbanBoardEnvelope,
  TaskyKanbanBoardSaveResponse,
  TaskyKanbanBoardState,
  TaskyAutomationRule,
  TaskyAutomationRuleCreateInput,
  TaskyAutomationRuleUpdateInput,
  TaskyAutomationRulesEnvelope,
  TaskyAutomationRunsEnvelope,
  TaskySavedViewFilters,
  TaskySavedViewCreateResponse,
  TaskySavedViewsEnvelope,
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


/** Saved views are stored server-side and scoped to the authenticated user. */
export function useTaskySavedViews() {
  return useQuery({
    queryKey: queryKeys.taskySavedViews,
    queryFn: () => apiRequest<TaskySavedViewsEnvelope>(apiPaths.taskySavedViews),
  });
}

export function useCreateTaskySavedView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; filters: TaskySavedViewFilters }) =>
      apiRequest<TaskySavedViewCreateResponse>(apiPaths.taskySavedViews, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.taskySavedViews }),
    onError: (error) => toast.error(apiErrorMessage(error, "Tasky could not save this view.")),
  });
}

export function useDeleteTaskySavedView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (viewId: string) =>
      apiRequest<{ deleted: true; id: string }>(apiPaths.taskySavedView(viewId), { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Saved view deleted.");
      return queryClient.invalidateQueries({ queryKey: queryKeys.taskySavedViews });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Tasky could not delete this view.")),
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


// ── Tasky Phase 5: configurable rules, scheduled reminders and execution history ──

export function useTaskyAutomations() {
  return useQuery({
    queryKey: queryKeys.taskyAutomations,
    queryFn: () => apiRequest<TaskyAutomationRulesEnvelope>(apiPaths.taskyAutomations),
  });
}

export function useCreateTaskyAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskyAutomationRuleCreateInput) =>
      apiRequest<{ rule: TaskyAutomationRule }>(apiPaths.taskyAutomations, {
        method: "POST",
        body: input,
      }),
    onSuccess: async () => {
      toast.success("Automation rule created.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskyAutomations });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Tasky could not create this rule.")),
  });
}

export function useUpdateTaskyAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, input }: { ruleId: string; input: TaskyAutomationRuleUpdateInput }) =>
      apiRequest<{ rule: TaskyAutomationRule }>(apiPaths.taskyAutomation(ruleId), {
        method: "PATCH",
        body: input,
      }),
    onSuccess: async () => {
      toast.success("Automation rule updated.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskyAutomations });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Tasky could not update this rule.")),
  });
}

export function useDeleteTaskyAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      apiRequest<{ deleted: true; id: string }>(apiPaths.taskyAutomation(ruleId), { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Automation rule deleted. Its execution history is retained.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskyAutomations });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskyAutomationRuns });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Tasky could not delete this rule.")),
  });
}

export function useTaskyAutomationRuns() {
  return useQuery({
    queryKey: queryKeys.taskyAutomationRuns,
    queryFn: () => apiRequest<TaskyAutomationRunsEnvelope>(apiPaths.taskyAutomationRuns),
    refetchInterval: 30_000,
  });
}

export function useCheckTaskyDueDates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<{ checked: true; notificationsCreated: number }>(
      apiPaths.taskyDueDateCheck,
      { method: "POST" },
    ),
    onSuccess: async (result) => {
      toast.success(`Due-date check complete: ${result.notificationsCreated} new notification(s).`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskyAutomationRuns });
      await queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Tasky could not check due dates.")),
  });
}

export function useRemindTaskyCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) =>
      apiRequest<{ sent: true }>(apiPaths.taskyCardRemind(cardId), { method: "POST" }),
    onSuccess: async () => {
      toast.success("Reminder sent to your Euforia notification inbox.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskyAutomationRuns });
      await queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Tasky could not create this reminder.")),
  });
}
