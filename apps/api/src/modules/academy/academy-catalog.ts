/**
 * Academy catalog — a compact but complete static curriculum served by the
 * API. The mock keeps a larger demo catalog; the live backend owns this one
 * (content parity between modes is a data concern, not a contract one).
 * Quiz/exam answers stay server-side and are never serialized.
 */
import type {
  AcademyBlock,
  AcademyCatalogResponse,
  AcademyCourseCard,
  AcademyEvent,
  AcademyFlashcard,
  AcademyGlossaryTerm,
  AcademyMilestone,
  AcademyQuizQuestion,
  AcademyScenario,
} from "../../shared/contracts";

export interface CatalogLesson {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  blocks: AcademyBlock[];
  checkpoint: AcademyQuizQuestion | null;
}

export interface CatalogCourse {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  quizId: string | null;
  lessons: CatalogLesson[];
}

export interface CatalogQuiz {
  id: string;
  courseId: string;
  title: string;
  questions: AcademyQuizQuestion[];
  /** Pass mark for the certification link, when any. */
  passMark: number;
}

const q = (
  id: string,
  kind: AcademyQuizQuestion["kind"],
  prompt: string,
  options: string[] | null,
  answer: number | boolean,
  explanation: string,
): AcademyQuizQuestion =>
  ({ id, kind, prompt, options, answer, explanation } as AcademyQuizQuestion);

export const CATEGORIES: AcademyCatalogResponse["categories"] = [
  { id: "cat-basics", name: "Market Basics", description: "Core market mechanics every trader needs.", level: "BEGINNER", icon: "book", order: 1 },
  { id: "cat-risk", name: "Risk & Discipline", description: "Position sizing, drawdown control and habits.", level: "INTERMEDIATE", icon: "shield", order: 2 },
];

export const COURSES: CatalogCourse[] = [
  {
    id: "crs-basics-101",
    categoryId: "cat-basics",
    title: "Market Foundations 101",
    description: "How prices are made, who the players are and what a chart really shows.",
    estimatedMinutes: 45,
    quizId: "quiz-basics-101",
    lessons: [
      {
        id: "les-101-1",
        title: "What moves prices",
        summary: "Order flow, liquidity and the auction between buyers and sellers.",
        minutes: 12,
        blocks: [
          { kind: "text", body: "Prices move because of imbalanced order flow. When market buy orders outpace resting sell liquidity, price rises — and the reverse." },
          { kind: "list", items: [
            "Information — new data repricing fair value.",
            "Liquidity — how much size is resting at each level.",
            "Leverage — forced flows from stops and margin calls.",
          ] },
        ] as AcademyBlock[],
        checkpoint: q("cp-101-1", "MC", "What does resting liquidity do to a fast market?", ["Absorbs orders and slows the move", "Guarantees continuation", "Forces gaps"], 0, "Deep resting liquidity absorbs incoming orders, slowing or stopping the move."),
      },
      {
        id: "les-101-2",
        title: "Reading a candlestick",
        summary: "Open, high, low, close — and the story they tell in context.",
        minutes: 10,
        blocks: [
          { kind: "text", body: "Each candle compresses a timeframe of battle into four numbers. Context — where the candle forms — matters more than its shape." },
        ] as AcademyBlock[],
        checkpoint: null,
      },
      {
        id: "les-101-3",
        title: "Markets are auctioning",
        summary: "Ranges are negotiations, breakouts are failed or successful auctions.",
        minutes: 11,
        blocks: [
          { kind: "text", body: "A range is a repeated auction looking for fair value. A breakout is the auction finding new value — or being rejected back into range." },
        ] as AcademyBlock[],
        checkpoint: q("cp-101-3", "TF", "A failed breakout can be information about the next directional move.", ["True", "False"], true, "Failed auctions often fuel the move in the opposite direction — trapped traders must unwind."),
      },
    ],
  },
  {
    id: "crs-risk-201",
    categoryId: "cat-risk",
    title: "Risk & Position Sizing",
    description: "The math and the habits that keep you solvent and consistent.",
    estimatedMinutes: 50,
    quizId: "quiz-risk-201",
    lessons: [
      {
        id: "les-201-1",
        title: "Fixed fractional risk",
        summary: "Why risking a fixed percent per trade protects the account.",
        minutes: 14,
        blocks: [
          { kind: "text", body: "Risking a fixed fraction (0.25–1%) per trade makes the account mathematically hard to kill and scales exposure down automatically during drawdowns." },
        ] as AcademyBlock[],
        checkpoint: q("cp-201-1", "NUMERIC", "At 1% risk per trade, how many consecutive full losses until a 10% account drawdown (approx)?", null, 10, "1% compounding losses reach ~10% after roughly 10–11 consecutive losses."),
      },
      {
        id: "les-201-2",
        title: "Stop placement logic",
        summary: "Invalidation first, then position size — never the reverse.",
        minutes: 12,
        blocks: [
          { kind: "text", body: "The stop belongs where the idea is invalidated. Size is then derived from the distance to that invalidation and the account risk budget." },
        ] as AcademyBlock[],
        checkpoint: null,
      },
      {
        id: "les-201-3",
        title: "The discipline loop",
        summary: "Journaling, review cadence and the honest use of streaks.",
        minutes: 10,
        blocks: [
          { kind: "text", body: "Discipline is a loop: plan → execute → journal → review weekly. The Cosmoz Index exists to make the loop measurable without blaming P&L." },
        ] as AcademyBlock[],
        checkpoint: null,
      },
    ],
  },
];

export const QUIZZES: CatalogQuiz[] = [
  {
    id: "quiz-basics-101",
    courseId: "crs-basics-101",
    title: "Market Foundations check",
    passMark: 70,
    questions: [
      q("q1", "MC", "What does resting liquidity do to a fast market?", ["Absorbs orders and slows the move", "Guarantees continuation", "Forces gaps"], 0, "Deep resting liquidity absorbs incoming orders, slowing or stopping the move."),
      q("q2", "TF", "Context matters more than candle shape.", ["True", "False"], true, "The same candle means different things at different locations."),
      q("q3", "MC", "A range is best described as…", ["A repeated auction looking for fair value", "A broken market", "A guarantee of a breakout"], 0, "Ranges are repeated negotiation until value shifts."),
    ],
  },
  {
    id: "quiz-risk-201",
    courseId: "crs-risk-201",
    title: "Risk & Sizing check",
    passMark: 70,
    questions: [
      q("q1", "MC", "Position size is derived from…", ["The invalidation distance and risk budget", "How confident you feel", "The broker's maximum lot"], 0, "Invalidation first, then sizing — never the reverse."),
      q("q2", "TF", "A fixed fractional risk per trade scales exposure down automatically during drawdowns.", ["True", "False"], true, "The fixed fraction of a smaller account is a smaller amount."),
    ],
  },
];

export const GLOSSARY: AcademyGlossaryTerm[] = [
  { id: "g1", term: "Liquidity", simple: "How much is available to trade at a price.", professional: "The volume of resting orders available at a price level.", related: ["Auction"], categoryId: "cat-basics" },
  { id: "g2", term: "Drawdown", simple: "How far the account fell from its peak.", professional: "The decline from an equity peak to the subsequent trough.", related: ["Expectancy"], categoryId: "cat-risk" },
  { id: "g3", term: "Expectancy", simple: "The average result of a trade.", professional: "Average R (or money) produced per trade over a sample.", related: ["Drawdown"], categoryId: "cat-risk" },
  { id: "g4", term: "Auction", simple: "The market looking for fair value.", professional: "The back-and-forth price process seeking fair value.", related: ["Liquidity"], categoryId: "cat-basics" },
  { id: "g5", term: "Invalidation", simple: "Where the trade idea is proven wrong.", professional: "The condition or level where a trade idea is proven wrong.", related: [], categoryId: "cat-risk" },
  { id: "g6", term: "R multiple", simple: "Result expressed in risk units.", professional: "Profit or loss expressed in units of initial risk.", related: ["Expectancy"], categoryId: "cat-risk" },
];

export const SCENARIOS: AcademyScenario[] = [
  {
    id: "scn-1",
    title: "The failed breakout",
    categoryId: "cat-basics",
    context: "Price breaks the range high, then closes back inside within two candles.",
    steps: [
      {
        id: "s1",
        narrative: "The breakout candle closes back inside the range. What happened to the auction?",
        options: [
          { id: "o1", label: "Value was rejected above the range" },
          { id: "o2", label: "Value shifted higher" },
          { id: "o3", label: "Nothing" },
        ],
        correctOptionId: "o1",
        feedback: "A close back inside signals rejection — trapped breakout buyers must unwind.",
      },
      {
        id: "s2",
        narrative: "With trapped longs unwinding, what is the highest-probability play?",
        options: [
          { id: "o1", label: "Chase the long" },
          { id: "o2", label: "Consider the reversal toward range low" },
          { id: "o3", label: "Stand aside forever" },
        ],
        correctOptionId: "o2",
        feedback: "Failed breakouts often fuel opposite-direction moves.",
      },
    ],
  },
];

export const FLASHCARDS: AcademyFlashcard[] = [
  { id: "fc-1", kind: "TAKEAWAY", front: "What is an R multiple?", back: "Profit or loss expressed in units of initial risk taken.", source: "Risk & Position Sizing", categoryId: "cat-risk" },
  { id: "fc-2", kind: "TERM", front: "Role of resting liquidity?", back: "Absorbs incoming orders; deep liquidity slows moves.", source: "Market Basics", categoryId: "cat-basics" },
  { id: "fc-3", kind: "TAKEAWAY", front: "Fixed fractional risk?", back: "Risking a fixed percent of the account per trade.", source: "Risk & Position Sizing", categoryId: "cat-risk" },
  { id: "fc-4", kind: "TAKEAWAY", front: "Where does the stop belong?", back: "At the invalidation of the idea — sizing comes after.", source: "Risk & Position Sizing", categoryId: "cat-risk" },
  { id: "fc-5", kind: "TERM", front: "Define expectancy.", back: "Average R per trade over a sample.", source: "Glossary", categoryId: "cat-risk" },
  { id: "fc-6", kind: "TERM", front: "What is a failed auction?", back: "A breakout rejected back into the prior value area.", source: "Market Basics", categoryId: "cat-basics" },
];

/** Exam wiring kept in code (not part of the shared Certification shape). */
export const EXAM_BY_CATEGORY: Record<string, { examId: string; passMark: number; title: string }> = {
  "cat-basics": { examId: "quiz-basics-101", passMark: 70, title: "Market Basics exam" },
  "cat-risk": { examId: "quiz-risk-201", passMark: 70, title: "Risk Management exam" },
};

export const MILESTONES: AcademyMilestone[] = [
  { id: "ms-1", label: "First lesson", description: "Complete your first lesson.", achieved: false, achievedAt: null, progress: { current: 0, target: 1 } },
  { id: "ms-2", label: "Five lessons", description: "Complete five lessons.", achieved: false, achievedAt: null, progress: { current: 0, target: 5 } },
  { id: "ms-3", label: "First quiz", description: "Submit your first quiz.", achieved: false, achievedAt: null, progress: { current: 0, target: 1 } },
  { id: "ms-4", label: "Course complete", description: "Complete a full course.", achieved: false, achievedAt: null, progress: { current: 0, target: 4 } },
];

export const EVENTS: AcademyEvent[] = [
  { id: "ev-1", title: "Live market walkthrough", type: "WORKSHOP", startsAt: "2026-10-14T14:00:00.000Z", durationMin: 60, host: "Cosmoz Desk", hostRole: "Educator", description: "Reading the open with real order flow.", categoryId: "cat-basics", seatsTotal: 100, seatsTaken: 58, registered: false, hasReplay: false },
  { id: "ev-2", title: "Risk clinic", type: "LIVE_QA", startsAt: "2026-10-21T15:00:00.000Z", durationMin: 45, host: "Risk Team", hostRole: "Analyst", description: "Bring your sizing questions.", categoryId: "cat-risk", seatsTotal: 120, seatsTaken: 40, registered: false, hasReplay: false },
  { id: "ev-3", title: "Prop firm prep", type: "WEBINAR", startsAt: "2026-11-03T13:00:00.000Z", durationMin: 90, host: "Guest coach", hostRole: "Prop firm mentor", description: "Challenge rules and drawdown math.", categoryId: "cat-risk", seatsTotal: 200, seatsTaken: 80, registered: false, hasReplay: false },
];

export const LESSONS: CatalogLesson[] = COURSES.flatMap((c) => c.lessons);
export const lessonById = (id: string): CatalogLesson | undefined => LESSONS.find((l) => l.id === id);
export const courseById = (id: string): CatalogCourse | undefined => COURSES.find((c) => c.id === id);
export const quizById = (id: string): CatalogQuiz | undefined => QUIZZES.find((q) => q.id === id);
export const courseOfLesson = (lessonId: string): CatalogCourse | undefined =>
  COURSES.find((c) => c.lessons.some((l) => l.id === lessonId));

/** Course cards with live progress injected by the service. */
export function courseCardOf(
  course: CatalogCourse,
  completed: Set<string>,
  quizBest: Map<string, number>,
): AcademyCourseCard {
  const completedLessons = course.lessons.filter((l) => completed.has(l.id)).length;
  return {
    id: course.id,
    categoryId: course.categoryId,
    title: course.title,
    description: course.description,
    level: course.categoryId === "cat-basics" ? "BEGINNER" : "INTERMEDIATE",
    lessonCount: course.lessons.length,
    completedLessons,
    progress: course.lessons.length === 0 ? 0 : Math.round((completedLessons / course.lessons.length) * 100),
    estimatedMinutes: course.estimatedMinutes,
    quizId: course.quizId,
    quizBestScore: quizBest.get(course.quizId ?? "") ?? null,
    completed: completedLessons === course.lessons.length,
  };
}
