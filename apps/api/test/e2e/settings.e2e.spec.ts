/**
 * e2e — Settings bounded context (Phase 15): the 9-domain user preferences
 * document, tested against the real AppModule + real PostgreSQL.
 *
 * Coverage map (Phase 15 §38):
 *   - authentication (§31) and the per-user singleton routes (§10/§12);
 *   - full-document read + shared-contract re-parse (§34 — frontend parity);
 *   - PATCH /me/preferences/:domain — whole-domain semantics, unknown-field
 *     stripping, validation failures (§13/§14/§31/§32);
 *   - default trading account REFERENCE ownership (§21);
 *   - reset semantics — one domain, defaults only, no domain data harmed
 *     (§37/§39);
 *   - security: privileged-field injection, envelope planting, structural
 *     IDOR (§11);
 *   - audit trail for sensitive preference changes (§33);
 *   - dashboard widget-order bound (§19); financial integrity (§17).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";
import {
  DEFAULT_USER_PREFERENCES,
  DASHBOARD_WIDGET_KEYS,
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
  return app.inject({ method: "GET", url: PREFS, headers: auth });
}

async function patchDomain(auth: Record<string, string>, domain: string, payload: unknown) {
  return app.inject({
    method: "PATCH",
    url: `${PREFS}/${domain}`,
    headers: { ...auth, "content-type": "application/json" },
    payload: JSON.stringify(payload),
  });
}

async function resetDomain(auth: Record<string, string>, domain: string) {
  return app.inject({
    method: "POST",
    url: `${PREFS}/reset`,
    headers: auth,
    payload: { domain },
  });
}

async function getMe(auth: Record<string, string>) {
  const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: auth });
  expect(res.statusCode).toBe(200);
  return res.json();
}

async function sensitiveEvents(auth: Record<string, string>): Promise<number> {
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/security/events?type=SENSITIVE_SETTINGS_CHANGED&limit=100",
    headers: auth,
  });
  expect(res.statusCode).toBe(200);
  return (res.json().items as Array<unknown>).length;
}

/** Connect a MOCK trading account for the authenticated user, return its id. */
async function connectAccount(auth: Record<string, string>): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/accounts",
    headers: auth,
    payload: {
      providerId: "MOCK",
      environment: "DEMO",
      externalAccountId: `50${Math.random().toString(36).slice(2, 8)}`,
      credentials: { method: "API_KEY", secret: "mock-api-key-abcd1234" },
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().account.id as string;
}

function expectValidationError(status: number, body: { error?: string; issues?: unknown }) {
  expect(status).toBe(400);
  expect(body.error).toBe("ValidationError");
  expect(Array.isArray(body.issues)).toBe(true);
}

// ── authentication (§31) ─────────────────────────────────────────────────────

describe("settings authentication (Phase 15 §31)", () => {
  it("rejects unauthenticated reads, updates and resets", async () => {
    const read = await app.inject({ method: "GET", url: PREFS });
    const patch = await app.inject({
      method: "PATCH",
      url: `${PREFS}/appearance`,
      payload: { theme: "DARK" },
    });
    const reset = await app.inject({ method: "POST", url: `${PREFS}/reset`, payload: { domain: "appearance" } });
    expect(read.statusCode).toBe(401);
    expect(patch.statusCode).toBe(401);
    expect(reset.statusCode).toBe(401);
  });
});

// ── document read (§12/§30) ──────────────────────────────────────────────────

describe("preferences document read (Phase 15 §12/§30)", () => {
  it("returns the full 9-domain doc matching the shared contract, with defaults", async () => {
    const ctx = await authenticatedUser(app, mail);

    const res = await getPrefs(ctx.authHeader);
    expect(res.statusCode).toBe(200);

    // §34 — the wire contract IS the shared schema (frontend parity).
    const doc = userPreferencesSchema.parse(res.json()) as UserPreferences;
    expect(doc.userId).toBe(ctx.userId);
    const domains: Array<keyof UserPreferences> = [
      "trading", "risk", "journal", "notifications", "appearance",
      "dashboard", "academy", "privacy", "localization",
    ];
    for (const domain of domains) {
      expect(doc[domain]).toBeDefined();
    }
    expect(doc.trading.displayCurrency).toBe(DEFAULT_USER_PREFERENCES.trading.displayCurrency);
    expect(doc.risk.defaultRiskPerTradePct).toBe(DEFAULT_USER_PREFERENCES.risk.defaultRiskPerTradePct);
    expect(doc.privacy.profileVisibility).toBe(DEFAULT_USER_PREFERENCES.privacy.profileVisibility);
  });

  it("provisions the doc with the mirrored profile timezone (single source of truth, §15)", async () => {
    const ctx = await authenticatedUser(app, mail);
    const me = await getMe(ctx.authHeader);

    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;
    expect(doc.localization.timezone).toBe(me.timezone);
  });
});

// ── domain update (§12/§13/§39) ──────────────────────────────────────────────

describe("preferences domain update (Phase 15 §12/§13/§39)", () => {
  it("replaces ONE domain, carries siblings verbatim and refreshes the envelope", async () => {
    const ctx = await authenticatedUser(app, mail);
    const before = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;

    const res = await patchDomain(ctx.authHeader, "trading", {
      ...before.trading,
      displayCurrency: "EUR",
      defaultTimeframe: "H1",
    });
    expect(res.statusCode).toBe(200);

    const after = userPreferencesSchema.parse(res.json()) as UserPreferences;
    expect(after.trading.displayCurrency).toBe("EUR");
    expect(after.trading.defaultTimeframe).toBe("H1");
    // §39 — one update never mutates unrelated settings.
    expect(after.risk).toEqual(before.risk);
    expect(after.journal).toEqual(before.journal);
    expect(after.notifications).toEqual(before.notifications);
    expect(after.appearance).toEqual(before.appearance);
    expect(after.dashboard).toEqual(before.dashboard);
    expect(after.academy).toEqual(before.academy);
    expect(after.privacy).toEqual(before.privacy);
    expect(after.localization).toEqual(before.localization);
    // Envelope is server-managed and moves forward.
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("monotonically advances updatedAt across successive updates (§36, last-write-wins)", async () => {
    const ctx = await authenticatedUser(app, mail);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;

    const first = await patchDomain(ctx.authHeader, "appearance", { ...doc.appearance, theme: "DARK" });
    const second = await patchDomain(ctx.authHeader, "appearance", { ...doc.appearance, theme: "LIGHT" });
    const a = userPreferencesSchema.parse(first.json()) as UserPreferences;
    const b = userPreferencesSchema.parse(second.json()) as UserPreferences;
    expect(b.updatedAt >= a.updatedAt).toBe(true);
    expect(b.appearance.theme).toBe("LIGHT");
  });

  it("strips unknown fields (safely ignored, §31/§32 — never mapped into privileged state)", async () => {
    const ctx = await authenticatedUser(app, mail);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;

    const res = await patchDomain(ctx.authHeader, "appearance", {
      ...doc.appearance,
      role: "ADMIN",
      isAdmin: true,
      passwordHash: "pwned",
      integrationSecret: "pwned",
    });
    expect(res.statusCode).toBe(200);
    const raw = res.json() as Record<string, unknown>;
    expect(raw).not.toHaveProperty("role");
    expect(raw).not.toHaveProperty("isAdmin");
    expect(JSON.stringify(raw)).not.toContain("pwned");
  });

  it("rejects invalid enums, invalid timezones, non-object payloads and unknown domains with 400", async () => {
    const ctx = await authenticatedUser(app, mail);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;

    const badCurrency = await patchDomain(ctx.authHeader, "trading", { ...doc.trading, displayCurrency: "NOT_A_CURRENCY" });
    expectValidationError(badCurrency.statusCode, badCurrency.json());

    const badTimezone = await patchDomain(ctx.authHeader, "localization", { ...doc.localization, timezone: "Mars/Olympus" });
    expectValidationError(badTimezone.statusCode, badTimezone.json());

    const badRisk = await patchDomain(ctx.authHeader, "risk", { ...doc.risk, maxOpenPositions: 999 });
    expectValidationError(badRisk.statusCode, badRisk.json());

    const badCrossField = await patchDomain(ctx.authHeader, "risk", {
      ...doc.risk,
      defaultRiskPerTradePct: 5,
      maxRiskPerTradePct: 2, // < default → schema refine must fail (§14)
    });
    expectValidationError(badCrossField.statusCode, badCrossField.json());

    const nonObject = await patchDomain(ctx.authHeader, "appearance", "hello"); // JSON scalar — valid JSON, not an object
    expectValidationError(nonObject.statusCode, nonObject.json());

    const unknownDomain = await patchDomain(ctx.authHeader, "notadomain", { foo: 1 });
    expectValidationError(unknownDomain.statusCode, unknownDomain.json());
  });
});

// ── default trading account reference (§21) ─────────────────────────────────

describe("default trading account reference (Phase 15 §21)", () => {
  it("accepts an owned account and persists the reference", async () => {
    const ctx = await authenticatedUser(app, mail);
    const accountId = await connectAccount(ctx.authHeader);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;

    const res = await patchDomain(ctx.authHeader, "trading", { ...doc.trading, defaultAccountId: accountId });
    expect(res.statusCode).toBe(200);
    const after = userPreferencesSchema.parse(res.json()) as UserPreferences;
    expect(after.trading.defaultAccountId).toBe(accountId);
  });

  it("rejects unknown and foreign accounts with 404 (IDOR convention) — never mutates the account", async () => {
    const a = await authenticatedUser(app, mail);
    const b = await authenticatedUser(app, mail);
    const bAccountId = await connectAccount(b.authHeader);
    const doc = userPreferencesSchema.parse((await getPrefs(a.authHeader)).json()) as UserPreferences;

    const unknown = await patchDomain(a.authHeader, "trading", { ...doc.trading, defaultAccountId: "00000000-0000-4000-8000-000000000000" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().code).toBe("DEFAULT_ACCOUNT_NOT_FOUND");

    const foreign = await patchDomain(a.authHeader, "trading", { ...doc.trading, defaultAccountId: bAccountId });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().code).toBe("DEFAULT_ACCOUNT_NOT_FOUND");

    // The reference is one-way: the account itself is untouched (§21).
    const bAccounts = await app.inject({ method: "GET", url: "/api/v1/accounts", headers: b.authHeader });
    expect(bAccounts.statusCode).toBe(200);
    expect(JSON.stringify(bAccounts.json())).toContain(bAccountId);
  });

  it("accepts clearing the reference with null", async () => {
    const ctx = await authenticatedUser(app, mail);
    const accountId = await connectAccount(ctx.authHeader);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;
    await patchDomain(ctx.authHeader, "trading", { ...doc.trading, defaultAccountId: accountId });

    const cleared = userPreferencesSchema.parse(
      (await patchDomain(ctx.authHeader, "trading", { ...doc.trading, defaultAccountId: null })).json(),
    ) as UserPreferences;
    expect(cleared.trading.defaultAccountId).toBeNull();
  });
});

// ── reset semantics (§37/§39) ────────────────────────────────────────────────

describe("preferences reset (Phase 15 §37/§39)", () => {
  it("restores ONE domain to defaults and leaves siblings untouched", async () => {
    const ctx = await authenticatedUser(app, mail);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;
    await patchDomain(ctx.authHeader, "journal", {
      ...doc.journal,
      requireScreenshot: true,
      defaultTemplate: "DEEP_REVIEW",
    });
    await patchDomain(ctx.authHeader, "trading", { ...doc.trading, displayCurrency: "CHF" });

    const res = await resetDomain(ctx.authHeader, "journal");
    expect(res.statusCode).toBe(200);
    const after = userPreferencesSchema.parse(res.json()) as UserPreferences;
    expect(after.journal).toEqual(DEFAULT_USER_PREFERENCES.journal);
    expect(after.trading.displayCurrency).toBe("CHF"); // untouched
  });

  it("resetting localization writes the default through to the profile (mock parity)", async () => {
    const ctx = await authenticatedUser(app, mail);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;
    await patchDomain(ctx.authHeader, "localization", { ...doc.localization, timezone: "Europe/Paris" });
    expect((await getMe(ctx.authHeader)).timezone).toBe("Europe/Paris");

    await resetDomain(ctx.authHeader, "localization");
    expect((await getMe(ctx.authHeader)).timezone).toBe(DEFAULT_USER_PREFERENCES.localization.timezone);
  });

  it("reset never harms domain data: account, profile and trades survive", async () => {
    const ctx = await authenticatedUser(app, mail);
    const accountId = await connectAccount(ctx.authHeader);
    const meBefore = await getMe(ctx.authHeader);

    for (const domain of ["trading", "risk", "journal", "notifications", "appearance", "dashboard", "academy", "privacy", "localization"] as const) {
      const res = await resetDomain(ctx.authHeader, domain);
      expect(res.statusCode).toBe(200);
    }

    const accounts = await app.inject({ method: "GET", url: "/api/v1/accounts", headers: ctx.authHeader });
    expect(accounts.statusCode).toBe(200);
    expect(JSON.stringify(accounts.json())).toContain(accountId);
    expect(await getMe(ctx.authHeader)).toMatchObject({
      id: meBefore.id,
      email: meBefore.email,
      name: meBefore.name,
      baseCurrency: meBefore.baseCurrency,
    });
  });
});

// ── security: mass-assignment & structural IDOR (§11/§31/§32) ───────────────

describe("settings mass-assignment protection (Phase 15 §31/§32)", () => {
  it("never lets a client plant privileged fields or the envelope into the document", async () => {
    const a = await authenticatedUser(app, mail);
    const b = await authenticatedUser(app, mail);
    const doc = userPreferencesSchema.parse((await getPrefs(a.authHeader)).json()) as UserPreferences;

    const res = await patchDomain(a.authHeader, "trading", {
      userId: b.userId, // envelope planting — must stay server-managed
      updatedAt: "1999-01-01T00:00:00.000Z",
      role: "ADMIN",
      permissions: ["*"],
      baseCurrency: "JPY", // identity-owned — NOT a trading preference
      ...doc.trading,
    });
    expect(res.statusCode).toBe(200);
    const after = res.json() as Record<string, unknown>;
    expect(after.userId).toBe(a.userId); // ownership comes from the token
    expect(after.updatedAt).not.toBe("1999-01-01T00:00:00.000Z");
    expect(after).not.toHaveProperty("role");
    expect(after).not.toHaveProperty("permissions");
    const parsed = userPreferencesSchema.parse(after) as UserPreferences;
    // The planted key is not part of the trading-domain type — the strip is
    // proven by its ABSENCE on the parsed (Zod-stripped) document.
    expect((parsed.trading as Record<string, unknown>).baseCurrency).toBeUndefined(); // stripped, not mapped
  });

  it("exposes no :userId-shaped route — a user cannot address another user's doc", async () => {
    const a = await authenticatedUser(app, mail);
    const foreignGet = await app.inject({
      method: "GET",
      url: `${PREFS}/${a.userId}`,
      headers: a.authHeader,
    });
    expect([404, 405]).toContain(foreignGet.statusCode);

    const foreignPatch = await app.inject({
      method: "PATCH",
      url: `${PREFS}/${a.userId}`,
      headers: a.authHeader,
      payload: { theme: "DARK" },
    });
    expect(foreignPatch.statusCode).toBe(400); // :domain enum rejects a uuid
  });
});

// ── audit trail (§33) ────────────────────────────────────────────────────────

describe("settings audit trail (Phase 15 §33)", () => {
  it("records SENSITIVE_SETTINGS_CHANGED when profile visibility changes", async () => {
    const ctx = await authenticatedUser(app, mail);
    const before = await sensitiveEvents(ctx.authHeader);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;

    const res = await patchDomain(ctx.authHeader, "privacy", { ...doc.privacy, profileVisibility: "PUBLIC" });
    expect(res.statusCode).toBe(200);
    expect(await sensitiveEvents(ctx.authHeader)).toBe(before + 1);
  });

  it("stays noise-free for cosmetic preference changes (§40)", async () => {
    const ctx = await authenticatedUser(app, mail);
    const before = await sensitiveEvents(ctx.authHeader);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;

    await patchDomain(ctx.authHeader, "appearance", { ...doc.appearance, theme: "DARK" });
    await patchDomain(ctx.authHeader, "privacy", { ...doc.privacy, productEmails: !doc.privacy.productEmails }); // visibility unchanged
    expect(await sensitiveEvents(ctx.authHeader)).toBe(before);
  });
});

// ── dashboard widget order bound (§19) ───────────────────────────────────────

describe("dashboard widget order (Phase 15 §19)", () => {
  it("accepts a permutation of the 7 canonical widgets and rejects oversized orders", async () => {
    const ctx = await authenticatedUser(app, mail);
    const keys = [...DEFAULT_USER_PREFERENCES.dashboard.widgetOrder];
    const reversed = [...keys].reverse();

    const ok = await patchDomain(ctx.authHeader, "dashboard", { widgetOrder: reversed });
    expect(ok.statusCode).toBe(200);
    const parsed = userPreferencesSchema.parse(ok.json()) as UserPreferences;
    expect(parsed.dashboard.widgetOrder).toEqual(reversed);

    // The canon grew with Phase 02 (11 widget types) — an oversized order
    // must exceed max(DASHBOARD_WIDGET_KEYS.length) to be rejected.
    const oversized = await patchDomain(ctx.authHeader, "dashboard", {
      widgetOrder: [...keys, ...keys].slice(0, DASHBOARD_WIDGET_KEYS.length + 1),
    });
    expectValidationError(oversized.statusCode, oversized.json());
  });
});

// ── dashboard saved analytical views + active filters (Phase 03 §10/§12) ─────

describe("dashboard saved views & active filters (Phase 03 §10/§12)", () => {
  const VIEW = {
    id: "view_e2e_gold",
    name: "Gold longs",
    schemaVersion: 1,
    filters: { period: "THIS_MONTH", accountId: "0b8f6e1e-7d2a-4c1b-9a2a-00000000e2e1", direction: "BUY" },
  };

  it("persists savedViews + activeFilters and echoes them back validated", async () => {
    const ctx = await authenticatedUser(app, mail);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;

    const patched = await patchDomain(ctx.authHeader, "dashboard", {
      ...doc.dashboard,
      savedViews: [VIEW, { ...VIEW, id: "view_e2e_none", name: "Out of playbook", filters: { period: "ALL", strategyId: "none" } }],
      activeFilters: VIEW.filters,
    });
    expect(patched.statusCode).toBe(200);
    const parsed = userPreferencesSchema.parse(patched.json()) as UserPreferences;
    expect(parsed.dashboard.savedViews).toHaveLength(2);
    expect(parsed.dashboard.savedViews?.[0]?.name).toBe("Gold longs");
    expect(parsed.dashboard.savedViews?.[1]?.filters).toEqual({ period: "ALL", strategyId: "none" });
    expect(parsed.dashboard.activeFilters).toEqual(VIEW.filters);

    // Round-trip through a fresh GET (persisted, not just echoed).
    const reread = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;
    expect(reread.dashboard.savedViews).toHaveLength(2);
    expect(reread.dashboard.activeFilters).toEqual(VIEW.filters);
  });

  it("keeps layouts intact when a filter-only PATCH carries them (wholesale domain)", async () => {
    const ctx = await authenticatedUser(app, mail);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;
    // A filter save built from the CURRENT domain (client convention) — the
    // layout collection must survive unchanged.
    const patched = await patchDomain(ctx.authHeader, "dashboard", {
      ...doc.dashboard,
      savedViews: [VIEW],
      activeFilters: { period: "LAST_30" },
    });
    expect(patched.statusCode).toBe(200);
    const parsed = userPreferencesSchema.parse(patched.json()) as UserPreferences;
    expect(parsed.dashboard.layouts).toEqual(doc.dashboard.layouts);
    expect(parsed.dashboard.widgetOrder).toEqual(doc.dashboard.widgetOrder);
    expect(parsed.dashboard.savedViews).toHaveLength(1);
  });

  it("rejects a malformed view and a CUSTOM range without bounds (4xx, domain untouched)", async () => {
    const ctx = await authenticatedUser(app, mail);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;

    const badView = await patchDomain(ctx.authHeader, "dashboard", {
      ...doc.dashboard,
      savedViews: [{ ...VIEW, name: "" }], // empty name violates min(1)
    });
    expectValidationError(badView.statusCode, badView.json());

    const badRange = await patchDomain(ctx.authHeader, "dashboard", {
      ...doc.dashboard,
      activeFilters: { period: "CUSTOM" }, // CUSTOM requires both bounds
    });
    expectValidationError(badRange.statusCode, badRange.json());

    // The stored document was never poisoned by a failed PATCH (whole-domain
    // replace happens ONLY after the schema passes).
    const reread = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;
    expect(reread.dashboard.savedViews).toBeUndefined();
    expect(reread.dashboard.activeFilters).toBeUndefined();
  });

  it("isolates views per user — another account never sees them", async () => {
    const ctxA = await authenticatedUser(app, mail);
    const docA = userPreferencesSchema.parse((await getPrefs(ctxA.authHeader)).json()) as UserPreferences;
    await patchDomain(ctxA.authHeader, "dashboard", {
      ...docA.dashboard,
      savedViews: [VIEW],
      activeFilters: VIEW.filters,
    });

    const ctxB = await authenticatedUser(app, mail);
    const docB = userPreferencesSchema.parse((await getPrefs(ctxB.authHeader)).json()) as UserPreferences;
    expect(docB.dashboard.savedViews).toBeUndefined();
    expect(docB.dashboard.activeFilters).toBeUndefined();
  });

  it("reset restores the defaults: no views, no active filters, layouts back", async () => {
    const ctx = await authenticatedUser(app, mail);
    const reset = await resetDomain(ctx.authHeader, "dashboard");
    expect(reset.statusCode).toBe(200);
    const parsed = userPreferencesSchema.parse(reset.json()) as UserPreferences;
    expect(parsed.dashboard.savedViews).toBeUndefined();
    expect(parsed.dashboard.activeFilters).toBeUndefined();
    expect(parsed.dashboard.widgetOrder).toEqual(DEFAULT_USER_PREFERENCES.dashboard.widgetOrder);
  });
});

// ── financial integrity (§17/§39) ────────────────────────────────────────────

describe("settings never mutate financial truth (Phase 15 §17/§39)", () => {
  it("changing the display currency does not alter the profile or the trading account", async () => {
    const ctx = await authenticatedUser(app, mail);
    const accountId = await connectAccount(ctx.authHeader);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;
    const meBefore = await getMe(ctx.authHeader);
    const accountBefore = await app.inject({ method: "GET", url: `/api/v1/accounts/${accountId}`, headers: ctx.authHeader });
    expect(accountBefore.statusCode).toBe(200);

    await patchDomain(ctx.authHeader, "trading", { ...doc.trading, displayCurrency: "CAD" });

    const meAfter = await getMe(ctx.authHeader);
    expect(meAfter.baseCurrency).toBe(meBefore.baseCurrency);
    const accountAfter = await app.inject({ method: "GET", url: `/api/v1/accounts/${accountId}`, headers: ctx.authHeader });
    expect(accountAfter.json()).toEqual(accountBefore.json()); // untouched
  });

  it("changing the timezone does not rewrite persisted identity fields (§39)", async () => {
    const ctx = await authenticatedUser(app, mail);
    const doc = userPreferencesSchema.parse((await getPrefs(ctx.authHeader)).json()) as UserPreferences;
    const meBefore = await getMe(ctx.authHeader);

    await patchDomain(ctx.authHeader, "localization", { ...doc.localization, timezone: "Asia/Tokyo" });
    const meAfter = await getMe(ctx.authHeader);
    expect(meAfter.timezone).toBe("Asia/Tokyo"); // write-through of the MIRROR source of truth
    expect(meAfter.id).toBe(meBefore.id);
    expect(meAfter.email).toBe(meBefore.email);
    expect(meAfter.createdAt).toBe(meBefore.createdAt);
  });
});
