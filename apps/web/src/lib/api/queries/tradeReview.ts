import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateGoalInput,
  DeleteReviewResponse,
  GoalWithProgress,
  GoalsResponse,
  LessonsResponse,
  ReviewRow,
  ReviewsResponse,
  TradeReviewOverviewResponse,
  UpdateGoalInput,
  UpsertReviewInput,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Trade Review hooks — the review workflow fused with Goal setting.
 * Review mutations ripple into Analytics (lessons/followedPlan live on the
 * trade) and into goal progress (FOLLOWED_PLAN_PCT is computed from trades).
 */

export function useReviewOverview() {
  return useQuery({
    queryKey: queryKeys.reviewWorkspaceOverview,
    queryFn: () => apiRequest<TradeReviewOverviewResponse>(apiPaths.reviewWorkspaceOverview),
  });
}

export function useReviews() {
  return useQuery({
    queryKey: queryKeys.reviewWorkspace,
    queryFn: () => apiRequest<ReviewsResponse>(apiPaths.reviewWorkspace),
  });
}

export function useReviewLessons() {
  return useQuery({
    queryKey: queryKeys.reviewLessons,
    queryFn: () => apiRequest<LessonsResponse>(apiPaths.reviewLessons),
  });
}

export function useGoals() {
  return useQuery({
    queryKey: queryKeys.goals,
    queryFn: () => apiRequest<GoalsResponse>(apiPaths.goals),
  });
}

/** Everything a review mutation must refresh, in one place. */
function useReviewInvalidation() {
  const queryClient = useQueryClient();
  return React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewWorkspaceRoot }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewLessons }),
      queryClient.invalidateQueries({ queryKey: queryKeys.goalsRoot }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tradesRoot }),
      queryClient.invalidateQueries({ queryKey: queryKeys.analyticsSuiteRoot }),
    ]);
  }, [queryClient]);
}

/** PUT /reviews/:tradeId — create or update the post-trade review. */
export function useUpsertReview() {
  const invalidate = useReviewInvalidation();
  return useMutation({
    mutationFn: (input: UpsertReviewInput) =>
      apiRequest<ReviewRow>(apiPaths.reviewWorkspaceEntry(input.tradeId), {
        method: "PUT",
        body: input,
      }),
    onSuccess: () => void invalidate(),
  });
}

/** DELETE /reviews/:tradeId — undo a review; the trade returns to pending. */
export function useDeleteReview() {
  const invalidate = useReviewInvalidation();
  return useMutation({
    mutationFn: (tradeId: string) =>
      apiRequest<DeleteReviewResponse>(apiPaths.reviewWorkspaceEntry(tradeId), {
        method: "DELETE",
      }),
    onSuccess: () => void invalidate(),
  });
}

function useGoalInvalidation() {
  const queryClient = useQueryClient();
  return React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.goalsRoot }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewWorkspaceRoot }),
    ]);
  }, [queryClient]);
}

/** POST /goals — progress is computed server-side; nothing else to seed. */
export function useCreateGoal() {
  const invalidate = useGoalInvalidation();
  return useMutation({
    mutationFn: (input: CreateGoalInput) =>
      apiRequest<GoalWithProgress>(apiPaths.goals, { method: "POST", body: input }),
    onSuccess: () => void invalidate(),
  });
}

/** PATCH /goals/:goalId */
export function useUpdateGoal() {
  const invalidate = useGoalInvalidation();
  return useMutation({
    mutationFn: ({ goalId, input }: { goalId: string; input: UpdateGoalInput }) =>
      apiRequest<GoalWithProgress>(apiPaths.goal(goalId), { method: "PATCH", body: input }),
    onSuccess: () => void invalidate(),
  });
}

/** DELETE /goals/:goalId */
export function useDeleteGoal() {
  const invalidate = useGoalInvalidation();
  return useMutation({
    mutationFn: (goalId: string) =>
      apiRequest<{ ok: boolean }>(apiPaths.goal(goalId), { method: "DELETE" }),
    onSuccess: () => void invalidate(),
  });
}
