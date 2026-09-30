import { http, HttpResponse } from "msw";
import type {
  AcademyBookmarkToggleInput,
  AcademyPracticeLogInput,
  AcademyQuizSubmitInput,
} from "@cosmoz/shared";
import {
  academyBookmarkToggleInputSchema,
  academyPracticeLogInputSchema,
  academyQuizSubmitInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import {
  academyBookmarks,
  academyCatalog,
  academyCourseDetail,
  academyGlossary,
  academyLesson,
  academyOverview,
  academyProgress,
  academyQuiz,
  academySearch,
  completeLesson,
  logPractice,
  patternDrill,
  submitQuiz,
  toggleBookmark,
} from "@/mocks/academy-engine";
import { MockError } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, toErrorResponse } from "./utils";

/**
 * Academy endpoints — the learning platform's API surface. Content is served
 * from the authored catalog; per-user state lives in the academy engine.
 * Quiz submissions and practice logs are Zod-validated before grading.
 */
export const academyHandlers = [
  /** GET /academy/catalog — categories + course cards with per-user progress. */
  http.get(endpoint(apiPaths.academyCatalog), async () => {
    await latency();
    try {
      return HttpResponse.json(academyCatalog());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/overview — continue learning, stats, recommendations. */
  http.get(endpoint(apiPaths.academyOverview), async () => {
    await latency();
    try {
      return HttpResponse.json(academyOverview());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/progress — overall + per-category progress. */
  http.get(endpoint(apiPaths.academyProgress), async () => {
    await latency();
    try {
      return HttpResponse.json(academyProgress());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/courses/:courseId — course detail with lesson list. */
  http.get(endpoint(apiPaths.academyCourse(":courseId")), async ({ params }) => {
    await latency();
    try {
      const course = academyCourseDetail(pathParam(params, "courseId"));
      if (!course) {
        return HttpResponse.json({ error: "Course not found" }, { status: 404 });
      }
      return HttpResponse.json(course);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/lessons/:lessonId — full lesson content (visual blocks). */
  http.get(endpoint(apiPaths.academyLesson(":lessonId")), async ({ params }) => {
    await latency();
    try {
      const lesson = academyLesson(pathParam(params, "lessonId"));
      if (!lesson) {
        return HttpResponse.json({ error: "Lesson not found" }, { status: 404 });
      }
      return HttpResponse.json(lesson);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /academy/lessons/:lessonId/complete — mark completed (idempotent). */
  http.post(endpoint(apiPaths.academyLessonComplete(":lessonId")), async ({ params }) => {
    await latency();
    try {
      const result = completeLesson(pathParam(params, "lessonId"));
      if (!result) {
        return HttpResponse.json({ error: "Lesson not found" }, { status: 404 });
      }
      return HttpResponse.json(result);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/quizzes/:quizId — public questions (answers stripped). */
  http.get(endpoint(apiPaths.academyQuiz(":quizId")), async ({ params }) => {
    await latency();
    try {
      const quiz = academyQuiz(pathParam(params, "quizId"));
      if (!quiz) {
        return HttpResponse.json({ error: "Quiz not found" }, { status: 404 });
      }
      return HttpResponse.json(quiz);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /academy/quizzes/:quizId/attempts — grade server-side. */
  http.post(endpoint(apiPaths.academyQuizSubmit(":quizId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody<AcademyQuizSubmitInput>(
        academyQuizSubmitInputSchema,
        await request.json().catch(() => null),
      );
      const result = submitQuiz(pathParam(params, "quizId"), input);
      if (!result) {
        return HttpResponse.json({ error: "Quiz not found" }, { status: 404 });
      }
      return HttpResponse.json(result);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/glossary?q= — searchable glossary. */
  http.get(endpoint(apiPaths.academyGlossary), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      return HttpResponse.json(academyGlossary(url.searchParams.get("q") ?? undefined));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/search?q= — courses + lessons + glossary. */
  http.get(endpoint(apiPaths.academySearch), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      return HttpResponse.json(academySearch(url.searchParams.get("q") ?? ""));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/bookmarks — user bookmarks (lessons + glossary terms). */
  http.get(endpoint(apiPaths.academyBookmarks), async () => {
    await latency();
    try {
      return HttpResponse.json(academyBookmarks());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /academy/bookmarks — toggle a bookmark (kind + refId). */
  http.post(endpoint(apiPaths.academyBookmarks), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<AcademyBookmarkToggleInput>(
        academyBookmarkToggleInputSchema,
        await request.json().catch(() => null),
      );
      const result = toggleBookmark(input);
      if (!result) {
        throw new MockError(404, "Bookmark target not found");
      }
      return HttpResponse.json(result);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /academy/practice/log — record a drill attempt. */
  http.post(endpoint(apiPaths.academyPracticeLog), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<AcademyPracticeLogInput>(
        academyPracticeLogInputSchema,
        await request.json().catch(() => null),
      );
      return HttpResponse.json(logPractice(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/practice/pattern-drill — one randomized pattern drill. */
  http.get(endpoint(apiPaths.academyPatternDrill), async () => {
    await latency();
    try {
      const drill = patternDrill();
      if (!drill) {
        return HttpResponse.json({ error: "No drills available" }, { status: 404 });
      }
      return HttpResponse.json(drill);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
