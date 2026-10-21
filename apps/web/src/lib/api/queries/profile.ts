import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Profile, ProfileUpdateInput } from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** GET /me — the signed-in trader's identity. */
export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiRequest<Profile>(apiPaths.me),
  });
}

/** PATCH /me — direct profile editing (name, email, timezone). */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileUpdateInput) =>
      apiRequest<Profile>(apiPaths.me, { method: "PATCH", body: input }),
    onSuccess: async (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
    },
  });
}
