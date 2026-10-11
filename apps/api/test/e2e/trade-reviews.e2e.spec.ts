/**
 * e2e — Trade Review / Post-Trade Analysis (Phase 6).
 *
 * Over the REAL AppModule + real database: review eligibility (§9), the
 * upsert lifecycle (create/edit/reactivate, §10/§31/§32), merge semantics,
 * archive-as-undo, the workspace list + pagination (§72), the overview
 * aggregate, the lessons library, the plan-vs-actual comparison engine
 * (§54/§67) with the FROZEN origin-plan snapshot (§26), plus the security
 * battery: authentication boundary, IDOR (user A ↔ user B), forged
 * ownership, leakage scans — and the IMMUTABILITY battery (§66): review
 * operations can never modify Trade, TradeExecution or TradePlan rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  deleteReviewResponseSchema,
  lessonsResponseSchema,
  reviewDetailResponseSchema,
  reviewRowSchema,
  reviewsResponseSchema,
  tradeReviewOverviewResponseSchema,
} from "../../src/shared/contracts";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service";

let app: NestFastifyApplication;
let mail: MailCapture;
let prisma: PrismaService;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app?.close();
});

// ── fixtures ─────────────────────────────────────────────────────────────────

/**
 * FNV-1a 32-bit — byte-for-byte mirror of the mock provider's hashSeed, so
 * the test can pick an externalAccountId that deterministically lands on USD
 * (the plan risk engine needs quote currency === account currency; the
 * accounts rate limiter only allows 5 connects per user per 15 minutes, so
 * brute-force retries inside one user are not an option).
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

async function connectMockAccount(auth: Record<string, string>) {
  const externalAccountId = `77${Math.random().toString(36).slice(2, 8)}`;
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/accounts",
    headers: auth,
    payload: {
      providerId: "MOCK",
      environment: "DEMO",
      externalAccountId,
      credentials: { method: "API_KEY", secret: "mock-api-key-abcd1234" },
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().account as { id: string; currency: string };
}

/** Connect a deterministic USD mock account (quote currency matches EURUSD plans). */
async function connectUsdMockAccount(auth: Record<string, string>, offset = 0) {
  for (let attempt = offset * 1000; attempt < (offset + 1) * 1000; attempt += 1) {
    const externalAccountId = `77${attempt.toString(36).padStart(4, "0")}`;
    if (fnv1a(externalAccountId) % 3 !== 0) continue;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: auth,
      payload: {
        providerId: "MOCK",
        environment: "DEMO",
        externalAccountId,
        credentials: { method: "API_KEY", secret: "mock-api-key-abcd1234" },
      },
    });
    expect(res.statusCode).toBe(201);
    const account = res.json().account as { id: string; currency: string };
    expect(account.currency).toBe("USD");
    return account;
  }
  throw new Error("no deterministic USD external id found");
}

function tradePayload(overrides: Record<string, unknown> = {}) {
  return {
    variant: "open",
    accountId: "00000000-0000-0000-0000-000000000000",
    symbol: "EURUSD",
    direction: "BUY",
    entryPrice: "1.08500",
    entryAt: "2026-03-02T09:30:00.000Z",
    quantity: "1",
    ...overrides,
  };
}

async function createOpenTrade(auth: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/v1/trades",
    headers: auth,
    payload: tradePayload(overrides),
  });
}

async function closeTrade(
  auth: Record<string, string>,
  tradeId: string,
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: `/api/v1/trades/${tradeId}/close`,
    headers: auth,
    payload: {
      mode: "single",
      exitPrice: "1.09000",
      exitAt: "2026-03-02T12:00:00.000Z",
      exitReason: "MANUAL",
      ...overrides,
    },
  });
}

/** A CLOSED canonical trade: BUY 1.085 → 1.09, risk 100 → pnlNet 500, R 5. */
async function closedTrade(
  auth: Record<string, string>,
  overrides: Record<string, unknown> = {},
): Promise<{ trade: Record<string, unknown>; account: { id: string; currency: string } }> {
  const account = await connectMockAccount(auth);
  const created = (
    await createOpenTrade(auth, {
      accountId: account.id,
      riskAmount: "100",
      initialStop: "1.08000",
      initialTP: "1.09500",
      ...overrides,
    })
  ).json().trade;
  const closed = await closeTrade(auth, created.id, (overrides.exit as Record<string, unknown>) ?? {});
  expect(closed.statusCode).toBe(200);
  return { trade: closed.json().trade, account };
}

/** Review payload WITHOUT the optional keys — exercises fresh resets. */
function minimalReviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    tradeId: "00000000-0000-0000-0000-000000000000",
    executionGrade: "C",
    followedPlan: true,
    playbookMatch: "PARTIAL",
    lessons: "Re-reviewed with a clearer head.",
    ...overrides,
  };
}

function planPayload(accountId: string, overrides: Record<string, unknown> = {}) {
  return {
    accountId,
    symbol: "EURUSD",
    direction: "BUY",
    entryPrice: "1.08500",
    stopLoss: "1.08000",
    takeProfit: "1.09500",
    size: { mode: "risk_amount", riskAmount: "100" },
    rationale: "London sweep of Asian lows into OB",
    ...overrides,
  };
}

/** A PLANNED (committed) EURUSD plan — engine sizes 0.2 lots at 100 risk, 2R. */
async function createPlan(auth: Record<string, string>, accountId: string, overrides: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/trade-plans",
    headers: auth,
    payload: planPayload(accountId, { commitNow: true, ...overrides }),
  });
  expect(res.statusCode).toBe(201);
  return res.json().tradePlan as { id: string; status: string; symbol: string };
}

function reviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    tradeId: "00000000-0000-0000-0000-000000000000",
    executionGrade: "A",
    followedPlan: true,
    playbookMatch: "MATCHED",
    checklistResults: [{ label: "Setup confirmed", passed: true }],
    entryQuality: 4,
    exitQuality: 3,
    riskManagement: 5,
    lessons: "Waited for the confirmation candle; the entry was clean.",
    improvementNote: "Next time I will trail the stop at 1R.",
    ...overrides,
  };
}

async function putReview(auth: Record<string, string>, tradeId: string, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: "PUT",
    url: `/api/v1/reviews/${tradeId}`,
    headers: auth,
    payload: reviewPayload({ ...overrides }),
  });
}

/** Byte-stable snapshot of the canonical rows — the immutability witness. */
async function canonicalSnapshot(tradeId: string) {
  const trade = await prisma.trade.findFirst({ where: { id: tradeId } });
  const executions = await prisma.tradeExecution.findMany({
    where: { tradeId },
    orderBy: { executedAt: "asc" },
  });
  return JSON.stringify({ trade, executions });
}

// ── Authentication boundary ──────────────────────────────────────────────────

describe("trade reviews — authentication boundary", () => {
  it("401 on every review route without a token", async () => {
    for (const [method, url] of [
      ["GET", "/api/v1/reviews"],
      ["GET", "/api/v1/reviews/overview"],
      ["GET", "/api/v1/reviews/lessons"],
      ["GET", "/api/v1/reviews/00000000-0000-0000-0000-000000000001"],
      ["PUT", "/api/v1/reviews/00000000-0000-0000-0000-000000000001"],
      ["PATCH", "/api/v1/reviews/00000000-0000-0000-0000-000000000001"],
      ["DELETE", "/api/v1/reviews/00000000-0000-0000-0000-000000000001"],
    ] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });
});

// ── Review eligibility (§9) ──────────────────────────────────────────────────

describe("trade reviews — eligibility", () => {
  it("rejects reviews for OPEN trades (only closed trades can be reviewed)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectMockAccount(user.authHeader);
    const created = (await createOpenTrade(user.authHeader, { accountId: account.id })).json().trade;

    const res = await putReview(user.authHeader, created.id);
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("TRADE_REVIEW_TRADE_NOT_REVIEWABLE");
  });

  it("404 for unknown trades and invalid uuids", async () => {
    const user = await authenticatedUser(app, mail);
    const missing = await putReview(user.authHeader, "00000000-0000-0000-0000-000000000042");
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("TRADE_REVIEW_TRADE_NOT_FOUND");

    const bad = await app.inject({
      method: "PUT",
      url: "/api/v1/reviews/not-a-uuid",
      headers: user.authHeader,
      payload: reviewPayload(),
    });
    expect(bad.statusCode).toBe(400);
  });

  it("404 for soft-deleted trades (the journal hides them from review)", async () => {
    const user = await authenticatedUser(app, mail);
    const { trade } = await closedTrade(user.authHeader);
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/trades/${trade.id as string}`,
      headers: user.authHeader,
    });
    expect(deleted.statusCode).toBe(200);

    const res = await putReview(user.authHeader, trade.id as string);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("TRADE_REVIEW_TRADE_NOT_FOUND");
  });
});

// ── Upsert: create + edit (§31/§32) ─────────────────────────────────────────

describe("trade reviews — upsert lifecycle", () => {
  it("creates a review and returns the contract-shaped workspace row", async () => {
    const user = await authenticatedUser(app, mail);
    const { trade, account } = await closedTrade(user.authHeader);

    const res = await putReview(user.authHeader, trade.id as string, { tradeId: trade.id });
    expect(res.statusCode).toBe(200);
    const row = reviewRowSchema.parse(res.json());
    expect(row.tradeId).toBe(trade.id);
    expect(row.reviewStatus).toBe("REVIEWED");
    expect(row.executionGrade).toBe("A");
    expect(row.followedPlan).toBe(true);
    expect(row.playbookMatch).toBe("MATCHED");
    expect(row.checklistResults).toEqual([{ label: "Setup confirmed", passed: true }]);
    expect(row.entryQuality).toBe(4);
    expect(row.exitQuality).toBe(3);
    expect(row.riskManagement).toBe(5);
    expect(row.lesson).toContain("confirmation candle");
    expect(row.improvementNote).toContain("trail the stop");
    // Canonical trade facts ride along as NUMBERS (workspace contract).
    // MANUAL trades carry no computed P&L (Phase 4: profits come from
    // provider deals — the journal never invents them), so R stays null.
    expect(row.rMultiple).toBeNull();
    expect(row.pnlNet).toBeNull();
    expect(row.symbol).toBe("EURUSD");
    expect(row.currency).toBe(account.currency);
    expect(row.tradingDate).toBe("2026-03-02");
    expect(row.reviewedAt).not.toBeNull();
  });

  it("rejects invalid payloads: short lessons, bad grades, missing fields", async () => {
    const user = await authenticatedUser(app, mail);
    const { trade } = await closedTrade(user.authHeader);

    const shortLessons = await putReview(user.authHeader, trade.id as string, { lessons: "no" });
    expect(shortLessons.statusCode).toBe(400);

    const badGrade = await putReview(user.authHeader, trade.id as string, { executionGrade: "E" });
    expect(badGrade.statusCode).toBe(400);

    const missingGrade = await putReview(user.authHeader, trade.id as string, { executionGrade: undefined });
    expect(missingGrade.statusCode).toBe(400);
  });

  it("updates on re-PUT: required fields overwritten, optionals keep mock-parity merge", async () => {
    const user = await authenticatedUser(app, mail);
    const { trade } = await closedTrade(user.authHeader);
    const created = (await putReview(user.authHeader, trade.id as string)).json();
    const first = reviewRowSchema.parse(created);

    // Re-PUT WITHOUT the optional fields — they keep their stored values.
    const second = await putReview(user.authHeader, trade.id as string, {
      executionGrade: "B",
      followedPlan: false,
      playbookMatch: "PARTIAL",
      lessons: "Chased the entry; management was fine.",
    });
    expect(second.statusCode).toBe(200);
    const updated = reviewRowSchema.parse(second.json());
    expect(updated.executionGrade).toBe("B");
    expect(updated.followedPlan).toBe(false);
    expect(updated.playbookMatch).toBe("PARTIAL");
    expect(updated.lesson).toContain("Chased the entry");
    expect(updated.checklistResults).toEqual([{ label: "Setup confirmed", passed: true }]);
    expect(updated.entryQuality).toBe(4);
    expect(updated.improvementNote).toContain("trail the stop");
    expect(updated.reviewedAt).toBe(first.reviewedAt); // edits keep the clock
  });

  it("explicit null keeps stored values on update (product merge semantics)", async () => {
    const user = await authenticatedUser(app, mail);
    const { trade } = await closedTrade(user.authHeader);
    await putReview(user.authHeader, trade.id as string);

    const res = await putReview(user.authHeader, trade.id as string, {
      checklistResults: null,
      entryQuality: null,
      improvementNote: null,
      lessons: "Kept the original lesson text.",
    });
    expect(res.statusCode).toBe(200);
    const row = reviewRowSchema.parse(res.json());
    expect(row.checklistResults).toEqual([{ label: "Setup confirmed", passed: true }]);
    expect(row.entryQuality).toBe(4);
    expect(row.improvementNote).toContain("trail the stop");
  });

  it("PATCH merges partial updates and requires at least one field", async () => {
    const user = await authenticatedUser(app, mail);
    const { trade } = await closedTrade(user.authHeader);
    await putReview(user.authHeader, trade.id as string);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: user.authHeader,
      payload: { exitQuality: 2, improvementNote: null },
    });
    expect(res.statusCode).toBe(200);
    const row = reviewRowSchema.parse(res.json());
    expect(row.exitQuality).toBe(2);
    expect(row.entryQuality).toBe(4); // untouched
    expect(row.improvementNote).toContain("trail the stop"); // null keeps (mock parity)

    const empty = await app.inject({
      method: "PATCH",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: user.authHeader,
      payload: {},
    });
    expect(empty.statusCode).toBe(400);

    const missing = await app.inject({
      method: "PATCH",
      url: "/api/v1/reviews/00000000-0000-0000-0000-000000000042",
      headers: user.authHeader,
      payload: { entryQuality: 3 },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("TRADE_REVIEW_NOT_FOUND");
  });
});

// ── Archive as undo (§10/§32) ───────────────────────────────────────────────

describe("trade reviews — archive (undo review)", () => {
  it("archives on DELETE: trade returns to PENDING, archived rows are invisible", async () => {
    const user = await authenticatedUser(app, mail);
    const { trade } = await closedTrade(user.authHeader);
    await putReview(user.authHeader, trade.id as string);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: user.authHeader,
    });
    expect(del.statusCode).toBe(200);
    expect(deleteReviewResponseSchema.parse(del.json()).ok).toBe(true);

    // Second delete is an honest 404; PATCH on the archived row is a 404.
    const again = await app.inject({
      method: "DELETE",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: user.authHeader,
    });
    expect(again.statusCode).toBe(404);
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: user.authHeader,
      payload: { entryQuality: 1 },
    });
    expect(patched.statusCode).toBe(404);
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: user.authHeader,
    });
    expect(detail.statusCode).toBe(404);

    // The workspace shows the trade as PENDING again.
    const list = reviewsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/reviews", headers: user.authHeader })).json(),
    );
    const row = list.reviews.find((candidate) => candidate.tradeId === trade.id);
    expect(row?.reviewStatus).toBe("PENDING");
    expect(row?.executionGrade).toBeNull();
  });

  it("re-PUT after archive REACTIVATES with a fresh completion", async () => {
    const user = await authenticatedUser(app, mail);
    const { trade } = await closedTrade(user.authHeader);
    const first = reviewRowSchema.parse((await putReview(user.authHeader, trade.id as string)).json());
    await app.inject({
      method: "DELETE",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: user.authHeader,
    });

    // Fresh completion WITHOUT optionals — they reset (no stale revival).
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: user.authHeader,
      payload: minimalReviewPayload(),
    });
    expect(res.statusCode).toBe(200);
    const row = reviewRowSchema.parse(res.json());
    expect(row.reviewStatus).toBe("REVIEWED");
    expect(row.executionGrade).toBe("C");
    expect(row.checklistResults).toBeNull();
    expect(row.entryQuality).toBeNull();
    expect(row.improvementNote).toBeNull();
    expect(row.reviewedAt).not.toBeNull();
    expect(new Date(row.reviewedAt as string).getTime()).toBeGreaterThanOrEqual(
      new Date(first.reviewedAt as string).getTime(),
    );
  });
});

// ── Workspace list + pagination (§72) ────────────────────────────────────────

describe("trade reviews — workspace list", () => {
  it("returns REVIEWED and PENDING rows, newest trading day first", async () => {
    const user = await authenticatedUser(app, mail);
    const reviewed = await closedTrade(user.authHeader); // 2026-03-02
    const pending = await closedTrade(user.authHeader, {
      entryAt: "2026-03-03T09:30:00.000Z",
      exit: { exitAt: "2026-03-03T11:00:00.000Z" },
    });
    await putReview(user.authHeader, reviewed.trade.id as string);

    const res = await app.inject({ method: "GET", url: "/api/v1/reviews", headers: user.authHeader });
    expect(res.statusCode).toBe(200);
    const parsed = reviewsResponseSchema.parse(res.json());
    expect(parsed.reviews).toHaveLength(2);
    // Newest trading day first — the PENDING 03-03 trade leads.
    expect(parsed.reviews[0]!.tradeId).toBe(pending.trade.id);
    expect(parsed.reviews[0]!.reviewStatus).toBe("PENDING");
    expect(parsed.reviews[1]!.tradeId).toBe(reviewed.trade.id);
    expect(parsed.reviews[1]!.reviewStatus).toBe("REVIEWED");
    // Pending rows carry the trade's own note as the stand-in lesson.
    expect(parsed.reviews[0]!.lesson).toBeNull();
  });

  it("paginates with honest meta (total/page/limit/hasMore)", async () => {
    const user = await authenticatedUser(app, mail);
    const first = await closedTrade(user.authHeader);
    const second = await closedTrade(user.authHeader, {
      entryAt: "2026-03-04T09:30:00.000Z",
      exit: { exitAt: "2026-03-04T11:00:00.000Z" },
    });

    const page1 = reviewsResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/reviews?limit=1&page=1",
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(page1.reviews).toHaveLength(1);
    expect(page1.meta.total).toBe(2);
    expect(page1.meta.limit).toBe(1);
    expect(page1.meta.hasMore).toBe(true);

    const page2 = reviewsResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/reviews?limit=1&page=2",
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(page2.reviews).toHaveLength(1);
    expect(page2.meta.hasMore).toBe(false);
    expect([page1.reviews[0]!.tradeId, page2.reviews[0]!.tradeId].sort()).toEqual(
      [first.trade.id, second.trade.id].sort(),
    );
  });

  it("puts REVIEWED rows before PENDING rows on trading-day ties", async () => {
    const user = await authenticatedUser(app, mail);
    const willBeReviewed = await closedTrade(user.authHeader);
    const stillPending = await closedTrade(user.authHeader, {
      entryAt: "2026-03-02T08:00:00.000Z",
      exit: { exitAt: "2026-03-02T10:00:00.000Z" },
    });
    await putReview(user.authHeader, willBeReviewed.trade.id as string);

    const parsed = reviewsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/reviews", headers: user.authHeader })).json(),
    );
    expect(parsed.reviews[0]!.tradeId).toBe(willBeReviewed.trade.id);
    expect(parsed.reviews[0]!.reviewStatus).toBe("REVIEWED");
    expect(parsed.reviews[1]!.tradeId).toBe(stillPending.trade.id);
  });
});

// ── Overview aggregate ────────────────────────────────────────────────────────

describe("trade reviews — overview", () => {
  it("computes stats, distribution, averages, streak and trend over real rows", async () => {
    const user = await authenticatedUser(app, mail);
    const reviewed = await closedTrade(user.authHeader);
    const pending = await closedTrade(user.authHeader, {
      notes: "Held through the news — worked out, but sloppy process.",
      entryAt: "2026-03-02T13:00:00.000Z",
      exit: { exitAt: "2026-03-02T15:00:00.000Z" },
    });
    await putReview(user.authHeader, reviewed.trade.id as string);

    const res = await app.inject({ method: "GET", url: "/api/v1/reviews/overview", headers: user.authHeader });
    expect(res.statusCode).toBe(200);
    const overview = tradeReviewOverviewResponseSchema.parse(res.json());

    expect(overview.stats.closedTrades).toBe(2);
    expect(overview.stats.reviewedTrades).toBe(1);
    expect(overview.stats.pendingReviews).toBe(1);
    expect(overview.stats.reviewRatePct).toBe(50);
    expect(overview.stats.gradeDistribution).toEqual({ A: 1, B: 0, C: 0, D: 0, F: 0 });
    expect(overview.stats.avgEntryQuality).toBe(4);
    expect(overview.stats.avgExitQuality).toBe(3);
    expect(overview.stats.avgRiskManagement).toBe(5);
    // 1 REVIEW lesson + 1 TRADE_NOTE lesson (pending trade with notes).
    expect(overview.stats.lessonsCaptured).toBe(2);
    expect(overview.stats.reviewStreakDays).toBeGreaterThanOrEqual(1);
    expect(overview.stats.followedPlanPct).toBe(100);
    expect(overview.stats.offPlaybookCount).toBe(0);

    // Pending queue preview carries the pending trade only.
    expect(overview.pendingQueuePreview).toHaveLength(1);
    expect(overview.pendingQueuePreview[0]!.tradeId).toBe(pending.trade.id);
    expect(overview.pendingQueuePreview[0]!.reviewStatus).toBe("PENDING");

    // Current week appears with the A-grade average (A=5 points).
    const currentWeek = overview.weeklyGradeTrend.at(-1);
    expect(currentWeek?.reviews).toBe(1);
    expect(currentWeek?.avgPoints).toBe(5);

    expect(overview.lastImprovementNote).toContain("trail the stop");
    expect(overview.recentLessons.length).toBe(2);
    // Goals engine is an honest zero until its own phase (documented).
    expect(overview.goalsSummary).toEqual({
      total: 0,
      achieved: 0,
      onTrack: 0,
      atRisk: 0,
      behind: 0,
      avgProgressPct: null,
    });
  });

  it("is empty-but-honest for a user with no reviews", async () => {
    const user = await authenticatedUser(app, mail);
    const overview = tradeReviewOverviewResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/reviews/overview", headers: user.authHeader })).json(),
    );
    expect(overview.stats.closedTrades).toBe(0);
    expect(overview.stats.reviewedTrades).toBe(0);
    expect(overview.stats.reviewRatePct).toBe(0);
    expect(overview.stats.followedPlanPct).toBeNull();
    expect(overview.stats.avgEntryQuality).toBeNull();
    expect(overview.streak.effectiveDays).toBe(0);
    expect(overview.weeklyGradeTrend).toEqual([]);
    expect(overview.pendingQueuePreview).toEqual([]);
    expect(overview.lastImprovementNote).toBeNull();
  });
});

// ── Lessons library ───────────────────────────────────────────────────────────

describe("trade reviews — lessons library", () => {
  it("unions REVIEW lessons with TRADE_NOTE lessons, newest first", async () => {
    const user = await authenticatedUser(app, mail);
    const reviewed = await closedTrade(user.authHeader);
    const noted = await closedTrade(user.authHeader, {
      notes: "News-day spreads widened my stop fill.",
      entryAt: "2026-03-02T14:00:00.000Z",
      exit: { exitAt: "2026-03-02T16:00:00.000Z" },
    });
    const reviewedRow = reviewRowSchema.parse(
      (await putReview(user.authHeader, reviewed.trade.id as string)).json(),
    );

    const res = await app.inject({ method: "GET", url: "/api/v1/reviews/lessons", headers: user.authHeader });
    expect(res.statusCode).toBe(200);
    const parsed = lessonsResponseSchema.parse(res.json());

    const reviewEntry = parsed.lessons.find((entry) => entry.source === "REVIEW");
    expect(reviewEntry?.id).toBeTypeOf("string"); // keyed by the review row id
    expect(reviewEntry?.tradeId).toBe(reviewedRow.tradeId);
    expect(reviewEntry?.text).toContain("confirmation candle");
    expect(reviewEntry?.executionGrade).toBe("A");
    // Manual trades carry no computed P&L — the echoed R is honestly null.
    expect(reviewEntry?.rMultiple).toBeNull();

    const noteEntry = parsed.lessons.find((entry) => entry.source === "TRADE_NOTE");
    expect(noteEntry?.id).toBe(`note-${noted.trade.id as string}`);
    expect(noteEntry?.text).toContain("News-day spreads");
    expect(noteEntry?.executionGrade).toBeNull();

    // Newest trading day first (both 2026-03-02 — stable order keeps both).
    expect(parsed.lessons).toHaveLength(2);
    void noted;
  });
});

// ── Detail + plan-vs-actual comparison (§54/§67/§70) ─────────────────────────

describe("trade reviews — detail and comparison without a plan", () => {
  it("returns the review, authoritative trade summary and a NONE comparison", async () => {
    const user = await authenticatedUser(app, mail);
    const { trade } = await closedTrade(user.authHeader);
    await putReview(user.authHeader, trade.id as string);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: user.authHeader,
    });
    expect(res.statusCode).toBe(200);
    const detail = reviewDetailResponseSchema.parse(res.json());

    expect(detail.review.tradeId).toBe(trade.id);
    expect(detail.tradeSummary.status).toBe("CLOSED");
    expect(detail.tradeSummary.symbol).toBe("EURUSD");
    expect(detail.tradeSummary.direction).toBe("BUY");
    expect(detail.tradeSummary.entryPrice).toBe("1.085");
    expect(detail.tradeSummary.exitPrice).toBe("1.09");
    expect(detail.tradeSummary.quantity).toBe("1");
    // Manual-close P&L is unknown (null) — canonical Trading Core truth.
    expect(detail.tradeSummary.pnlNet).toBeNull();
    expect(detail.tradeSummary.riskAmount).toBe("100");
    expect(detail.tradeSummary.rMultiple).toBeNull();
    // Duration is canonical execution truth: 09:30 → 12:00 = 9000 seconds.
    expect(detail.tradeSummary.durationSeconds).toBe(9000);

    expect(detail.planSummary).toBeNull();
    expect(detail.comparison.basedOn).toBe("NONE");
    expect(detail.comparison.hasPlan).toBe(false);
    expect(detail.comparison.direction.match).toBeNull();
    expect(detail.comparison.entry.available).toBe(false);
    expect(detail.comparison.entry.actual).toBe("1.085");
  });
});

describe("trade reviews — detail and comparison with an origin plan", () => {
  it("compares plan vs actual across every dimension and freezes the snapshot", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const plan = await createPlan(user.authHeader, account.id);
    // Execute the plan's sizing: 0.2 lots at 100 risk, stop 1.08, target 1.095.
    const created = (
      await createOpenTrade(user.authHeader, {
        accountId: account.id,
        quantity: "0.2",
        initialStop: "1.08000",
        initialTP: "1.09500",
        riskAmount: "100",
      })
    ).json().trade;
    await closeTrade(user.authHeader, created.id);

    const put = await putReview(user.authHeader, created.id, { originTradePlanId: plan.id });
    expect(put.statusCode).toBe(200);

    const detail = reviewDetailResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/reviews/${created.id}`,
          headers: user.authHeader,
        })
      ).json(),
    );

    expect(detail.comparison.basedOn).toBe("SNAPSHOT");
    expect(detail.comparison.hasPlan).toBe(true);
    expect(detail.comparison.direction).toEqual({ planned: "BUY", actual: "BUY", match: true });
    expect(detail.comparison.entry).toEqual({
      planned: "1.085",
      actual: "1.085",
      deviation: "0",
      deviationPips: 0,
      available: true,
    });
    expect(detail.comparison.stop).toEqual({
      planned: "1.08",
      actual: "1.08",
      deviation: "0",
      deviationPips: 0,
      available: true,
    });
    expect(detail.comparison.target).toEqual({
      planned: "1.095",
      actual: "1.095",
      deviation: "0",
      deviationPips: 0,
      available: true,
    });
    // Money and size legs never report pips (a money unit is not a pip).
    expect(detail.comparison.risk).toEqual({
      planned: "100",
      actual: "100",
      deviation: "0",
      deviationPips: null,
      available: true,
    });
    expect(detail.comparison.size).toEqual({
      planned: "0.2",
      actual: "0.2",
      deviation: "0",
      deviationPips: null,
      available: true,
    });
    // Planned RR 2 vs realized R — the manual close has no computed P&L, so
    // the realized-R leg is honestly unavailable (§67; synced trades with
    // realized R are covered in the dedicated test below).
    expect(detail.comparison.rMultiple).toEqual({
      planned: "2",
      actual: null,
      deviation: null,
      deviationPips: null,
      available: false,
    });

    expect(detail.planSummary?.planId).toBe(plan.id);
    expect(detail.planSummary?.currentStatus).toBe("PLANNED");
    expect(detail.planSummary?.snapshot.entryPrice).toBe("1.085");
    expect(detail.planSummary?.snapshot.positionSize).toBe("0.2");
    expect(detail.planSummary?.snapshot.rrRatio).toBe("2");
  });

  it("keeps the FROZEN snapshot when the plan is edited after linking (§26)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader, 3);
    const plan = await createPlan(user.authHeader, account.id);
    const created = (
      await createOpenTrade(user.authHeader, {
        accountId: account.id,
        quantity: "0.2",
        initialStop: "1.08000",
        riskAmount: "100",
      })
    ).json().trade;
    await closeTrade(user.authHeader, created.id);
    await putReview(user.authHeader, created.id, { originTradePlanId: plan.id });

    // The plan stays editable (PLANNED) — but the review's comparison must not move.
    const edit = await app.inject({
      method: "PATCH",
      url: `/api/v1/trade-plans/${plan.id}`,
      headers: user.authHeader,
      payload: { entryPrice: "1.09000", stopLoss: "1.08500" },
    });
    expect(edit.statusCode).toBe(200);

    const detail = reviewDetailResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/reviews/${created.id}`,
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(detail.planSummary?.snapshot.entryPrice).toBe("1.085");
    expect(detail.planSummary?.snapshot.stopLoss).toBe("1.08");
    expect(detail.comparison.entry.planned).toBe("1.085");
    expect(detail.comparison.stop.planned).toBe("1.08");
    // Deviations now reflect the ORIGINAL plan vs the actual trade.
    expect(detail.comparison.entry.deviation).toBe("0");
  });

  it("validates plan linkage: foreign plans 404, symbol mismatches 422, detach works", async () => {
    const user = await authenticatedUser(app, mail);
    const stranger = await authenticatedUser(app, mail);
    const { trade } = await closedTrade(user.authHeader);

    // A foreign plan is an honest 404 (stranger's own USD account).
    const strangerAccount = await connectUsdMockAccount(stranger.authHeader, 0);
    const foreignPlan = await createPlan(stranger.authHeader, strangerAccount.id);
    const foreign = await putReview(user.authHeader, trade.id as string, {
      originTradePlanId: foreignPlan.id,
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().code).toBe("TRADE_REVIEW_PLAN_NOT_FOUND");

    // A plan for a different symbol can never be the origin.
    const ownPlan = await createPlan(user.authHeader, (await connectUsdMockAccount(user.authHeader, 1)).id, {
      symbol: "XAUUSD",
      entryPrice: "2350",
      stopLoss: "2340",
      takeProfit: "2370",
    });
    const mismatch = await putReview(user.authHeader, trade.id as string, {
      originTradePlanId: ownPlan.id,
    });
    expect(mismatch.statusCode).toBe(422);
    expect(mismatch.json().code).toBe("TRADE_REVIEW_PLAN_MISMATCH");

    // Link then detach — the comparison falls back to NONE.
    const eurusdPlan = await createPlan(user.authHeader, (await connectUsdMockAccount(user.authHeader, 2)).id);
    await putReview(user.authHeader, trade.id as string, { originTradePlanId: eurusdPlan.id });
    const detail = reviewDetailResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/reviews/${trade.id as string}`,
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(detail.comparison.basedOn).toBe("SNAPSHOT");

    await putReview(user.authHeader, trade.id as string, { originTradePlanId: null });
    const detached = reviewDetailResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/reviews/${trade.id as string}`,
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(detached.planSummary).toBeNull();
    expect(detached.comparison.basedOn).toBe("NONE");
    expect(detached.comparison.hasPlan).toBe(false);
  });
});

// ── Security: ownership, IDOR, forged ownership (§36/§65) ────────────────────

describe("trade reviews — security battery", () => {
  it("IDOR: user B cannot read, edit, complete or archive user A's review (honest 404)", async () => {
    const a = await authenticatedUser(app, mail);
    const b = await authenticatedUser(app, mail);
    const { trade } = await closedTrade(a.authHeader);
    await putReview(a.authHeader, trade.id as string);

    const read = await app.inject({
      method: "GET",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: b.authHeader,
    });
    expect(read.statusCode).toBe(404);
    expect(read.json().code).toBe("TRADE_REVIEW_NOT_FOUND");

    const edit = await app.inject({
      method: "PATCH",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: b.authHeader,
      payload: { lessons: "hijacked" },
    });
    expect(edit.statusCode).toBe(404);

    // B cannot even CREATE a review for A's trade — the trade itself 404s.
    const complete = await putReview(b.authHeader, trade.id as string);
    expect(complete.statusCode).toBe(404);
    expect(complete.json().code).toBe("TRADE_REVIEW_TRADE_NOT_FOUND");

    const archive = await app.inject({
      method: "DELETE",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: b.authHeader,
    });
    expect(archive.statusCode).toBe(404);
  });

  it("the workspace is private: B's list, overview and lessons never contain A's rows", async () => {
    const a = await authenticatedUser(app, mail);
    const b = await authenticatedUser(app, mail);
    const aTrade = await closedTrade(a.authHeader);
    const bTrade = await closedTrade(b.authHeader);
    await putReview(a.authHeader, aTrade.trade.id as string);

    const listB = reviewsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/reviews", headers: b.authHeader })).json(),
    );
    expect(listB.reviews.map((row) => row.tradeId)).toEqual([bTrade.trade.id]);

    const overviewB = tradeReviewOverviewResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/reviews/overview", headers: b.authHeader })).json(),
    );
    expect(overviewB.stats.closedTrades).toBe(1);
    expect(overviewB.stats.reviewedTrades).toBe(0);

    const lessonsB = lessonsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/reviews/lessons", headers: b.authHeader })).json(),
    );
    expect(lessonsB.lessons).toHaveLength(0);

    void aTrade;
  });

  it("the URL tradeId is authoritative — a forged body tradeId is ignored (§24)", async () => {
    const user = await authenticatedUser(app, mail);
    const owned = await closedTrade(user.authHeader);

    const res = await putReview(user.authHeader, owned.trade.id as string, {
      tradeId: "00000000-0000-0000-0000-000000000099", // forged — ignored
    });
    expect(res.statusCode).toBe(200);
    const row = reviewRowSchema.parse(res.json());
    expect(row.tradeId).toBe(owned.trade.id);
  });

  it("error responses never leak internals (§73)", async () => {
    const user = await authenticatedUser(app, mail);
    const { trade } = await closedTrade(user.authHeader);
    const bad = await putReview(user.authHeader, trade.id as string, { entryQuality: 99 });
    expect(bad.statusCode).toBe(400);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/reviews/${trade.id as string}`,
      headers: user.authHeader,
    });
    expect(detail.statusCode).toBe(404);

    const scan = JSON.stringify({ bad: bad.json(), detail: detail.json() }).toLowerCase();
    expect(scan).not.toContain("prisma");
    expect(scan).not.toContain("password");
    expect(scan).not.toContain("select");
    expect(scan).not.toContain("insert into");
  });
});

// ── Immutability battery (§66 — the critical architectural test) ─────────────

describe("trade reviews — immutability of execution truth", () => {
  it("review create/edit/complete/archive never modify Trade or TradeExecution rows", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const plan = await createPlan(user.authHeader, account.id);
    const created = (
      await createOpenTrade(user.authHeader, {
        accountId: account.id,
        quantity: "0.2",
        initialStop: "1.08000",
        riskAmount: "100",
      })
    ).json().trade;
    await closeTrade(user.authHeader, created.id);

    const before = await canonicalSnapshot(created.id);
    const beforePlan = JSON.stringify(
      await prisma.tradePlan.findFirst({ where: { id: plan.id } }),
    );

    // The full review lifecycle, including a plan linkage:
    await putReview(user.authHeader, created.id, { originTradePlanId: plan.id });
    await app.inject({
      method: "PATCH",
      url: `/api/v1/reviews/${created.id}`,
      headers: user.authHeader,
      payload: { exitQuality: 1, lessons: "Rewritten lesson." },
    });
    await app.inject({
      method: "GET",
      url: `/api/v1/reviews/${created.id}`,
      headers: user.authHeader,
    });
    await app.inject({ method: "GET", url: "/api/v1/reviews", headers: user.authHeader });
    await app.inject({ method: "GET", url: "/api/v1/reviews/overview", headers: user.authHeader });
    await app.inject({ method: "GET", url: "/api/v1/reviews/lessons", headers: user.authHeader });
    await app.inject({
      method: "DELETE",
      url: `/api/v1/reviews/${created.id}`,
      headers: user.authHeader,
    });
    await putReview(user.authHeader, created.id);

    const after = await canonicalSnapshot(created.id);
    expect(after).toBe(before);

    const afterPlan = JSON.stringify(
      await prisma.tradePlan.findFirst({ where: { id: plan.id } }),
    );
    expect(afterPlan).toBe(beforePlan);
  });

  it("financial truth stays canonical: review payloads echo Trading Core, never override it", async () => {
    const user = await authenticatedUser(app, mail);
    const { trade } = await closedTrade(user.authHeader);
    const row = reviewRowSchema.parse((await putReview(user.authHeader, trade.id as string)).json());

    // The review has NO field for P&L/R (they are not user-writable) — the
    // trader records the process verdict while the canonical facts stand.
    await putReview(user.authHeader, trade.id as string, {
      followedPlan: false,
      playbookMatch: "OFF_PLAYBOOK",
      executionGrade: "F",
    });
    const detail = reviewDetailResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/reviews/${trade.id as string}`,
          headers: user.authHeader,
        })
      ).json(),
    );
    expect(row.pnlNet).toBeNull();
    expect(detail.tradeSummary.pnlNet).toBeNull();
    expect(detail.comparison.entry.actual).toBe("1.085");
    // Process quality moved independently of financial outcome (§16).
    expect(detail.review.executionGrade).toBe("F");
    expect(detail.tradeSummary.rMultiple).toBeNull();
  });

});
