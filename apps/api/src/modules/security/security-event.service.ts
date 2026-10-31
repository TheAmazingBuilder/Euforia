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
import { Inject, Injectable } from "@nestjs/common";
import type { SecurityEventType } from "../../shared/contracts";
import { ROOT_LOGGER, type RootLogger } from "../../infrastructure/logging/logger.factory";
import { SecurityEventRepository, type LoginRecordRow, type SecurityEventRow } from "./security-event.repository";
import { isoDateTime } from "../identity/mappers";

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
  constructor(
    private readonly repository: SecurityEventRepository,
    @Inject(ROOT_LOGGER) private readonly logger: RootLogger,
  ) {}

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
      // Audit logging must not invalidate a completed business operation.
      // Exclude raw database/error messages to avoid leaking internal details.
      this.logger.warn(
        {
          userId: input.userId,
          eventType: input.type,
          errorType: error instanceof Error ? error.name : "UnknownError",
        },
        "Security event write failed; continuing without blocking the operation.",
      );
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
