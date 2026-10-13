import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSocialPostInput,
  SocialOverviewResponse,
  SocialPeriod,
  SocialPost,
  SocialMe,
  ToggleFollowResponse,
  ToggleLikeResponse,
  UpdateSocialMeInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Social Trading hooks — the trading floor (share card, leaderboards,
 * community feed). Every social mutation invalidates the whole social
 * subtree so the card, the classement and the feed stay in sync.
 */

/** GET /social/overview?period=… — card + classement + feed in one shot. */
export function useSocialOverview(period: SocialPeriod) {
  return useQuery({
    queryKey: queryKeys.socialOverview(period),
    queryFn: () =>
      apiRequest<SocialOverviewResponse>(
        `${apiPaths.socialOverview}?period=${period}`,
      ),
  });
}

/** GET /social/me — the shareable card alone (profile identity block). */
export function useSocialMe() {
  return useQuery({
    queryKey: queryKeys.socialMe,
    queryFn: () => apiRequest<SocialMe>(apiPaths.socialMe),
  });
}

function useSocialInvalidation() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.socialRoot });
  };
}

/** PATCH /social/me — publish/unpublish the card, rename the handle. */
export function useUpdateSocialMe() {
  const invalidate = useSocialInvalidation();
  return useMutation({
    mutationFn: (input: UpdateSocialMeInput) =>
      apiRequest<SocialMe>(apiPaths.socialMe, { method: "PATCH", body: input }),
    onSuccess: () => invalidate(),
  });
}

/** POST /social/posts — share a result / lesson / milestone. */
export function useCreateSocialPost() {
  const invalidate = useSocialInvalidation();
  return useMutation({
    mutationFn: (input: CreateSocialPostInput) =>
      apiRequest<SocialPost>(apiPaths.socialPosts, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

/** POST /social/posts/:id/like — toggle my like on a feed post. */
export function useToggleSocialPostLike() {
  const invalidate = useSocialInvalidation();
  return useMutation({
    mutationFn: (postId: string) =>
      apiRequest<ToggleLikeResponse>(apiPaths.socialPostLike(postId), { method: "POST" }),
    onSuccess: () => invalidate(),
  });
}

/** POST /social/traders/:id/follow — toggle follow on a member. */
export function useToggleSocialFollow() {
  const invalidate = useSocialInvalidation();
  return useMutation({
    mutationFn: (traderId: string) =>
      apiRequest<ToggleFollowResponse>(apiPaths.socialFollow(traderId), { method: "POST" }),
    onSuccess: () => invalidate(),
  });
}
