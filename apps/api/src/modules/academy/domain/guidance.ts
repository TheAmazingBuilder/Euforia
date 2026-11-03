/**
 * Academy learner-guidance rules - Continue Learning, Resume Reading and the
 * rule-based recommendations. Pure functions over authored content + the
 * user's derived progress (Phase 11 §65/§66: deliberately simple, no AI, the
 * replacement seam for a future analytics-driven engine is HERE).
 *
 * Parity source: mocks/academy-engine.ts (continueLearning/resumeLearning/
 * recommendations) - verbatim semantics.
 */
import type {
  AcademyContinueLearning,
  AcademyOverviewResponse,
  AcademyRecommendation,
  AcademyResume,
} from "../../../shared/contracts";
import { COURSES, courseById, sortedCourses } from "./catalog";

/** Categories the curriculum prioritizes for new learners (product seed). */
const PRIORITY_CATEGORY_IDS = ["cat-risk", "cat-fundamentals", "cat-structure"];

export interface ContinueLearningSeed {
  completedLessonIds: ReadonlySet<string>;
  /** lessonId → completion timestamp (drives recency ordering). */
  completionAt: ReadonlyMap<string, string>;
}

export function continueLearning(seed: ContinueLearningSeed): AcademyContinueLearning {
  const inProgress = sortedCourses()
    .filter((course) => {
      const done = course.lessons.filter((lesson) => seed.completedLessonIds.has(lesson.id)).length;
      return done > 0 && done < course.lessons.length;
    })
    .sort((a, b) => {
      const lastAt = (courseId: string) => {
        const course = courseById(courseId);
        if (!course) return 0;
        return Math.max(
          0,
          ...course.lessons.map((lesson) => {
            const at = seed.completionAt.get(lesson.id);
            return at ? new Date(at).getTime() : 0;
          }),
        );
      };
      return lastAt(b.id) - lastAt(a.id);
    });

  const target =
    inProgress[0] ??
    sortedCourses().find(
      (course) => !course.lessons.every((lesson) => seed.completedLessonIds.has(lesson.id)),
    );
  if (!target) return null;

  const done = target.lessons.filter((lesson) => seed.completedLessonIds.has(lesson.id)).length;
  const nextLesson = target.lessons.find((lesson) => !seed.completedLessonIds.has(lesson.id));
  const lastCompleted = [...target.lessons]
    .reverse()
    .find((lesson) => seed.completedLessonIds.has(lesson.id));

  const firstLesson = target.lessons[0];
  if (!firstLesson) return null;

  return {
    // Continue points at the NEXT unfinished lesson (fallback: the last one,
    // for the fully-completed edge case).
    lessonId: (nextLesson ?? lastCompleted)?.id ?? firstLesson.id,
    lessonTitle: (nextLesson ?? lastCompleted)?.title ?? firstLesson.title,
    // 1-based position of the NEXT lesson to open.
    lessonOrder: Math.min(done + 1, target.lessons.length),
    lessonCount: target.lessons.length,
    courseId: target.id,
    courseTitle: target.title,
    categoryId: target.categoryId,
    percent: target.lessons.length === 0 ? 0 : Math.round((done / target.lessons.length) * 100),
    nextLessonId: nextLesson?.id ?? null,
  };
}

export interface ResumeSeed {
  /** lessonId → last time the lesson was opened. */
  viewedAt: ReadonlyMap<string, string>;
  completedLessonIds: ReadonlySet<string>;
}

/** The unfinished lesson the user last had open - distinct from continueLearning. */
export function resumeLearning(seed: ResumeSeed): AcademyResume {
  const viewed = [...seed.viewedAt.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .find(([lessonId]) => !seed.completedLessonIds.has(lessonId));
  if (!viewed) return null;
  const [lessonId, viewedAt] = viewed;

  const course = COURSES.find((entry) => entry.lessons.some((lesson) => lesson.id === lessonId));
  const lesson = course?.lessons.find((entry) => entry.id === lessonId);
  if (!course || !lesson) return null;

  const done = course.lessons.filter((entry) => seed.completedLessonIds.has(entry.id)).length;
  return {
    lessonId,
    lessonTitle: lesson.title,
    courseId: course.id,
    courseTitle: course.title,
    categoryId: course.categoryId,
    coursePercent:
      course.lessons.length === 0 ? 0 : Math.round((done / course.lessons.length) * 100),
    viewedAt,
  };
}

export function recommendations(seed: ContinueLearningSeed): AcademyRecommendation[] {
  const cards = sortedCourses().map((course) => ({ course, card: course }));
  const picks: AcademyRecommendation[] = [];

  const completionOf = (courseId: string) => {
    const course = courseById(courseId);
    if (!course) return { done: 0, total: 0 };
    return {
      done: course.lessons.filter((lesson) => seed.completedLessonIds.has(lesson.id)).length,
      total: course.lessons.length,
    };
  };

  // In-progress first (max 2) - recency does not matter for the reason text.
  const unfinished = cards.filter(({ course }) => {
    const { done, total } = completionOf(course.id);
    return total > 0 && done < total;
  });
  const inProgress = unfinished.filter(({ course }) => completionOf(course.id).done > 0);
  for (const { course } of inProgress.slice(0, 2)) {
    const { done, total } = completionOf(course.id);
    picks.push({
      courseId: course.id,
      title: course.title,
      reason: `In progress - ${done}/${total} lessons done.`,
      categoryId: course.categoryId,
    });
  }

  for (const categoryId of PRIORITY_CATEGORY_IDS) {
    const next = unfinished.find(
      ({ course }) => course.categoryId === categoryId && !picks.some((pick) => pick.courseId === course.id),
    );
    if (next) {
      picks.push({
        courseId: next.course.id,
        title: next.course.title,
        reason: "Foundation track - recommended next for your level.",
        categoryId,
      });
    }
  }

  const advanced = unfinished.find(
    ({ course }) => course.level === "ADVANCED" && !picks.some((pick) => pick.courseId === course.id),
  );
  if (advanced && picks.length < 3) {
    picks.push({
      courseId: advanced.course.id,
      title: advanced.course.title,
      reason: "Advanced track - when the foundations hold.",
      categoryId: advanced.course.categoryId,
    });
  }

  return picks.slice(0, 3);
}

export type AcademyOverviewResponseShared = AcademyOverviewResponse;
