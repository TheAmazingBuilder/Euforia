/**
 * Academy content registry - the READ layer over the authored catalog
 * (src/modules/academy/content, ported verbatim from the product's authoring
 * files). Pure functions only: no clock, no randomness, no I/O.
 *
 * This is the bounded context's content architecture (Phase 11 §9–§18, §45,
 * §56): the catalog is code-owned, served through the API, and the client
 * renders it - it is never a database blob, never user-generated, and the
 * renderer's SVG visual variants keep lesson bodies free of raw HTML (no
 * sanitization surface exists - Phase 11 §17/§82 documented as N/A).
 *
 * Parity source: mocks/academy-engine.ts catalog helpers.
 */
import type {
  AcademyBlock,
  AcademyCatalogResponse,
  AcademyCategoryProgress,
  AcademyCategorySummary,
  AcademyCourseCard,
  AcademyCourseDetailResponse,
  AcademyFlashcard,
  AcademyGlossaryResponse,
  AcademyLessonCard,
  AcademyLessonResponse,
  AcademySearchResponse,
  AcademyQuizQuestion,
} from "../../../shared/contracts";
import { CATEGORIES, COURSES, LEVEL_ORDER, PATHS } from "../content/catalog";
import { GLOSSARY_TERMS } from "../content/glossary";
import type { AuthoredCourse } from "../content/types";

export { CATEGORIES, COURSES, GLOSSARY_TERMS, LEVEL_ORDER, PATHS };
export type { AuthoredCourse };

// ── Lookups ──────────────────────────────────────────────────────────────────

export const courseById = (courseId: string): AuthoredCourse | undefined =>
  COURSES.find((course) => course.id === courseId);

export const categoryById = (categoryId: string) =>
  CATEGORIES.find((category) => category.id === categoryId);

export const quizById = (quizId: string) =>
  COURSES.find((course) => course.quiz?.id === quizId)?.quiz ?? null;

export const lessonOwner = (lessonId: string): { course: AuthoredCourse; index: number } | null => {
  for (const course of COURSES) {
    const index = course.lessons.findIndex((lesson) => lesson.id === lessonId);
    if (index !== -1) return { course, index };
  }
  return null;
};

/** Category exam question pool - every question of the category's course quizzes. */
export const examPool = (categoryId: string): AcademyQuizQuestion[] =>
  COURSES.filter((course) => course.categoryId === categoryId).flatMap(
    (course) => course.quiz?.questions ?? [],
  );

// ── Deterministic ordering ───────────────────────────────────────────────────
// Course listing order: level (BEGINNER → ADVANCED), then category order,
// then title - never insertion order (Phase 11 §48).

export function sortedCourses(): AuthoredCourse[] {
  const categoryRank = new Map(CATEGORIES.map((category, index) => [category.id, index]));
  return [...COURSES].sort(
    (a, b) =>
      (LEVEL_ORDER[a.level] ?? 99) - (LEVEL_ORDER[b.level] ?? 99) ||
      (categoryRank.get(a.categoryId) ?? 99) - (categoryRank.get(b.categoryId) ?? 99) ||
      a.title.localeCompare(b.title),
  );
}

// ── Projections (per-user progress is injected, never stored here) ──────────

export interface ProgressSeed {
  /** Authored lesson ids the user has completed. */
  completedLessonIds: ReadonlySet<string>;
  /** Authored quiz id → best score so far. */
  quizBest: ReadonlyMap<string, number>;
}

export function categorySummary(categoryIndex: number): AcademyCategorySummary {
  const category = CATEGORIES[categoryIndex];
  if (!category) throw new Error(`academy category missing at index ${categoryIndex}`);
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    level: category.level,
    icon: category.icon,
    order: categoryIndex,
  };
}

export function courseCard(course: AuthoredCourse, seed: ProgressSeed): AcademyCourseCard {
  const lessonCount = course.lessons.length;
  const completedLessons = course.lessons.filter((lesson) =>
    seed.completedLessonIds.has(lesson.id),
  ).length;
  const best = course.quiz ? seed.quizBest.get(course.quiz.id) : undefined;
  return {
    id: course.id,
    categoryId: course.categoryId,
    title: course.title,
    description: course.description,
    level: course.level,
    lessonCount,
    completedLessons,
    progress: lessonCount === 0 ? 0 : Math.round((completedLessons / lessonCount) * 100),
    estimatedMinutes: course.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0),
    quizId: course.quiz?.id ?? null,
    quizBestScore: best ?? null,
    completed: lessonCount > 0 && completedLessons === lessonCount,
  };
}

export function catalogResponse(seed: ProgressSeed): AcademyCatalogResponse {
  const courses = sortedCourses().map((course) => courseCard(course, seed));
  return {
    categories: CATEGORIES.map((_, index) => categorySummary(index)),
    courses,
    paths: PATHS.map((path) => {
      const memberCourses = path.courseIds
        .map((courseId) => courseById(courseId))
        .filter((course): course is AuthoredCourse => Boolean(course))
        .map((course) => courseCard(course, seed));
      const completedCourses = memberCourses.filter((card) => card.completed).length;
      return {
        id: path.id,
        title: path.title,
        description: path.description,
        icon: path.icon,
        courses: memberCourses,
        completedCourses,
        percent:
          memberCourses.length === 0
            ? 0
            : Math.round((completedCourses / memberCourses.length) * 100),
      };
    }),
  };
}

export function courseDetail(courseId: string, seed: ProgressSeed): AcademyCourseDetailResponse | null {
  const course = courseById(courseId);
  const categoryIndex = course ? CATEGORIES.findIndex((category) => category.id === course.categoryId) : -1;
  if (!course || categoryIndex === -1) return null;

  const lessons: AcademyLessonCard[] = course.lessons.map((lesson, index) => ({
    id: lesson.id,
    courseId: course.id,
    title: lesson.title,
    summary: lesson.summary,
    minutes: lesson.minutes,
    order: index,
    completed: seed.completedLessonIds.has(lesson.id),
  }));

  return {
    course: courseCard(course, seed),
    category: categorySummary(categoryIndex),
    objectives: course.objectives,
    lessons,
  };
}

// ── Checkpoint selection (deterministic per lesson + UTC day) ────────────────

/** Stable string hash - deterministic checkpoint picks per lesson + day. */
export function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Mid-lesson checkpoint rule (parity verbatim): long lessons (≥ 6 blocks) in
 * quiz-bearing courses get ONE question from the course bank, picked from
 * lessonId + UTC day - same pick for serving and grading; answers never leave
 * the server (Phase 11 §33).
 */
export const CHECKPOINT_MIN_BLOCKS = 6;

export function checkpointFor(course: AuthoredCourse, lessonIndex: number, utcDay: string): AcademyQuizQuestion | null {
  if (!course.quiz) return null;
  const lesson = course.lessons[lessonIndex];
  if (!lesson || lesson.blocks.length < CHECKPOINT_MIN_BLOCKS) return null;
  const index = hashString(`${lesson.id}:${utcDay}`) % course.quiz.questions.length;
  return course.quiz.questions[index] ?? null;
}

// ── Lesson assembly (completion/note/view are injected by the service) ──────

export interface LessonAssemblyInput {
  course: AuthoredCourse;
  index: number;
  seed: ProgressSeed;
  note: AcademyLessonResponse["note"];
  checkpoint: AcademyQuizQuestion | null;
}

export function lessonResponse(input: LessonAssemblyInput): AcademyLessonResponse {
  const { course, index, seed, note, checkpoint } = input;
  const lesson = course.lessons[index];
  if (!lesson) throw new Error(`academy lesson missing at index ${index} of ${course.id}`);
  const strip: (question: AcademyQuizQuestion) => AcademyLessonResponse["checkpoint"] = checkpoint
    ? (question) => ({
        id: question.id,
        kind: question.kind,
        prompt: question.prompt,
        options: question.options,
        unit: question.unit,
      })
    : () => null;

  return {
    id: lesson.id,
    courseId: course.id,
    courseTitle: course.title,
    categoryId: course.categoryId,
    title: lesson.title,
    summary: lesson.summary,
    minutes: lesson.minutes,
    order: index,
    position: index + 1,
    lessonCount: course.lessons.length,
    completed: seed.completedLessonIds.has(lesson.id),
    blocks: lesson.blocks,
    quizId: course.quiz?.id ?? null,
    prevLessonId: course.lessons[index - 1]?.id ?? null,
    nextLessonId: course.lessons[index + 1]?.id ?? null,
    checkpoint: checkpoint ? strip(checkpoint) : null,
    note,
  };
}

// ── Glossary & search (in-memory over authored content - Phase 11 §43/§45) ──

export function glossary(query: string | undefined): AcademyGlossaryResponse {
  const q = query?.trim().toLowerCase() ?? "";
  const terms =
    q === ""
      ? GLOSSARY_TERMS
      : GLOSSARY_TERMS.filter((term) =>
          `${term.term} ${term.simple} ${term.professional} ${term.related.join(" ")}`
            .toLowerCase()
            .includes(q),
        );
  return { terms: [...terms].sort((a, b) => a.term.localeCompare(b.term)), total: terms.length };
}

function blockText(block: AcademyBlock): string {
  if (block.kind === "text" || block.kind === "callout") return block.body;
  if (block.kind === "list") return block.items.join(" ");
  if (block.kind === "example") return block.steps.join(" ");
  if (block.kind === "table") return block.rows.flat().join(" ");
  return "";
}

/** Snippet of ≤ 140 chars around the first match (parity verbatim). */
function lessonSnippet(blocks: AcademyBlock[], query: string): string {
  for (const block of blocks) {
    const bodies: string[] = [];
    if (block.kind === "text" || block.kind === "callout") bodies.push(block.body);
    if (block.kind === "list") bodies.push(...block.items);
    if (block.kind === "example") bodies.push(...block.steps);
    for (const body of bodies) {
      const index = body.toLowerCase().indexOf(query);
      if (index >= 0) {
        const start = Math.max(0, index - 40);
        return (
          (start > 0 ? "…" : "") +
          body.slice(start, start + 140).trim() +
          (body.length > start + 140 ? "…" : "")
        );
      }
    }
  }
  return "";
}

export function academySearch(query: string, seed: ProgressSeed): AcademySearchResponse {
  const q = query.trim().toLowerCase();
  if (q === "") return { query, courses: [], lessons: [], glossary: [] };

  const courses = sortedCourses()
    .filter((course) =>
      `${course.title} ${course.description} ${course.objectives.join(" ")}`.toLowerCase().includes(q),
    )
    .map((course) => courseCard(course, seed))
    .slice(0, 6);

  const lessons = COURSES.flatMap((course) =>
    course.lessons
      .filter((lesson) =>
        `${lesson.title} ${lesson.summary} ${lesson.blocks.map(blockText).join(" ")}`
          .toLowerCase()
          .includes(q),
      )
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        courseId: course.id,
        courseTitle: course.title,
        snippet: lessonSnippet(lesson.blocks, q),
      })),
  ).slice(0, 10);

  const glossaryTerms = glossary(q).terms.slice(0, 8);
  return { query, courses, lessons, glossary: glossaryTerms };
}

// ── Category progress (derived on read - never persisted, §29/§30) ──────────

export function categoryProgress(
  seed: ProgressSeed,
): AcademyCategoryProgress[] {
  return CATEGORIES.map((category) => {
    const lessons = COURSES.filter((course) => course.categoryId === category.id).flatMap(
      (course) => course.lessons,
    );
    const done = lessons.filter((lesson) => seed.completedLessonIds.has(lesson.id)).length;
    return {
      categoryId: category.id,
      name: category.name,
      lessonCount: lessons.length,
      completedLessons: done,
      percent: lessons.length === 0 ? 0 : Math.round((done / lessons.length) * 100),
    };
  });
}

// ── Flashcard deck (deterministic derivation from authored content) ─────────

export function flashcardDeck(): AcademyFlashcard[] {
  const deck: AcademyFlashcard[] = [];

  for (const term of GLOSSARY_TERMS) {
    deck.push({
      id: `fc-term-${term.id}`,
      kind: "TERM",
      front: term.term,
      back: term.simple,
      source: "Glossary",
      categoryId: term.categoryId,
    });
  }

  for (const course of COURSES) {
    for (const lesson of course.lessons) {
      const takeaways = lesson.blocks.find((block) => block.kind === "takeaways");
      if (takeaways?.kind !== "takeaways") continue;
      takeaways.items.forEach((item, index) => {
        deck.push({
          id: `fc-take-${lesson.id}-${index}`,
          kind: "TAKEAWAY",
          front: `${lesson.title} - key takeaway`,
          back: item,
          source: lesson.title,
          categoryId: course.categoryId,
        });
      });
    }
  }

  return deck;
}

export const flashcardExists = (cardId: string): boolean =>
  flashcardDeck().some((card) => card.id === cardId);
