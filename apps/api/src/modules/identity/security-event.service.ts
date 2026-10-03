/**
 * Security-event recording (Phase 2 mandate §30; shared security.ts §10).
 *
 * The log is APPEND-ONLY: this service exposes append + reads — no update,
 * no delete. Events carry sanitized human context and NEVER contain
 * passwords, tokens, MFA secrets or recovery codes (§30).
 * Login history rows share the same metadata discipline (§31).
 */
import { Injectable } from "@nestjs/common";
import { IdentityRepository } from "./identity.repository";
import type { SessionRow, UserRow } from "./identity.repository";
import { isoDateTime } from "./mappers";

export type SecurityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET_REQUESTED"
  | "EMAIL_VERIFIED"
  | "TFA_ENABLED"
  | "TFA_DISABLED"
  | "TFA_CHALLENGE_FAILED"
  | "RECOVERY_CODES_REGENERATED"
  | "API_KEY_CREATED"
  | "API_KEY_REVOKED"
  | "INTEGRATION_CONNECTED"
  | "INTEGRATION_DISCONNECTED"
  | "SESSION_REVOKED"
  | "SENSITIVE_SETTINGS_CHANGED"
  | "REAUTH_OK"
  | "REAUTH_FAILED"
  | "ACCOUNT_DELETION_REQUESTED";

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
  constructor(private readonly repository: IdentityRepository) {}

  async record(input: {
    userId: string | null;
    type: SecurityEventType;
    actor: string;
    context: string;
    outcome?: "SUCCESS" | "FAILURE";
  }): Promise<void> {
    // Append-only — failures of the write itself must not break the caller,
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
export function toSecurityEvent(event: {
  id: string;
  at: Date;
  type: string;
  actor: string;
  context: string;
  outcome: string;
}): { id: string; at: string; type: string; actor: string; context: string; outcome: string } {
  return {
    id: event.id,
    at: isoDateTime(event.at),
    type: event.type,
    actor: event.actor,
    context: event.context,
    outcome: event.outcome === "FAILURE" ? "FAILURE" : "SUCCESS",
  };
}

export function toLoginRecord(record: {
  id: string;
  at: Date;
  success: boolean;
  device: string;
  browser: string;
  os: string;
  ipMasked: string;
  location: string;
  reason: string | null;
}) {
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

export function sessionFingerprint(session: SessionRow): RequestFingerprint {
  return {
    device: session.device,
    browser: session.browser,
    os: session.os,
    ipMasked: session.ipMasked,
    location: session.location,
    userAgent: session.userAgent,
  };
}

export function userActor(user: UserRow): string {
  return user.email;
}
