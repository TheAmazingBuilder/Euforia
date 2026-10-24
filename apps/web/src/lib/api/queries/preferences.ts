import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DeactivateAccountInput,
  DeactivateAccountResponse,
  PreferenceDomain,
  RequestAccountDeletionInput,
  RequestAccountDeletionResponse,
  ResetPreferencesInput,
  UserPreferences,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Preferences domain hooks (Settings module). Each domain card saves ITSELF
 * (PATCH /me/preferences/:domain with the full domain object) - unrelated
 * settings are never saved together. Updates write straight into the query
 * cache with a snapshot rollback on failure.
 */

/** GET /me/preferences - the whole structured preferences document. */
export function usePreferences() {
  return useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => apiRequest<UserPreferences>(apiPaths.preferences),
  });
}

/** PATCH /me/preferences/:domain - replace one validated domain. */
export function useUpdatePreferencesDomain<TDomain extends PreferenceDomain>(
  domain: TDomain,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UserPreferences[TDomain]) =>
      apiRequest<UserPreferences>(apiPaths.preferenceDomain(domain), {
        method: "PATCH",
        body: input,
      }),
    // Optimistic update - the settings UI feels instant, rolls back on 4xx.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.preferences });
      const previous = queryClient.getQueryData<UserPreferences>(queryKeys.preferences);
      if (previous) {
        queryClient.setQueryData<UserPreferences>(queryKeys.preferences, {
          ...previous,
          [domain]: input,
          updatedAt: new Date().toISOString(),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.preferences, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.preferences });
    },
  });
}

/** POST /me/preferences/reset - restore one domain to the safe defaults. */
export function useResetPreferencesDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResetPreferencesInput) =>
      apiRequest<UserPreferences>(apiPaths.preferencesReset, { method: "POST", body: input }),
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKeys.preferences, preferences);
    },
  });
}

/** POST /me/deactivate - pause the account (typed confirmation). */
export function useDeactivateAccount() {
  return useMutation({
    mutationFn: (input: DeactivateAccountInput) =>
      apiRequest<DeactivateAccountResponse>(apiPaths.accountDeactivate, {
        method: "POST",
        body: input,
      }),
  });
}

/** POST /me/delete - schedule account deletion (typed confirmation). */
export function useRequestAccountDeletion() {
  return useMutation({
    mutationFn: (input: RequestAccountDeletionInput) =>
      apiRequest<RequestAccountDeletionResponse>(apiPaths.accountDelete, {
        method: "POST",
        body: input,
      }),
  });
}
