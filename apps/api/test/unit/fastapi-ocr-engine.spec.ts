/**
 * Unit - FastApiOcrEngine adapter (the REAL sidecar HTTP client).
 *
 * Fetch is stubbed: these tests pin the HTTP discipline (§34 failure
 * mapping, §54 strict response parsing, request-id/contract echo check)
 * and the document capability routing - NOT the sidecar pipeline itself
 * (the sidecar's own pytest suite in mini-services/ocr-service owns that).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../src/config/app-config";
import {
  EngineMalformedResponseError,
  EngineTransientError,
  EngineUnprocessableError,
  OCR_CONTRACT_VERSION,
} from "../../src/modules/ocr/engine/ocr-engine.port";
import { FastApiOcrEngine } from "../../src/modules/ocr/engine/fastapi-ocr.engine";

const REQUEST = {
  requestId: "req-1",
  contractVersion: OCR_CONTRACT_VERSION,
  imageBase64: "aGVsbG8gd29ybGQgdGhpcyBpcyBhIHRlc3Q=",
  metadata: {
    mime: "image/png",
    sizeBytes: 24,
    width: 100,
    height: 100,
    checksumSha256: "a".repeat(64),
  },
  extractionProfile: "TRADE_SUMMARY" as const,
  deadlineMs: 25_000,
};

function engine(): FastApiOcrEngine {
  return new FastApiOcrEngine({
    ocr: {
      serviceUrl: "http://127.0.0.1:3004",
      serviceToken: "t".repeat(32),
      engineTimeoutMs: 5_000,
    },
  } as unknown as AppConfig);
}

const completedImageResponse = {
  requestId: "req-1",
  contractVersion: OCR_CONTRACT_VERSION,
  processingStatus: "COMPLETED",
  classification: null,
  fields: [],
  trades: [{ pageIndex: 0, fields: [] }],
  tradeCandidates: [],
  warnings: [],
  perceptualHash: null,
  processingMetadata: {
    engine: "fastapi-tesseract",
    engineVersion: "5.3.0",
    pipelineVersion: "3.0.0",
    durationsMs: { totalMs: 10 },
    passes: [],
    layoutTemplate: null,
    deskewDeg: null,
    documentPages: null,
    documentWidth: null,
    documentHeight: null,
  },
  failure: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FastApiOcrEngine - recognize", () => {
  it("posts to /v1/recognitions with the internal token and parses a COMPLETED body (trades included)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, completedImageResponse));
    vi.stubGlobal("fetch", fetchMock);

    const body = await engine().recognize(REQUEST);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:3004/v1/recognitions");
    expect((init.headers as Record<string, string>)["x-internal-token"]).toBe("t".repeat(32));
    expect(body.processingStatus).toBe("COMPLETED");
    expect(body.trades).toHaveLength(1);
    expect(body.trades?.[0]?.pageIndex).toBe(0);
  });

  it("maps 413 to an unprocessable RESOURCE_LIMIT and 4xx to SCREENSHOT_UNSUPPORTED (§34)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 413 })));
    await expect(engine().recognize(REQUEST)).rejects.toBeInstanceOf(EngineUnprocessableError);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 415 })));
    await expect(engine().recognize(REQUEST)).rejects.toBeInstanceOf(EngineUnprocessableError);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 502 })));
    await expect(engine().recognize(REQUEST)).rejects.toBeInstanceOf(EngineTransientError);
  });

  it("throws malformed when the payload fails the strict contract or echoes a foreign request id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { requestId: "req-1" })));
    await expect(engine().recognize(REQUEST)).rejects.toBeInstanceOf(EngineMalformedResponseError);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { ...completedImageResponse, requestId: "req-OTHER" }),
      ),
    );
    await expect(engine().recognize(REQUEST)).rejects.toBeInstanceOf(EngineMalformedResponseError);
  });

  it("maps network failure to a transient error (bounded retry upstream)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(engine().recognize(REQUEST)).rejects.toBeInstanceOf(EngineTransientError);
  });
});

describe("FastApiOcrEngine - recognizeDocument", () => {
  const DOCUMENT_REQUEST = {
    requestId: "doc-1",
    contractVersion: OCR_CONTRACT_VERSION,
    documentBase64: "JVBERi0xLjQKJcTl8uXrp",
    metadata: { mime: "application/pdf", sizeBytes: 1024, checksumSha256: "b".repeat(64) },
    extractionProfile: "TRADE_SUMMARY" as const,
    deadlineMs: 60_000,
  };

  const completedDocumentResponse = {
    requestId: "doc-1",
    contractVersion: OCR_CONTRACT_VERSION,
    processingStatus: "COMPLETED",
    pages: [
      {
        pageIndex: 0,
        classification: null,
        fields: [],
        trades: [],
        warnings: [],
      },
    ],
    warnings: [],
    perceptualHash: null,
    processingMetadata: completedImageResponse.processingMetadata,
    failure: null,
  };

  it("posts to /v1/recognitions/document and parses the per-page answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, completedDocumentResponse));
    vi.stubGlobal("fetch", fetchMock);

    const body = await engine().recognizeDocument(DOCUMENT_REQUEST);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:3004/v1/recognitions/document");
    expect(body.processingStatus).toBe("COMPLETED");
    expect(body.pages).toHaveLength(1);
    expect(body.pages[0]?.pageIndex).toBe(0);
  });

  it("applies the same §34 mapping on the document route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 413 })));
    await expect(engine().recognizeDocument(DOCUMENT_REQUEST)).rejects.toBeInstanceOf(
      EngineUnprocessableError,
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 400 })));
    await expect(engine().recognizeDocument(DOCUMENT_REQUEST)).rejects.toBeInstanceOf(
      EngineUnprocessableError,
    );
  });
});
