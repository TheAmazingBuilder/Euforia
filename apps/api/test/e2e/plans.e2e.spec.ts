/**
 * e2e - Trade Plans, Analysis Scenarios & Post-Trade Review (Phase 11).
 *
 * Over the REAL AppModule + real database: plan creation (draft, activate in
 * one call), the explicit lifecycle (activate → invalidate/complete →
 * archive) with invalid-transition rejections, edit windows (DRAFT/ACTIVE
 * only), scenario management, canonical-trade linkage (ownership + symbol
 * mismatch + detach), the plan-vs-actual comparison (honest nulls), listing
 * with filters/pagination, and the security battery (authentication, IDOR,
 * forged ownership, no trade creation from plan operations).
 *
 * A plan is NOT an order: nothing in the flow ever creates or mutates a
 * canonical journal trade except the explicit link (a reference, not a copy).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  analysisPlanDetailResponseSchema,
  analysisPlansResponseSchema,
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

// ── helpers ──────────────────────────────────────────────────────────────────

function planPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "HH/HL continuation above 1.0842",
    symbol: "EURUSD",
    timeframe: "1H",
    thesis: "Structure intact above the weekly level; buy the retest into demand.",
    invalidationCriteria: "H1 close below 1.0842 invalidates the bullish chain.",
    plannedEntry: "1.08500",
    plannedStop: "1.08200",
    plannedTargets: ["1.09200"],
    referenceTimeSec: 1_760_300_000,
    scenarios: [
      {
        id: "scen-primary-01",
        role: "PRIMARY",
        title: "Retest continuation",
        description: "If the retest holds, price continues to the weekly high.",
      },
    ],
    ...overrides,
  };
}

async function createPlan(auth: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/v1/plans",
    headers: { ...auth, "content-type": "application/json" },
    payload: planPayload(overrides),
  });
}

/** Canonical CLOSED EURUSD trade (seeds the exact rows the comparison reads). */
async function createClosedEurTrade(auth: Record<string, string>, accountId: string, instrumentId: string, entryPrice: string) {
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/trades",
    headers: { ...auth, "content-type": "application/json" },
    payload: {
      variant: "open",
      accountId,
      instrumentId,
      direction: "BUY",
      entryPrice,
      entryAt: "2026-03-02T09:30:00.000Z",
      size: { mode: "risk_amount", riskAmount: "100" },
      initialStop: "1.0800",
      outOfPlaybook: true,
    },
  });
  expect(created.statusCode).toBe(201);
  const tradeId = (created.json() as { id: string }).id;
  const closed = await app.inject({
    method: "POST",
    url: `/api/v1/trades/${tradeId}/close`,
    headers: { ...auth, "content-type": "application/json" },
    payload: { mode: "single", exitPrice: "1.0920", exitAt: "2026-03-02T12:00:00.000Z", exitReason: "TP" },
  });
  expect(closed.statusCode).toBe(200);
  return tradeId;
}

// ── lifecycle ────────────────────────────────────────────────────────────────

describe("plan lifecycle", () => {
  it("creates a DRAFT with scenarios and hypothetical levels, then activates it", async () => {
    const user = await authenticatedUser(app, mail);
    const created = await createPlan(user.authHeader);
    expect(created.statusCode).toBe(201);
    const plan = created.json().plan;
    expect(plan.status).toBe("DRAFT");
    expect(plan.scenarios).toHaveLength(1);
    expect(plan.plannedEntry).toBe("1.085"); // hypothetical, canonical decimal string
    expect(plan.tradeId).toBeNull(); // a plan starts unlinked

    const activated = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${plan.id}/activate`,
      headers: user.authHeader,
    });
    expect(activated.statusCode).toBe(200);
    expect(activated.json().plan.status).toBe("ACTIVE");
  });

  it("rejects activation without documented invalidation criteria", async () => {
    const user = await authenticatedUser(app, mail);
    const created = await createPlan(user.authHeader, { invalidationCriteria: null });
    const plan = created.json().plan;
    const activated = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${plan.id}/activate`,
      headers: user.authHeader,
    });
    expect(activated.statusCode).toBe(422);
    expect(activated.json().code).toBe("PLAN_ACTIVATION_INCOMPLETE");
  });

  it("invalidates an ACTIVE plan with a recorded reason, then archives it", async () => {
    const user = await authenticatedUser(app, mail);
    const plan = (await createPlan(user.authHeader)).json().plan;
    await app.inject({ method: "POST", url: `/api/v1/plans/${plan.id}/activate`, headers: user.authHeader });

    const invalidated = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${plan.id}/invalidate`,
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { reason: "H1 close broke 1.0842 - the chain is gone." },
    });
    expect(invalidated.statusCode).toBe(200);
    expect(invalidated.json().plan.status).toBe("INVALIDATED");
    expect(invalidated.json().plan.invalidationReason).toContain("1.0842");
    expect(invalidated.json().plan.invalidatedAt).not.toBeNull();

    const archived = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${plan.id}/archive`,
      headers: user.authHeader,
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().plan.status).toBe("ARCHIVED");

    // ARCHIVED is terminal - no further transitions.
    const resurrect = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${plan.id}/activate`,
      headers: user.authHeader,
    });
    expect(resurrect.statusCode).toBe(422);
    expect(resurrect.json().code).toBe("PLAN_TRANSITION_INVALID");
  });

  it("completes with the post-trade review (process tags, neutral vocabulary)", async () => {
    const user = await authenticatedUser(app, mail);
    const plan = (await createPlan(user.authHeader)).json().plan;
    await app.inject({ method: "POST", url: `/api/v1/plans/${plan.id}/activate`, headers: user.authHeader });

    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${plan.id}/complete`,
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { reviewNotes: "Thesis held; management clean.", processTags: ["followed_plan"] },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().plan.status).toBe("COMPLETED");
    expect(completed.json().plan.reviewedAt).not.toBeNull();
    expect(completed.json().plan.processTags).toEqual(["followed_plan"]);
  });

  it("rejects editing a COMPLETED plan (edit window = DRAFT/ACTIVE only)", async () => {
    const user = await authenticatedUser(app, mail);
    const plan = (await createPlan(user.authHeader)).json().plan;
    await app.inject({ method: "POST", url: `/api/v1/plans/${plan.id}/activate`, headers: user.authHeader });
    await app.inject({ method: "POST", url: `/api/v1/plans/${plan.id}/complete`, headers: user.authHeader, payload: {} });

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/plans/${plan.id}`,
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { thesis: "Rewriting history." },
    });
    expect(patched.statusCode).toBe(422);
  });

  it("supports DRAFT editing: title/thesis/scenarios replace, hypothetical levels update", async () => {
    const user = await authenticatedUser(app, mail);
    const plan = (await createPlan(user.authHeader)).json().plan;
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/plans/${plan.id}`,
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: {
        title: "Updated - structure confirmed",
        plannedStop: "1.08100",
        scenarios: [
          { id: "scen-primary-01", role: "PRIMARY", title: "Retest continuation", description: "Holds." },
          { id: "scen-alt-000001", role: "ALTERNATIVE", title: "Break", description: "Loses 1.0842 → range day." },
        ],
      },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().plan.title).toBe("Updated - structure confirmed");
    expect(patched.json().plan.plannedStop).toBe("1.081");
    expect(patched.json().plan.scenarios).toHaveLength(2);
  });

  it("rejects an empty PATCH body with 400", async () => {
    const user = await authenticatedUser(app, mail);
    const plan = (await createPlan(user.authHeader)).json().plan;
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/plans/${plan.id}`,
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: {},
    });
    expect(patched.statusCode).toBe(400);
  });
});

// ── trade linkage + comparison ───────────────────────────────────────────────

describe("plan ↔ trade linkage", () => {
  it("links a canonical trade, compares planned vs actual, never mutates the trade", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { providerId: "MOCK", environment: "DEMO", externalAccountId: "plan-lk-1", credentials: { method: "API_KEY", secret: "mock-api-key-plan1" } },
    });
    expect(account.statusCode).toBe(201);
    const accountId = (account.json() as { account: { id: string } }).account.id;
    const instruments = (await app.inject({ method: "GET", url: "/api/v1/instruments", headers: user.authHeader })).json() as { instruments: Array<{ id: string; symbol: string }> };
    const eurusd = instruments.instruments.find((i) => i.symbol === "EURUSD")!;

    const tradeId = await createClosedEurTrade(user.authHeader, accountId, eurusd.id, "1.0850");
    const before = await prisma.trade.findUniqueOrThrow({ where: { id: tradeId } });

    const plan = (await createPlan(user.authHeader)).json().plan;
    const linked = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${plan.id}/link-trade`,
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { tradeId },
    });
    expect(linked.statusCode).toBe(200);
    expect(linked.json().plan.tradeId).toBe(tradeId);

    // The canonical trade is untouched by the link (read-only reference).
    const after = await prisma.trade.findUniqueOrThrow({ where: { id: tradeId } });
    expect(after.entryPrice.toFixed()).toBe(before.entryPrice.toFixed());
    expect(after.exitPrice!.toFixed()).toBe(before.exitPrice!.toFixed());
    expect(after.pnlNet!.toFixed()).toBe(before.pnlNet!.toFixed());

    // Comparison: planned vs actual - both sides available for entry/stop.
    const detail = analysisPlanDetailResponseSchema.parse(
      (await app.inject({ method: "GET", url: `/api/v1/plans/${plan.id}`, headers: user.authHeader })).json(),
    );
    expect(detail.comparison.trade?.tradeId).toBe(tradeId);
    expect(detail.comparison.entry.available).toBe(true);
    expect(detail.comparison.entry.planned).toBe("1.085");
    expect(detail.comparison.entry.actual).toBe("1.085"); // same value, canonical form
    expect(detail.comparison.stop.available).toBe(true);
    // The trade row was never overwritten by the plan's hypothetical levels.
    expect(detail.comparison.trade?.initialStop).toBe("1.08"); // canonical form - never overwritten by the plan

    // Detach clears the link without touching either record.
    const detached = await app.inject({
      method: "DELETE",
      url: `/api/v1/plans/${plan.id}/link-trade`,
      headers: user.authHeader,
    });
    expect(detached.statusCode).toBe(200);
    expect(detached.json().plan.tradeId).toBeNull();
  });

  it("422 on a symbol mismatch without explicit confirmation, 200 with it", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { providerId: "MOCK", environment: "DEMO", externalAccountId: "plan-lk-2", credentials: { method: "API_KEY", secret: "mock-api-key-plan2" } },
    });
    const accountId = (account.json() as { account: { id: string } }).account.id;
    const instruments = (await app.inject({ method: "GET", url: "/api/v1/instruments", headers: user.authHeader })).json() as { instruments: Array<{ id: string; symbol: string }> };
    const xau = instruments.instruments.find((i) => i.symbol === "XAUUSD")!;

    const tradeId = await createClosedEurTrade(user.authHeader, accountId, xau.id, "2345.0");
    const plan = (await createPlan(user.authHeader)).json().plan; // EURUSD plan

    const mismatch = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${plan.id}/link-trade`,
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { tradeId },
    });
    expect(mismatch.statusCode).toBe(422);
    expect(mismatch.json().code).toBe("PLAN_TRADE_SYMBOL_MISMATCH");

    const confirmed = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${plan.id}/link-trade`,
      headers: { ...user.authHeader, "content-type": "application/json" },
      payload: { tradeId, confirmSymbolMismatch: true },
    });
    expect(confirmed.statusCode).toBe(200);
  });

  it("404 on a foreign trade id (IDOR-safe)", async () => {
    const [userA, userB] = await Promise.all([authenticatedUser(app, mail), authenticatedUser(app, mail)]);
    const plan = (await createPlan(userA.authHeader)).json().plan;
    // userB owns a trade; userA cannot link it.
    const account = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: { ...userB.authHeader, "content-type": "application/json" },
      payload: { providerId: "MOCK", environment: "DEMO", externalAccountId: "plan-lk-3", credentials: { method: "API_KEY", secret: "mock-api-key-plan3" } },
    });
    const accountId = (account.json() as { account: { id: string } }).account.id;
    const instruments = (await app.inject({ method: "GET", url: "/api/v1/instruments", headers: userB.authHeader })).json() as { instruments: Array<{ id: string; symbol: string }> };
    const eurusd = instruments.instruments.find((i) => i.symbol === "EURUSD")!;
    const foreignTradeId = await createClosedEurTrade(userB.authHeader, accountId, eurusd.id, "1.0850");

    const attempted = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${plan.id}/link-trade`,
      headers: { ...userA.authHeader, "content-type": "application/json" },
      payload: { tradeId: foreignTradeId },
    });
    expect(attempted.statusCode).toBe(404);
    expect(attempted.json().code).toBe("PLAN_TRADE_NOT_FOUND");
  });
});

// ── listing + security ───────────────────────────────────────────────────────

describe("plan listing + security battery", () => {
  it("lists with status filter and honest pagination meta", async () => {
    const user = await authenticatedUser(app, mail);
    const draft = (await createPlan(user.authHeader, { title: "Draft A" })).json().plan;
    await createPlan(user.authHeader, { title: "Active B", activate: true });
    const list = analysisPlansResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/plans?status=ACTIVE", headers: user.authHeader })).json(),
    );
    expect(list.meta.total).toBeGreaterThanOrEqual(1);
    expect(list.plans.every((p) => p.status === "ACTIVE")).toBe(true);
    void draft;
  });

  it("401 without credentials; IDOR on read/patch/delete; plans never create trades", async () => {
    const [userA, userB] = await Promise.all([authenticatedUser(app, mail), authenticatedUser(app, mail)]);
    const plan = (await createPlan(userA.authHeader)).json().plan;

    const anon = await app.inject({ method: "GET", url: "/api/v1/plans" });
    expect(anon.statusCode).toBe(401);

    const foreignGet = await app.inject({ method: "GET", url: `/api/v1/plans/${plan.id}`, headers: userB.authHeader });
    expect(foreignGet.statusCode).toBe(404);
    expect(foreignGet.json().code).toBe("PLAN_NOT_FOUND");

    const foreignPatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/plans/${plan.id}`,
      headers: { ...userB.authHeader, "content-type": "application/json" },
      payload: { title: "hijacked" },
    });
    expect(foreignPatch.statusCode).toBe(404);

    const foreignDelete = await app.inject({ method: "DELETE", url: `/api/v1/plans/${plan.id}`, headers: userB.authHeader });
    expect(foreignDelete.statusCode).toBe(404);

    // Planning never creates a trade (§6/§30).
    const trades = await app.inject({ method: "GET", url: "/api/v1/trades", headers: userA.authHeader });
    expect(trades.json().total).toBe(0);
  });

  it("deletes an owned plan", async () => {
    const user = await authenticatedUser(app, mail);
    const plan = (await createPlan(user.authHeader)).json().plan;
    const deleted = await app.inject({ method: "DELETE", url: `/api/v1/plans/${plan.id}`, headers: user.authHeader });
    expect(deleted.statusCode).toBe(200);
    const gone = await app.inject({ method: "GET", url: `/api/v1/plans/${plan.id}`, headers: user.authHeader });
    expect(gone.statusCode).toBe(404);
  });
});
