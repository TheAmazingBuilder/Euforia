/**
 * e2e — OCR V2 ops (V2 spec §28/§30/§32/§39/§62): reprocess (fresh
 * recognition from the same asset — original never mutated), screenshot
 * collections (owner-scoped organization layer), analytics extensions
 * (correction rate + platform/type distributions) and history filters.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";
import {
  ocrCollectionSchema,
  ocrRecognitionPageSchema,
  ocrRecognitionResponseSchema,
} from "../../src/shared/contracts";
import { makeOcrFixturePng, pngDataUrl } from "../helpers/ocr-fixtures";

let app: NestFastifyApplication;
let mail: MailCapture;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
});

afterAll(async () => {
  await app?.close();
});

interface UserCtx {
  userId: string;
  authHeader: Record<string, string>;
}

async function user(): Promise<UserCtx> {
  const ctx = await authenticatedUser(app, mail);
  return { userId: ctx.userId, authHeader: ctx.authHeader };
}

async function upload(a: UserCtx, nonce: number) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/ocr/recognitions",
    headers: { ...a.authHeader, "content-type": "application/json" },
    payload: {
      imageDataUrl: pngDataUrl(makeOcrFixturePng({ nonce })),
      requestedProfile: "TRADE_SUMMARY",
    },
  });
  expect(res.statusCode).toBe(201);
  return ocrRecognitionResponseSchema.parse(res.json()).recognition;
}

// ── V2 §32/§39 — reprocess ───────────────────────────────────────────────────

describe("reprocess — a fresh recognition from the same asset", () => {
  it("creates a NEW recognition linked by reprocessedFrom, original untouched", async () => {
    const a = await user();
    const original = await upload(a, 210);
    const originalFieldsJson = JSON.stringify(original.fields);

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${original.id}/reprocess`,
      headers: a.authHeader,
    });
    expect(res.statusCode).toBe(201);
    const reprocessed = ocrRecognitionResponseSchema.parse(res.json()).recognition;

    // A genuinely NEW row — the original is never mutated (§33).
    expect(reprocessed.id).not.toBe(original.id);
    expect(reprocessed.asset.id).toBe(original.asset.id);
    expect(reprocessed.reprocessedFrom).toBe(original.id);
    expect(JSON.stringify(reprocessed.fields)).toBe(originalFieldsJson); // deterministic engine

    // The original row still exists, unchanged.
    const reloaded = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/recognitions/${original.id}`,
      headers: a.authHeader,
    });
    expect(reloaded.statusCode).toBe(200);
    const originalAgain = ocrRecognitionResponseSchema.parse(reloaded.json()).recognition;
    expect(originalAgain.reprocessedFrom).toBeNull();

    // A SECOND reprocess is a fresh, legitimate run of the current pipeline
    // (reprocess idempotency rides the rate limit, not the payload — the
    // user may re-run as often as the limit allows, §32/§39).
    const second = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${original.id}/reprocess`,
      headers: a.authHeader,
    });
    expect(second.statusCode).toBe(201);
    const secondRow = ocrRecognitionResponseSchema.parse(second.json()).recognition;
    expect(secondRow.id).not.toBe(reprocessed.id);
    expect(secondRow.reprocessedFrom).toBe(original.id);
    expect(secondRow.asset.id).toBe(original.asset.id);
  });

  it("is owner-scoped and honest about unknown ids (§ IDOR)", async () => {
    const a = await user();
    const b = await user();
    const recognition = await upload(a, 211);

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/recognitions/${recognition.id}/reprocess`,
      headers: b.authHeader,
    });
    expect(res.statusCode).toBe(404);

    const missing = await app.inject({
      method: "POST",
      url: "/api/v1/ocr/recognitions/00000000-0000-4000-8000-0000000000cc/reprocess",
      headers: a.authHeader,
    });
    expect(missing.statusCode).toBe(404);
  });
});

// ── V2 §28 — screenshot collections ──────────────────────────────────────────

describe("screenshot collections — named organization over recognitions", () => {
  it("creates, fills, trims and deletes a collection (recognitions survive)", async () => {
    const a = await user();
    const r1 = await upload(a, 220);
    const r2 = await upload(a, 221);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/ocr/collections",
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { name: "Gold Scalping" },
    });
    expect(createRes.statusCode).toBe(201);
    const collection = ocrCollectionSchema.parse(createRes.json().collection);
    expect(collection.name).toBe("Gold Scalping");

    // Duplicate name → 409 (unique per owner).
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/ocr/collections",
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { name: "Gold Scalping" },
    });
    expect(duplicate.statusCode).toBe(409);

    // Add two recognitions; a duplicate add stays idempotent.
    for (const id of [r1.id, r2.id, r1.id]) {
      const addRes = await app.inject({
        method: "POST",
        url: `/api/v1/ocr/collections/${collection.id}/items`,
        headers: { ...a.authHeader, "content-type": "application/json" },
        payload: { recognitionId: id },
      });
      expect(addRes.statusCode).toBe(201);
    }
    const listed = ocrCollectionSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/ocr/collections/${collection.id}`,
          headers: a.authHeader,
        })
      ).json().collection,
    );
    expect(listed.items).toHaveLength(2);

    // Remove one item.
    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/ocr/collections/${collection.id}/items/${r2.id}`,
      headers: a.authHeader,
    });
    expect(removed.statusCode).toBe(200);
    const trimmed = ocrCollectionSchema.parse(removed.json().collection);
    expect(trimmed.items).toHaveLength(1);

    // Delete the collection — the recognitions are untouched (§28).
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/ocr/collections/${collection.id}`,
      headers: a.authHeader,
    });
    expect(deleted.statusCode).toBe(200);
    const survivor = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/recognitions/${r1.id}`,
      headers: a.authHeader,
    });
    expect(survivor.statusCode).toBe(200);
  });

  it("404s foreign collections and foreign recognitions (§ IDOR)", async () => {
    const a = await user();
    const b = await user();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/ocr/collections",
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { name: "Private" },
    });
    const collection = ocrCollectionSchema.parse(created.json().collection);

    const foreignGet = await app.inject({
      method: "GET",
      url: `/api/v1/ocr/collections/${collection.id}`,
      headers: b.authHeader,
    });
    expect(foreignGet.statusCode).toBe(404);

    const bRecognition = await upload(b, 222);
    const foreignItem = await app.inject({
      method: "POST",
      url: `/api/v1/ocr/collections/${collection.id}/items`,
      headers: { ...a.authHeader, "content-type": "application/json" },
      payload: { recognitionId: bRecognition.id },
    });
    expect(foreignItem.statusCode).toBe(404);
  });
});

// ── V2 §30/§62 — analytics extensions + history filters ──────────────────────

describe("analytics extensions and history filters", () => {
  it("reports platform/type distributions, correction rate, and filters by platform", async () => {
    const a = await user();
    await upload(a, 230);
    await upload(a, 231);

    const analyticsRes = await app.inject({
      method: "GET",
      url: "/api/v1/ocr/analytics?days=30",
      headers: a.authHeader,
    });
    expect(analyticsRes.statusCode).toBe(200);
    const analytics = analyticsRes.json();
    expect(analytics.correctionRate === null || typeof analytics.correctionRate === "number").toBe(true);
    expect(Array.isArray(analytics.platformDistribution)).toBe(true);
    expect(Array.isArray(analytics.typeDistribution)).toBe(true);
    // The deterministic engine always classifies MT5.
    const platforms = analytics.platformDistribution.map((entry: { platform: string }) => entry.platform);
    expect(platforms).toContain("MT5");

    // Server-side platform filter (V2 §62).
    const filtered = await app.inject({
      method: "GET",
      url: "/api/v1/ocr/recognitions?platform=MT5&limit=20",
      headers: a.authHeader,
    });
    expect(filtered.statusCode).toBe(200);
    const page = ocrRecognitionPageSchema.parse(filtered.json());
    // At least the classified rows match; a scenario-bucket member may be
    // honestly FAILED (no classification) and is correctly excluded.
    expect(page.items.length).toBeGreaterThanOrEqual(1);

    const empty = await app.inject({
      method: "GET",
      url: "/api/v1/ocr/recognitions?platform=CTRADER&limit=20",
      headers: a.authHeader,
    });
    expect(ocrRecognitionPageSchema.parse(empty.json()).items).toHaveLength(0);
  });
});
