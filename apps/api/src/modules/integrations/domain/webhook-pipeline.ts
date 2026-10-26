/**
 * Inbound webhook pipeline (Phase 14 §12/§21/§22/§23) - signing + PURE
 * pipeline decisions. The transport-free evaluator mirrors the mock engine
 * pipeline exactly (timestamp freshness → signature → idempotency) so the
 * simulate endpoint is a REAL pipeline exercise, not a simulated verdict.
 *
 * The signing secret NEVER leaves this module: it is generated server-side,
 * stored AES-256-GCM encrypted, decrypted only to compute/verify signatures
 * (§14/§18) and masked in every message that reaches the ledger.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { isWebhookTimestampFresh } from "../../../shared/contracts";

/** Canonical signed-payload format (mock §12 parity): `<ts>.<json>`. */
export interface WebhookSignedPayload {
  readonly eventId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

/** Serialize the canonical signed body - the exact string the HMAC covers. */
export function serializeWebhookBody(timestampMs: number, body: WebhookSignedPayload): string {
  return `${timestampMs}.${JSON.stringify({
    eventId: body.eventId,
    eventType: body.eventType,
    payload: body.payload,
  })}`;
}

/** HMAC-SHA256 hex digest - node:crypto, no external dependency. */
export function signWebhookBody(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests (timing-attack hardening). */
export function signaturesMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** `whsec_<12 hex>` - generated server-side, never returned (§14). */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(6).toString("hex")}`;
}

/** Masked UI hint (mock parity): `whsec_••••e7c1`. */
export function webhookSecretHint(secret: string): string {
  return `whsec_••••${secret.slice(-4)}`;
}

/** Deterministic simulate event id (mock §32 parity shape). */
export function simulateEventId(nowMs: number, eventType: string): string {
  return `evt-${Math.abs(Math.floor(Math.sin(nowMs) * 1e9))}-${eventType}`;
}

// ── Pipeline evaluation (PURE) ───────────────────────────────────────────────

export type WebhookSimulateMode = "valid" | "bad-signature" | "stale-timestamp" | "replay";

export interface WebhookPipelineInput {
  readonly mode: WebhookSimulateMode;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

export interface WebhookVerdict {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly signatureValid: boolean;
  readonly message: string;
  /** Hub feed event to log (null = silent pipeline rejection, mock parity). */
  readonly eventType: "WEBHOOK_RECEIVED" | "WEBHOOK_REJECTED" | "WEBHOOK_DUPLICATE" | null;
  readonly eventMessage: string | null;
  /** Delivery-ledger row values. */
  readonly delivery: {
    readonly signatureValid: boolean;
    readonly accepted: boolean;
    readonly duplicate: boolean;
    readonly message: string;
  };
  /** True when the event was newly accepted (event id recorded for replay). */
  readonly acceptedNow: boolean;
}

export function evaluateWebhookDelivery(params: {
  fresh: boolean;
  /** Provided signature matches the computed one (already compared). */
  signatureValid: boolean;
  /** The (provider, eventId) pair was already processed. */
  alreadySeen: boolean;
  /** mode === "replay" AND a previous accepted event id exists. */
  isReplay: boolean;
}): WebhookVerdict {
  const { fresh, signatureValid, alreadySeen, isReplay } = params;

  // Pipeline step 1 - timestamp freshness (replay protection, §22).
  if (!fresh) {
    return {
      accepted: false,
      duplicate: false,
      signatureValid: true,
      message: "Rejected - timestamp outside the replay window",
      eventType: null,
      eventMessage: null,
      delivery: {
        signatureValid: true,
        accepted: false,
        duplicate: false,
        message: "Rejected: timestamp outside the replay window",
      },
      acceptedNow: false,
    };
  }
  // Pipeline step 2 - signature verification.
  if (!signatureValid) {
    return {
      accepted: false,
      duplicate: false,
      signatureValid: false,
      message: "Rejected - invalid signature",
      eventType: "WEBHOOK_REJECTED",
      eventMessage: "Webhook rejected - invalid signature",
      delivery: {
        signatureValid: false,
        accepted: false,
        duplicate: false,
        message: "Rejected: invalid signature",
      },
      acceptedNow: false,
    };
  }
  // Pipeline step 3 - idempotency (§23).
  if (alreadySeen && !isReplay) {
    return {
      accepted: false,
      duplicate: false,
      signatureValid: true,
      message: "Duplicate event - ignored",
      eventType: null,
      eventMessage: null,
      delivery: {
        signatureValid: true,
        accepted: false,
        duplicate: false,
        message: "Accepted but already processed",
      },
      acceptedNow: false,
    };
  }
  if (isReplay) {
    return {
      accepted: false,
      duplicate: true,
      signatureValid: true,
      message: "Duplicate - the event was already processed",
      eventType: "WEBHOOK_DUPLICATE",
      eventMessage: "Replayed delivery ignored - idempotency held",
      delivery: {
        signatureValid: true,
        accepted: true,
        duplicate: true,
        message: "Duplicate delivery ignored (idempotent)",
      },
      acceptedNow: false,
    };
  }
  // Accepted → normalized application event (§21: Normalization → event).
  return {
    accepted: true,
    duplicate: false,
    signatureValid: true,
    message: "Accepted - event applied",
    eventType: "WEBHOOK_RECEIVED",
    eventMessage: `Webhook accepted - event applied in real time`,
    delivery: {
      signatureValid: true,
      accepted: true,
      duplicate: false,
      message: "Signature verified - event applied",
    },
    acceptedNow: true,
  };
}

/** Freshness helper re-export bound to the shared 5-minute replay window. */
export function isTimestampFresh(timestampMs: number, nowMs: number): boolean {
  return isWebhookTimestampFresh(timestampMs, nowMs);
}
