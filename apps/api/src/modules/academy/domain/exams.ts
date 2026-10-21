/**
 * Academy category certifications — exam papers over a category's question
 * pool, server-side grading and the BRONZE/SILVER/GOLD tier ladder
 * (Phase 11 §32/§36/§39: same security invariants as quizzes — public papers
 * never carry answers, the backend is authoritative, cross-pool questionIds
 * are not graded).
 *
 * Parity source: mocks/academy-engine.ts (EXAM_SIZE/tierOf/examPaper/
 * submitExam/certifications) — verbatim semantics.
 */
import type {
  AcademyCertificationsResponse,
  AcademyExamPaper,
  AcademyExamResultResponse,
  AcademyQuizSubmitInput,
} from "../../../shared/contracts";
import { CATEGORIES, categoryById, examPool } from "./catalog";
import { gradeAnswers, stripQuestion } from "./grading";
import type { Rng } from "./drills";
import { shuffleWith } from "./drills";

export const EXAM_SIZE = 20;

/** Paper over the category pool — public questions only (answers stripped). */
export function examPaper(categoryId: string, rng: Rng): AcademyExamPaper | null {
  if (!categoryById(categoryId)) return null;
  const pool = examPool(categoryId);
  if (pool.length === 0) return null;
  const picked = shuffleWith(rng, pool).slice(0, Math.min(EXAM_SIZE, pool.length));
  return { categoryId, questions: picked.map(stripQuestion) };
}

/** BRONZE ≥50%, SILVER ≥70%, GOLD ≥90%. */
export function tierOf(percent: number): AcademyExamResultResponse["tier"] {
  if (percent >= 90) return "GOLD";
  if (percent >= 70) return "SILVER";
  if (percent >= 50) return "BRONZE";
  return "NONE";
}

export interface ExamGrading {
  graded: AcademyExamResultResponse["results"];
  score: number;
  total: number;
  percent: number;
  passed: boolean;
  tier: AcademyExamResultResponse["tier"];
}

/**
 * Grade an exam submission. Only questions BELONGING to the category's pool
 * and present in the submission are graded (defensive — Phase 11 §37: a
 * questionId from another quiz/category can never earn credit).
 */
export function gradeExam(
  categoryId: string,
  input: AcademyQuizSubmitInput,
): ExamGrading | null {
  const pool = examPool(categoryId);
  if (pool.length === 0) return null;

  const answerMap = new Map(input.answers.map((entry) => [entry.questionId, entry.value ?? null]));
  const poolById = new Map(pool.map((question) => [question.id, question]));
  const owned = [...answerMap.entries()]
    .map(([questionId]) => poolById.get(questionId))
    .filter((question): question is NonNullable<typeof question> => Boolean(question));

  const graded = gradeAnswers(owned, answerMap);
  const score = graded.filter((result) => result.correct).length;
  const total = graded.length;
  const percent = total === 0 ? 0 : Math.round((score / total) * 100);

  return { graded, score, total, percent, passed: percent >= 50, tier: tierOf(percent) };
}

export interface CertificationSeed {
  /** categoryId → best percent so far (ledger-derived). */
  bestPercent: ReadonlyMap<string, number>;
  /** categoryId → number of attempts. */
  attempts: ReadonlyMap<string, number>;
}

export function certifications(seed: CertificationSeed): AcademyCertificationsResponse {
  return {
    certifications: CATEGORIES.map((category) => {
      const best = seed.bestPercent.get(category.id);
      return {
        categoryId: category.id,
        name: category.name,
        bestPercent: best ?? null,
        attempts: seed.attempts.get(category.id) ?? 0,
        tier: best === undefined ? ("NONE" as const) : tierOf(best),
        questionPool: examPool(category.id).length,
      };
    }),
  };
}
