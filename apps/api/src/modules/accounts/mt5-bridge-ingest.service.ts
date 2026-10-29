/**
 * MT5 terminal bridge - ingest service (Phase 08).
 *
 * The ONLY public (JWT-free) route of the accounts module. Authentication is
 * per-event HMAC-SHA256 over a canonical serialization, mirroring the
 * integrations webhook pipeline (same freshness window, same timing-safe
 * comparison, same idempotency-by-event-id ledger semantics):
 *
 *   signature = HMAC-SHA256(secret, `${timestampMs}.${JSON.stringify({eventId, kind, payload})}`)
 *
 * The terminal sends: X-Bridge-Key (public routing key), X-Bridge-Timestamp,
 * X-Bridge-Signature, X-Bridge-Event-Id. The service re-serializes the
 * PARSED wrapper ({eventId, kind, payload}) - JSON.parse preserves property
 * order, so the canonical string is byte-identical to what the EA signed
 * (decimals travel as strings to keep this stable - EA + guide mandate it).
 *
 * Trust model: the routing key locates the connection; the SECRET proves the
 * terminal; the timestamp bounds replay; the event id dedupes. The first
 * accepted push flips the pairing (CONNECTING → CONNECTED) - pairing IS the
 * validation for an external terminal (capability connectionValidation,
 * ON_CONNECT). Account identity facts (currency, broker identification from
 * the EA-reported company/server) refresh on ACCOUNT_INFO pushes.
 */
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { UnauthorizedError } from "../../shared/errors/app-error";
import { ForbiddenError } from "../../shared/errors/app-error";
import { SecurityEventService } from "../security/security-event.service";
import { CredentialsEncryptionService } from "./credentials-encryption.service";
import { BrokerIdentificationService } from "./broker-identification.service";
import { AccountsRepository } from "./accounts.repository";
import {
  normalizedDealSchema,
  normalizedOrderSchema,
  normalizedPositionSchema,
} from "./normalization";

/** Ingest envelope kinds - one zod payload schema per kind. */
export const bridgeEventKindSchema = z.enum([
  "ACCOUNT_INFO",
  "SNAPSHOT",
  "POSITIONS",
  "ORDERS",
  "DEALS",
]);
export type BridgeEventKind = z.infer<typeof bridgeEventKindSchema>;

/** Terminal-reported account identity (MT5 AccountInfo*). */
export const bridgeAccountInfoPayloadSchema = z.object({
  externalAccountId: z.string().trim().min(1).max(64),
  currency: z.string().trim().min(2).max(12),
  leverage: z.string().trim().min(1).max(16).nullable().optional(),
  server: z.string().trim().min(1).max(128).nullable().optional(),
  brokerName: z.string().trim().min(1).max(128).nullable().optional(),
  accountClass: z.enum(["REAL", "DEMO"]).nullable().optional(),
});

/** Balance/equity/margin snapshot - decimals as strings, nullable = unknown. */
export const bridgeSnapshotPayloadSchema = z.object({
  balance: z.string().nullable().optional(),
  equity: z.string().nullable().optional(),
  margin: z.string().nullable().optional(),
  freeMargin: z.string().nullable().optional(),
  marginLevel: z.string().nullable().optional(),
});

export const bridgePositionsPayloadSchema = z.object({
  positions: z.array(normalizedPositionSchema).max(500),
});

export const bridgeOrdersPayloadSchema = z.object({
  orders: z.array(normalizedOrderSchema).max(500),
});

/** Incremental deals window; the EA owns its checkpoint (documented). */
export const bridgeDealsPayloadSchema = z.object({
  deals: z.array(normalizedDealSchema).max(1000),
  observedThrough: z.string().max(64).nullable().optional(),
  complete: z.boolean().optional(),
});

export const bridgeIngestEnvelopeSchema = z
  .object({
    eventId: z.string().trim().min(8).max(64),
    kind: bridgeEventKindSchema,
    payload: z.unknown(),
  })
  .superRefine((value, ctx) => {
    const schema = {
      ACCOUNT_INFO: bridgeAccountInfoPayloadSchema,
      SNAPSHOT: bridgeSnapshotPayloadSchema,
      POSITIONS: bridgePositionsPayloadSchema,
      ORDERS: bridgeOrdersPayloadSchema,
      DEALS: bridgeDealsPayloadSchema,
    }[value.kind];
    const parsed = schema.safeParse(value.payload);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload"],
        message: `payload does not match the ${value.kind} bridge contract`,
      });
    }
  });
export type BridgeIngestEnvelope = z.infer<typeof bridgeIngestEnvelopeSchema>;

/** ±5 minutes - the SAME replay window as the integrations webhook pipeline. */
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/** Ingest rate bound: generous (a 5 s cadence ≈ 12/min), bounded (≤ 120/min). */
const INGEST_WINDOW_MS = 60_000;
const INGEST_MAX_PER_WINDOW = 120;

@Injectable()
export class Mt5BridgeIngestService implements OnModuleDestroy {
  /** In-memory sliding window per routing key (bounded map - keys rotate). */
  private readonly ingestWindows = new Map<string, number[]>();

  constructor(
    private readonly repository: AccountsRepository,
    private readonly credentials: CredentialsEncryptionService,
    private readonly identification: BrokerIdentificationService,
    private readonly events: SecurityEventService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    this.ingestWindows.clear();
  }

  /**
   * Authenticate + persist one pushed event. Idempotent by (keyId, eventId);
   * the first ACCOUNT_INFO activates the pairing and captures the broker
   * identity (provider-reported company wins; server-name patterns fall
   * through; honest UNKNOWN otherwise).
   */
  async ingest(input: {
    keyId: string;
    timestampMs: number;
    signatureHex: string;
    envelope: BridgeIngestEnvelope;
  }): Promise<{ accepted: true; duplicate: boolean; state: "CONNECTING" | "CONNECTED" }> {
    const connection = await this.repository.findConnectionByBridgeKeyId(input.keyId);
    if (!connection) {
      throw new UnauthorizedError("Unknown bridge key.", "BRIDGE_KEY_UNKNOWN");
    }
    // Only allocate per-key rate-limit state after resolving a real bridge key.
    // Otherwise arbitrary unauthenticated key IDs can grow the in-memory map.
    if (connection.method !== "PLATFORM_BRIDGE") {
      throw new ForbiddenError(
        "This connection does not accept bridge pushes.",
        "BRIDGE_METHOD_MISMATCH",
      );
    }
    if (connection.status === "DISCONNECTED") {
      throw new ForbiddenError(
        "This bridge connection has been disconnected. Pair the terminal again.",
        "BRIDGE_DISCONNECTED",
      );
    }

    this.enforceRateLimit(input.keyId);

    const now = Date.now();
    // Freshness is compared in MILLISECONDS. The EA v1.0.0 sends epoch
    // SECONDS ((long)TimeGMT()); ms-capable terminals send ms. Detect by
    // magnitude (ms epochs exceed 1e12 since 2001-09-09) - the SIGNATURE
    // still binds the raw string the terminal sent (canonical uses the
    // un-converted value), so this can never widen who can authenticate.
    const rawTimestamp = input.timestampMs;
    const timestampMs = Math.abs(rawTimestamp) >= 1e12 ? rawTimestamp : rawTimestamp * 1000;
    if (
      !Number.isFinite(rawTimestamp) ||
      Math.abs(now - timestampMs) > TIMESTAMP_TOLERANCE_MS
    ) {
      throw new UnauthorizedError(
        "The bridge timestamp is outside the accepted window.",
        "BRIDGE_STALE_TIMESTAMP",
      );
    }

    const secret = this.credentials.decrypt(connection.credentialsEnc);
    if (!secret) {
      throw new UnauthorizedError(
        "The bridge secret is no longer valid. Pair the terminal again.",
        "BRIDGE_SECRET_GONE",
      );
    }

    // Canonical serialization - identical bytes to what the terminal signed.
    const canonical = `${input.timestampMs}.${JSON.stringify({
      eventId: input.envelope.eventId,
      kind: input.envelope.kind,
      payload: input.envelope.payload,
    })}`;
    if (!this.signatureMatches(secret, input.timestampMs, input.signatureHex, canonical)) {
      throw new UnauthorizedError(
        "The bridge signature did not verify.",
        "BRIDGE_BAD_SIGNATURE",
      );
    }

    // The routing key is bound to one Euforia account. Validate the
    // terminal-reported login/environment before recording or activating
    // this pairing; otherwise a misconfigured terminal could attach another
    // broker account's identity/data to the wrong Euforia account.
    if (input.envelope.kind === "ACCOUNT_INFO") {
      await this.assertAccountInfoMatchesConnection(connection.accountId, input.envelope);
    }

    // The database revalidates the active key/status and stores the event in
    // the same transaction. This serializes the accept path against disconnect
    // and rotation, so no revoked pairing can reactivate or append orphan data.
    const accepted = await this.repository.acceptBridgeEvent({
      bridgeKeyId: input.keyId,
      eventId: input.envelope.eventId,
      kind: input.envelope.kind,
      payload: input.envelope.payload,
    });
    if (!accepted.accepted) {
      throw new UnauthorizedError(
        "This bridge key has been revoked or is no longer active. Pair the terminal again.",
        "BRIDGE_KEY_UNKNOWN",
      );
    }

    if (accepted.activated && !accepted.duplicate) {
      const account = await this.repository.findAccountById(connection.accountId);
      await this.events.record({
        userId: account?.userId ?? "unknown",
        type: "TRADING_ACCOUNT_CONNECTED",
        actor: "mt5-bridge",
        context: `First bridge push accepted for account ${account?.externalAccountId ?? connection.accountId} - pairing complete (PLATFORM_BRIDGE).`,
      });
    }

    if (!accepted.duplicate && input.envelope.kind === "ACCOUNT_INFO") {
      await this.applyAccountInfo(connection.accountId, input.envelope);
      // Bounded log maintenance on the slowest cadence.
      await this.repository.pruneBridgeEvents(input.keyId);
    }

    return { accepted: true, duplicate: accepted.duplicate, state: "CONNECTED" as const };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** Enforce the immutable pairing/account boundary before accepting identity data. */
  private async assertAccountInfoMatchesConnection(
    accountId: string,
    envelope: BridgeIngestEnvelope,
  ): Promise<void> {
    const payload = envelope.payload as {
      externalAccountId: string;
      accountClass?: "REAL" | "DEMO" | null;
      brokerName?: string | null;
      server?: string | null;
    };
    const account = await this.repository.findAccountById(accountId);
    if (!account || payload.externalAccountId.trim() !== account.externalAccountId) {
      throw new ForbiddenError(
        "The terminal login does not match the Euforia account paired with this bridge key.",
        "BRIDGE_ACCOUNT_MISMATCH",
      );
    }

    // DEMO and LIVE are explicit user choices. PROP_FIRM is a separate
    // journal category and may use either a broker DEMO or REAL account.
    const classMismatch =
      (account.type === "DEMO" && payload.accountClass === "REAL") ||
      (account.type === "LIVE" && payload.accountClass === "DEMO");
    if (classMismatch) {
      throw new ForbiddenError(
        "The terminal account class does not match the DEMO/LIVE environment selected in Euforia.",
        "BRIDGE_ENVIRONMENT_MISMATCH",
      );
    }

    const reported = payload.brokerName
      ? this.identification.identifyAtConnect({
          providerId: "mt5-bridge",
          externalAccountId: payload.externalAccountId,
          providerReported: {
            brokerName: payload.brokerName,
            accountClass: payload.accountClass ?? null,
          },
        })
      : null;
    const server = payload.server
      ? this.identification.identify({
          providerId: "mt5-bridge",
          externalAccountId: payload.externalAccountId,
          endpoint: payload.server,
        })
      : null;
    const isSpecificBroker = (brokerId: string | undefined) =>
      Boolean(brokerId && brokerId !== "unknown" && brokerId !== "metatrader-platform");
    if (
      reported &&
      server &&
      isSpecificBroker(reported.brokerId) &&
      isSpecificBroker(server.brokerId) &&
      reported.brokerId !== server.brokerId
    ) {
      throw new ForbiddenError(
        "The broker name and MT5 server do not identify the same broker. Verify the account and terminal server.",
        "BRIDGE_BROKER_MISMATCH",
      );
    }

    const storedIdentity = account.brokerIdentity as { brokerId?: string } | null;
    const nextIdentity =
      reported && isSpecificBroker(reported.brokerId)
        ? reported
        : server && isSpecificBroker(server.brokerId)
          ? server
          : reported ?? server;
    const connection = await this.repository.findConnectionByAccountId(accountId);
    if (
      connection?.expectedBrokerId &&
      nextIdentity &&
      isSpecificBroker(nextIdentity.brokerId) &&
      connection.expectedBrokerId !== nextIdentity.brokerId
    ) {
      throw new ForbiddenError(
        "The selected broker does not match the broker reported by the MT5 terminal. Verify the broker server before pairing.",
        "BRIDGE_BROKER_MISMATCH",
      );
    }
    if (
      nextIdentity &&
      isSpecificBroker(nextIdentity.brokerId) &&
      storedIdentity &&
      isSpecificBroker(storedIdentity.brokerId) &&
      storedIdentity.brokerId !== nextIdentity.brokerId
    ) {
      throw new ForbiddenError(
        "This terminal is now reporting a different broker than the account originally paired in Euforia. Reconnect the intended terminal account.",
        "BRIDGE_BROKER_MISMATCH",
      );
    }
  }

  /** ACCOUNT_INFO pushes refresh the journal anchor facts + identification. */
  private async applyAccountInfo(
    accountId: string,
    envelope: BridgeIngestEnvelope,
  ): Promise<void> {
    const payload = envelope.payload as {
      externalAccountId: string;
      currency: string;
      brokerName?: string | null;
      accountClass?: "REAL" | "DEMO" | null;
      server?: string | null;
    };
    const account = await this.repository.findAccountById(accountId);
    if (!account) return;

    // Capture the strongest trustworthy evidence. A recognized broker may
    // upgrade the initial UNKNOWN/generic MT5 identity, and provider-reported
    // identity may strengthen a prior server-pattern match. A different
    // specific broker is rejected before event persistence by the pairing guard.
    const stored = account.brokerIdentity as {
      brokerId?: string;
      confidence?: string;
    } | null;
    let brokerIdentity: unknown = undefined;
    const identification = payload.brokerName
      ? this.identification.identifyAtConnect({
          providerId: "mt5-bridge",
          externalAccountId: payload.externalAccountId,
          endpoint: payload.server ?? null,
          providerReported: {
            brokerName: payload.brokerName,
            accountClass: payload.accountClass ?? null,
          },
        })
      : this.identification.identify({
          providerId: "mt5-bridge",
          externalAccountId: payload.externalAccountId,
          ...(payload.server ? { endpoint: payload.server } : {}),
        });
    const isSpecificBroker = (brokerId: string | undefined) =>
      Boolean(brokerId && brokerId !== "unknown" && brokerId !== "metatrader-platform");
    const confidenceRank: Record<string, number> = {
      UNKNOWN: 0,
      PLATFORM_KNOWN: 1,
      PATTERN_MATCH: 2,
      PROVIDER_REPORTED: 3,
    };
    const currentRank = confidenceRank[stored?.confidence ?? "UNKNOWN"] ?? 0;
    const nextRank = confidenceRank[identification.confidence] ?? 0;
    const storedIsGeneric =
      !stored ||
      !isSpecificBroker(stored.brokerId) ||
      stored.confidence === "UNKNOWN";
    if (
      !stored ||
      (isSpecificBroker(identification.brokerId) &&
        (storedIsGeneric ||
          (stored.brokerId === identification.brokerId && nextRank > currentRank)))
    ) {
      brokerIdentity = identification;
    }
    await this.repository.setBridgeAccountIdentity(accountId, {
      currency: payload.currency,
      ...(brokerIdentity !== undefined ? { brokerIdentity } : {}),
    });
  }

  /** Timing-safe HMAC-SHA256 (hex) - same construction as integrations. */
  private signatureMatches(
    secret: string,
    _timestampMs: number,
    signatureHex: string,
    canonical: string,
  ): boolean {
    if (typeof signatureHex !== "string" || signatureHex.length === 0) return false;
    const expected = Buffer.from(this.hmacHex(secret, canonical), "utf8");
    const received = Buffer.from(signatureHex.toLowerCase(), "utf8");
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  }

  private hmacHex(secret: string, value: string): string {
    return createHmac("sha256", secret).update(value).digest("hex");
  }

  private enforceRateLimit(keyId: string): void {
    const now = Date.now();
    const window = (this.ingestWindows.get(keyId) ?? []).filter(
      (ts) => now - ts < INGEST_WINDOW_MS,
    );
    if (window.length >= INGEST_MAX_PER_WINDOW) {
      throw new UnauthorizedError(
        "Bridge push rate exceeded. Slow down the terminal push cadence.",
        "BRIDGE_RATE_LIMITED",
      );
    }
    window.push(now);
    this.ingestWindows.set(keyId, window);
    // Bounded map: drop stale keys opportunistically.
    if (this.ingestWindows.size > 10_000) {
      for (const [key, stamps] of this.ingestWindows) {
        if (stamps.every((ts) => now - ts >= INGEST_WINDOW_MS)) {
          this.ingestWindows.delete(key);
        }
      }
    }
  }
}
