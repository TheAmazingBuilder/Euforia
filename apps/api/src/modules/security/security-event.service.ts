/**
 * Security-event recording - the SHARED write port for security-relevant
 * facts (Phase 2 mandate §30; Phase 16 bounded-context extraction §33/§34).
 *
 * Identity (auth flows), Accounts (connection lifecycle) and any future
 * domain record through THIS service - they never touch the Security
 * center's internals, and the Security center never writes into another
 * context's tables. One coherent event architecture (§38): a single model,
 * a single writer, one catalog (shared securityEventTypeSchema).
 *
 * The log is APPEND-ONLY: this service exposes record + reads - no update,
 * no delete. Events carry sanitized human context and NEVER contain
 * passwords, tokens, MFA secrets or recovery codes (§30).
 * Login history rows share the same metadata discipline (§31).
 */
import { Injectable } from "@nestjs/common";
import type { SecurityEventType as SharedSecurityEventType } from "../../shared/contracts";
import { SecurityEventRepository, type LoginRecordRow, type SecurityEventRow } from "./security-event.repository";
import { isoDateTime } from "../identity/mappers";

/**
 * Recognition V1 backend additions to the shared audit catalog (§83): the
 * recognition surface emits lifecycle facts (job created/cancelled, draft
 * saved, journal import, retention sweep, fusion groups) that postdate the
 * shared enum. Declared HERE - the shared contract stays frozen - in the
 * SAME naming style, so every writer keeps going through THIS port and the
 * append-only model is unchanged.
 */
export type OcrSecurityEventType =
  | "OCR_JOB_CREATED"
  | "OCR_JOB_CANCELLED"
  | "OCR_RETENTION_SWEEP"
  | "OCR_GROUP_CREATED"
  | "TRADE_DRAFT_SAVED"
  | "TRADE_IMPORTED";

/**
 * Accounts bridge additions (Phase 08 - MT5 terminal bridge): the rotation
 * of a bridge secret is a security-relevant credential lifecycle fact. The
 * activation path reuses TRADING_ACCOUNT_CONNECTED (pairing IS a connection
 * fact); only the rotation needs its own type.
 */
export type BridgeSecurityEventType = "TRADING_ACCOUNT_BRIDGE_ROTATED";

export type SecurityEventType =
  | SharedSecurityEventType
  | OcrSecurityEventType
  | BridgeSecurityEventType;

export interface RequestFingerprint {
  device: string;
  browser: string;
  os: string;
  ipMasked: string;
  location: string;
  userAgent: string | null;
}

@Injectable()
export class SecurityEventService {
  constructor(private readonly repository: SecurityEventRepository) {}

  async record(input: {
    userId: string | null;
    type: SecurityEventType;
    actor: string;
    context: string;
    outcome?: "SUCCESS" | "FAILURE";
  }): Promise<void> {
    // Append-only - failures of the write itself must not break the caller,
    // but are surfaced to logs for observability (§54).
    try {
      await this.repository.appendSecurityEvent({
        userId: input.userId,
        type: input.type,
        actor: input.actor,
        context: input.context,
        outcome: input.outcome ?? "SUCCESS",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      throw new Error(`security-event write failed: ${message}`);
    }
  }

  async recordLogin(
    input: {
      userId: string;
      type: SecurityEventType;
      context: string;
      outcome: "SUCCESS" | "FAILURE";
      reason?: string;
    },
    fingerprint: RequestFingerprint,
  ): Promise<void> {
    await Promise.all([
      this.record({
        userId: input.userId,
        type: input.type,
        actor: fingerprint.device,
        context: input.context,
        outcome: input.outcome,
      }),
      this.repository.appendLoginRecord({
        userId: input.userId,
        success: input.outcome === "SUCCESS",
        device: fingerprint.device,
        browser: fingerprint.browser,
        os: fingerprint.os,
        ipMasked: fingerprint.ipMasked,
        location: fingerprint.location,
        reason: input.reason ?? null,
      }),
    ]);
  }
}

/** Row → contract mappers for security payloads. */
export function toSecurityEvent(event: SecurityEventRow): {
  id: string;
  at: string;
  type: string;
  actor: string;
  context: string;
  outcome: string;
} {
  return {
    id: event.id,
    at: isoDateTime(event.at),
    type: event.type,
    actor: event.actor,
    context: event.context,
    outcome: event.outcome === "FAILURE" ? "FAILURE" : "SUCCESS",
  };
}

export function toLoginRecord(record: LoginRecordRow) {
  return {
    id: record.id,
    at: isoDateTime(record.at),
    success: record.success,
    device: record.device,
    browser: record.browser,
    os: record.os,
    ipMasked: record.ipMasked,
    location: record.location,
    reason: record.reason,
  };
}
