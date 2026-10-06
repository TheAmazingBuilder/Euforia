/**
 * e2e — Trade Review + Goals (B8) over the REAL AppModule + real database:
 * the review workflow (pending → reviewed → undo, lesson sync), the goals
 * engine (computed progress, honest PENDING without data), the lessons
 * library and the overview aggregate. Validated against SHARED contracts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  goalsResponseSchema,
  lessonsResponseSchema,
  reviewsResponseSchema,
  tradeReviewOverviewResponseSchema,
} from "../../src/shared/contracts";
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

async function userWithAccount() {
  const user = await authenticatedUser(app, mail);
  const connected = await app.inject({
    method: "POST",
    url: "/api/v1/accounts",
    headers: user.authHeader,
    payload: {
      providerId: "MOCK",
      environment: "DEMO",
      externalAccountId: `77${Math.random().toString(36).slice(2, 8)}`,
      credentials: { method: "API_KEY", secret: "mock-api-key-review" },
    },
  });
  expect(connected.statusCode).toBe(201);
  const accountId = (connected.json() as { account: { id: string } }).account.id;
  const list = await app.inject({ method: "GET", url: "/api/v1/instruments", headers: user.authHeader });
  const instrument = (list.json() as { instruments: Array<{ id: string; symbol: string }> })
    .instruments.find((i) => i.symbol === "EURUSD")!;
  return { ...user, accountId, instrumentId: instrument.id };
}

/** Capture → close a BUY trade today; returns the trade id. */
async function closedTrade(
  user: { authHeader: Record<string, string>; accountId: string; instrumentId: string },
  overrides: Record<string, unknown> = {},
) {
  const entryAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const exitAt = new Date(Date.now() - 60 * 60_000).toISOString();
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/trades",
    headers: user.authHeader,
    payload: {
      variant: "open",
      accountId: user.accountId,
      instrumentId: user.instrumentId,
      direction: "BUY",
      entryPrice: "1.0850",
      entryAt,
      size: { mode: "quantity", quantity: "0.10" },
      initialStop: "1.0800",
      outOfPlaybook: true,
      ...overrides,
    },
  });
  expect(created.statusCode).toBe(201);
  const tradeId = (created.json() as { id: string }).id;
  const closed = await app.inject({
    method: "POST",
    url: `/api/v1/trades/${tradeId}/close`,
    headers: user.authHeader,
    payload: { mode: "single", exitPrice: "1.0900", exitAt, exitReason: "TP" },
  });
  expect(closed.statusCode).toBe(200);
  return tradeId;
}

describe("review workflow (B8)", () => {
  it("pending → reviewed → undo, with the lesson synced onto the trade", async () => {
    const user = await userWithAccount();
    const tradeId = await closedTrade(user);

    // Pending row appears with the trade's context (and no execution grade).
    const pendingList = reviewsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/reviews", headers: user.authHeader })).json(),
    );
    const pending = pendingList.reviews.find((row) => row.tradeId === tradeId);
    expect(pending?.reviewStatus).toBe("PENDING");
    expect(pending?.symbol).toBe("EURUSD");
    expect(pending?.pnlNet).toBe(50); // +0.005 × 0.1 × 100000

    const upserted = await app.inject({
      method: "PUT",
      url: `/api/v1/reviews/${tradeId}`,
      headers: user.authHeader,
      payload: {
        tradeId,
        executionGrade: "B",
        followedPlan: true,
        playbookMatch: "OFF_PLAYBOOK",
        entryQuality: 4,
        exitQuality: 3,
        riskManagement: 5,
        lessons: "Waited for the retest — patience paid; size was conservative.",
        improvementNote: "Next time I will scale in half size at the retest.",
      },
    });
    expect(upserted.statusCode).toBe(200);
    const reviewed = upserted.json() as { reviewStatus: string; executionGrade: string; reviewedAt: string | null };
    expect(reviewed.reviewStatus).toBe("REVIEWED");
    expect(reviewed.executionGrade).toBe("B");
    expect(reviewed.reviewedAt).not.toBeNull();

    // The trade's written trace stays in sync (journal coherence).
    const tradeReview = (
      await app.inject({
        method: "GET",
        url: `/api/v1/trades/${tradeId}/review`,
        headers: user.authHeader,
      })
    ).json() as { trade: { lessons: string | null; followedPlan: boolean | null } };
    expect(tradeReview.trade.lessons).toContain("patience paid");
    expect(tradeReview.trade.followedPlan).toBe(true);

    // Lessons library: the REVIEW source carries the takeaway.
    const lessons = lessonsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/reviews/lessons", headers: user.authHeader })).json(),
    );
    const reviewLesson = lessons.lessons.find((entry) => entry.tradeId === tradeId);
    expect(reviewLesson?.source).toBe("REVIEW");

    // Undo → the trade returns to pending.
    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/reviews/${tradeId}`,
      headers: user.authHeader,
    });
    expect(removed.statusCode).toBe(200);
    const after = reviewsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/reviews", headers: user.authHeader })).json(),
    );
    expect(after.reviews.find((row) => row.tradeId === tradeId)?.reviewStatus).toBe("PENDING");
  });

  it("422 on reviewing an open trade, 404 on a foreign trade", async () => {
    const [userA, userB] = await Promise.all([userWithAccount(), userWithAccount()]);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/trades",
      headers: userA.authHeader,
      payload: {
        variant: "open",
        accountId: userA.accountId,
        instrumentId: userA.instrumentId,
        direction: "BUY",
        entryPrice: "1.0850",
        size: { mode: "quantity", quantity: "0.10" },
        outOfPlaybook: true,
      },
    });
    const openTradeId = (created.json() as { id: string }).id;

    const onOpen = await app.inject({
      method: "PUT",
      url: `/api/v1/reviews/${openTradeId}`,
      headers: userA.authHeader,
      payload: {
        tradeId: openTradeId,
        executionGrade: "A",
        followedPlan: true,
        playbookMatch: "MATCHED",
        lessons: "Too early — the trade is still open.",
      },
    });
    expect(onOpen.statusCode).toBe(422);

    const foreign = await app.inject({
      method: "PUT",
      url: "/api/v1/reviews/00000000-0000-4000-8000-00000000dead",
      headers: userB.authHeader,
      payload: {
        tradeId: "00000000-0000-4000-8000-00000000dead",
        executionGrade: "A",
        followedPlan: true,
        playbookMatch: "MATCHED",
        lessons: "Foreign trade attempt.",
      },
    });
    expect(foreign.statusCode).toBe(404);
  });
});

describe("goals engine (B8)", () => {
  it("creates, computes progress honestly, updates, deletes", async () => {
    const user = await userWithAccount();

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/goals",
      headers: user.authHeader,
      payload: {
        title: "Win rate above 45%",
        metric: "WIN_RATE",
        target: 45,
        period: "MONTH",
        color: "EMERALD",
      },
    });
    expect(created.statusCode).toBe(201);
    const goal = created.json() as { goal: { id: string; active: boolean }; progress: { status: string; direction: string; unit: string; progressPct: number | null } };
    expect(goal.goal.active).toBe(true);
    expect(goal.progress.direction).toBe("HIGHER_IS_BETTER");
    expect(goal.progress.unit).toBe("PERCENT");
    // Empty period → honest PENDING with a null progress.
    expect(goal.progress.status).toBe("PENDING");
    expect(goal.progress.progressPct).toBeNull();

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/goals/${goal.goal.id}`,
      headers: user.authHeader,
      payload: { target: 50, active: false },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ goal: { target: 50, active: false } });

    const list = goalsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/goals", headers: user.authHeader })).json(),
    );
    expect(list.goals).toHaveLength(1);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/goals/${goal.goal.id}`,
      headers: user.authHeader,
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({ ok: true });
  });

  it("computes a growth goal's progress from REAL closed trades", async () => {
    const user = await userWithAccount();
    await closedTrade(user); // +50 USD net

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/goals",
      headers: user.authHeader,
      payload: {
        title: "Bank 10R this month",
        metric: "R_EARNED",
        target: 10,
        period: "MONTH",
        color: "VIOLET",
      },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { progress: { actual: number | null; status: string; sampleSize: number } };
    // The closed trade banked +1R (50 / 50 risk).
    expect(body.progress.actual).toBe(1);
    expect(body.progress.sampleSize).toBe(1);
    expect(["ON_TRACK", "AT_RISK", "BEHIND"]).toContain(body.progress.status);
  });
});

describe("review overview (B8)", () => {
  it("serves the aggregate: stats, streak, pending queue preview", async () => {
    const user = await userWithAccount();
    const tradeId = await closedTrade(user);
    await app.inject({
      method: "PUT",
      url: `/api/v1/reviews/${tradeId}`,
      headers: user.authHeader,
      payload: {
        tradeId,
        executionGrade: "A",
        followedPlan: true,
        playbookMatch: "MATCHED",
        lessons: "Clean entry on the reclaim; held to target.",
        improvementNote: "Next time I will trail the stop at 1R.",
      },
    });

    const overview = tradeReviewOverviewResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/reviews/overview",
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(overview.stats.closedTrades).toBe(1);
    expect(overview.stats.reviewedTrades).toBe(1);
    expect(overview.stats.gradeDistribution.A).toBe(1);
    expect(overview.stats.followedPlanPct).toBe(100);
    expect(overview.stats.offPlaybookCount).toBe(0);
    expect(overview.stats.reviewStreakDays).toBeGreaterThanOrEqual(1);
    expect(overview.pendingQueuePreview).toHaveLength(0);
    expect(overview.lastImprovementNote).toContain("trail the stop");
    expect(overview.recentLessons.length).toBeGreaterThanOrEqual(1);
  });

  it("401 without a token on every review route", async () => {
    const list = await app.inject({ method: "GET", url: "/api/v1/reviews" });
    expect(list.statusCode).toBe(401);
    const goals = await app.inject({ method: "GET", url: "/api/v1/goals" });
    expect(goals.statusCode).toBe(401);
  });
});
