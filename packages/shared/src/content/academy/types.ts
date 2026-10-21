import type {
  AcademyBlock,
  AcademyLevel,
  AcademyQuizQuestion,
} from "../../schemas/academy";

/**
 * Academy content authoring types. Content lives server-side (mock server)
 * and is served through the API — the client renders it from responses and
 * never imports it directly, so a future CMS can replace these files.
 */

export type AuthoredLesson = {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  objectives: string[];
  blocks: AcademyBlock[];
  takeaways: string[];
};

export type AuthoredQuiz = {
  id: string;
  questions: AcademyQuizQuestion[];
};

export type AuthoredCourse = {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  level: AcademyLevel;
  /** "After this course you will be able to…" */
  objectives: string[];
  lessons: AuthoredLesson[];
  quiz?: AuthoredQuiz;
};

export type AuthoredCategory = {
  id: string;
  name: string;
  description: string;
  level: AcademyLevel;
  /** Lucide icon name rendered by the client's icon registry. */
  icon: string;
};

/** Shorthand block builders — keep the lesson files readable. */
export const text = (body: string): AcademyBlock => ({ kind: "text", body });
export const tip = (title: string, body: string): AcademyBlock => ({ kind: "callout", tone: "tip", title, body });
export const info = (title: string, body: string): AcademyBlock => ({ kind: "callout", tone: "info", title, body });
export const warn = (title: string, body: string): AcademyBlock => ({ kind: "callout", tone: "warn", title, body });
export const risk = (title: string, body: string): AcademyBlock => ({ kind: "callout", tone: "risk", title, body });
export const list = (...items: string[]): AcademyBlock => ({ kind: "list", items });
export const steps = (...items: string[]): AcademyBlock => ({ kind: "list", items, ordered: true });
export const formula = (label: string, expr: string, note?: string): AcademyBlock => ({ kind: "formula", label, expr, note });
export const table = (headers: string[], rows: string[][]): AcademyBlock => ({ kind: "table", headers, rows });
export const example = (title: string, ...steps_: string[]): AcademyBlock => ({ kind: "example", title, steps: steps_ });
export const candles = (variant: string, caption?: string): AcademyBlock => ({ kind: "candles", variant, caption });
export const structure = (variant: string, caption?: string): AcademyBlock => ({ kind: "structure", variant, caption });
export const zones = (variant: string, caption?: string): AcademyBlock => ({ kind: "zones", variant, caption });
export const riskDiagram = (variant: string, caption?: string): AcademyBlock => ({ kind: "risk", variant, caption });

/** MC question builder. */
export function mc(id: string, prompt: string, options: string[], answer: number, explanation: string): AcademyQuizQuestion {
  return { id, kind: "MC", prompt, options, answer, explanation };
}
/** True/false question builder. */
export function tf(id: string, prompt: string, answer: boolean, explanation: string): AcademyQuizQuestion {
  return { id, kind: "TF", prompt, answer, explanation };
}
/** Scenario question builder (MC with a trading situation). */
export function sc(id: string, prompt: string, options: string[], answer: number, explanation: string): AcademyQuizQuestion {
  return { id, kind: "SCENARIO", prompt, options, answer, explanation };
}
/** Numeric question builder (tolerance is relative, default 2%). */
export function num(id: string, prompt: string, value: number, unit: string, explanation: string, tolerance = 0.02): AcademyQuizQuestion {
  return { id, kind: "NUMERIC", prompt, value, tolerance, unit, explanation };
}
