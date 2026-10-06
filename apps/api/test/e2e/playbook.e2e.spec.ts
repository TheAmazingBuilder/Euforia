/**
 * e2e — Professional Playbook (B10) over the REAL AppModule + real database:
 * strategy CRUD with server-side versioning, duplicate-as-draft, FK-RESTRICT
 * deletes, setups/checklists/rules CRUD, template library + instantiate, and
 * the overview/stats/insights aggregates.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  playbookOverviewResponseSchema,
  playbookRulesResponseSchema,
  playbookTemplatesResponseSchema,
  setupsResponseSchema,
  strategyVersionsResponseSchema,
  strategiesResponseSchema,
  checklistsResponseSchema,
  setupInsightsResponseSchema,
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

function auth(user: { authHeader: Record<string, string> }) {
  return user.authHeader;
}

describe("strategies + versioning (B10)", () => {
  it("create → definition edit bumps the version and freezes a snapshot", async () => {
    const user = await authenticatedUser(app, mail);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      headers: auth(user),
      payload: {
        name: "  Breakout NY  ",
        description: "NY open breakouts on levels that held twice.",
        entryRules: "15m body close beyond the level.",
        status: "ACTIVE",
        tags: ["breakout"],
      },
    });
    expect(created.statusCode).toBe(201);
    const strategy = created.json() as { id: string; name: string; version: number };
    expect(strategy.name).toBe("Breakout NY"); // trimmed
    expect(strategy.version).toBe(1);

    // Lifecycle fields mutate IN PLACE (no version bump).
    const recolor = await app.inject({
      method: "PATCH",
      url: `/api/v1/strategies/${strategy.id}`,
      headers: auth(user),
      payload: { color: "VIOLET", status: "PAUSED" },
    });
    expect(recolor.json()).toMatchObject({ version: 1, status: "PAUSED" });

    // A definition edit freezes v1 and bumps to v2.
    const edited = await app.inject({
      method: "PATCH",
      url: `/api/v1/strategies/${strategy.id}`,
      headers: auth(user),
      payload: { entryRules: "15m body close + retest within 6 candles." },
    });
    expect(edited.json()).toMatchObject({ version: 2 });

    const versions = strategyVersionsResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/strategies/${strategy.id}/versions`,
          headers: auth(user),
        })
      ).json(),
    );
    expect(versions.currentVersion).toBe(2);
    expect(versions.versions).toHaveLength(1);
    expect(versions.versions[0]).toMatchObject({ version: 1, strategyId: strategy.id });
    // The frozen snapshot kept the ORIGINAL entry rules.
    const snapshot = versions.versions[0]!.snapshot as { entryRules: string };
    expect(snapshot.entryRules).toBe("15m body close beyond the level.");

    // Duplicated copy is a fresh DRAFT with a reset grade.
    const copy = await app.inject({
      method: "POST",
      url: `/api/v1/strategies/${strategy.id}/duplicate`,
      headers: auth(user),
    });
    expect(copy.statusCode).toBe(201);
    expect(copy.json()).toMatchObject({ name: "Breakout NY (copy)", status: "DRAFT", grade: null, version: 1 });
  });

  it("delete is FK-RESTRICT while trades are attached (409)", async () => {
    const user = await authenticatedUser(app, mail);
    const connected = await app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: auth(user),
      payload: {
        providerId: "MOCK",
        environment: "DEMO",
        externalAccountId: `77${Math.random().toString(36).slice(2, 8)}`,
        credentials: { method: "API_KEY", secret: "mock-api-key-playbook" },
      },
    });
    const accountId = (connected.json() as { account: { id: string } }).account.id;
    const list = await app.inject({ method: "GET", url: "/api/v1/instruments", headers: auth(user) });
    const instrument = (list.json() as { instruments: Array<{ id: string; symbol: string }> })
      .instruments.find((i) => i.symbol === "EURUSD")!;

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      headers: auth(user),
      payload: { name: "Traded strategy" },
    });
    const strategyId = (created.json() as { id: string }).id;

    const traded = await app.inject({
      method: "POST",
      url: "/api/v1/trades",
      headers: auth(user),
      payload: {
        variant: "open",
        accountId,
        instrumentId: instrument.id,
        direction: "BUY",
        entryPrice: "1.0850",
        size: { mode: "quantity", quantity: "0.10" },
        strategyId,
      },
    });
    expect(traded.statusCode).toBe(201);

    const forbidden = await app.inject({
      method: "DELETE",
      url: `/api/v1/strategies/${strategyId}`,
      headers: auth(user),
    });
    expect(forbidden.statusCode).toBe(409);
  });
});

describe("setups, checklists, rules (B10)", () => {
  it("setups CRUD with unknown-strategy 422 and name trimming", async () => {
    const user = await authenticatedUser(app, mail);
    const badSetup = await app.inject({
      method: "POST",
      url: "/api/v1/setups",
      headers: auth(user),
      payload: { strategyId: "00000000-0000-4000-8000-00000000dead", name: "Ghost setup" },
    });
    expect(badSetup.statusCode).toBe(422);

    const strategy = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      headers: auth(user),
      payload: { name: "Setup host" },
    });
    const strategyId = (strategy.json() as { id: string }).id;

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/setups",
      headers: auth(user),
      payload: { strategyId, name: "  Breakout + Retest  ", trigger: "15m close + retest." },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: "Breakout + Retest", strategyId });

    const list = setupsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/setups", headers: auth(user) })).json(),
    );
    expect(list.setups).toHaveLength(1);
  });

  it("checklists CRUD (global or strategy-scoped)", async () => {
    const user = await authenticatedUser(app, mail);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/checklists",
      headers: auth(user),
      payload: {
        name: "Pre-trade checklist",
        items: [
          { id: "chk1-1", label: "HTF aligned", required: true },
          { id: "chk1-2", label: "No red news in 30 min", required: true },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const checklist = created.json() as { id: string; strategyId: string | null };
    expect(checklist.strategyId).toBeNull();

    const list = checklistsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/checklists", headers: auth(user) })).json(),
    );
    expect(list.checklists).toHaveLength(1);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/checklists/${checklist.id}`,
      headers: auth(user),
    });
    expect(removed.json()).toEqual({ ok: true });
  });

  it("rules CRUD: a STRATEGY-scope rule needs a strategy (422)", async () => {
    const user = await authenticatedUser(app, mail);
    const badRule = await app.inject({
      method: "POST",
      url: "/api/v1/playbook/rules",
      headers: auth(user),
      payload: { title: "Scoped but dangling", detail: "No strategy attached.", category: "ENTRY", scope: "STRATEGY" },
    });
    expect(badRule.statusCode).toBe(422);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/playbook/rules",
      headers: auth(user),
      payload: {
        title: "Never chase",
        detail: "If the entry moved more than 0.5 × ATR without you — skip.",
        category: "ENTRY",
        scope: "GLOBAL",
        evaluatable: false,
      },
    });
    expect(created.statusCode).toBe(201);
    const rule = created.json() as { id: string; title: string };

    const list = playbookRulesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/playbook/rules", headers: auth(user) })).json(),
    );
    expect(list.rules).toHaveLength(1);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/playbook/rules/${rule.id}`,
      headers: auth(user),
    });
    expect(removed.json()).toEqual({ ok: true });
  });
});

describe("templates + aggregates (B10)", () => {
  it("template library serves cards; instantiate creates a DRAFT", async () => {
    const user = await authenticatedUser(app, mail);
    const templates = playbookTemplatesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/playbook/templates", headers: auth(user) })).json(),
    );
    expect(templates.templates.length).toBeGreaterThanOrEqual(1);

    const instantiated = await app.inject({
      method: "POST",
      url: "/api/v1/playbook/templates/instantiate",
      headers: auth(user),
      payload: { key: templates.templates[0]!.key },
    });
    expect(instantiated.statusCode).toBe(201);
    expect(instantiated.json()).toMatchObject({ status: "DRAFT" });

    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/playbook/templates/instantiate",
      headers: auth(user),
      payload: { key: "not-a-template" },
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("overview + stats + insights serve validated aggregates", async () => {
    const user = await authenticatedUser(app, mail);
    const overview = playbookOverviewResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/playbook/overview", headers: auth(user) })).json(),
    );
    expect(overview.counts.totalStrategies).toBeGreaterThanOrEqual(0);
    expect(overview.compliance.windowSize).toBe(20);

    const stats = (await app.inject({
      method: "GET",
      url: "/api/v1/strategies/stats",
      headers: auth(user),
    })).json() as { stats: unknown[]; underperforming: object | null };
    expect(Array.isArray(stats.stats)).toBe(true);

    const insights = setupInsightsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/setups/insights", headers: auth(user) })).json(),
    );
    expect(Array.isArray(insights.insights)).toBe(true);

    const strategies = strategiesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/strategies", headers: auth(user) })).json(),
    );
    expect(Array.isArray(strategies.strategies)).toBe(true);
  });

  it("401 without a token", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/playbook/overview" });
    expect(response.statusCode).toBe(401);
  });
});
