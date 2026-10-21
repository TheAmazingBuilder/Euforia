import { http, HttpResponse } from "msw";
import type {
  AcademyBookmarkToggleInput,
  AcademyCheckpointInput,
  AcademyFlashcardReviewInput,
  AcademyNoteInput,
  AcademyPracticeLogInput,
  AcademyQuizSubmitInput,
} from "@cosmoz/shared";
import {
  academyBookmarkToggleInputSchema,
  academyCheckpointInputSchema,
  academyEventRegisterInputSchema,
  academyFlashcardReviewInputSchema,
  academyNoteInputSchema,
  academyPracticeLogInputSchema,
  academyQuizSubmitInputSchema,
  academyTaskCreateInputSchema,
  academyTaskDeleteInputSchema,
  academyTaskToggleInputSchema,
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
  academyScenarios,
  academySearch,
  academySuggestions,
  certifications,
  completeLesson,
  examPaper,
  flashcards,
  gradeCheckpoint,
  logPractice,
  milestones,
  patternDrill,
  positionDrill,
  practiceStats,
  reviewFlashcard,
  saveLessonNote,
  srDrill,
  submitExam,
  submitQuiz,
  toggleBookmark,
  zoneDrill,
} from "@/mocks/academy-engine";
import {
  academyEvents,
  academyTasks,
  createTask,
  deleteTask,
  registerEvent,
  toggleTask,
} from "@/mocks/academy/events-tasks";
import { MockError } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, toErrorResponse } from "./utils";

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

  /** POST /academy/lessons/:lessonId/checkpoint — grade the inline checkpoint. */
  http.post(endpoint(apiPaths.academyCheckpoint(":lessonId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody<AcademyCheckpointInput>(
        academyCheckpointInputSchema,
        await request.json().catch(() => null),
      );
      const result = gradeCheckpoint(pathParam(params, "lessonId"), input);
      if (!result) {
        return HttpResponse.json({ error: "No checkpoint for this lesson today" }, { status: 404 });
      }
      return HttpResponse.json(result);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** PUT /academy/lessons/:lessonId/notes — save the personal lesson note. */
  http.put(endpoint(apiPaths.academyLessonNote(":lessonId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody<AcademyNoteInput>(
        academyNoteInputSchema,
        await request.json().catch(() => null),
      );
      const result = saveLessonNote(pathParam(params, "lessonId"), input);
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

  /** GET /academy/practice/sr-drill — engine-generated support/resistance read. */
  http.get(endpoint(apiPaths.academySrDrill), async () => {
    await latency();
    try {
      return HttpResponse.json(srDrill());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/practice/position-drill — randomized position-sizing arithmetic. */
  http.get(endpoint(apiPaths.academyPositionDrill), async () => {
    await latency();
    try {
      return HttpResponse.json(positionDrill());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/practice/zone-drill — engine-generated supply/demand read. */
  http.get(endpoint(apiPaths.academyZoneDrill), async () => {
    await latency();
    try {
      return HttpResponse.json(zoneDrill());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/practice/stats — per-drill accuracy + recent ledger rows. */
  http.get(endpoint(apiPaths.academyPracticeStats), async () => {
    await latency();
    try {
      return HttpResponse.json(practiceStats());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/scenarios — the full scenario library (learning tool). */
  http.get(endpoint(apiPaths.academyScenarios), async () => {
    await latency();
    try {
      return HttpResponse.json(academyScenarios());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/flashcards — the due queue (Leitner SRS, 10/day cap). */
  http.get(endpoint(apiPaths.academyFlashcards), async () => {
    await latency();
    try {
      return HttpResponse.json(flashcards());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /academy/flashcards/review — grade a card (AGAIN/GOOD/EASY). */
  http.post(endpoint(apiPaths.academyFlashcardReview), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<AcademyFlashcardReviewInput>(
        academyFlashcardReviewInputSchema,
        await request.json().catch(() => null),
      );
      const result = reviewFlashcard(input);
      if (!result) {
        return HttpResponse.json({ error: "Card not found" }, { status: 404 });
      }
      return HttpResponse.json(result);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/certifications — per-category exam bests and tiers. */
  http.get(endpoint(apiPaths.academyCertifications), async () => {
    await latency();
    try {
      return HttpResponse.json(certifications());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/exams/:categoryId — an exam paper over the category pool. */
  http.get(endpoint(apiPaths.academyExam(":categoryId")), async ({ params }) => {
    await latency();
    try {
      const paper = examPaper(pathParam(params, "categoryId"));
      if (!paper) {
        return HttpResponse.json({ error: "No question pool for this category" }, { status: 404 });
      }
      return HttpResponse.json(paper);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /academy/exams/:categoryId/attempts — grade the exam server-side. */
  http.post(endpoint(apiPaths.academyExamSubmit(":categoryId")), async ({ request, params }) => {
    await latency();
    try {
      const input = parseBody<AcademyQuizSubmitInput>(
        academyQuizSubmitInputSchema,
        await request.json().catch(() => null),
      );
      const result = submitExam(pathParam(params, "categoryId"), input);
      if (!result) {
        return HttpResponse.json({ error: "No question pool for this category" }, { status: 404 });
      }
      return HttpResponse.json(result);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/milestones — sober achievements computed from real state. */
  http.get(endpoint(apiPaths.academyMilestones), async () => {
    await latency();
    try {
      return HttpResponse.json(milestones());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/suggestions — journal-driven lesson recommendations. */
  http.get(endpoint(apiPaths.academySuggestions), async () => {
    await latency();
    try {
      return HttpResponse.json(academySuggestions());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/events — live sessions (upcoming + past). */
  http.get(endpoint(apiPaths.academyEvents), async () => {
    await latency();
    try {
      return HttpResponse.json(academyEvents());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /academy/events/register — toggle a seat on an upcoming event. */
  http.post(endpoint(apiPaths.academyEventRegister), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(academyEventRegisterInputSchema, await readJson(request));
      const result = registerEvent(input);
      if (!result) {
        return HttpResponse.json({ error: "Event not found or already finished" }, { status: 404 });
      }
      return HttpResponse.json(result);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** GET /academy/tasks — the Tasky study list. */
  http.get(endpoint(apiPaths.academyTasks), async () => {
    await latency();
    try {
      return HttpResponse.json(academyTasks());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /academy/tasks — create a custom study task. */
  http.post(endpoint(apiPaths.academyTasks), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(academyTaskCreateInputSchema, await readJson(request));
      return HttpResponse.json(createTask(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /academy/tasks/toggle — mark a task done / reopen it. */
  http.post(endpoint(apiPaths.academyTaskToggle), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(academyTaskToggleInputSchema, await readJson(request));
      const task = toggleTask(input);
      if (!task) {
        return HttpResponse.json({ error: "Task not found" }, { status: 404 });
      }
      return HttpResponse.json(task);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /academy/tasks/delete — remove a task permanently. */
  http.post(endpoint(apiPaths.academyTaskDelete), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(academyTaskDeleteInputSchema, await readJson(request));
      return HttpResponse.json(deleteTask(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
