import React from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AcademyBookmarkToggleInput,
  AcademyBookmarkToggleResponse,
  AcademyBookmarksResponse,
  AcademyCatalogResponse,
  AcademyCheckpointInput,
  AcademyCheckpointResult,
  AcademyCourseDetailResponse,
  AcademyGlossaryResponse,
  AcademyLessonCompleteResponse,
  AcademyLessonResponse,
  AcademyNoteInput,
  AcademyNoteResponse,
  AcademyOverviewResponse,
  AcademyPatternDrill,
  AcademyPracticeLogInput,
  AcademyPracticeLogResponse,
  AcademyProgressResponse,
  AcademyQuizQuestionPublic,
  AcademyQuizResultResponse,
  AcademyQuizSubmitInput,
  AcademySearchResponse,
} from "@cosmoz/shared";

import { apiErrorMessage, apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Academy hooks — the learning platform's data layer. Reading aggregates
 * (catalog/overview/progress) stays cheap; every mutation refreshes the
 * aggregates so Overview, Courses and Progress stay in lockstep.
 */

export function useAcademyCatalog() {
  return useQuery({
    queryKey: queryKeys.academyCatalog,
    queryFn: () => apiRequest<AcademyCatalogResponse>(apiPaths.academyCatalog),
  });
}

export function useAcademyOverview() {
  return useQuery({
    queryKey: queryKeys.academyOverview,
    queryFn: () => apiRequest<AcademyOverviewResponse>(apiPaths.academyOverview),
  });
}

export function useAcademyProgress() {
  return useQuery({
    queryKey: queryKeys.academyProgress,
    queryFn: () => apiRequest<AcademyProgressResponse>(apiPaths.academyProgress),
  });
}

export function useAcademyCourse(courseId: string | null) {
  return useQuery({
    queryKey: queryKeys.academyCourse(courseId ?? "none"),
    queryFn: () => apiRequest<AcademyCourseDetailResponse>(apiPaths.academyCourse(courseId ?? "")),
    enabled: courseId !== null && courseId !== "",
  });
}

export function useAcademyLesson(lessonId: string | null) {
  return useQuery({
    queryKey: queryKeys.academyLesson(lessonId ?? "none"),
    queryFn: () => apiRequest<AcademyLessonResponse>(apiPaths.academyLesson(lessonId ?? "")),
    enabled: lessonId !== null && lessonId !== "",
  });
}

export type AcademyQuizResponse = {
  id: string;
  courseId: string;
  courseTitle: string;
  questions: AcademyQuizQuestionPublic[];
};

export function useAcademyQuiz(quizId: string | null) {
  return useQuery({
    queryKey: queryKeys.academyQuiz(quizId ?? "none"),
    queryFn: () => apiRequest<AcademyQuizResponse>(apiPaths.academyQuiz(quizId ?? "")),
    enabled: quizId !== null && quizId !== "",
  });
}

export function useAcademyGlossary(query: string) {
  return useQuery({
    queryKey: queryKeys.academyGlossary(query),
    queryFn: () => apiRequest<AcademyGlossaryResponse>(apiPaths.academyGlossary, { query: { q: query || undefined } }),
  });
}

export function useAcademySearch(query: string) {
  return useQuery({
    queryKey: queryKeys.academySearch(query),
    queryFn: () => apiRequest<AcademySearchResponse>(apiPaths.academySearch, { query: { q: query } }),
    enabled: query.trim().length > 0,
  });
}

export function useAcademyBookmarks() {
  return useQuery({
    queryKey: queryKeys.academyBookmarks,
    queryFn: () => apiRequest<AcademyBookmarksResponse>(apiPaths.academyBookmarks),
  });
}

export function useAcademyPatternDrill() {
  return useQuery({
    queryKey: queryKeys.academyPatternDrill,
    queryFn: () => apiRequest<AcademyPatternDrill>(apiPaths.academyPatternDrill),
    // Drills are deliberately stateful per fetch — no caching, no refetch storms.
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

/** Internal: invalidate every academy aggregate after a learning mutation. */
function useInvalidateAcademy() {
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    // Each entry is itself a key array — invalidate them one by one
    // (a single array of arrays would be treated as one hierarchical key).
    for (const key of queryKeys.academyAggregates) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }, [queryClient]);
}

export function useCompleteLesson() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAcademy();
  return useMutation({
    mutationFn: (lessonId: string) =>
      apiRequest<AcademyLessonCompleteResponse>(apiPaths.academyLessonComplete(lessonId), { method: "POST", body: {} }),
    onSuccess: (result) => {
      invalidate();
      // The lesson detail itself also carries `completed` — refresh it too.
      void queryClient.invalidateQueries({ queryKey: ["academy-lesson", result.lessonId] });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not save lesson progress")),
  });
}

export function useSubmitQuiz(quizId: string) {
  const invalidate = useInvalidateAcademy();
  return useMutation({
    mutationFn: (input: AcademyQuizSubmitInput) =>
      apiRequest<AcademyQuizResultResponse>(apiPaths.academyQuizSubmit(quizId), { method: "POST", body: input }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(apiErrorMessage(error, "Could not submit the quiz")),
  });
}

export function useToggleBookmark() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAcademy();
  return useMutation({
    mutationFn: (input: AcademyBookmarkToggleInput) =>
      apiRequest<AcademyBookmarkToggleResponse>(apiPaths.academyBookmarks, { method: "POST", body: input }),
    onSuccess: (result) => {
      invalidate();
      // Keep the open lesson/glossary detail in sync with the new state.
      void queryClient.invalidateQueries({ queryKey: ["academy-lesson"] });
      void queryClient.invalidateQueries({ queryKey: ["academy-glossary"] });
      void result;
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not update the bookmark")),
  });
}

export function useLogPractice() {
  const invalidate = useInvalidateAcademy();
  return useMutation({
    mutationFn: (input: AcademyPracticeLogInput) =>
      apiRequest<AcademyPracticeLogResponse>(apiPaths.academyPracticeLog, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
    // Practice logging is fire-and-forget by design — no toasts on failure.
  });
}

export function useSubmitCheckpoint(lessonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AcademyCheckpointInput) =>
      apiRequest<AcademyCheckpointResult>(apiPaths.academyCheckpoint(lessonId), { method: "POST", body: input }),
    // The result renders inline; aggregates refresh quietly (practice counters).
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.academyProgress });
      void queryClient.invalidateQueries({ queryKey: queryKeys.academyOverview });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not grade the checkpoint")),
  });
}

export function useSaveLessonNote(lessonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AcademyNoteInput) =>
      apiRequest<AcademyNoteResponse>(apiPaths.academyLessonNote(lessonId), { method: "PUT", body: input }),
    onSuccess: () => {
      // The lesson payload carries the note — refresh it so revisits show the
      // saved text even from cache-first mounts.
      void queryClient.invalidateQueries({ queryKey: queryKeys.academyLesson(lessonId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.academyOverview });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not save the note")),
  });
}
