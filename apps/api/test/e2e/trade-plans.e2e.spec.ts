/**
 * e2e — Trade Planning, Risk Management & Checklist (Phase 5).
 *
 * Over the REAL AppModule + real database: plan creation (draft/commit),
 * authoritative risk computation, pre-trade validation battery (checklist
 * gate included), lifecycle transitions (commit/validate/cancel/abandon)
 * with idempotent retries, recalculation, listing with filters/pagination,
 * plus the security battery: authentication boundary, IDOR (user A ↔ user B),
 * forged ownership, foreign accounts, invalid states and leakage scans.
 *
 * Plan ≠ Trade: these tests also assert that NO trade ever appears from plan
 * operations (§6/§30 — planning never executes).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  tradePlanDetailSchema,
  tradePlansResponseSchema,
  validateTradePlanResponseSchema,
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

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * FNV-1a 32-bit — byte-for-byte mirror of the mock provider's hashSeed so the
 * test can pick an externalAccountId that deterministically lands on USD
 * (CURRENCIES[h % 3]) with a SINGLE connect — the accounts rate limiter only
 * allows 5 connects per user per 15 minutes, so brute-force retries are not
 * an option.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Connect a deterministic USD mock account (quote currency matches EURUSD/XAUUSD/US30 specs). */
async function connectUsdMockAccount(auth: Record<string, string>) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
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

/** Canonical EURUSD plan: BUY 1.08500 / SL 1.08000 / TP 1.09500 (50 pips risk, 2R). */
function planPayload(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "00000000-0000-0000-0000-000000000000",
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

async function createPlan(auth: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/v1/trade-plans",
    headers: auth,
    payload: planPayload(overrides),
  });
}

async function createReadyPlan(
  auth: Record<string, string>,
  accountId: string,
  overrides: Record<string, unknown> = {},
) {
  const created = await createPlan(auth, { accountId, commitNow: true, ...overrides });
  expect(created.statusCode).toBe(201);
  return created.json().tradePlan as { id: string; status: string };
}

// ── Authentication boundary ──────────────────────────────────────────────────

describe("trade plans — authentication boundary", () => {
  it("401 on every trade-plan route without a token", async () => {
    for (const [method, url] of [
      ["GET", "/api/v1/trade-plans"],
      ["POST", "/api/v1/trade-plans"],
      ["GET", "/api/v1/trade-plans/00000000-0000-0000-0000-000000000001"],
      ["PATCH", "/api/v1/trade-plans/00000000-0000-0000-0000-000000000001"],
      ["POST", "/api/v1/trade-plans/00000000-0000-0000-0000-000000000001/commit"],
      ["POST", "/api/v1/trade-plans/00000000-0000-0000-0000-000000000001/validate"],
      ["POST", "/api/v1/trade-plans/00000000-0000-0000-0000-000000000001/cancel"],
      ["POST", "/api/v1/trade-plans/00000000-0000-0000-0000-000000000001/abandon"],
      ["POST", "/api/v1/trade-plans/00000000-0000-0000-0000-000000000001/recalculate"],
    ] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });
});

// ── Creation & authoritative risk ────────────────────────────────────────────

describe("trade plans — creation (§37)", () => {
  it("creates a DRAFT plan with server-computed risk distinct from the sizing input", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const res = await createPlan(user.authHeader, { accountId: account.id });
    expect(res.statusCode).toBe(201);
    const plan = tradePlanDetailSchema.parse(res.json().tradePlan);
    expect(plan.status).toBe("DRAFT");
    expect(plan.plannedAt).toBeNull();
    expect(plan.userId).toBe(user.userId);
    expect(plan.accountId).toBe(account.id);
    expect(plan.currency).toBe(account.currency);
    expect(plan.entryType).toBe("MARKET");
    expect(plan.symbol).toBe("EURUSD");
    // Input echo, untouched (§39 — user input ≠ derived).
    expect(plan.size).toEqual({ mode: "risk_amount", riskAmount: "100" });
    // risk_amount 100 over a 500-per-lot stop → exactly 0.2 lots.
    expect(plan.risk.positionSize).toBe("0.2");
    expect(plan.risk.riskAmount).toBe("100");
    expect(plan.risk.rrRatio).toBe("2");
    expect(plan.risk.stopPips).toBe("50");
    expect(plan.risk.balanceSnapshot).not.toBeNull();
    // The balance anchor is the account's real balance (10k–19k on the mock).
    expect(Number(plan.risk.balanceSnapshot)).toBeGreaterThanOrEqual(10000);
    // Creation never validates by itself (§37).
    expect(plan.validatedAt).toBeNull();
    expect(plan.lastValidation).toBeNull();
  });

  it("commitNow lands the plan directly in PLANNED with a plannedAt stamp", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const res = await createPlan(user.authHeader, { accountId: account.id, commitNow: true });
    expect(res.statusCode).toBe(201);
    const plan = tradePlanDetailSchema.parse(res.json().tradePlan);
    expect(plan.status).toBe("PLANNED");
    expect(plan.plannedAt).not.toBeNull();
  });

  it("risk_percent mode derives the money risk from the account balance, never from the client", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const res = await createPlan(user.authHeader, {
      accountId: account.id,
      size: { mode: "risk_percent", riskPercent: "1" },
    });
    expect(res.statusCode).toBe(201);
    const plan = tradePlanDetailSchema.parse(res.json().tradePlan);
    expect(plan.risk.riskPercent).toBe("1");
    const balance = Number(plan.risk.balanceSnapshot);
    const riskAmount = Number(plan.risk.riskAmount);
    // Budget = 1% of the snapshot; effective risk ≤ budget (floored size).
    expect(riskAmount).toBeGreaterThan(0);
    expect(riskAmount).toBeLessThanOrEqual(balance * 0.01);
    // And within one micro-lot step of it.
    expect(balance * 0.01 - riskAmount).toBeLessThan(0.01 * 500 + 1e-6);
  });

  it("rejects an inverted stop with a stable error code (§11)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const res = await createPlan(user.authHeader, {
      accountId: account.id,
      stopLoss: "1.09000",
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("INVALID_TRADE_PLAN_CONFIGURATION");
  });

  it("rejects an inverted take profit (§12)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const res = await createPlan(user.authHeader, {
      accountId: account.id,
      takeProfit: "1.07000",
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("INVALID_TRADE_PLAN_CONFIGURATION");
  });

  it("rejects risk-percent sizing without a stop loss", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const res = await createPlan(user.authHeader, {
      accountId: account.id,
      stopLoss: null,
      size: { mode: "risk_percent", riskPercent: "1" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("INVALID_TRADE_PLAN_CONFIGURATION");
  });

  it("rejects risk modes on symbols outside the instrument catalog (§15)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const res = await createPlan(user.authHeader, {
      accountId: account.id,
      symbol: "UNKNOWN_XYZ",
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("INSTRUMENT_SPECIFICATION_UNAVAILABLE");
  });

  it("quantity mode tolerates a missing catalog row for preview-free planning", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const res = await createPlan(user.authHeader, {
      accountId: account.id,
      symbol: "UNKNOWN_XYZ",
      size: { mode: "quantity", quantity: "1" },
    });
    expect(res.statusCode).toBe(201);
    const plan = tradePlanDetailSchema.parse(res.json().tradePlan);
    expect(plan.risk.riskAmount).toBeNull();
    expect(plan.risk.rrRatio).toBe("2"); // distance ratio stays computable (§19)
  });

  it("idempotent create: a retried clientRequestId returns the same plan (§40)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const requestId = "9f1c3b2a-0000-4000-8000-000000000001";
    const first = await createPlan(user.authHeader, { accountId: account.id, clientRequestId: requestId });
    expect(first.statusCode).toBe(201);
    const retry = await createPlan(user.authHeader, { accountId: account.id, clientRequestId: requestId });
    expect(retry.statusCode).toBe(201);
    expect(retry.json().tradePlan.id).toBe(first.json().tradePlan.id);
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/trade-plans",
      headers: user.authHeader,
    });
    expect(list.json().total).toBe(1);
  });
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

describe("trade plans — lifecycle (§7/§38)", () => {
  it("commit: DRAFT → PLANNED, idempotent on retry (§40)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const plan = await createReadyPlan(user.authHeader, account.id, { commitNow: false });
    expect(plan.status).toBe("DRAFT");
    const committed = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/commit`,
      headers: user.authHeader,
      payload: {},
    });
    expect(committed.statusCode).toBe(200);
    expect(committed.json().tradePlan.status).toBe("PLANNED");
    expect(committed.json().tradePlan.plannedAt).not.toBeNull();
    const again = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/commit`,
      headers: user.authHeader,
      payload: {},
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().tradePlan.status).toBe("PLANNED");
  });

  it("validate: PLANNED → VALIDATED on a clean battery, echoed idempotently (§21)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const plan = await createReadyPlan(user.authHeader, account.id, {
      checklist: {
        templateId: null,
        templateName: "Pre-entry",
        items: [
          { id: "i1", label: "HTF bias aligned", required: true, checked: true },
          { id: "i2", label: "News window clear", required: true, checked: true },
        ],
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/validate`,
      headers: user.authHeader,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const result = validateTradePlanResponseSchema.parse(res.json());
    expect(result.status).toBe("VALIDATED");
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/trade-plans/${plan.id}`,
      headers: user.authHeader,
    });
    const parsed = tradePlanDetailSchema.parse(detail.json().tradePlan);
    expect(parsed.validatedAt).not.toBeNull();
    // The checklist snapshot is frozen with the plan (§25).
    expect(parsed.checklist?.items).toHaveLength(2);
    expect(parsed.lastValidation?.passed).toBe(true);
    // Idempotent echo — revalidation of a VALIDATED plan never rewrites it (§38/§40).
    const echo = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/validate`,
      headers: user.authHeader,
      payload: {},
    });
    expect(echo.statusCode).toBe(200);
    expect(echo.json().passed).toBe(true);
  });

  it("validate: an incomplete required checklist blocks with structured issues (§23)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const plan = await createReadyPlan(user.authHeader, account.id, {
      checklist: {
        templateId: null,
        templateName: "Pre-entry",
        items: [{ id: "i1", label: "HTF bias aligned", required: true, checked: false }],
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/validate`,
      headers: user.authHeader,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const result = validateTradePlanResponseSchema.parse(res.json());
    expect(result.passed).toBe(false);
    expect(result.status).toBe("PLANNED");
    expect(result.issues[0]?.code).toBe("CHECKLIST_INCOMPLETE");
    expect(result.issues[0]?.severity).toBe("ERROR");
    // The failed attempt is persisted for auditability (§21).
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/trade-plans/${plan.id}`,
      headers: user.authHeader,
    });
    expect(detail.json().tradePlan.lastValidation?.passed).toBe(false);
    expect(detail.json().tradePlan.validatedAt).toBeNull();
  });

  it("validate: DRAFT plans must commit first (§7)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const plan = await createReadyPlan(user.authHeader, account.id, { commitNow: false });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/validate`,
      headers: user.authHeader,
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("TRADE_PLAN_INVALID_STATE");
  });

  it("cancel: PLANNED → CANCELLED with a stamp, idempotent on retry", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const plan = await createReadyPlan(user.authHeader, account.id);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/cancel`,
      headers: user.authHeader,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tradePlan.status).toBe("CANCELLED");
    expect(res.json().tradePlan.cancelledAt).not.toBeNull();
    const again = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/cancel`,
      headers: user.authHeader,
      payload: {},
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().tradePlan.status).toBe("CANCELLED");
  });

  it("abandon: DRAFT → ABANDONED; validated plans cannot be abandoned", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const draft = await createReadyPlan(user.authHeader, account.id, { commitNow: false });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${draft.id}/abandon`,
      headers: user.authHeader,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tradePlan.status).toBe("ABANDONED");
    expect(res.json().tradePlan.abandonedAt).not.toBeNull();

    const validated = await createReadyPlan(user.authHeader, account.id);
    await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${validated.id}/validate`,
      headers: user.authHeader,
      payload: {},
    });
    const reject = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${validated.id}/abandon`,
      headers: user.authHeader,
      payload: {},
    });
    expect(reject.statusCode).toBe(422);
    expect(reject.json().code).toBe("TRADE_PLAN_INVALID_STATE");
  });

  it("invalid transitions are rejected: cancel a draft / commit a cancelled plan", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const draft = await createReadyPlan(user.authHeader, account.id, { commitNow: false });
    const cancelDraft = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${draft.id}/cancel`,
      headers: user.authHeader,
      payload: {},
    });
    expect(cancelDraft.statusCode).toBe(422);

    const cancelled = await createReadyPlan(user.authHeader, account.id);
    await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${cancelled.id}/cancel`,
      headers: user.authHeader,
      payload: {},
    });
    const recommit = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${cancelled.id}/commit`,
      headers: user.authHeader,
      payload: {},
    });
    expect(recommit.statusCode).toBe(422);
    const revalidate = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${cancelled.id}/validate`,
      headers: user.authHeader,
      payload: {},
    });
    expect(revalidate.statusCode).toBe(422);
  });
});

// ── Editing & recalculation ──────────────────────────────────────────────────

describe("trade plans — editing and recalculation (§38/§39)", () => {
  it("edits recompute risk server-side; client numbers are never stored", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const plan = await createReadyPlan(user.authHeader, account.id);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/trade-plans/${plan.id}`,
      headers: user.authHeader,
      payload: { stopLoss: "1.08300" }, // 20 pips → per-lot 200 → 100/200 = 0.5 lots
    });
    expect(res.statusCode).toBe(200);
    const updated = tradePlanDetailSchema.parse(res.json().tradePlan);
    expect(updated.stopLoss).toBe("1.083");
    expect(updated.risk.stopPips).toBe("20");
    expect(updated.risk.positionSize).toBe("0.5");
    expect(updated.risk.riskAmount).toBe("100");
  });

  it("validated plans are frozen: edits and recalculations are rejected (§38)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const plan = await createReadyPlan(user.authHeader, account.id);
    await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/validate`,
      headers: user.authHeader,
      payload: {},
    });
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/trade-plans/${plan.id}`,
      headers: user.authHeader,
      payload: { stopLoss: "1.08300" },
    });
    expect(patch.statusCode).toBe(422);
    expect(patch.json().code).toBe("TRADE_PLAN_INVALID_STATE");
    const recalc = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/recalculate`,
      headers: user.authHeader,
      payload: {},
    });
    expect(recalc.statusCode).toBe(422);
  });

  it("recalculate refreshes derived columns without touching the inputs", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const plan = await createReadyPlan(user.authHeader, account.id, { commitNow: false });
    const before = await app.inject({
      method: "GET",
      url: `/api/v1/trade-plans/${plan.id}`,
      headers: user.authHeader,
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/recalculate`,
      headers: user.authHeader,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const after = tradePlanDetailSchema.parse(res.json().tradePlan);
    const prior = tradePlanDetailSchema.parse(before.json().tradePlan);
    expect(after.size).toEqual(prior.size);
    expect(after.risk.positionSize).toBe(prior.risk.positionSize);
    expect(after.risk.balanceSnapshot).toBe(prior.risk.balanceSnapshot);
  });
});

// ── Listing ──────────────────────────────────────────────────────────────────

describe("trade plans — listing, filters, pagination (§55)", () => {
  it("filters by status/symbol/direction and paginates with the standard envelope", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    await createPlan(user.authHeader, {
      accountId: account.id,
      symbol: "XAUUSD",
      direction: "SELL",
      entryPrice: "2400.00",
      stopLoss: "2405.00",
      takeProfit: "2390.00",
      size: { mode: "risk_amount", riskAmount: "100" },
      commitNow: true,
    });
    await createPlan(user.authHeader, { accountId: account.id, commitNow: true });
    // Quantity mode: no money math → no volume-ceiling rejection on gold.
    const draft = await createPlan(user.authHeader, {
      accountId: account.id,
      symbol: "XAUUSD",
      size: { mode: "quantity", quantity: "1" },
    });
    expect(draft.statusCode).toBe(201);

    const all = await app.inject({ method: "GET", url: "/api/v1/trade-plans?limit=2&page=1", headers: user.authHeader });
    const list = tradePlansResponseSchema.parse(all.json());
    expect(list.total).toBe(3);
    expect(list.tradePlans).toHaveLength(2);
    expect(list.page).toBe(1);
    expect(list.limit).toBe(2);

    const drafts = await app.inject({ method: "GET", url: "/api/v1/trade-plans?status=DRAFT", headers: user.authHeader });
    expect(drafts.json().total).toBe(1);

    const gold = await app.inject({ method: "GET", url: "/api/v1/trade-plans?symbol=XAUUSD", headers: user.authHeader });
    expect(gold.json().total).toBe(2);

    const sells = await app.inject({ method: "GET", url: "/api/v1/trade-plans?direction=SELL", headers: user.authHeader });
    expect(sells.json().total).toBe(1);

    const byAccount = await app.inject({
      method: "GET",
      url: `/api/v1/trade-plans?accountId=${account.id}`,
      headers: user.authHeader,
    });
    expect(byAccount.json().total).toBe(3);
  });
});

// ── Security battery (§44/§50) ───────────────────────────────────────────────

describe("trade plans — security battery", () => {
  it("IDOR: user B cannot read, update, validate or cancel user A's plan (honest 404s)", async () => {
    const alice = await authenticatedUser(app, mail);
    const bob = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(alice.authHeader);
    const plan = await createReadyPlan(alice.authHeader, account.id);

    const get = await app.inject({
      method: "GET",
      url: `/api/v1/trade-plans/${plan.id}`,
      headers: bob.authHeader,
    });
    expect(get.statusCode).toBe(404);
    expect(get.json().code).toBe("TRADE_PLAN_NOT_FOUND");

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/trade-plans/${plan.id}`,
      headers: bob.authHeader,
      payload: { stopLoss: "1.07000" },
    });
    expect(patch.statusCode).toBe(404);

    const validate = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/validate`,
      headers: bob.authHeader,
      payload: {},
    });
    expect(validate.statusCode).toBe(404);

    const cancel = await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/cancel`,
      headers: bob.authHeader,
      payload: {},
    });
    expect(cancel.statusCode).toBe(404);

    // Bob's listing never leaks Alice's plan.
    const list = await app.inject({ method: "GET", url: "/api/v1/trade-plans", headers: bob.authHeader });
    expect(list.json().total).toBe(0);
  });

  it("forged ownership is rejected: another user's accountId is an honest 404", async () => {
    const alice = await authenticatedUser(app, mail);
    const bob = await authenticatedUser(app, mail);
    const bobAccount = await connectUsdMockAccount(bob.authHeader);
    const res = await createPlan(alice.authHeader, { accountId: bobAccount.id });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("ACCOUNT_NOT_FOUND");
  });

  it("client-supplied userId is ignored — ownership always comes from the principal (§28)", async () => {
    const alice = await authenticatedUser(app, mail);
    const bob = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(alice.authHeader);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trade-plans",
      headers: alice.authHeader,
      payload: { ...planPayload({ accountId: account.id }), userId: bob.userId },
    });
    expect(res.statusCode).toBe(201);
    const plan = tradePlanDetailSchema.parse(res.json().tradePlan);
    expect(plan.userId).toBe(alice.userId);
  });

  it("unknown plan ids are honest 404s, malformed ids are 400s", async () => {
    const user = await authenticatedUser(app, mail);
    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/trade-plans/00000000-0000-0000-0000-000000000002",
      headers: user.authHeader,
    });
    expect(missing.statusCode).toBe(404);
    const malformed = await app.inject({
      method: "GET",
      url: "/api/v1/trade-plans/not-a-uuid",
      headers: user.authHeader,
    });
    expect(malformed.statusCode).toBe(400);
  });

  it("schema violations are 400s with issues; error bodies never leak internals", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    const bad = await createPlan(user.authHeader, { accountId: account.id, entryPrice: "-5" });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("ValidationError");
    expect(Array.isArray(bad.json().issues)).toBe(true);

    const leakScan = JSON.stringify({
      bad: bad.json(),
      invalid: (await createPlan(user.authHeader, { accountId: account.id, stopLoss: "1.2" })).json(),
    }).toLowerCase();
    expect(leakScan).not.toContain("prisma");
    expect(leakScan).not.toContain("select");
    expect(leakScan).not.toContain("insert into");
    expect(leakScan).not.toContain("password");
  });

  it("planning never produces journal trades (§6/§30)", async () => {
    const user = await authenticatedUser(app, mail);
    const account = await connectUsdMockAccount(user.authHeader);
    // The mock PROVIDER auto-syncs journal trades at connect time — the
    // invariant under test is that PLANNING adds none of its own.
    const before = await app.inject({ method: "GET", url: "/api/v1/trades", headers: user.authHeader });
    const plan = await createReadyPlan(user.authHeader, account.id);
    await app.inject({
      method: "POST",
      url: `/api/v1/trade-plans/${plan.id}/validate`,
      headers: user.authHeader,
      payload: {},
    });
    const trades = await app.inject({ method: "GET", url: "/api/v1/trades", headers: user.authHeader });
    expect(trades.json().total).toBe(before.json().total);
  });
});
