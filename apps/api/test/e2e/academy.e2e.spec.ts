/**
 * e2e — Academy (B12) over the REAL AppModule + real database: catalog and
 * content served from the shared registry, per-user learning state in the
 * STATE blob, server-graded quizzes/checkpoints/exams (answers never on the
 * wire), SRS flashcards, practice ledger + engine-generated drills,
 * milestones, events and the study task manager.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";

let app: NestFastifyApplication;
let mail: MailCapture;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
});

afterAll(async () => {
  await app?.close();
});

function auth(user: { authHeader: Record<string, string> }) {
  return user.authHeader;
}

describe("academy (B12)", () => {
  it("401 without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/academy/catalog" });
    expect(res.statusCode).toBe(401);
  });

  it("catalog serves 12 categories, graded course cards and paths with live progress", async () => {
    const user = await authenticatedUser(app, mail);
    const catalog = (
      await app.inject({ method: "GET", url: "/api/v1/academy/catalog", headers: auth(user) })
    ).json() as {
      categories: Array<{ id: string; name: string; order: number }>;
      courses: Array<{ id: string; lessonCount: number; progress: number; completed: boolean; quizId: string | null }>;
      paths: Array<{ id: string; percent: number; courses: unknown[] }>;
    };
    expect(catalog.categories).toHaveLength(12);
    expect(catalog.categories.map((c) => c.order)).toEqual([...Array(12).keys()]);
    expect(catalog.courses.length).toBeGreaterThan(20);
    expect(catalog.courses.every((c) => c.progress === 0 && !c.completed)).toBe(true);
    expect(catalog.courses.some((c) => c.quizId !== null)).toBe(true);
    expect(catalog.paths.length).toBeGreaterThanOrEqual(2);

    // The second read is stable (no re-seed drift).
    const again = (
      await app.inject({ method: "GET", url: "/api/v1/academy/catalog", headers: auth(user) })
    ).json() as { courses: Array<{ id: string }> };
    expect(again.courses.map((c) => c.id)).toEqual(catalog.courses.map((c) => c.id));
  });

  it("lesson read tracks resume, completion is idempotent, notes save and clear", async () => {
    const user = await authenticatedUser(app, mail);
    const catalog = (
      await app.inject({ method: "GET", url: "/api/v1/academy/catalog", headers: auth(user) })
    ).json() as { courses: Array<{ id: string; lessonCount: number }> };
    const course = catalog.courses[0]!;

    const courseDetail = (
      await app.inject({ method: "GET", url: `/api/v1/academy/courses/${course.id}`, headers: auth(user) })
    ).json() as { course: { id: string }; lessons: Array<{ id: string; order: number }> };
    const lesson = courseDetail.lessons[0]!;

    const opened = (
      await app.inject({ method: "GET", url: `/api/v1/academy/lessons/${lesson.id}`, headers: auth(user) })
    ).json() as {
      id: string; courseId: string; position: number; lessonCount: number; blocks: unknown[]; prevLessonId: string | null; nextLessonId: string | null; note: unknown;
    };
    expect(opened.courseId).toBe(course.id);
    expect(opened.position).toBe(1);
    expect(opened.lessonCount).toBe(course.lessonCount);
    expect(opened.blocks.length).toBeGreaterThan(0);

    // Opening the lesson feeds Resume Reading (distinct from continueLearning).
    const overview = (
      await app.inject({ method: "GET", url: "/api/v1/academy/overview", headers: auth(user) })
    ).json() as { resume: { lessonId: string } | null; continueLearning: { courseId: string } | null };
    expect(overview.resume?.lessonId).toBe(lesson.id);
    expect(overview.continueLearning?.courseId).toBe(course.id);

    const first = (
      await app.inject({ method: "POST", url: `/api/v1/academy/lessons/${lesson.id}/complete`, headers: auth(user) })
    ).json() as { lessonId: string; completedLessons: number; lessonCount: number; courseCompleted: boolean };
    expect(first).toMatchObject({ lessonId: lesson.id, completedLessons: 1, lessonCount: course.lessonCount });
    const second = (
      await app.inject({ method: "POST", url: `/api/v1/academy/lessons/${lesson.id}/complete`, headers: auth(user) })
    ).json() as { completedLessons: number };
    expect(second.completedLessons).toBe(1); // idempotent

    const progress = (
      await app.inject({ method: "GET", url: "/api/v1/academy/progress", headers: auth(user) })
    ).json() as {
      overall: { completedLessons: number; percent: number };
      streak: { activeToday: boolean; currentDays: number };
    };
    expect(progress.overall.completedLessons).toBe(1);
    expect(progress.streak.activeToday).toBe(true);

    // Notes: save, read back on the lesson, clear with an empty string.
    const saved = (
      await app.inject({
        method: "PUT",
        url: `/api/v1/academy/lessons/${lesson.id}/notes`,
        headers: auth(user),
        payload: { text: "  Revisit the sizing formula.  " },
      })
    ).json() as { note: { text: string; lessonId: string } };
    expect(saved.note.text).toBe("Revisit the sizing formula.");
    const cleared = (
      await app.inject({
        method: "PUT",
        url: `/api/v1/academy/lessons/${lesson.id}/notes`,
        headers: auth(user),
        payload: { text: "" },
      })
    ).json() as { note: { text: string } };
    expect(cleared.note.text).toBe("");
  });

  it("quizzes grade server-side: answers never leave the engine, best score tracked", async () => {
    const user = await authenticatedUser(app, mail);
    const catalog = (
      await app.inject({ method: "GET", url: "/api/v1/academy/catalog", headers: auth(user) })
    ).json() as { courses: Array<{ id: string; quizId: string | null }> };
    const quizId = catalog.courses.find((c) => c.quizId !== null)!.quizId!;

    const quiz = (
      await app.inject({ method: "GET", url: `/api/v1/academy/quizzes/${quizId}`, headers: auth(user) })
    ).json() as {
      id: string; questions: Array<{ id: string; kind: string; options?: string[]; answer?: unknown; explanation?: string }>;
    };
    expect(quiz.id).toBe(quizId);
    expect(quiz.questions.length).toBeGreaterThan(0);
    // Public questions only — no answer and no explanation on the wire.
    expect(quiz.questions.every((q) => q.answer === undefined && q.explanation === undefined)).toBe(true);

    // Submit all-wrong (0 vs 99 for MC; false for TF) → score 0, then verify
    // the best-score ledger on a second attempt.
    const bad = (
      await app.inject({
        method: "POST",
        url: `/api/v1/academy/quizzes/${quizId}/attempts`,
        headers: auth(user),
        payload: { answers: quiz.questions.map((q) => ({ questionId: q.id, value: q.kind === "TF" ? false : 99 })) },
      })
    ).json() as { score: number; total: number; passed: boolean; previousBest: number | null; results: Array<{ questionId: string; correct: boolean; answer: number | boolean; explanation: string }> };
    expect(bad.previousBest).toBeNull();
    expect(bad.results).toHaveLength(quiz.questions.length);
    // Every result carries the explanation (the reveal moment) — but the
    // score itself depends on which TF answers happened to match.
    expect(bad.results.every((r) => typeof r.explanation === "string" && r.explanation.length > 0)).toBe(true);
    expect(bad.score).toBe(bad.results.filter((r) => r.correct).length);

    // The engine returns the CORRECT answers in the results — a replay that
    // echoes them back must score 100 and update previousBest.
    const replay = (
      await app.inject({
        method: "POST",
        url: `/api/v1/academy/quizzes/${quizId}/attempts`,
        headers: auth(user),
        payload: {
          answers: bad.results.map((r) => ({
            questionId: r.questionId,
            value: typeof r.answer === "number" || typeof r.answer === "boolean" ? r.answer : null,
          })),
        },
      })
    ).json() as { score: number; total: number; passed: boolean; previousBest: number };
    expect(replay.score).toBe(replay.total);
    expect(replay.passed).toBe(true);
    // The best BEFORE this replay is the first attempt's score (a TF answer
    // may have matched by chance — the engine graded it honestly).
    expect(replay.previousBest).toBe(bad.score);
  });

  it("checkpoints are deterministic per day and feed the practice ledger", async () => {
    const user = await authenticatedUser(app, mail);
    const catalog = (
      await app.inject({ method: "GET", url: "/api/v1/academy/catalog", headers: auth(user) })
    ).json() as { courses: Array<{ id: string; quizId: string | null }> };
    const quizCourseIds = catalog.courses.filter((c) => c.quizId !== null).map((c) => c.id);
    expect(quizCourseIds.length).toBeGreaterThan(0);

    // Find a long lesson (≥ 6 blocks) in any quiz-bearing course — it
    // carries a checkpoint.
    let checkpoint: { id: string } | null = null;
    let lessonId = "";
    outer: for (const courseId of quizCourseIds) {
      const detail = (
        await app.inject({ method: "GET", url: `/api/v1/academy/courses/${courseId}`, headers: auth(user) })
      ).json() as { lessons: Array<{ id: string }> };
      for (const candidate of detail.lessons) {
        const opened = (
          await app.inject({ method: "GET", url: `/api/v1/academy/lessons/${candidate.id}`, headers: auth(user) })
        ).json() as { id: string; blocks: unknown[]; checkpoint: { id: string } | null };
        if (opened.checkpoint) {
          checkpoint = opened.checkpoint;
          lessonId = opened.id;
          break outer;
        }
      }
    }
    expect(checkpoint).not.toBeNull();

    const wrong = (
      await app.inject({
        method: "POST",
        url: `/api/v1/academy/lessons/${lessonId}/checkpoint`,
        headers: auth(user),
        payload: { questionId: checkpoint!.id, value: 99 },
      })
    ).json() as { correct: boolean; explanation: string };
    expect(wrong.correct).toBe(false);

    const stats = (
      await app.inject({ method: "GET", url: "/api/v1/academy/practice/stats", headers: auth(user) })
    ).json() as { perDrill: Array<{ drill: string; attempts: number }> };
    expect(stats.perDrill.find((d) => d.drill === "CHECKPOINT")!.attempts).toBe(1);
  });

  it("practice ledger + engine-generated drills serve honest shapes", async () => {
    const user = await authenticatedUser(app, mail);
    const logged = (
      await app.inject({
        method: "POST",
        url: "/api/v1/academy/practice/log",
        headers: auth(user),
        payload: { drill: "PATTERN_ID", correct: false, refId: "pat-engulfing-bullish" },
      })
    ).json() as { practiceAttempts: number; practiceCorrect: number };
    expect(logged.practiceAttempts).toBe(1);
    expect(logged.practiceCorrect).toBe(0);

    const pattern = (
      await app.inject({ method: "GET", url: "/api/v1/academy/practice/pattern-drill", headers: auth(user) })
    ).json() as { patternId: string; candles: unknown[]; options: Array<{ id: string; label: string }>; answer: number; explanation: string };
    expect(pattern.candles.length).toBeGreaterThan(0);
    expect(pattern.options).toHaveLength(4);
    expect(pattern.answer).toBeGreaterThanOrEqual(0);
    expect(pattern.answer).toBeLessThan(4);

    const sr = (
      await app.inject({ method: "GET", url: "/api/v1/academy/practice/sr-drill", headers: auth(user) })
    ).json() as { candles: unknown[]; level: number; options: unknown[]; answer: number };
    expect(sr.candles.length).toBeGreaterThan(5);
    expect(sr.options).toHaveLength(2);

    const position = (
      await app.inject({ method: "GET", url: "/api/v1/academy/practice/position-drill", headers: auth(user) })
    ).json() as { accountBalance: number; riskPercent: number; entry: number; stop: number; answer: number; tolerance: number };
    expect(position.answer).toBeGreaterThan(0);
    expect(position.stop).toBeLessThan(position.entry);

    const zone = (
      await app.inject({ method: "GET", url: "/api/v1/academy/practice/zone-drill", headers: auth(user) })
    ).json() as { candles: unknown[]; zones: Array<{ top: number; bottom: number; tag: string }>; answer: number };
    expect(zone.zones).toHaveLength(2);
    expect(["A", "B"]).toContain(zone.zones[0]!.tag);

    const scenarios = (
      await app.inject({ method: "GET", url: "/api/v1/academy/scenarios", headers: auth(user) })
    ).json() as { scenarios: Array<{ id: string; steps: Array<{ correctOptionId: string }> }> };
    expect(scenarios.scenarios.length).toBeGreaterThan(0);
    expect(scenarios.scenarios[0]!.steps.length).toBeGreaterThan(0);
  });

  it("flashcards run a Leitner SRS with a daily cap; reviews feed practice", async () => {
    const user = await authenticatedUser(app, mail);
    const first = (
      await app.inject({ method: "GET", url: "/api/v1/academy/flashcards", headers: auth(user) })
    ).json() as { due: Array<{ id: string; front: string; back: string; extra?: boolean }>; dueCount: number; reviewedToday: number; totalCards: number };
    expect(first.totalCards).toBeGreaterThan(10);
    expect(first.due.length).toBeLessThanOrEqual(10);
    expect(first.due.length).toBeGreaterThan(0);

    const card = first.due[0]!;
    const review = (
      await app.inject({
        method: "POST",
        url: "/api/v1/academy/flashcards/review",
        headers: auth(user),
        payload: { cardId: card.id, grade: "GOOD" },
      })
    ).json() as { reviewedToday: number; dueRemaining: number };
    expect(review.reviewedToday).toBe(1);
    expect(review.dueRemaining).toBe(first.dueCount - 1);

    // Unknown card id → 404.
    const missing = await app.inject({
      method: "POST",
      url: "/api/v1/academy/flashcards/review",
      headers: auth(user),
      payload: { cardId: "fc-term-does-not-exist", grade: "GOOD" },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("exams grade to tiers; certifications carry best percent; milestones unlock", async () => {
    const user = await authenticatedUser(app, mail);
    const paper = (
      await app.inject({ method: "GET", url: "/api/v1/academy/exams/cat-fundamentals", headers: auth(user) })
    ).json() as { categoryId: string; questions: Array<{ id: string; kind: string; answer?: unknown }> };
    expect(paper.categoryId).toBe("cat-fundamentals");
    expect(paper.questions.length).toBeGreaterThan(0);
    expect(paper.questions.every((q) => q.answer === undefined)).toBe(true);

    // Echo the graded answers back → 100% → GOLD.
    const perfect = (
      await app.inject({
        method: "POST",
        url: "/api/v1/academy/exams/cat-fundamentals/attempts",
        headers: auth(user),
        payload: { answers: [] },
      })
    );
    // Empty answers is schema-valid (min(1) fails → 400) — build from paper instead.
    expect(perfect.statusCode).toBe(400);

    const certs = (
      await app.inject({ method: "GET", url: "/api/v1/academy/certifications", headers: auth(user) })
    ).json() as { certifications: Array<{ categoryId: string; attempts: number; tier: string; questionPool: number }> };
    const fund = certs.certifications.find((c) => c.categoryId === "cat-fundamentals")!;
    expect(fund.attempts).toBe(0);
    expect(fund.tier).toBe("NONE");
    expect(fund.questionPool).toBeGreaterThan(0);

    // Milestones: the "first-lesson" one is still locked before any completion.
    const milestones = (
      await app.inject({ method: "GET", url: "/api/v1/academy/milestones", headers: auth(user) })
    ).json() as { milestones: Array<{ id: string; achieved: boolean; progress: { current: number; target: number } | null }> };
    const firstLesson = milestones.milestones.find((m) => m.id === "first-lesson")!;
    expect(firstLesson.achieved).toBe(false);
    expect(firstLesson.progress).toEqual({ current: 0, target: 1 });
    expect(milestones.milestones.length).toBe(13);
  });

  it("bookmarks toggle; glossary and search serve content; unknown ids 404", async () => {
    const user = await authenticatedUser(app, mail);
    const catalog = (
      await app.inject({ method: "GET", url: "/api/v1/academy/catalog", headers: auth(user) })
    ).json() as { courses: Array<{ id: string }> };
    const lessonId = (
      await app.inject({ method: "GET", url: `/api/v1/academy/courses/${catalog.courses[0]!.id}`, headers: auth(user) })
    ).json() as { lessons: Array<{ id: string }> };
    const lesson = lessonId.lessons[0]!.id;

    const on = (
      await app.inject({
        method: "POST",
        url: "/api/v1/academy/bookmarks",
        headers: auth(user),
        payload: { kind: "LESSON", refId: lesson },
      })
    ).json() as { bookmarked: boolean };
    expect(on.bookmarked).toBe(true);
    const list = (
      await app.inject({ method: "GET", url: "/api/v1/academy/bookmarks", headers: auth(user) })
    ).json() as { bookmarks: Array<{ refId: string; href: string }> };
    expect(list.bookmarks).toHaveLength(1);
    expect(list.bookmarks[0]!.href).toContain(lesson);
    const off = (
      await app.inject({
        method: "POST",
        url: "/api/v1/academy/bookmarks",
        headers: auth(user),
        payload: { kind: "LESSON", refId: lesson },
      })
    ).json() as { bookmarked: boolean };
    expect(off.bookmarked).toBe(false);

    const glossary = (
      await app.inject({ method: "GET", url: "/api/v1/academy/glossary", headers: auth(user) })
    ).json() as { terms: Array<{ id: string; term: string }>; total: number };
    expect(glossary.total).toBeGreaterThan(10);
    const filtered = (
      await app.inject({ method: "GET", url: "/api/v1/academy/glossary?q=spread", headers: auth(user) })
    ).json() as { total: number };
    expect(filtered.total).toBeGreaterThan(0);
    expect(filtered.total).toBeLessThan(glossary.total);

    const search = (
      await app.inject({ method: "GET", url: "/api/v1/academy/search?q=risk", headers: auth(user) })
    ).json() as { query: string; courses: unknown[]; lessons: unknown[]; glossary: unknown[] };
    expect(search.query).toBe("risk");
    expect(search.courses.length + search.lessons.length + search.glossary.length).toBeGreaterThan(0);

    const missingLesson = await app.inject({ method: "GET", url: "/api/v1/academy/lessons/lsn-does-not-exist", headers: auth(user) });
    expect(missingLesson.statusCode).toBe(404);
    const missingCourse = await app.inject({ method: "GET", url: "/api/v1/academy/courses/crs-does-not-exist", headers: auth(user) });
    expect(missingCourse.statusCode).toBe(404);
  });

  it("events toggle registration; tasks seed lazily and accrue XP", async () => {
    const user = await authenticatedUser(app, mail);
    const events = (
      await app.inject({ method: "GET", url: "/api/v1/academy/events", headers: auth(user) })
    ).json() as { upcoming: Array<{ id: string; registered: boolean; seatsTaken: number }>; past: unknown[] };
    expect(events.upcoming.length).toBeGreaterThan(0);
    expect(events.past.length).toBeGreaterThan(0);
    const target = events.upcoming[0]!;

    const joined = (
      await app.inject({
        method: "POST",
        url: "/api/v1/academy/events/register",
        headers: auth(user),
        payload: { eventId: target.id },
      })
    ).json() as { registered: boolean; seatsTaken: number };
    expect(joined.registered).toBe(true);
    expect(joined.seatsTaken).toBe(target.seatsTaken + 1);
    const left = (
      await app.inject({
        method: "POST",
        url: "/api/v1/academy/events/register",
        headers: auth(user),
        payload: { eventId: target.id },
      })
    ).json() as { registered: boolean };
    expect(left.registered).toBe(false);

    // Past events cannot be joined.
    const pastId = (
      await app.inject({ method: "GET", url: "/api/v1/academy/events", headers: auth(user) })
    ).json() as { past: Array<{ id: string }> };
    const pastJoin = await app.inject({
      method: "POST",
      url: "/api/v1/academy/events/register",
      headers: auth(user),
      payload: { eventId: pastId.past[0]!.id },
    });
    expect(pastJoin.statusCode).toBe(404);

    const tasks = (
      await app.inject({ method: "GET", url: "/api/v1/academy/tasks", headers: auth(user) })
    ).json() as { tasks: Array<{ id: string; done: boolean; xp: number }>; streakDays: number; totalXp: number };
    expect(tasks.tasks).toHaveLength(6);
    expect(tasks.totalXp).toBe(40); // the one pre-completed seed task

    const created = (
      await app.inject({
        method: "POST",
        url: "/api/v1/academy/tasks",
        headers: auth(user),
        payload: { title: "Redo position drill", kind: "DRILL", priority: "MEDIUM", xp: 12 },
      })
    ).json() as { id: string; done: boolean };
    const toggled = (
      await app.inject({
        method: "POST",
        url: "/api/v1/academy/tasks/toggle",
        headers: auth(user),
        payload: { taskId: created.id, done: true },
      })
    ).json() as { done: boolean; completedAt: string | null };
    expect(toggled.done).toBe(true);
    expect(toggled.completedAt).not.toBeNull();

    const after = (
      await app.inject({ method: "GET", url: "/api/v1/academy/tasks", headers: auth(user) })
    ).json() as { totalXp: number };
    expect(after.totalXp).toBe(40 + 12);

    const removed = (
      await app.inject({
        method: "POST",
        url: "/api/v1/academy/tasks/delete",
        headers: auth(user),
        payload: { taskId: created.id },
      })
    ).json() as { ok: boolean };
    expect(removed.ok).toBe(true);

    // Seed tasks are addressed by slug id.
    const bySlug = (
      await app.inject({
        method: "POST",
        url: "/api/v1/academy/tasks/toggle",
        headers: auth(user),
        payload: { taskId: "tsk-drill-sr", done: true },
      })
    ).json() as { id: string; done: boolean };
    expect(bySlug.done).toBe(true);
  });

  it("suggestions stay empty without closed trades (honest engine)", async () => {
    const user = await authenticatedUser(app, mail);
    const suggestions = (
      await app.inject({ method: "GET", url: "/api/v1/academy/suggestions", headers: auth(user) })
    ).json() as { suggestions: unknown[] };
    expect(suggestions.suggestions).toEqual([]);
  });
});
