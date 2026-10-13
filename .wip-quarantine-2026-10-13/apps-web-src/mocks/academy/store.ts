import type {
  AcademyBookmarkToggleResponse,
  AcademyBookmarksResponse,
  AcademyCatalogResponse,
  AcademyCourseDetail,
  AcademyGlossaryResponse,
  AcademyLessonCompleteResponse,
  AcademyLessonDetail,
  AcademyProgressResponse,
  AcademyQuiz,
  AcademyQuizAttemptResponse,
  AcademyRecommendationsResponse,
} from "@cosmoz/shared";

import { ACADEMY_CATEGORIES, ACADEMY_COURSES, academyCategoryOf } from "./catalog";
import { ACADEMY_LESSONS_A, type AcademyLessonBody } from "./lessons-a";
import { ACADEMY_LESSONS_B } from "./lessons-b";
import { ACADEMY_GLOSSARY } from "./glossary";
import { ACADEMY_QUIZZES, gradeAttempt, toClientQuiz } from "./quiz";
import { MockError, mockStore } from "@/mocks/store";

/** All lesson bodies, merged. */
const LESSONS: Record<string, AcademyLessonBody> = {
  ...ACADEMY_LESSONS_A,
  ...ACADEMY_LESSONS_B,
};

const QUIZ_BY_COURSE = new Map(ACADEMY_QUIZZES.map((quiz) => [quiz.courseId, quiz]));

/** Toronto-anchored date key (the journal's convention). */
function todayKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

function dateKeyOffset(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const key = date.toISOString().slice(0, 10);
  return key;
}

function msError(status: number, message: string): never {
  throw new MockError(status, message);
}

/** Level rubric — honest thresholds on completed lessons (1-5). */
const LEVEL_STEPS = [
  { min: 0, label: "Trading Foundations" },
  { min: 5, label: "Technical Foundations" },
  { min: 12, label: "Market Structure" },
  { min: 22, label: "Strategy Development" },
  { min: 35, label: "Advanced Trading" },
];

function levelOf(lessonsCompleted: number): { level: number; label: string } {
  let index = 0;
  for (let i = 0; i < LEVEL_STEPS.length; i += 1) {
    if (lessonsCompleted >= LEVEL_STEPS[i].min) index = i;
  }
  return { level: index + 1, label: LEVEL_STEPS[index].label };
}

function createAcademyStore() {
  // ── Per-user learning state (demo: session-scoped, isolated by design) ──
  const completions = new Map<string, string>(); // lessonId → completedAt ISO
  const activityDays = new Set<string>();
  const quizAttempts: Array<{
    quizId: string;
    percent: number;
    score: number;
    total: number;
    at: string;
  }> = [];
  const bookmarks = new Map<string, string>(); // lessonId → bookmarkedAt ISO (§33)

  // Seed a believable in-flight education: 5 lessons across 3 courses over
  // the last three days (gives the streak and the continue-learning card
  // honest data to show). The rest of the library starts uncompleted.
  const seeded = ["les-c-anatomy", "les-c-sentiment", "les-r-risk-per-trade", "les-r-position-sizing", "les-t-charts-timeframes"];
  const dayOffsets = [0, -1, -1, -2, -2];
  seeded.forEach((lessonId, index) => {
    const offset = dayOffsets[index] ?? 0;
    const key = dateKeyOffset(offset);
    const hour = String(9 + index).padStart(2, "0");
    completions.set(lessonId, new Date(`${key}T${hour}:12:00.000Z`).toISOString());
    activityDays.add(key);
  });

  // Seed two bookmarks so the shelf (§33) opens with believable content.
  const seededBookmarks: Array<[string, number]> = [
    ["les-c-context-first", -1],
    ["les-r-drawdown-ruin", -3],
  ];
  seededBookmarks.forEach(([lessonId, offset]) => {
    const key = dateKeyOffset(offset);
    bookmarks.set(lessonId, new Date(`${key}T18:40:00.000Z`).toISOString());
  });

  const allLessonIds = ACADEMY_COURSES.flatMap((course) =>
    course.modules.flatMap((mod) => mod.lessonIds),
  );
  const lessonsTotal = allLessonIds.length;

  function lessonsCompletedCount(): number {
    return completions.size;
  }

  function streakDays(): number {
    let streak = 0;
    for (let offset = 0; offset < 3650; offset += 1) {
      const key = dateKeyOffset(-offset);
      if (activityDays.has(key)) {
        streak += 1;
      } else if (offset > 0) {
        break;
      }
    }
    return streak;
  }

  // ── Catalog & course pages ────────────────────────────────────────────────
  function getAcademyCatalog(): AcademyCatalogResponse {
    return {
      categories: ACADEMY_CATEGORIES.map((category) => ({ ...category })),
      courses: ACADEMY_COURSES.map((course) => ({ ...course, modules: course.modules.map((m) => ({ ...m, lessonIds: [...m.lessonIds] })) })),
    };
  }

  function getAcademyCourse(courseId: string): AcademyCourseDetail {
    const course = ACADEMY_COURSES.find((c) => c.id === courseId);
    if (!course) msError(404, `Unknown course ${courseId}`);
    const category = academyCategoryOf(courseId) ?? ACADEMY_CATEGORIES[0];

    const lessons = course.modules.flatMap((mod) =>
      mod.lessonIds.map((lessonId) => {
        const body = LESSONS[lessonId];
        if (!body) msError(500, `Missing lesson body ${lessonId}`);
        return {
          id: lessonId,
          title: body.title,
          durationMin: body.durationMin,
          completed: completions.has(lessonId),
        };
      }),
    );

    const nextLessonId =
      course.modules
        .flatMap((mod) => mod.lessonIds)
        .find((lessonId) => !completions.has(lessonId)) ?? null;

    return {
      course: structuredCloneish(course),
      category: { ...category },
      lessons,
      nextLessonId,
      completedCount: lessons.filter((lesson) => lesson.completed).length,
    };
  }

  function getAcademyLesson(lessonId: string): AcademyLessonDetail {
    const course = ACADEMY_COURSES.find((c) =>
      c.modules.some((mod) => mod.lessonIds.includes(lessonId)),
    );
    if (!course) msError(404, `Unknown lesson ${lessonId}`);
    const moduleId = course.modules.find((mod) =>
      mod.lessonIds.includes(lessonId),
    )!.id;
    const moduleTitle = course.modules.find((mod) => mod.id === moduleId)!.title;
    const body = LESSONS[lessonId];
    if (!body) msError(500, `Missing lesson body ${lessonId}`);

    const flat = course.modules.flatMap((mod) => mod.lessonIds);
    const index = flat.indexOf(lessonId);
    const lessonIdsInOrder = flat;

    return {
      id: lessonId,
      courseId: course.id,
      courseTitle: course.title,
      moduleId,
      moduleTitle,
      title: body.title,
      durationMin: body.durationMin,
      completed: completions.has(lessonId),
      objectives: [...body.objectives],
      sections: body.sections.map((section) => ({
        heading: section.heading,
        paragraphs: [...section.paragraphs],
        bullets: section.bullets ? [...section.bullets] : undefined,
      })),
      takeaways: [...body.takeaways],
      mistakes: [...body.mistakes],
      figure: body.figure ? { ...body.figure } : null,
      figures: body.figures ? body.figures.map((f) => ({ ...f })) : null,
      prevLessonId: index > 0 ? lessonIdsInOrder[index - 1] : null,
      prevLessonTitle:
        index > 0 ? LESSONS[lessonIdsInOrder[index - 1]].title : null,
      nextLessonId: index < lessonIdsInOrder.length - 1 ? lessonIdsInOrder[index + 1] : null,
      nextLessonTitle:
        index < lessonIdsInOrder.length - 1
          ? LESSONS[lessonIdsInOrder[index + 1]].title
          : null,
      bookmarked: bookmarks.has(lessonId),
    };
  }

  function completeAcademyLesson(lessonId: string): AcademyLessonCompleteResponse {
    if (!LESSONS[lessonId] || !allLessonIds.includes(lessonId)) {
      msError(404, `Unknown lesson ${lessonId}`);
    }
    if (!completions.has(lessonId)) {
      completions.set(lessonId, new Date().toISOString());
      activityDays.add(todayKey());
    }
    return {
      lessonId,
      completed: true,
      lessonsCompleted: lessonsCompletedCount(),
      streakDays: streakDays(),
    };
  }

  // ── Quiz ──────────────────────────────────────────────────────────────────
  function getAcademyQuiz(courseId: string): AcademyQuiz {
    const seed = QUIZ_BY_COURSE.get(courseId);
    if (!seed) msError(404, `No quiz for course ${courseId}`);
    const course = ACADEMY_COURSES.find((c) => c.id === courseId)!;
    const attempts = quizAttempts.filter((a) => a.quizId === seed.id);
    const best = attempts.length
      ? Math.max(...attempts.map((a) => a.percent))
      : null;
    return toClientQuiz(seed, course.title, best, attempts.length);
  }

  function submitAcademyQuizAttempt(
    courseId: string,
    answers: Array<{ questionId: string; choiceIndex: number }>,
  ): AcademyQuizAttemptResponse {
    const seed = QUIZ_BY_COURSE.get(courseId);
    if (!seed) msError(404, `No quiz for course ${courseId}`);
    const results = gradeAttempt(seed, answers);
    const score = results.filter((r) => r.correct).length;
    const total = results.length;
    const percent = Math.round((score / total) * 100);
    const attempts = quizAttempts.filter((a) => a.quizId === seed.id);
    const best = attempts.length
      ? Math.max(...attempts.map((a) => a.percent))
      : 0;
    quizAttempts.push({
      quizId: seed.id,
      percent,
      score,
      total,
      at: new Date().toISOString(),
    });
    activityDays.add(todayKey());
    return {
      quizId: seed.id,
      score,
      total,
      percent,
      bestPercent: Math.max(best, percent),
      attempts: attempts.length + 1,
      results,
    };
  }

  // ── Progress ──────────────────────────────────────────────────────────────
  function getAcademyProgress(): AcademyProgressResponse {
    const byCategory = ACADEMY_CATEGORIES.map((category) => {
      const courseIds = ACADEMY_COURSES.filter((c) => c.categoryId === category.id);
      const ids = courseIds.flatMap((course) =>
        course.modules.flatMap((mod) => mod.lessonIds),
      );
      return {
        categoryId: category.id,
        title: category.title,
        lessonsTotal: ids.length,
        lessonsCompleted: ids.filter((id) => completions.has(id)).length,
      };
    });

    const coursesCompleted = ACADEMY_COURSES.filter((course) =>
      course.modules.every((mod) => mod.lessonIds.every((id) => completions.has(id))),
    ).length;

    const attemptsByQuiz = new Map<string, number[]>();
    for (const attempt of quizAttempts) {
      const list = attemptsByQuiz.get(attempt.quizId) ?? [];
      list.push(attempt.percent);
      attemptsByQuiz.set(attempt.quizId, list);
    }
    const bests = [...attemptsByQuiz.values()].map((list) => Math.max(...list));
    const quizAveragePercent = bests.length
      ? Math.round(bests.reduce((sum, value) => sum + value, 0) / bests.length)
      : null;

    // Continue learning: the seeded "current" course is the one with the most
    // recent completion that still has uncompleted lessons.
    let continueCourseId: string | null = null;
    let continueLessonId: string | null = null;
    let newestAt = "";
    for (const course of ACADEMY_COURSES) {
      const flat = course.modules.flatMap((mod) => mod.lessonIds);
      const next = flat.find((id) => !completions.has(id));
      if (!next) continue;
      const touched = flat
        .map((id) => completions.get(id) ?? "")
        .filter(Boolean)
        .sort()
        .at(-1) ?? "";
      if (touched === "" && newestAt !== "") continue;
      if (touched >= newestAt) {
        newestAt = touched;
        continueCourseId = course.id;
        continueLessonId = next;
      }
    }

    const { level, label } = levelOf(lessonsCompletedCount());

    return {
      lessonsCompleted: lessonsCompletedCount(),
      lessonsTotal,
      coursesCompleted,
      quizAveragePercent,
      quizAttempts: quizAttempts.length,
      streakDays: streakDays(),
      level,
      levelLabel: label,
      continueCourseId,
      continueLessonId,
      byCategory,
      achievements: [
        {
          id: "ach-first-lesson",
          title: "First page written",
          description: "Complete your first Academy lesson.",
          earned: completions.size >= 1,
        },
        {
          id: "ach-first-quiz",
          title: "Tested",
          description: "Attempt your first course quiz.",
          earned: quizAttempts.length >= 1,
        },
        {
          id: "ach-perfect-quiz",
          title: "Flawless grade",
          description: "Score 100% on any course quiz.",
          earned: quizAttempts.some((a) => a.percent === 100),
        },
        {
          id: "ach-course-complete",
          title: "Course closed",
          description: "Complete every lesson of a course.",
          earned: coursesCompleted >= 1,
        },
        {
          id: "ach-category-complete",
          title: "Domain mastered",
          description: "Complete a full category.",
          earned: byCategory.some(
            (row) => row.lessonsTotal > 0 && row.lessonsCompleted === row.lessonsTotal,
          ),
        },
        {
          id: "ach-streak-7",
          title: "A week of study",
          description: "Keep a 7-day learning streak.",
          earned: streakDays() >= 7,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
  }

  // ── Bookmarks (§33) ──────────────────────────────────────────────────────
  function bookmarkRow(lessonId: string, createdAt: string) {
    const course = ACADEMY_COURSES.find((c) =>
      c.modules.some((mod) => mod.lessonIds.includes(lessonId)),
    );
    const moduleTitle =
      course?.modules.find((mod) => mod.lessonIds.includes(lessonId))?.title ??
      "";
    const body = LESSONS[lessonId];
    return {
      id: `bm-${lessonId}`,
      lessonId,
      lessonTitle: body.title,
      courseId: course?.id ?? "",
      courseTitle: course?.title ?? "",
      moduleTitle,
      durationMin: body.durationMin,
      completed: completions.has(lessonId),
      createdAt,
    };
  }

  function listAcademyBookmarks(): AcademyBookmarksResponse {
    const rows = [...bookmarks.entries()]
      .map(([lessonId, createdAt]) => bookmarkRow(lessonId, createdAt))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { bookmarks: rows, total: rows.length };
  }

  function toggleAcademyBookmark(
    lessonId: string,
  ): AcademyBookmarkToggleResponse {
    if (!LESSONS[lessonId] || !allLessonIds.includes(lessonId)) {
      msError(404, `Unknown lesson ${lessonId}`);
    }
    if (bookmarks.has(lessonId)) {
      bookmarks.delete(lessonId);
    } else {
      bookmarks.set(lessonId, new Date().toISOString());
    }
    return { lessonId, bookmarked: bookmarks.has(lessonId), total: bookmarks.size };
  }

  // ── Recommendations (§35) — ranked from the journal's own weaknesses ──────
  //
  // The engine reads the SAME live store the trading pages serve: the mistake
  // ledger (frequency + R cost over the window), the rule-violation log, the
  // to-grade queue and plan adherence from the discipline endpoint. Weakness
  // buckets map to the course that drills them, weights decide the order, and
  // any free slot is filled by the library's beginner-first rubric. Pure
  // arithmetic on the reader's own record — no AI, and every row carries its
  // evidence so the claim can be checked against the journal.

  const RISK_MISTAKE_KEYS = new Set(["oversized", "no_stop_loss", "moved_stop"]);

  function courseCompletedCount(courseId: string): number {
    const course = ACADEMY_COURSES.find((c) => c.id === courseId);
    if (!course) return 0;
    return course.modules
      .flatMap((mod) => mod.lessonIds)
      .filter((lessonId) => completions.has(lessonId)).length;
  }

  function recommendationRow(
    courseId: string,
    source: "journal" | "rubric",
    reason: string,
    evidence: string,
    weight: number,
  ): { courseId: string; source: "journal" | "rubric"; reason: string; evidence: string; weight: number } {
    return { courseId, source, reason, evidence, weight };
  }

  function listAcademyRecommendations(): AcademyRecommendationsResponse {
    const ledger = mockStore.mistakesLedger();
    const violations = mockStore.listViolations();
    const discipline = mockStore.disciplineScore();
    const toGrade = mockStore.listTrades({ graded: "false" });

    const riskEntries = ledger.entries.filter((e) => RISK_MISTAKE_KEYS.has(e.key));
    const behaviorEntries = ledger.entries.filter((e) => e.category === "BEHAVIOR");
    const exitEntries = ledger.entries.filter((e) => e.category === "EXIT");

    const riskMistakes = riskEntries.reduce((sum, e) => sum + e.count, 0);
    const behaviorMistakes = behaviorEntries.reduce((sum, e) => sum + e.count, 0);
    const exitMistakes = exitEntries.reduce((sum, e) => sum + e.count, 0);
    const planAdherencePct =
      discipline.planAdherencePct === null
        ? null
        : Math.round(Number(discipline.planAdherencePct));

    const signals = {
      ungradedTrades: toGrade.total,
      riskMistakes,
      behaviorMistakes,
      exitMistakes,
      ruleViolations: violations.windowCount,
      planAdherencePct,
    };

    // Candidates — one per weakness bucket, each with its evidence chip.
    const candidates = [] as ReturnType<typeof recommendationRow>[];

    if (riskMistakes > 0) {
      const top = [...riskEntries].sort((a, b) => b.count - a.count)[0];
      candidates.push(
        recommendationRow(
          "course-risk",
          "journal",
          `${riskMistakes} entr${riskMistakes === 1 ? "y" : "ies"} in your journal carry a sizing or stop mistake — this course drills sizing, stops and the math of staying in the game.`,
          `${top.label.toLowerCase()} ×${top.count}`,
          riskMistakes * 3,
        ),
      );
    }

    if (behaviorMistakes + violations.windowCount > 0) {
      const revenge = behaviorEntries.find((e) => e.key === "revenge_trade");
      const evidence =
        revenge !== undefined && revenge.count > 0
          ? `revenge ×${revenge.count}`
          : `${violations.windowCount} breach${violations.windowCount === 1 ? "" : "es"}`;
      candidates.push(
        recommendationRow(
          "course-psychology",
          "journal",
          "Logged behavior errors and rule breaches cluster around emotions — the routines that make discipline cheaper than willpower live in this course.",
          evidence,
          behaviorMistakes * 3 + violations.windowCount * 2,
        ),
      );
    }

    if (exitMistakes > 0) {
      const top = [...exitEntries].sort((a, b) => b.count - a.count)[0];
      candidates.push(
        recommendationRow(
          "course-management",
          "journal",
          `Early exits and handed-back winners show a management gap — what happens after the entry is a skill this course drills.`,
          `${top.label.toLowerCase()} ×${top.count}`,
          exitMistakes * 2,
        ),
      );
    }

    if (toGrade.total >= 3) {
      candidates.push(
        recommendationRow(
          "course-management",
          "journal",
          `${toGrade.total} closed trades still await a grade — the review ritual that turns raw trades into patterns starts here.`,
          `${toGrade.total} to grade`,
          toGrade.total * 2,
        ),
      );
    }

    if (planAdherencePct !== null && planAdherencePct < 70) {
      candidates.push(
        recommendationRow(
          "course-strategies",
          "journal",
          `Only ${planAdherencePct}% of graded trades followed the plan — blueprints with entry, stop, target and invalidation make conformity measurable.`,
          `${planAdherencePct}% plan followed`,
          Math.round((70 - planAdherencePct) * 2),
        ),
      );
    }

    // Same course proposed by two buckets → merge weights, keep the heavier reason.
    const byCourse = new Map<string, ReturnType<typeof recommendationRow>>();
    for (const candidate of candidates) {
      const existing = byCourse.get(candidate.courseId);
      if (existing === undefined) {
        byCourse.set(candidate.courseId, candidate);
      } else {
        const keep = candidate.weight >= existing.weight ? candidate : existing;
        byCourse.set(candidate.courseId, {
          ...keep,
          weight: existing.weight + candidate.weight,
        });
      }
    }

    const ranked = [...byCourse.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);

    // Free slots → the library's beginner-first rubric (least started first).
    if (ranked.length < 3) {
      const picked = new Set(ranked.map((row) => row.courseId));
      const rubric = ACADEMY_COURSES.filter((course) => !picked.has(course.id))
        .sort((a, b) => {
          const levelRank = { beginner: 0, intermediate: 1, advanced: 2 } as const;
          const byLevel = levelRank[a.level] - levelRank[b.level];
          const byProgress =
            courseCompletedCount(a.id) - courseCompletedCount(b.id);
          return byProgress !== 0 ? byProgress : byLevel;
        })
        .slice(0, 3 - ranked.length);
      for (const course of rubric) {
        ranked.push(
          recommendationRow(
            course.id,
            "rubric",
            "No journal signal yet — the library's default order, beginner first.",
            "default path",
            0,
          ),
        );
      }
    }

    const rows = ranked.map((candidate, index) => {
      const course = ACADEMY_COURSES.find((c) => c.id === candidate.courseId);
      if (!course) msError(500, `Unknown course ${candidate.courseId}`);
      return {
        id: `reco-${index}-${candidate.courseId}`,
        courseId: course.id,
        courseTitle: course.title,
        categoryId: course.categoryId,
        categoryTitle: academyCategoryOf(course.id)?.title ?? "",
        level: course.level,
        durationMin: course.durationMin,
        reason: candidate.reason,
        evidence: candidate.evidence,
        source: candidate.source,
      };
    });

    return {
      recommendations: rows,
      signals,
      computedAt: new Date().toISOString(),
      total: rows.length,
    };
  }

  // ── Glossary ────────────────────────────────────────────────────────────────
  function listAcademyGlossary(q?: string): AcademyGlossaryResponse {
    const query = q?.trim().toLowerCase();
    const terms = ACADEMY_GLOSSARY.filter((term) => {
      if (!query) return true;
      return (
        term.term.toLowerCase().includes(query) ||
        term.simple.toLowerCase().includes(query) ||
        term.professional.toLowerCase().includes(query) ||
        term.related.some((rel) => rel.toLowerCase().includes(query))
      );
    });
    return { terms: terms.map((term) => ({ ...term })), total: terms.length };
  }

  // structuredClone is available in Node 18+; keep a tiny local fallback.
  function structuredCloneish<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  return {
    getAcademyCatalog,
    getAcademyCourse,
    getAcademyLesson,
    completeAcademyLesson,
    getAcademyQuiz,
    submitAcademyQuizAttempt,
    getAcademyProgress,
    listAcademyGlossary,
    listAcademyBookmarks,
    toggleAcademyBookmark,
    listAcademyRecommendations,
  };
}

export type AcademyMockStore = ReturnType<typeof createAcademyStore>;
export const academyStore: AcademyMockStore = createAcademyStore();
