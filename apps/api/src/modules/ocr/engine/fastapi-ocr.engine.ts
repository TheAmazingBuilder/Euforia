/**
 * FastAPI OCR engine adapter (Phase 19 §4/§26/§27) — the HTTP client toward
 * the Python sidecar (mini-services/ocr-service).
 *
 * Security (§27): service-to-service shared secret (x-internal-token), no
 * user-controlled free text beyond the fixed extraction profile, internal
 * credentials never leave the server (the browser has no path to the
 * sidecar — §4 "no direct browser → FastAPI bypass").
 *
 * Failure semantics (§34): network errors, 5xx and timeouts are TRANSIENT
 * (bounded retry at the service layer); 4xx unprocessable answers and
 * structurally invalid payloads are NOT retried.
 */
import { Injectable } from "@nestjs/common";
import type { AppConfig } from "../../../config/app-config";
import {
  EngineMalformedResponseError,
  EngineTransientError,
  EngineUnprocessableError,
  OCR_CONTRACT_VERSION,
  engineDocumentResponseSchema,
  engineResponseSchema,
  type EngineDocumentRecognizeRequest,
  type EngineDocumentRecognizeResponse,
  type EngineRecognizeRequest,
  type EngineResponse,
  type OcrEngine,
} from "./ocr-engine.port";

@Injectable()
export class FastApiOcrEngine implements OcrEngine {
  /** Static identity — live versions come from each response's metadata. */
  readonly info = {
    name: "fastapi-tesseract",
    engineVersion: "unknown",
    pipelineVersion: "unknown",
    contractVersion: OCR_CONTRACT_VERSION,
  };

  constructor(private readonly config: AppConfig) {}

  /** Document (PDF statement) capability — the sidecar serves /v1/recognitions/document. */
  readonly supportsDocuments = true;

  async recognize(request: EngineRecognizeRequest): Promise<EngineResponse> {
    return this.post(
      "/v1/recognitions",
      request,
      engineResponseSchema,
    ) as Promise<EngineResponse>;
  }

  async recognizeDocument(
    request: EngineDocumentRecognizeRequest,
  ): Promise<EngineDocumentRecognizeResponse> {
    return this.post(
      "/v1/recognitions/document",
      request,
      engineDocumentResponseSchema,
    ) as Promise<EngineDocumentRecognizeResponse>;
  }

  /** Shared HTTP discipline (§34): mapped status errors, strict parse,
   * request-id/contract echo check — identical for both routes. */
  private async post<Req extends { requestId: string; contractVersion: string }, Parsed extends { requestId: string; contractVersion: string }>(
    path: string,
    request: Req,
    schema: { safeParse(payload: unknown): { success: boolean; data?: Parsed } },
  ): Promise<Parsed> {
    const { serviceUrl, serviceToken } = this.config.ocr;
    if (!serviceUrl || !serviceToken) {
      // The factory never registers this adapter without both values — this
      // is a hard programming error, surfaced as infrastructure failure.
      throw new EngineTransientError("OCR sidecar is not configured");
    }

    let response: Response;
    try {
      response = await fetch(`${serviceUrl.replace(/\/+$/, "")}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": serviceToken,
          "x-request-id": request.requestId,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.ocr.engineTimeoutMs),
      });
    } catch (error) {
      // AbortSignal timeout surfaces as TimeoutError/AbortError — transient (§34).
      throw new EngineTransientError(
        `OCR sidecar unreachable: ${error instanceof Error ? error.name : "unknown error"}`,
      );
    }

    if (response.status === 413) {
      throw new EngineUnprocessableError("RESOURCE_LIMIT", "The payload exceeds the sidecar limit.");
    }
    if (response.status === 422 || response.status === 415 || response.status === 400) {
      throw new EngineUnprocessableError("SCREENSHOT_UNSUPPORTED", "The sidecar rejected the payload.");
    }
    if (!response.ok) {
      throw new EngineTransientError(`OCR sidecar answered HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new EngineMalformedResponseError("OCR sidecar returned a non-JSON payload");
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success || !parsed.data) {
      throw new EngineMalformedResponseError("OCR sidecar payload failed contract validation");
    }

    const body = parsed.data;
    if (body.requestId !== request.requestId || body.contractVersion !== OCR_CONTRACT_VERSION) {
      throw new EngineMalformedResponseError("OCR sidecar answered with a mismatched request id or contract version");
    }
    return body;
  }
}
