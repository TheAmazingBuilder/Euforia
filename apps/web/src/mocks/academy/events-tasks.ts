import type {
  AcademyEvent,
  AcademyEventRegisterInput,
  AcademyEventRegisterResponse,
  AcademyEventsResponse,
  AcademyTask,
  AcademyTaskCreateInput,
  AcademyTaskDeleteInput,
  AcademyTaskToggleInput,
  AcademyTasksResponse,
} from "@cosmoz/shared";

/**
 * Academy Events + Tasky engines (mock backend).
 *
 * Self-contained module state (same lifecycle as the academy engine): the
 * seeds regenerate per browser session, registrations and task mutations
 * live in memory — the mock contract a real NestJS module replaces 1:1.
 *
 * Event dates are generated RELATIVE TO NOW so the "Upcoming" band always
 * has live content no matter when the sandbox boots.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function inHours(hours: number): string {
  return new Date(Date.now() + hours * HOUR).toISOString();
}

// ── Events ───────────────────────────────────────────────────────────────────

type EventSeed = Omit<AcademyEvent, "registered" | "startsAt"> & { offsetHours: number };

const UPCOMING_SEEDS: EventSeed[] = [
  {
    id: "evt-workshop-risk-sizing",
    title: "Workshop — Position sizing under pressure",
    description:
      "Live lab: compute size for five messy real charts, then defend the number against a forced redraw of your stop. Bring a calculator and your last 10 losers.",
    type: "WORKSHOP",
    host: "Mara Quinn",
    hostRole: "Risk coach · ex-proprietary desk",
    offsetHours: 26,
    durationMin: 90,
    categoryId: "cat-risk",
    seatsTotal: 40,
    seatsTaken: 31,
    hasReplay: false,
  },
  {
    id: "evt-webinar-liquidity",
    title: "Webinar — Where liquidity actually sits",
    description:
      "Equal highs, session opens and the myth of the stop hunt: a sober map of resting liquidity on FX and crypto, with repeatable marking rules.",
    type: "WEBINAR",
    host: "Deniz Aksoy",
    hostRole: "Price action instructor",
    offsetHours: 74,
    durationMin: 60,
    categoryId: "cat-price-action",
    seatsTotal: 200,
    seatsTaken: 87,
    hasReplay: false,
  },
  {
    id: "evt-qa-psychology",
    title: "Live Q&A — Tilt, revenge and the reset routine",
    description:
      "Open mic with the psychology team. Bring your worst session of the month; we rebuild the recovery checklist together, step by step.",
    type: "LIVE_QA",
    host: "Dr. Elena Voss",
    hostRole: "Performance psychologist",
    offsetHours: 122,
    durationMin: 45,
    categoryId: "cat-psychology",
    seatsTotal: 60,
    seatsTaken: 22,
    hasReplay: false,
  },
  {
    id: "evt-exam-fundamentals",
    title: "Certification window — Trading Fundamentals",
    description:
      "Supervised 40-question exam on the Fundamentals track. A GOLD tier score unlocks the advanced risk syllabus. One attempt per window.",
    type: "EXAM",
    host: "Academy proctoring",
    hostRole: "Automated supervision",
    offsetHours: 190,
    durationMin: 50,
    categoryId: "cat-fundamentals",
    seatsTotal: 120,
    seatsTaken: 64,
    hasReplay: false,
  },
  {
    id: "evt-workshop-patterns",
    title: "Workshop — Grading breakouts by context",
    description:
      "We grade twenty breakouts live — location, compression, volume and invalidation — and you score each one before the reveal. Brutal and useful.",
    type: "WORKSHOP",
    host: "Jonas Feld",
    hostRole: "Chart patterns instructor",
    offsetHours: 286,
    durationMin: 75,
    categoryId: "cat-chart-patterns",
    seatsTotal: 40,
    seatsTaken: 12,
    hasReplay: false,
  },
];

const PAST_SEEDS: EventSeed[] = [
  {
    id: "evt-webinar-structure",
    title: "Webinar — Market structure without the mysticism",
    description:
      "Swings, BOS and CHoCH defined precisely enough to code — and the three setups where structure says nothing at all.",
    type: "WEBINAR",
    host: "Deniz Aksoy",
    hostRole: "Price action instructor",
    offsetHours: -52,
    durationMin: 60,
    categoryId: "cat-structure",
    seatsTotal: 200,
    seatsTaken: 143,
    hasReplay: true,
  },
  {
    id: "evt-qa-journaling",
    title: "Live Q&A — From journal to edge",
    description:
      "How to read your own journal like a dataset: sample size traps, regime splits, and the two metrics worth tracking weekly.",
    type: "LIVE_QA",
    host: "Mara Quinn",
    hostRole: "Risk coach · ex-proprietary desk",
    offsetHours: -96,
    durationMin: 45,
    categoryId: "cat-advanced",
    seatsTotal: 60,
    seatsTaken: 51,
    hasReplay: true,
  },
];

function toEvent(seed: EventSeed): AcademyEvent {
  return {
    id: seed.id,
    title: seed.title,
    description: seed.description,
    type: seed.type,
    host: seed.host,
    hostRole: seed.hostRole,
    startsAt: inHours(seed.offsetHours),
    durationMin: seed.durationMin,
    categoryId: seed.categoryId,
    seatsTotal: seed.seatsTotal,
    seatsTaken: seed.seatsTaken,
    registered: registeredEventIds.has(seed.id),
    hasReplay: seed.hasReplay,
  };
}

const registeredEventIds = new Set<string>();

export function academyEvents(): AcademyEventsResponse {
  const upcoming = UPCOMING_SEEDS.map(toEvent).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = PAST_SEEDS.map(toEvent).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { upcoming, past };
}

export function registerEvent(input: AcademyEventRegisterInput): AcademyEventRegisterResponse | null {
  const seed = [...UPCOMING_SEEDS, ...PAST_SEEDS].find((candidate) => candidate.id === input.eventId);
  if (!seed || seed.offsetHours < 0) return null; // past events cannot be joined

  if (registeredEventIds.has(seed.id)) {
    registeredEventIds.delete(seed.id);
    return { eventId: seed.id, registered: false, seatsTaken: seed.seatsTaken };
  }
  if (seed.seatsTaken >= seed.seatsTotal) {
    return { eventId: seed.id, registered: false, seatsTaken: seed.seatsTaken };
  }
  registeredEventIds.add(seed.id);
  return { eventId: seed.id, registered: true, seatsTaken: seed.seatsTaken + 1 };
}

// ── Tasky ────────────────────────────────────────────────────────────────────

type TaskSeed = Omit<AcademyTask, "dueAt"> & { dueOffsetHours: number | null };

const TASK_SEEDS: TaskSeed[] = [
  {
    id: "tsk-fund-orders",
    title: "Finish “Order types & execution”",
    description: "Three lessons left — then run the checkpoint quiz until 80%+.",
    kind: "LESSON",
    priority: "HIGH",
    dueOffsetHours: 20,
    href: "/academy?tab=courses&course=crs-fund-markets",
    categoryId: "cat-fundamentals",
    xp: 40,
    done: false,
    completedAt: null,
  },
  {
    id: "tsk-drill-sr",
    title: "10 structure drill reps",
    description: "Support/resistance drill — stay above 70% accuracy before logging off.",
    kind: "DRILL",
    priority: "MEDIUM",
    dueOffsetHours: 8,
    href: "/academy?tab=practice",
    categoryId: "cat-structure",
    xp: 25,
    done: false,
    completedAt: null,
  },
  {
    id: "tsk-review-week",
    title: "Review last week's losing trades",
    description: "Tag each loss with a mistake from the ledger; flag any repeat offenders.",
    kind: "REVIEW",
    priority: "HIGH",
    dueOffsetHours: 32,
    href: "/journal?tab=reviews",
    categoryId: "cat-psychology",
    xp: 30,
    done: false,
    completedAt: null,
  },
  {
    id: "tsk-risk-refresher",
    title: "Re-read “Risk of ruin” and redo its quiz",
    description: "Refresh the survival math before increasing size again.",
    kind: "LESSON",
    priority: "LOW",
    dueOffsetHours: 76,
    href: "/academy?tab=courses&course=crs-risk-fundamentals",
    categoryId: "cat-risk",
    xp: 20,
    done: false,
    completedAt: null,
  },
  {
    id: "tsk-flashcards",
    title: "Clear the flashcard backlog",
    description: "The review queue is at 14 cards — zero it out today.",
    kind: "DRILL",
    priority: "MEDIUM",
    dueOffsetHours: null,
    href: "/academy?tab=courses",
    categoryId: null,
    xp: 15,
    done: false,
    completedAt: null,
  },
  {
    id: "tsk-quiz-fundamentals",
    title: "Fundamentals checkpoint — passed",
    description: "Scored 85% on the first attempt.",
    kind: "LESSON",
    priority: "HIGH",
    dueOffsetHours: -28,
    href: null,
    categoryId: "cat-fundamentals",
    xp: 40,
    done: true,
    completedAt: inHours(-30),
  },
];

const tasks: AcademyTask[] = TASK_SEEDS.map((seed) => ({
  id: seed.id,
  title: seed.title,
  description: seed.description,
  kind: seed.kind,
  priority: seed.priority,
  dueAt: seed.dueOffsetHours === null ? null : inHours(seed.dueOffsetHours),
  href: seed.href,
  categoryId: seed.categoryId,
  xp: seed.xp,
  done: seed.done,
  completedAt: seed.completedAt,
}));

function streakFrom(completed: AcademyTask[]): number {
  const days = new Set(
    completed
      .filter((task) => task.completedAt !== null)
      .map((task) => task.completedAt!.slice(0, 10)),
  );
  let streak = 0;
  const cursor = new Date();
  for (let offset = 0; offset < 60; offset += 1) {
    const key = new Date(cursor.getTime() - offset * DAY).toISOString().slice(0, 10);
    if (days.has(key)) {
      streak += 1;
    } else if (offset > 0) {
      break;
    }
  }
  return streak;
}

export function academyTasks(): AcademyTasksResponse {
  const completed = tasks.filter((task) => task.done);
  return {
    tasks: [...tasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const aDue = a.dueAt ?? "9999";
      const bDue = b.dueAt ?? "9999";
      return aDue.localeCompare(bDue);
    }),
    streakDays: streakFrom(completed),
    totalXp: completed.reduce((sum, task) => sum + task.xp, 0),
  };
}

export function createTask(input: AcademyTaskCreateInput): AcademyTask {
  const task: AcademyTask = {
    id: `tsk-custom-${Date.now()}-${tasks.length}`,
    title: input.title,
    description: input.description ?? null,
    kind: input.kind,
    priority: input.priority,
    dueAt: input.dueAt ?? null,
    href: input.href ?? null,
    categoryId: input.categoryId ?? null,
    xp: input.xp ?? 10,
    done: false,
    completedAt: null,
  };
  tasks.push(task);
  return task;
}

export function toggleTask(input: AcademyTaskToggleInput): AcademyTask | null {
  const task = tasks.find((candidate) => candidate.id === input.taskId);
  if (!task) return null;
  task.done = input.done;
  task.completedAt = input.done ? new Date().toISOString() : null;
  return task;
}

export function deleteTask(input: AcademyTaskDeleteInput): { ok: boolean } {
  const index = tasks.findIndex((candidate) => candidate.id === input.taskId);
  if (index === -1) return { ok: false };
  tasks.splice(index, 1);
  return { ok: true };
}
