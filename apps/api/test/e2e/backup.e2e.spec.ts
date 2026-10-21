/**
 * e2e — Backup (B2) over the REAL AppModule + real database: the full
 * authored-data export snapshot (journal trades + playbook strategies +
 * tags in wire shapes), the validated import (replace trades, merge
 * strategies + tags by id), re-ownership to the importing user, and the
 * schema-version gate.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { backupPayloadSchema } from "../../src/shared/contracts";
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

async function connectAccount(user: { authHeader: Record<string, string> }) {
  const connected = await app.inject({
    method: "POST",
    url: "/api/v1/accounts",
    headers: auth(user),
    payload: {
      providerId: "MOCK",
      environment: "DEMO",
      externalAccountId: `77${Math.random().toString(36).slice(2, 8)}`,
      credentials: { method: "API_KEY", secret: "mock-api-key-backup" },
    },
  });
  expect(connected.statusCode).toBe(201);
  return (connected.json() as { account: { id: string } }).account.id;
}

describe("backup (B2)", () => {
  it("401 without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/export/backup" });
    expect(res.statusCode).toBe(401);
  });

  it("empty user exports a schema-valid snapshot; the import gate rejects bad payloads", async () => {
    const user = await authenticatedUser(app, mail);
    const exported = (
      await app.inject({ method: "GET", url: "/api/v1/export/backup", headers: auth(user) })
    ).json();
    const payload = backupPayloadSchema.parse(exported);
    expect(payload.app).toBe("cosmoz");
    expect(payload.schemaVersion).toBe(1);
    expect(payload.trades).toEqual([]);
    expect(payload.strategies).toEqual([]);
    expect(payload.tags).toEqual([]);

    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/import/backup",
      headers: auth(user),
      payload: { ...payload, app: "not-cosmoz" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("same-user restore replaces trades and preserves ids; cross-user merge re-owns", async () => {
    const userA = await authenticatedUser(app, mail);
    await connectAccount(userA);
    // The connect triggers the initial provider sync (demo history) — wait
    // for the journal trades to land so the backup sees a stable dataset.
    let tradeCount = 0;
    for (let i = 0; i < 50; i += 1) {
      const list = (
        await app.inject({ method: "GET", url: "/api/v1/trades", headers: auth(userA) })
      ).json() as { trades: unknown[] };
      tradeCount = list.trades.length;
      if (tradeCount > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(tradeCount).toBeGreaterThanOrEqual(1);

    const strategy = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      headers: auth(userA),
      payload: { name: "Backup strategy", status: "ACTIVE" },
    });
    expect(strategy.statusCode).toBe(201);
    const tag = await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      headers: auth(userA),
      payload: { name: "BackupTag" },
    });
    expect(tag.statusCode).toBe(201);

    const exported = backupPayloadSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/export/backup", headers: auth(userA) })).json(),
    );
    expect(exported.trades.length).toBeGreaterThanOrEqual(1);
    expect(exported.strategies).toHaveLength(1);
    expect(exported.strategies[0]!.name).toBe("Backup strategy");
    expect(exported.tags.some((t) => t.name === "BackupTag")).toBe(true);
    const originalIds = exported.trades.map((t) => t.id);

    // SAME-USER restore: trades are replaced, every id survives (the old
    // rows were just deleted), strategies/tags merge as no-ops.
    const restore = await app.inject({
      method: "POST",
      url: "/api/v1/import/backup",
      headers: auth(userA),
      payload: exported,
    });
    expect(restore.statusCode).toBe(200);
    const restored = restore.json() as { imported: { trades: number; strategies: number; tags: number } };
    expect(restored.imported.trades).toBe(exported.trades.length);
    expect(restored.imported.strategies).toBe(0);
    expect(restored.imported.tags).toBe(0);

    const aReExport = backupPayloadSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/export/backup", headers: auth(userA) })).json(),
    );
    expect(aReExport.trades.map((t) => t.id)).toEqual(originalIds);

    // CROSS-USER: user B imports A's snapshot — rows are re-owned and the
    // merge reports only what was actually added.
    const userB = await authenticatedUser(app, mail);
    await connectAccount(userB);
    const beforeB = (
      await app.inject({ method: "GET", url: "/api/v1/trades", headers: auth(userB) })
    ).json() as { trades: Array<{ id: string }> };
    void beforeB; // the mock provider's initial sync may still be landing —
    // trade counts cross-user are not deterministic; the merge of
    // strategies/tags and the re-ownership are what this flow asserts.
    const importResponse = await app.inject({
      method: "POST",
      url: "/api/v1/import/backup",
      headers: auth(userB),
      payload: exported,
    });
    expect(importResponse.statusCode).toBe(200);
    const imported = importResponse.json() as { imported: { trades: number; strategies: number; tags: number } };
    expect(imported.imported.trades).toBe(exported.trades.length);
    expect(imported.imported.strategies).toBe(1);
    expect(imported.imported.tags).toBe(1);

    // Repeat import merges: no strategy/tag duplicates.
    const repeatResponse = await app.inject({
      method: "POST",
      url: "/api/v1/import/backup",
      headers: auth(userB),
      payload: exported,
    });
    expect(repeatResponse.statusCode).toBe(200);
    const repeat = repeatResponse.json() as { imported: { trades: number; strategies: number; tags: number } };
    expect(repeat.imported.strategies).toBe(0);
    expect(repeat.imported.tags).toBe(0);

    const bTrades = (
      await app.inject({ method: "GET", url: "/api/v1/trades", headers: auth(userB) })
    ).json() as { trades: Array<{ userId: string; pnlNet: string }> };
    // Every journal trade B owns after the import is B-owned (no leak).
    expect(bTrades.trades.every((t) => t.userId === userB.userId)).toBe(true);
    // The imported payload's strategies landed under B's ownership.
    const bStrategies = (
      await app.inject({ method: "GET", url: "/api/v1/strategies", headers: auth(userB) })
    ).json() as { strategies: Array<{ name: string }> };
    expect(bStrategies.strategies.some((s) => s.name === "Backup strategy")).toBe(true);
  });
});
