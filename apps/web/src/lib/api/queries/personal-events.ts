"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PersonalEventsBoardResponse,
  PersonalEventsBoardSaveResponse,
  PersonalEventsState,
} from "@cosmoz/shared";

import { apiErrorMessage, apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";
import { toast } from "sonner";

/** Load the current user's personal Events board without any demo-data fallback. */
export function usePersonalEventsBoard() {
  return useQuery({
    queryKey: queryKeys.personalEventsBoard,
    queryFn: () => apiRequest<PersonalEventsBoardResponse>(apiPaths.personalEventsBoard),
  });
}

/** Persist the complete calendar snapshot for the authenticated user. */
export function useSavePersonalEventsBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (state: PersonalEventsState) =>
      apiRequest<PersonalEventsBoardSaveResponse>(apiPaths.personalEventsBoard, {
        method: "PUT",
        body: state,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData<PersonalEventsBoardResponse>(
        queryKeys.personalEventsBoard,
        { state: saved.state, updatedAt: saved.updatedAt },
      );
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Your calendar could not be saved. Check your connection and try again."));
    },
  });
}
