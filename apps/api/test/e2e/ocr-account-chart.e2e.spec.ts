/**
 * e2e — Account & Chart profiles (Recognition V1.1) against the REAL
 * AppModule, the REAL database and the DETERMINISTIC mock engine (§57):
 *
 *   - ACCOUNT_POSITION: upload → REVIEW_REQUIRED with account fields +
 *     position candidate; confirm → CONFIRMED with NO trade (explicit
 *     TRADE_IMPORT_SKIPPED_PROFILE warning — never a misleading INCOMPLETE);
 *   - CHART_ANALYSIS: upload → REVIEW_REQUIRED with chart fields; confirm →
 *     CONFIRMED, no trade, corrections stored;
 *   - idempotency is profile-scoped: the same image under two profiles is
 *     TWO recognitions (§32).
 *
 * Real pixel reading belongs to the FastAPI sidecar (pytest suite) — the
 * mock documents PIPELINE behavior (§62 honesty).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";
import { ocrRecognitionResponseSchema } from "../../src/shared/contracts";
import { makeHappyPathPngForProfile, pngDataUrl } from "../helpers/ocr-fixtures";
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

async function user() {
  const ctx = await authenticatedUser(app, mail);
  return { userId: ctx.userId, authHeader: ctx.authHeader };
}

async function uploadWithProfile(
  authHeader: Record<string, string>,
  profile: "ACCOUNT_POSITION" | "CHART_ANALYSIS",
  dataUrl: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/ocr/recognitions",
    headers: { ...authHeader, "content-type": "application/json" },
    payload: { imageDataUrl: dataUrl, requestedProfile: profile },
  });
  return { status: res.statusCode, body: ocrRecognitionResponseSchema.parse(res.json()) };
}

async function confirm(
  authHeader: Record<string, string>,
  id: string,
  corrections: Record<string, string | null>,
) {
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/ocr/recognitions/${id}/confirm`,
    headers: { ...authHeader, "content-type": "application/json" },
    payload: { corrections },
  });
  return { status: res.statusCode, body: ocrRecognitionResponseSchema.parse(res.json()) };
}

describe("ACCOUNT_POSITION profile", () => {
  it("produces a reviewable account snapshot and confirms WITHOUT a trade", async () => {
    const ctx = await user();
    const created = await uploadWithProfile(
      ctx.authHeader,
      "ACCOUNT_POSITION",
      pngDataUrl(makeHappyPathPngForProfile("ACCOUNT_POSITION")),
    );
    expect(created.status).toBe(201);
    const recognition = created.body.recognition;
    expect(recognition.status).toBe("REVIEW_REQUIRED");
    expect(recognition.extractionProfile).toBe("ACCOUNT_POSITION");

    const keys = recognition.fields.map((f) => f.field);
    expect(keys).toContain("accountBalance");
    expect(keys).toContain("accountEquity");
    expect(keys).toContain("accountCurrency");
    // Position candidate rides the same grouped-evidence contract.
    expect(recognition.candidates).not.toBeNull();
    expect(recognition.candidates!.length).toBeGreaterThanOrEqual(1);
    // No MISSING_REQUIRED_FIELD for the account floor (currency/balance/equity).
    const missing = recognition.issues.filter((i) => i.code === "MISSING_REQUIRED_FIELD");
    expect(missing).toHaveLength(0);

    // Confirm — the snapshot is stored, the bridge is skipped EXPLICITLY.
    const balance = recognition.fields.find((f) => f.field === "accountBalance")!;
    const confirmed = await confirm(ctx.authHeader, recognition.id, {
      accountBalance: balance.normalizedValue ?? "10500.00",
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.recognition.status).toBe("CONFIRMED");
    expect(confirmed.body.recognition.tradeId).toBeNull();
    expect(confirmed.body.recognition.tradeIds).toHaveLength(0);
    expect(confirmed.body.recognition.warnings).toContain("TRADE_IMPORT_SKIPPED_PROFILE");
    expect(confirmed.body.recognition.corrections?.accountBalance).toBeDefined();

    // No trade row leaked into Trading Core from this recognition.
    const trades = await prisma.trade.findMany({
      where: { userId: ctx.userId, externalRef: { startsWith: `ocr:${recognition.id}` } },
    });
    expect(trades).toHaveLength(0);
  });
});

describe("CHART_ANALYSIS profile", () => {
  it("produces a reviewable chart reading and confirms WITHOUT a trade", async () => {
    const ctx = await user();
    const created = await uploadWithProfile(
      ctx.authHeader,
      "CHART_ANALYSIS",
      pngDataUrl(makeHappyPathPngForProfile("CHART_ANALYSIS")),
    );
    expect(created.status).toBe(201);
    const recognition = created.body.recognition;
    expect(recognition.status).toBe("REVIEW_REQUIRED");
    expect(recognition.extractionProfile).toBe("CHART_ANALYSIS");

    const keys = recognition.fields.map((f) => f.field);
    expect(keys).toContain("chartTimeframe");
    expect(keys).toContain("chartClose");
    expect(keys).toContain("chartRsi");
    const missing = recognition.issues.filter((i) => i.code === "MISSING_REQUIRED_FIELD");
    expect(missing).toHaveLength(0);

    const close = recognition.fields.find((f) => f.field === "chartClose")!;
    const confirmed = await confirm(ctx.authHeader, recognition.id, {
      chartClose: close.normalizedValue ?? "2348.90",
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.recognition.status).toBe("CONFIRMED");
    expect(confirmed.body.recognition.tradeId).toBeNull();
    expect(confirmed.body.recognition.warnings).toContain("TRADE_IMPORT_SKIPPED_PROFILE");
  });
});

describe("profile-scoped idempotency (§32)", () => {
  it("the same image under two profiles is TWO recognitions", async () => {
    const ctx = await user();
    const bytes = makeHappyPathPngForProfile("ACCOUNT_POSITION");
    const first = await uploadWithProfile(ctx.authHeader, "ACCOUNT_POSITION", pngDataUrl(bytes));
    const second = await uploadWithProfile(ctx.authHeader, "CHART_ANALYSIS", pngDataUrl(bytes));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.recognition.id).not.toBe(first.body.recognition.id);
    expect(second.body.recognition.extractionProfile).toBe("CHART_ANALYSIS");
  });
});
