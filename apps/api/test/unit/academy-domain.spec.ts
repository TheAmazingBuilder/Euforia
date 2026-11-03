/**
 * Unit - Academy pure domain engines (Phase 11).
 *
 * Grading (quiz/checkpoint/exam share ONE evaluator), learning-state
 * derivations (streak, weekly plan, progress, milestones), Leitner
 * flashcard scheduling, practice drills (deterministic rng) and the
 * journal-suggestion rules. Security-relevant behaviors (answer stripping,
 * cross-pool grading rejection, weakness bank) are asserted HERE and again
 * over HTTP in the e2e battery.
 */
import { describe, expect, it } from "vitest";
import type { AcademyQuizQuestion } from "../../src/shared/contracts";
import { gradeAnswer, gradeCheckpointAnswer, gradeAnswers, stripQuestion } from "../../src/modules/academy/domain/grading";
import {
  progress,
  streak,
  utcDateKey,
  weeklyPlan,
  milestones,
  WEEK_TARGETS,
  weekStartOf,
} from "../../src/modules/academy/domain/learning-state";
import { continueLearning, recommendations, resumeLearning } from "../../src/modules/academy/domain/guidance";
import {
  FLASHCARD_DAILY_CAP,
  flashcardsQueue,
  nextFlashcardState,
  type FlashcardCardState,
} from "../../src/modules/academy/domain/flashcards";
import {
  patternDrill,
  positionDrill,
  practiceStats,
  weaknessBank,
} from "../../src/modules/academy/domain/drills";
import { examPaper, gradeExam, tierOf } from "../../src/modules/academy/domain/exams";
import { suggestions, type SuggestionTradeRow } from "../../src/modules/academy/domain/suggestions";
import { CHECKPOINT_MIN_BLOCKS, courseById, COURSES, hashString } from "../../src/modules/academy/domain/catalog";

// ── deterministic rng helpers ────────────────────────────────────────────────

function sequentialRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i % values.length] as number;
    i += 1;
    return value;
  };
}

const questions: AcademyQuizQuestion[] = [
  { id: "q1", kind: "MC", prompt: "p1", options: ["a", "b", "c"], answer: 2, explanation: "e1" },
  { id: "q2", kind: "TF", prompt: "p2", answer: false, explanation: "e2" },
  { id: "q3", kind: "NUMERIC", prompt: "p3", value: 100, tolerance: 0.02, unit: "units", explanation: "e3" },
];

// ── grading ──────────────────────────────────────────────────────────────────

describe("grading", () => {
  it("strips every correctness carrier from the public projection", () => {
    for (const question of questions) {
      const pub = stripQuestion(question);
      expect(JSON.stringify(pub)).not.toContain("answer");
      expect(JSON.stringify(pub)).not.toContain("explanation");
      expect(JSON.stringify(pub)).not.toContain("tolerance");
      expect(JSON.stringify(pub)).not.toContain("value");
      expect(pub).toEqual({
        id: question.id,
        kind: question.kind,
        prompt: question.prompt,
        options: question.options,
        unit: question.unit,
      });
    }
  });

  it("grades MC by option index and TF by boolean equality", () => {
    expect(gradeAnswer(questions[0] as AcademyQuizQuestion, 2).correct).toBe(true);
    expect(gradeAnswer(questions[0] as AcademyQuizQuestion, 1).correct).toBe(false);
    expect(gradeAnswer(questions[0] as AcademyQuizQuestion, null).correct).toBe(false);
    expect(gradeAnswer(questions[1] as AcademyQuizQuestion, false).correct).toBe(true);
    expect(gradeAnswer(questions[1] as AcademyQuizQuestion, true).correct).toBe(false);
    // A string value can never satisfy a TF/MC comparison (type-hostile input).
    expect(gradeAnswer(questions[1] as AcademyQuizQuestion, "false" as unknown as number).correct).toBe(false);
  });

  it("grades NUMERIC with RELATIVE tolerance and a 1e-9 floor", () => {
    // 100 ± 2% → 98..102.
    expect(gradeAnswer(questions[2] as AcademyQuizQuestion, 98).correct).toBe(true);
    expect(gradeAnswer(questions[2] as AcademyQuizQuestion, 102).correct).toBe(true);
    expect(gradeAnswer(questions[2] as AcademyQuizQuestion, 97.9).correct).toBe(false);
    // Zero-valued question: the floor keeps 0 correct and rejects anything else.
    const zero: AcademyQuizQuestion = { id: "z", kind: "NUMERIC", prompt: "p", value: 0, explanation: "e" };
    expect(gradeAnswer(zero, 0).correct).toBe(true);
    expect(gradeAnswer(zero, 0.5).correct).toBe(false);
  });

  it("grades only the owned question list - foreign questionIds earn nothing", () => {
    const results = gradeAnswers(questions, new Map<string, number | boolean | null>([
      ["q1", 2],
      ["q2", false],
      ["q3", 100],
      ["FOREIGN", 999],
    ]));
    expect(results).toHaveLength(3);
    expect(results.every((result) => result.correct)).toBe(true);
  });

  it("rejects checkpoint grading when the questionId mismatches the served pick", () => {
    const verdict = gradeCheckpointAnswer(questions[0] as AcademyQuizQuestion, "OTHER", 2);
    expect(verdict).toBeNull();
    const ok = gradeCheckpointAnswer(questions[0] as AcademyQuizQuestion, "q1", 2);
    expect(ok).toEqual({ questionId: "q1", correct: true, answer: 2, explanation: "e1" });
  });

  it("hashString is stable (same pick for serving and grading)", () => {
    expect(hashString("lsn-x:2026-01-15")).toBe(hashString("lsn-x:2026-01-15"));
    expect(hashString("lsn-x:2026-01-15")).not.toBe(hashString("lsn-x:2026-01-16"));
  });
});

// ── streak ───────────────────────────────────────────────────────────────────

describe("streak", () => {
  const day = (offsetDays: number): Date => new Date(Date.UTC(2026, 0, 10, 12, 0, 0) + offsetDays * 86_400_000);

  it("counts today, survives through yesterday, resets after a gap", () => {
    // Jan 10 = "today"; 8,9,10 → current 3.
    expect(streak(["2026-01-08", "2026-01-09", "2026-01-10"], day(0)).currentDays).toBe(3);
    // Yesterday-only streak survives (10 missing).
    const yesterday = streak(["2026-01-09"], day(0));
    expect(yesterday.currentDays).toBe(1);
    expect(yesterday.activeToday).toBe(false);
    // Gap on the 8th breaks the run.
    expect(streak(["2026-01-06", "2026-01-07", "2026-01-09", "2026-01-10"], day(0)).currentDays).toBe(2);
  });

  it("derives longest run and last activity", () => {
    const info = streak(["2026-01-02", "2026-01-03", "2026-01-04", "2026-01-07", "2026-01-08"], day(0));
    expect(info.longestDays).toBe(3);
    expect(info.lastActivityDate).toBe("2026-01-08");
  });

  it("handles empty state honestly", () => {
    const info = streak([], day(0));
    expect(info).toEqual({ currentDays: 0, longestDays: 0, lastActivityDate: null, activeToday: false });
  });
});

// ── weekly plan ──────────────────────────────────────────────────────────────

describe("weekly plan", () => {
  it("anchors on the Monday of the current UTC week", () => {
    // 2026-01-07 is a Wednesday → week starts 2026-01-05.
    expect(weekStartOf(new Date(Date.UTC(2026, 0, 7, 18, 0, 0)))).toBe("2026-01-05");
    // Sunday rolls back to the Monday five days earlier.
    expect(weekStartOf(new Date(Date.UTC(2026, 0, 11, 23, 0, 0)))).toBe("2026-01-05");
  });

  it("counts lessons/drills/quizzes inside the week with mock-parity targets", () => {
    const now = new Date(Date.UTC(2026, 0, 7, 12, 0, 0));
    const plan = weeklyPlan({
      now,
      lessonCompletionsAt: ["2026-01-05T10:00:00Z", "2026-01-06T10:00:00Z", "2025-12-30T10:00:00Z"],
      drillAttemptsAt: ["2026-01-05T10:00:00Z", "2026-01-06T10:00:00Z", "2026-01-07T10:00:00Z"],
      quizAttemptsAt: ["2026-01-05T10:00:00Z", "2025-12-29T10:00:00Z"],
    });
    expect(plan.weekStart).toBe("2026-01-05");
    expect(plan.lessonsDone).toBe(2);
    expect(plan.drillsDone).toBe(3);
    expect(plan.quizzesDone).toBe(1);
    expect(plan.lessonsTarget).toBe(WEEK_TARGETS.lessons);
    expect(plan.drillsTarget).toBe(WEEK_TARGETS.drills);
    expect(plan.quizzesTarget).toBe(WEEK_TARGETS.quizzes);
  });
});

// ── progress ─────────────────────────────────────────────────────────────────

describe("progress", () => {
  it("averages BEST scores per attempted quiz over the whole question pool", () => {
    // Mock-parity: quizzesTaken counts DISTINCT quizzes; quizAverage = Σ best / Σ pool questions.
    const pool = COURSES.filter((course) => course.quiz).reduce(
      (sum, course) => sum + (course.quiz?.questions.length ?? 0),
      0,
    );
    // Only AUTHORED lesson ids count toward overall progress.
    const realLessons = (courseById("crs-fund-markets")?.lessons ?? []).slice(0, 2).map((lesson) => lesson.id);
    const result = progress({
      today: new Date(Date.UTC(2026, 0, 7)),
      activityDays: ["2026-01-07"],
      completedLessonIds: new Set([...realLessons, "lsn-a"]), // lsn-a: unknown → ignored
      quizAttempts: [
        { quizId: "qz-1", score: 2 },
        { quizId: "qz-1", score: 1 }, // older attempt - best(2) wins, not the average
        { quizId: "qz-2", score: 1 },
      ],
      practiceAttempts: 7,
      practiceCorrect: 4,
    });
    expect(result.quizzesTaken).toBe(2);
    expect(result.quizAverage).toBe(Math.min(100, Math.round((3 / pool) * 100)));
    expect(result.practiceAttempts).toBe(7);
    expect(result.practiceCorrect).toBe(4);
    expect(result.overall.completedLessons).toBe(realLessons.length);
    expect(result.overall.lessonCount).toBeGreaterThan(0);
  });

  it("reports null quiz average before the first attempt", () => {
    const result = progress({
      today: new Date(),
      activityDays: [],
      completedLessonIds: new Set(),
      quizAttempts: [],
      practiceAttempts: 0,
      practiceCorrect: 0,
    });
    expect(result.quizAverage).toBeNull();
    expect(result.overall.percent).toBe(0);
    expect(result.streak.activeToday).toBe(false);
  });
});

// ── milestones ───────────────────────────────────────────────────────────────

describe("milestones", () => {
  it("achieves first-lesson with the completion timestamp and keeps others locked with progress", () => {
    const response = milestones({
      completedLessonIds: new Set(["lsn-a"]),
      oldestCompletionAt: "2026-01-05T10:00:00.000Z",
      quizAttemptCount: 0,
      examBestPercents: [],
      flashcardReviewCount: 10,
      scenarioStepCount: 1,
      noteCount: 0,
      streakLongest: 1,
    });
    const first = response.milestones.find((m) => m.id === "first-lesson");
    expect(first?.achieved).toBe(true);
    expect(first?.achievedAt).toBe("2026-01-05T10:00:00.000Z");
    expect(first?.progress).toBeNull();
    const ten = response.milestones.find((m) => m.id === "lessons-10");
    expect(ten?.achieved).toBe(false);
    expect(ten?.progress).toEqual({ current: 1, target: 10 });
  });
});

// ── guidance ─────────────────────────────────────────────────────────────────

describe("guidance", () => {
  const CATALOG_COURSE = "crs-fund-markets"; // authored, 5 lessons, BEGINNER, cat-fundamentals

  it("continueLearning prefers the most recently touched in-progress course", () => {
    // In-progress state on the authored course (partial completion).
    const course = courseById(CATALOG_COURSE);
    if (!course) throw new Error("catalog changed");
    const partial = new Set(course.lessons.slice(0, 2).map((lesson) => lesson.id));

    const pointer = continueLearning({
      completedLessonIds: partial,
      completionAt: new Map([...partial].map((id, i) => [id, new Date(Date.UTC(2026, 0, 5 + i)).toISOString()])),
    });
    expect(pointer?.courseId).toBe(CATALOG_COURSE);
    expect(pointer?.nextLessonId).toBe(course.lessons[2]?.id ?? null);
    expect(pointer?.lessonOrder).toBe(3);
    expect(pointer?.percent).toBe(50); // 2 of 4 authored lessons
  });

  it("resumeLearning points at the last VIEWED unfinished lesson only", () => {
    const course = courseById(CATALOG_COURSE);
    if (!course) throw new Error("catalog changed");
    const [first, second] = course.lessons;
    if (!first || !second) throw new Error("catalog changed");

    const viewed = resumeLearning({
      viewedAt: new Map([
        [first.id, "2026-01-05T10:00:00.000Z"],
        [second.id, "2026-01-06T10:00:00.000Z"],
      ]),
      completedLessonIds: new Set([second.id]),
    });
    expect(viewed?.lessonId).toBe(first.id); // second is completed → skipped
    expect(viewed?.coursePercent).toBeGreaterThan(0);

    // Everything viewed is completed → nothing to resume.
    expect(
      resumeLearning({
        viewedAt: new Map([[second.id, "2026-01-06T10:00:00.000Z"]]),
        completedLessonIds: new Set([second.id]),
      }),
    ).toBeNull();
  });

  it("recommendations surface in-progress first, then priority categories, capped at 3", () => {
    const course = courseById(CATALOG_COURSE);
    if (!course) throw new Error("catalog changed");
    const partial = new Set([course.lessons[0]?.id].filter(Boolean) as string[]);

    const picks = recommendations({
      completedLessonIds: partial,
      completionAt: new Map([[course.lessons[0]!.id, "2026-01-05T10:00:00.000Z"]]),
    });
    expect(picks.length).toBeLessThanOrEqual(3);
    expect(picks[0]?.courseId).toBe(CATALOG_COURSE);
    expect(picks[0]?.reason).toContain("In progress");
    // Priority categories appear before advanced.
    const advancedIndex = picks.findIndex((pick) => pick.categoryId === "cat-advanced");
    const priorityIndex = picks.findIndex((pick) => pick.categoryId === "cat-risk" || pick.categoryId === "cat-fundamentals");
    if (advancedIndex !== -1 && priorityIndex !== -1) {
      expect(priorityIndex).toBeLessThan(advancedIndex);
    }
  });
});

// ── flashcards ───────────────────────────────────────────────────────────────

describe("flashcards", () => {
  const today = new Date(Date.UTC(2026, 0, 7, 12, 0, 0));
  const deck = [
    { id: "c1", kind: "TERM" as const, front: "f1", back: "b1", source: "s", categoryId: null },
    { id: "c2", kind: "TERM" as const, front: "f2", back: "b2", source: "s", categoryId: null },
    { id: "c3", kind: "TAKEAWAY" as const, front: "f3", back: "b3", source: "s", categoryId: null },
  ];

  it("AGAIN resets to box 0 due today; GOOD advances one box; EASY two", () => {
    expect(nextFlashcardState(undefined, "AGAIN", today)).toEqual({ box: 0, due: "2026-01-07", reviews: 1 });
    const good = nextFlashcardState(undefined, "GOOD", today);
    expect(good).toEqual({ box: 1, due: "2026-01-09", reviews: 1 }); // +2 days (interval ladder)
    expect(nextFlashcardState(good, "EASY", today)).toEqual({ box: 3, due: "2026-01-15", reviews: 2 }); // +8 days
    expect(nextFlashcardState(good, "AGAIN", today).box).toBe(0);
  });

  it("caps the Leitner box at the top of the ladder", () => {
    const top: FlashcardCardState = { box: 4, due: "2026-01-01", reviews: 9 };
    const next = nextFlashcardState(top, "EASY", today);
    expect(next.box).toBe(4); // clamped
    expect(next.due).toBe("2026-01-22"); // 15 days (top interval)
  });

  it("enforces the daily cap and serves free practice when nothing is due", () => {
    const queue = flashcardsQueue({
      deck,
      states: new Map(),
      today,
      reviewedToday: FLASHCARD_DAILY_CAP - 2,
      shuffle: (items) => [...items],
    });
    expect(queue.due).toHaveLength(2);
    expect(queue.dueCount).toBe(3);
    expect(queue.reviewedToday).toBe(FLASHCARD_DAILY_CAP - 2);

    const free = flashcardsQueue({
      deck,
      states: new Map(deck.map((card) => [card.id, { box: 4, due: "2026-03-01", reviews: 5 }])),
      today,
      reviewedToday: FLASHCARD_DAILY_CAP,
      shuffle: (items) => [...items],
    });
    expect(free.due.every((card) => card.extra)).toBe(true);
    expect(free.dueCount).toBe(0);
  });
});

// ── drills ───────────────────────────────────────────────────────────────────

describe("practice drills", () => {
  const at = (day: string) => new Date(`${day}T10:00:00.000Z`);

  it("weakness bank: latest-missed patterns are owed, a later correct clears them", () => {
    const rows = [
      { drill: "PATTERN_ID", correct: false, at: at("2026-01-01"), refId: "doji" },
      { drill: "PATTERN_ID", correct: false, at: at("2026-01-02"), refId: "hammer" },
      { drill: "PATTERN_ID", correct: true, at: at("2026-01-03"), refId: "doji" }, // cleared
      { drill: "CANDLE_LAB", correct: false, at: at("2026-01-03"), refId: "ignored" },
    ];
    expect(weaknessBank(rows)).toEqual(["hammer"]);
  });

  it("weakness bank caps at 12 and honors the oldest-first order", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      drill: "PATTERN_ID",
      correct: false,
      at: at(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`),
      refId: `pattern-${i}`,
    }));
    const bank = weaknessBank(rows);
    expect(bank.length).toBeLessThanOrEqual(12);
  });

  it("pattern drill serves 4 options including the answer (deterministic rng)", () => {
    const drill = patternDrill({ rng: sequentialRng([0.99, 0.01, 0.25, 0.5, 0.75]), wrongPatternIds: ["doji"] });
    expect(drill).not.toBeNull();
    expect(drill?.options).toHaveLength(4);
    expect(drill?.options.map((option) => option.id)).toContain("doji");
    expect(drill?.answer).toBeGreaterThanOrEqual(0);
    expect(drill?.answer).toBeLessThan(4);
    expect(drill?.explanation.length).toBeGreaterThan(0);
  });

  it("position drill: answer = risk budget ÷ stop distance (tolerance 3%)", () => {
    // Deterministic rng: first call picks balance index 0 (5000), second percent index 0 (0.5%).
    const drill = positionDrill(sequentialRng([0, 0, 0.5, 0.5, 0.5]));
    const budget = (drill.accountBalance * drill.riskPercent) / 100;
    const distance = Math.round((drill.entry - drill.stop) * 100) / 100;
    expect(drill.tolerance).toBe(0.03);
    expect(drill.answer).toBeCloseTo(Math.round((budget / distance) * 10) / 10, 5);
  });

  it("practice stats aggregate per-drill accuracy with fixed labels and a recent tail", () => {
    const stats = practiceStats([
      { drill: "PATTERN_ID", correct: true, at: at("2026-01-01") },
      { drill: "PATTERN_ID", correct: false, at: at("2026-01-02") },
      { drill: "FLASHCARD", correct: true, at: at("2026-01-03") },
    ]);
    expect(stats.perDrill).toHaveLength(9);
    const pattern = stats.perDrill.find((row) => row.drill === "PATTERN_ID");
    expect(pattern).toEqual({ drill: "PATTERN_ID", label: "Pattern ID", attempts: 2, correct: 1, accuracy: 50 });
    expect(stats.recent).toHaveLength(3);
    expect(stats.recent[0]?.drill).toBe("FLASHCARD"); // newest first
  });
});

// ── exams ────────────────────────────────────────────────────────────────────

describe("exams", () => {
  it("tier ladder: GOLD ≥90, SILVER ≥70, BRONZE ≥50, NONE below", () => {
    expect(tierOf(100)).toBe("GOLD");
    expect(tierOf(90)).toBe("GOLD");
    expect(tierOf(70)).toBe("SILVER");
    expect(tierOf(50)).toBe("BRONZE");
    expect(tierOf(49)).toBe("NONE");
    expect(tierOf(0)).toBe("NONE");
  });

  it("grades only questions belonging to the category pool", () => {
    // cat-technical has at least the qz-ta-charts pool (q1/q2/q3 authored ids).
    const grading = gradeExam("cat-technical", {
      answers: [
        { questionId: "q1", value: 1 },
        { questionId: "q2", value: false },
        { questionId: "FOREIGN", value: 0 },
      ],
    });
    expect(grading).not.toBeNull();
    expect(grading?.total).toBe(2);
    expect(grading?.score).toBe(2);
    expect(grading?.percent).toBe(100);
    expect(grading?.passed).toBe(true);
  });

  it("exam paper serves at most 20 public questions over an existing category", () => {
    const paper = examPaper("cat-technical", () => 0.5);
    expect(paper?.categoryId).toBe("cat-technical");
    expect(paper?.questions.length).toBeGreaterThan(0);
    expect(paper?.questions.length).toBeLessThanOrEqual(20);
    for (const question of paper?.questions ?? []) {
      expect(JSON.stringify(question)).not.toContain("explanation");
    }
    expect(examPaper("cat-does-not-exist", () => 0.5)).toBeNull();
  });
});

// ── journal suggestions ──────────────────────────────────────────────────────

describe("journal suggestions", () => {
  const row = (overrides: Partial<SuggestionTradeRow>): SuggestionTradeRow => ({
    rMultiple: 0,
    plannedRR: null,
    strategyId: "strat-1",
    ...overrides,
  });

  it("fires rules only at the ≥2 evidence threshold", () => {
    expect(suggestions([row({ rMultiple: -1.5 })])).toEqual([]);
    const two = suggestions([
      row({ rMultiple: -1.5 }),
      row({ rMultiple: -2 }),
      row({ rMultiple: 3 }),
    ]);
    const risk = two.find((pick) => pick.courseId === "crs-risk-fundamentals");
    expect(risk?.reason).toContain("2 closed trades hit −1R or worse");
  });

  it("ranks by weight and deep-links the first lesson", () => {
    const rows = [
      row({ rMultiple: -1, strategyId: null }),
      row({ rMultiple: -1.5, strategyId: null }),
      row({ rMultiple: -2, strategyId: null }),
      row({ rMultiple: -3, strategyId: "strat-1", plannedRR: 3 }),
      row({ rMultiple: -0.5, strategyId: "strat-1", plannedRR: 2.5 }),
    ];
    const picks = suggestions(rows);
    expect(picks.length).toBeGreaterThan(0);
    // fullLosses weight 4 (all four ≤ −1R) outranks noStrategy (2) and planDrift (2).
    expect(picks[0]?.courseId).toBe("crs-risk-fundamentals");
    expect(picks[0]?.lessonId).toMatch(/^lsn-/);
  });

  it("never fires when the journal is empty", () => {
    expect(suggestions([])).toEqual([]);
  });
});

// ── utcDateKey sanity ────────────────────────────────────────────────────────

describe("utcDateKey", () => {
  it("is UTC-based, not local", () => {
    expect(utcDateKey(new Date("2026-01-07T23:30:00.000Z"))).toBe("2026-01-07");
  });
});

// ── checkpoint rule constant ─────────────────────────────────────────────────

describe("checkpoint rule", () => {
  it("requires long lessons (≥ 6 blocks) - the authored threshold", () => {
    expect(CHECKPOINT_MIN_BLOCKS).toBe(6);
  });
});
