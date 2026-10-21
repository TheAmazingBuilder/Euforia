/**
 * e2e — Onboarding first-run lifecycle (preferences domain "onboarding").
 *
 * The onboarding state lives in the EXISTING per-user preferences document
 * (PATCH /me/preferences/onboarding) — no second service, no second model.
 * This spec proves against the real AppModule + real PostgreSQL:
 *   - fresh provisioning: every NEW user gets onboarding NOT_STARTED;
 *   - backward compatibility: a preferences document WITHOUT the onboarding
 *     key still satisfies the shared root schema (existing users predate the
 *     tour — the absence of the key is the documented "predates" marker);
 *   - progress save + resume pointer persistence across independent reads;
 *   - the shared superRefine transition invariants (terminal timestamps,
 *     currentStep null on terminal states, startedAt on IN_PROGRESS, no
 *     duplicate stepsDone);
 *   - envelope planting defense (userId/updatedAt are server-managed);
 *   - skip semantics (SKIPPED + skippedAt, tour suppressed by the client);
 *   - reset semantics (explicit POST /me/preferences/reset re-arms the
 *     domain to its defaults — documented product behavior);
 *   - per-user isolation (completing user A never touches user B);
 *   - authentication on every onboarding operation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";
import {
  DEFAULT_USER_PREFERENCES,
  ONBOARDING_VERSION,
  userPreferencesSchema,
  type UserPreferences,
} from "../../src/shared/contracts";

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

const PREFS = "/api/v1/me/preferences";

async function getPrefs(auth: Record<string, string>) {
  const res = await app.inject({ method: "GET", url: PREFS, headers: auth });
  expect(res.statusCode).toBe(200);
  return res.json() as Promise<UserPreferences>;
}

async function patchOnboarding(auth: Record<string, string>, payload: unknown) {
  return app.inject({
    method: "PATCH",
    url: `${PREFS}/onboarding`,
    headers: { ...auth, "content-type": "application/json" },
    payload: JSON.stringify(payload),
  });
}

function expectValidationError(status: number, body: { error?: string; issues?: unknown }) {
  expect(status).toBe(400);
  expect(body.error).toBe("ValidationError");
  expect(Array.isArray(body.issues)).toBe(true);
}

// ── provisioning & backward compatibility ────────────────────────────────────

describe("onboarding provisioning (fresh users) and backward compatibility", () => {
  it("provisions NOT_STARTED with the current version for every new user", async () => {
    const ctx = await authenticatedUser(app, mail);
    const prefs = await getPrefs(ctx.authHeader);

    expect(prefs.onboarding).toEqual({
      status: "NOT_STARTED",
      version: ONBOARDING_VERSION,
      currentStep: null,
      startedAt: null,
      completedAt: null,
      skippedAt: null,
      stepsDone: [],
    });
  });

  it("accepts a preferences document WITHOUT the onboarding key (predates the tour)", () => {
    // The documented backward-compat contract: docs stored before onboarding
    // shipped carry no onboarding key, and the root schema must keep parsing
    // them — otherwise every existing user's read would 500.
    const legacy = {
      ...structuredClone(DEFAULT_USER_PREFERENCES),
      userId: "3f1d2b0e-0000-4000-8000-000000000001",
      updatedAt: new Date().toISOString(),
    };
    delete (legacy as Record<string, unknown>).onboarding;
    expect(() => userPreferencesSchema.parse(legacy)).not.toThrow();
  });
});

// ── progress, completion, skip ───────────────────────────────────────────────

describe("onboarding lifecycle transitions", () => {
  it("saves meaningful progress (startedAt + currentStep + stepsDone) and persists it", async () => {
    const ctx = await authenticatedUser(app, mail);
    const startedAt = new Date().toISOString();

    const res = await patchOnboarding(ctx.authHeader, {
      status: "IN_PROGRESS",
      version: ONBOARDING_VERSION,
      currentStep: "tour",
      startedAt,
      completedAt: null,
      skippedAt: null,
      stepsDone: ["welcome"],
    });
    expect(res.statusCode).toBe(200);

    // Independent read — the resume pointer must survive (fresh GET).
    const prefs = await getPrefs(ctx.authHeader);
    expect(prefs.onboarding?.status).toBe("IN_PROGRESS");
    expect(prefs.onboarding?.currentStep).toBe("tour");
    expect(prefs.onboarding?.stepsDone).toEqual(["welcome"]);
    expect(prefs.onboarding?.startedAt).toBe(startedAt);
  });

  it("completes only with completedAt and a null resume pointer — full-contract re-parse", async () => {
    const ctx = await authenticatedUser(app, mail);

    // Invalid: COMPLETED without completedAt.
    const missing = await patchOnboarding(ctx.authHeader, {
      status: "COMPLETED",
      version: ONBOARDING_VERSION,
      currentStep: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      skippedAt: null,
      stepsDone: ["welcome", "tour", "preferences", "accounts", "personalize", "ready"],
    });
    expectValidationError(missing.statusCode, missing.json());

    // Invalid: COMPLETED with a non-null currentStep.
    const dangling = await patchOnboarding(ctx.authHeader, {
      status: "COMPLETED",
      version: ONBOARDING_VERSION,
      currentStep: "ready",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      skippedAt: null,
      stepsDone: [],
    });
    expectValidationError(dangling.statusCode, dangling.json());

    // Valid completion — the response satisfies the WHOLE shared contract.
    const ok = await patchOnboarding(ctx.authHeader, {
      status: "COMPLETED",
      version: ONBOARDING_VERSION,
      currentStep: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      skippedAt: null,
      stepsDone: ["welcome", "tour", "preferences", "accounts", "personalize", "ready"],
    });
    expect(ok.statusCode).toBe(200);
    const parsed = userPreferencesSchema.parse(ok.json());
    expect(parsed.onboarding?.status).toBe("COMPLETED");

    const prefs = await getPrefs(ctx.authHeader);
    expect(prefs.onboarding?.status).toBe("COMPLETED");
    expect(prefs.onboarding?.currentStep).toBeNull();
  });

  it("rejects terminal timestamps on non-terminal states and IN_PROGRESS without startedAt", async () => {
    const ctx = await authenticatedUser(app, mail);

    const ghostTimestamp = await patchOnboarding(ctx.authHeader, {
      status: "NOT_STARTED",
      version: ONBOARDING_VERSION,
      currentStep: null,
      startedAt: null,
      completedAt: new Date().toISOString(),
      skippedAt: null,
      stepsDone: [],
    });
    expectValidationError(ghostTimestamp.statusCode, ghostTimestamp.json());

    const noStart = await patchOnboarding(ctx.authHeader, {
      status: "IN_PROGRESS",
      version: ONBOARDING_VERSION,
      currentStep: "welcome",
      startedAt: null,
      completedAt: null,
      skippedAt: null,
      stepsDone: [],
    });
    expectValidationError(noStart.statusCode, noStart.json());

    const duplicates = await patchOnboarding(ctx.authHeader, {
      status: "IN_PROGRESS",
      version: ONBOARDING_VERSION,
      currentStep: "tour",
      startedAt: new Date().toISOString(),
      completedAt: null,
      skippedAt: null,
      stepsDone: ["welcome", "welcome"],
    });
    expectValidationError(duplicates.statusCode, duplicates.json());
  });

  it("rejects unknown step ids, bad statuses and non-integer versions", async () => {
    const ctx = await authenticatedUser(app, mail);
    const base = {
      status: "IN_PROGRESS",
      version: ONBOARDING_VERSION,
      currentStep: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      skippedAt: null,
      stepsDone: [],
    };

    const badStep = await patchOnboarding(ctx.authHeader, { ...base, currentStep: "payments" });
    expectValidationError(badStep.statusCode, badStep.json());

    const badStatus = await patchOnboarding(ctx.authHeader, { ...base, status: "FINISHED" });
    expectValidationError(badStatus.statusCode, badStatus.json());

    const badVersion = await patchOnboarding(ctx.authHeader, { ...base, version: 0 });
    expectValidationError(badVersion.statusCode, badVersion.json());

    const fractional = await patchOnboarding(ctx.authHeader, { ...base, version: 1.5 });
    expectValidationError(fractional.statusCode, fractional.json());
  });

  it("strips planted envelope keys (userId/updatedAt are server-managed)", async () => {
    const ctx = await authenticatedUser(app, mail);

    const res = await patchOnboarding(ctx.authHeader, {
      status: "IN_PROGRESS",
      version: ONBOARDING_VERSION,
      currentStep: "welcome",
      startedAt: new Date().toISOString(),
      completedAt: null,
      skippedAt: null,
      stepsDone: [],
      userId: "3f1d2b0e-0000-4000-8000-000000000099",
      updatedAt: "2001-01-01T00:00:00.000Z",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as UserPreferences;
    expect(body.userId).toBe(ctx.userId);
    expect(body.updatedAt).not.toBe("2001-01-01T00:00:00.000Z");
  });

  it("records SKIPPED with skippedAt (the skip policy marker)", async () => {
    const ctx = await authenticatedUser(app, mail);

    const res = await patchOnboarding(ctx.authHeader, {
      status: "SKIPPED",
      version: ONBOARDING_VERSION,
      currentStep: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      skippedAt: new Date().toISOString(),
      stepsDone: ["welcome"],
    });
    expect(res.statusCode).toBe(200);

    const prefs = await getPrefs(ctx.authHeader);
    expect(prefs.onboarding?.status).toBe("SKIPPED");
    expect(prefs.onboarding?.skippedAt).not.toBeNull();
    // Skipping must NOT fabricate completion.
    expect(prefs.onboarding?.completedAt).toBeNull();
  });

  it("reset re-arms ONLY the onboarding domain to its defaults and harms no sibling", async () => {
    const ctx = await authenticatedUser(app, mail);

    // Give the doc a distinctive sibling value + a completed onboarding.
    // The trading PATCH body is the WHOLE domain object (whole-domain
    // semantics) — merge the new display currency over the safe defaults.
    const tradingDomain = {
      ...structuredClone(DEFAULT_USER_PREFERENCES.trading),
      displayCurrency: "EUR",
    };
    const trading = await app.inject({
      method: "PATCH",
      url: `${PREFS}/trading`,
      headers: { ...ctx.authHeader, "content-type": "application/json" },
      payload: tradingDomain,
    });
    expect(trading.statusCode).toBe(200);

    const done = await patchOnboarding(ctx.authHeader, {
      status: "COMPLETED",
      version: ONBOARDING_VERSION,
      currentStep: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      skippedAt: null,
      stepsDone: ["welcome"],
    });
    expect(done.statusCode).toBe(200);

    const reset = await app.inject({
      method: "POST",
      url: `${PREFS}/reset`,
      headers: ctx.authHeader,
      payload: { domain: "onboarding" },
    });
    expect(reset.statusCode).toBe(200);

    const prefs = (await getPrefs(ctx.authHeader)) as unknown as {
      onboarding: { status: string; stepsDone: string[] };
      trading: { displayCurrency: string };
    };
    expect(prefs.onboarding.status).toBe("NOT_STARTED");
    expect(prefs.onboarding.stepsDone).toEqual([]);
    // The sibling domain survives the reset untouched (§37).
    expect(prefs.trading.displayCurrency).toBe("EUR");
  });
});

// ── security ─────────────────────────────────────────────────────────────────

describe("onboarding security", () => {
  it("rejects unauthenticated progress writes and resets", async () => {
    const patch = await app.inject({
      method: "PATCH",
      url: `${PREFS}/onboarding`,
      payload: { status: "COMPLETED", version: 1, currentStep: null },
    });
    const reset = await app.inject({
      method: "POST",
      url: `${PREFS}/reset`,
      payload: { domain: "onboarding" },
    });
    expect(patch.statusCode).toBe(401);
    expect(reset.statusCode).toBe(401);
  });

  it("keeps onboarding states isolated per user (structural IDOR defense)", async () => {
    const alice = await authenticatedUser(app, mail);
    const bob = await authenticatedUser(app, mail);

    const done = await patchOnboarding(alice.authHeader, {
      status: "COMPLETED",
      version: ONBOARDING_VERSION,
      currentStep: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      skippedAt: null,
      stepsDone: ["welcome"],
    });
    expect(done.statusCode).toBe(200);

    const alicePrefs = await getPrefs(alice.authHeader);
    const bobPrefs = await getPrefs(bob.authHeader);
    expect(alicePrefs.onboarding?.status).toBe("COMPLETED");
    expect(bobPrefs.onboarding?.status).toBe("NOT_STARTED");
  });
});
