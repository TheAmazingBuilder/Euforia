/**
 * Academy answer grading - the ONE evaluation function shared by course
 * quizzes, inline lesson checkpoints and category exams (Phase 11 §32–§39,
 * §77).
 *
 * SECURITY INVARIANTS (§33/§34/§37 - mandatory, covered by e2e):
 *   - Correct answers NEVER leave the server before a submission: the public
 *     question projection (`stripQuestion`) is the only learner-facing shape.
 *   - The backend is authoritative: client values are inputs to THIS grading,
 *     never verdicts (no clientScore/isCorrect/passed is ever trusted).
 *   - Grading only ever touches questions belonging to the resolved quiz /
 *     category pool - a questionId from another quiz cannot be graded.
 *
 * Parity source: mocks/academy-engine.ts (NUMERIC relative tolerance with a
 * 1e-9 floor, TF boolean equality, MC/SCENARIO option-index equality).
 */
import type {
  AcademyCheckpointResult,
  AcademyQuizQuestion,
  AcademyQuizQuestionPublic,
  AcademyQuizQuestionResult,
} from "../../../shared/contracts";

/** Default relative tolerance for NUMERIC questions (2%). */
const DEFAULT_NUMERIC_TOLERANCE = 0.02;

/** Learner-facing projection - correctness never included (§33/§34). */
export function stripQuestion(question: AcademyQuizQuestion): AcademyQuizQuestionPublic {
  return {
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    options: question.options,
    unit: question.unit,
  };
}

/** Grade ONE submitted value against ONE owned question. Pure. */
export function gradeAnswer(
  question: AcademyQuizQuestion,
  given: number | boolean | null | undefined,
): AcademyQuizQuestionResult {
  let correct = false;
  let answer: number | boolean = 0;

  if (question.kind === "NUMERIC") {
    const value = typeof given === "number" ? given : Number.NaN;
    const tolerance = (question.tolerance ?? DEFAULT_NUMERIC_TOLERANCE) * Math.abs(question.value ?? 0);
    correct =
      Number.isFinite(value) &&
      Math.abs(value - (question.value ?? 0)) <= Math.max(tolerance, 1e-9);
    answer = question.value ?? 0;
  } else if (question.kind === "TF") {
    correct = typeof given === "boolean" && given === question.answer;
    answer = question.answer === true;
  } else {
    correct = typeof given === "number" && given === question.answer;
    answer = typeof question.answer === "number" ? question.answer : 0;
  }

  return { questionId: question.id, correct, answer, explanation: question.explanation };
}

/** Grade a submitted answer map against an OWNED question list (order kept). */
export function gradeAnswers(
  questions: AcademyQuizQuestion[],
  answerMap: Map<string, number | boolean | null | undefined>,
): AcademyQuizQuestionResult[] {
  return questions.map((question) => gradeAnswer(question, answerMap.get(question.id)));
}

/** Checkpoint verdict shape (same content as the quiz result row). */
export type CheckpointVerdict = Pick<AcademyCheckpointResult, "correct" | "answer" | "explanation"> & {
  questionId: string;
};

/** Grade one inline checkpoint against its OWNED question (null → mismatch). */
export function gradeCheckpointAnswer(
  question: AcademyQuizQuestion | undefined,
  inputQuestionId: string,
  value: number | boolean | null | undefined,
): CheckpointVerdict | null {
  if (!question || question.id !== inputQuestionId) return null;
  const result = gradeAnswer(question, value);
  return { questionId: question.id, correct: result.correct, answer: result.answer, explanation: result.explanation };
}
