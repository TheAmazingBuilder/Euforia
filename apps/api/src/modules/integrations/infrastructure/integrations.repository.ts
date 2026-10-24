/**
 * Integrations data access (Phase 14) - the ONLY place in the context that
 * touches Prisma. Narrow row projections, no Prisma types cross into
 * services or controllers (Phase 1 §10 boundary).
 *
 * Ownership (§7/§38 - only what the product needs):
 *   - IntegrationConnection      per-user connection state (vault REFERENCE,
 *                                never secret material)
 *   - IntegrationEvent           Hub activity feed (sanitized messages)
 *   - IntegrationError           open-errors ledger (cleared on recovery)
 *   - IntegrationWebhookEndpoint per-user inbound endpoint (encrypted secret)
 *   - IntegrationWebhookDelivery delivery ledger; (endpointId, eventId) IS
 *                                the idempotency guard (§23)
 *
 * Multi-step writes run in one transaction (§25/§27) - e.g. a connect writes
 * the connection patch + the feed event atomically. User scoping: the
 * principal's userId is part of EVERY where-clause (§35/§40).
 */

import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

// ── Narrow row shapes (no Prisma types exported) ─────────────────────────────

export type IntegrationStatusRow =
  | "CONNECTED"
  | "SYNCING"
  | "DEGRADED"
  | "DISCONNECTED"
  | "AUTH_REQUIRED"
  | "ERROR";
export type IntegrationAuthStateRow = "OK" | "MISSING" | "EXPIRED";
export type IntegrationEventTypeRow =
  | "CONNECTED"
  | "DISCONNECTED"
  | "TEST_OK"
  | "TEST_FAILED"
  | "SYNCED"
  | "SYNC_FAILED"
  | "DEGRADED"
  | "RECOVERED"
  | "CREDENTIAL_ROTATED"
  | "WEBHOOK_RECEIVED"
  | "WEBHOOK_REJECTED"
  | "WEBHOOK_DUPLICATE";
export type IntegrationErrorCodeRow =
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "PROVIDER_OUTAGE"
  | "MALFORMED_RESPONSE"
  | "TIMEOUT"
  | "PARTIAL_SYNC"
  | "CREDENTIALS_EXPIRED"
  | "DUPLICATE_EVENT";

export interface IntegrationConnectionRow {
  id: string;
  userId: string;
  providerId: string;
  status: IntegrationStatusRow;
  authState: IntegrationAuthStateRow;
  credentialsVaultRef: string | null;
  credentialsHint: string | null;
  credentialsLastRotatedAt: Date | null;
  connectedAt: Date | null;
  lastCheckedAt: Date | null;
  syncLastAttemptedAt: Date | null;
  syncLastSuccessAt: Date | null;
  syncLastDurationMs: number | null;
  syncRecordsProcessed: number;
  syncRecordsFailed: number;
  syncRetryCount: number;
  syncRunCount: number;
  syncCursor: string | null;
  syncNextRetryAt: Date | null;
  pairedOnce: boolean;
  scenario: string | null;
}

export interface IntegrationEventRow {
  id: string;
  providerId: string;
  providerName: string;
  type: IntegrationEventTypeRow;
  message: string;
  occurredAt: Date;
}

export interface IntegrationErrorRow {
  id: string;
  providerId: string;
  code: IntegrationErrorCodeRow;
  message: string;
  retryable: boolean;
  actionHint: string;
  retryAfterMs: number | null;
  occurredAt: Date;
  clearedAt: Date | null;
}

export interface WebhookEndpointRow {
  id: string;
  userId: string;
  providerId: string;
  path: string;
  status: "ACTIVE" | "PAUSED";
  secretEnc: string;
  secretHint: string;
  lastAcceptedEventId: string | null;
}

export interface WebhookDeliveryRow {
  id: string;
  eventId: string;
  eventType: string;
  signatureValid: boolean;
  accepted: boolean;
  duplicate: boolean;
  message: string;
  receivedAt: Date;
}

/** A transaction handle accepting either the raw client or a tx client. */
export type TxHandle = Prisma.TransactionClient | PrismaService;

@Injectable()
export class IntegrationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── IntegrationConnection ──────────────────────────────────────────────────

  async findConnection(
    userId: string,
    providerId: string,
  ): Promise<IntegrationConnectionRow | null> {
    const row = await this.prisma.integrationConnection.findUnique({
      where: { userId_providerId: { userId, providerId } },
    });
    return (row as IntegrationConnectionRow) ?? null;
  }

  async listConnections(userId: string): Promise<IntegrationConnectionRow[]> {
    const rows = await this.prisma.integrationConnection.findMany({
      where: { userId },
    });
    return rows as IntegrationConnectionRow[];
  }

  /**
   * Applied patch for a lifecycle action. Absent fields stay untouched;
   * explicit `undefined` would be ignored by Prisma so callers pass only
   * the fields they mean to change (or null to clear).
   */
  async upsertConnection(
    userId: string,
    providerId: string,
    patch: {
      status?: IntegrationStatusRow;
      authState?: IntegrationAuthStateRow;
      credentialsVaultRef?: string | null;
      credentialsHint?: string | null;
      credentialsLastRotatedAt?: Date | null;
      connectedAt?: Date | null;
      lastCheckedAt?: Date | null;
      syncLastAttemptedAt?: Date | null;
      syncLastSuccessAt?: Date | null;
      syncLastDurationMs?: number | null;
      syncRecordsProcessed?: number;
      syncRecordsFailed?: number;
      syncRetryCount?: number;
      syncRunCount?: number;
      syncCursor?: string | null;
      syncNextRetryAt?: Date | null;
      pairedOnce?: boolean;
      scenario?: string | null;
    },
    tx?: TxHandle,
  ): Promise<IntegrationConnectionRow> {
    const client = tx ?? this.prisma;
    const row = await client.integrationConnection.upsert({
      where: { userId_providerId: { userId, providerId } },
      create: {
        userId,
        providerId,
        ...patch,
        // Explicit create defaults (Prisma schema defaults cover the rest).
        status: patch.status ?? "DISCONNECTED",
        authState: patch.authState ?? "MISSING",
      },
      update: patch,
    });
    return row as IntegrationConnectionRow;
  }

  // ── IntegrationEvent (activity feed) ───────────────────────────────────────

  async appendEvent(
    userId: string,
    event: {
      providerId: string;
      providerName: string;
      type: IntegrationEventTypeRow;
      message: string;
    },
    tx?: TxHandle,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.integrationEvent.create({ data: { userId, ...event } });
  }

  async listEvents(userId: string, take: number): Promise<IntegrationEventRow[]> {
    const rows = await this.prisma.integrationEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      take,
      select: {
        id: true,
        providerId: true,
        providerName: true,
        type: true,
        message: true,
        occurredAt: true,
      },
    });
    return rows as IntegrationEventRow[];
  }

  /** §28 retention: sync-log window pruning (lazy, on write paths). */
  async pruneEvents(userId: string, olderThan: Date): Promise<void> {
    await this.prisma.integrationEvent.deleteMany({
      where: { userId, occurredAt: { lt: olderThan } },
    });
  }

  // ── IntegrationError (open-errors ledger) ─────────────────────────────────

  async appendError(
    userId: string,
    error: {
      providerId: string;
      code: IntegrationErrorCodeRow;
      message: string;
      retryable: boolean;
      actionHint: string;
      retryAfterMs?: number | null;
    },
    tx?: TxHandle,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.integrationError.create({
      data: {
        userId,
        providerId: error.providerId,
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        actionHint: error.actionHint,
        retryAfterMs: error.retryAfterMs ?? null,
      },
    });
  }

  async listOpenErrors(userId: string, take: number): Promise<IntegrationErrorRow[]> {
    const rows = await this.prisma.integrationError.findMany({
      where: { userId, clearedAt: null },
      orderBy: { occurredAt: "desc" },
      take,
      select: {
        id: true,
        providerId: true,
        code: true,
        message: true,
        retryable: true,
        actionHint: true,
        retryAfterMs: true,
        occurredAt: true,
        clearedAt: true,
      },
    });
    return rows as IntegrationErrorRow[];
  }

  /** Clear by codes (null code = all) - mock clearError parity. */
  async clearErrors(
    userId: string,
    providerId: string,
    codes?: readonly string[],
    tx?: TxHandle,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.integrationError.updateMany({
      where: {
        userId,
        providerId,
        clearedAt: null,
        ...(codes && codes.length > 0 ? { code: { in: codes as IntegrationErrorCodeRow[] } } : {}),
      },
      data: { clearedAt: new Date() },
    });
  }

  // ── IntegrationWebhookEndpoint ─────────────────────────────────────────────

  /**
   * The user's inbound endpoint for a provider. The model's @@unique is
   * (userId, providerId, path) - a provider may expose several paths - so
   * this is an ownership-scoped scan (oldest first, listEndpoints order)
   * rather than a compound-unique lookup.
   */
  async findEndpointByUserAndProvider(
    userId: string,
    providerId: string,
  ): Promise<WebhookEndpointRow | null> {
    const row = await this.prisma.integrationWebhookEndpoint.findFirst({
      where: { userId, providerId },
      orderBy: { createdAt: "asc" },
    });
    return (row as WebhookEndpointRow) ?? null;
  }

  /** Ownership-scoped lookup - foreign endpoint ids are simply not found. */
  async findEndpointForUser(
    userId: string,
    endpointId: string,
  ): Promise<WebhookEndpointRow | null> {
    const row = await this.prisma.integrationWebhookEndpoint.findFirst({
      where: { id: endpointId, userId },
    });
    return (row as WebhookEndpointRow) ?? null;
  }

  async createEndpoint(
    userId: string,
    data: {
      providerId: string;
      path: string;
      secretEnc: string;
      secretHint: string;
    },
  ): Promise<WebhookEndpointRow> {
    const row = await this.prisma.integrationWebhookEndpoint.create({
      data: { userId, ...data },
    });
    return row as WebhookEndpointRow;
  }

  /** All inbound endpoints of the user (overview rendering, Phase 14 §12). */
  async listEndpoints(userId: string): Promise<WebhookEndpointRow[]> {
    const rows = await this.prisma.integrationWebhookEndpoint.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return rows as WebhookEndpointRow[];
  }

  async setEndpointLastAcceptedEventId(
    endpointId: string,
    eventId: string,
    tx?: TxHandle,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.integrationWebhookEndpoint.update({
      where: { id: endpointId },
      data: { lastAcceptedEventId: eventId },
    });
  }

  // ── IntegrationWebhookDelivery ─────────────────────────────────────────────

  /** Idempotency lookup (§23) - a stored row means the event was processed. */
  async findDelivery(
    endpointId: string,
    eventId: string,
  ): Promise<WebhookDeliveryRow | null> {
    // No (endpointId, eventId) unique exists on the model - the guard is
    // this lookup, so it takes the explicit findFirst path.
    const row = await this.prisma.integrationWebhookDelivery.findFirst({
      where: { endpointId, eventId },
    });
    return (row as WebhookDeliveryRow) ?? null;
  }

  /**
   * One ledger row per (endpoint, event) - the idempotency write (§23): a
   * replayed event updates its row instead of duplicating it. The model has
   * NO (endpointId, eventId) unique, so this is the explicit find-then-write
   * path (the ocr null-unique-component branch pattern): the delivery route's
   * per-endpoint serial processing plus the {@link findDelivery} guard are
   * what keeps the ledger duplicate-free - no constraint race to converge.
   */
  async appendDelivery(
    endpointId: string,
    delivery: {
      eventId: string;
      eventType: string;
      signatureValid: boolean;
      accepted: boolean;
      duplicate: boolean;
      message: string;
    },
    tx?: TxHandle,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const existing = await client.integrationWebhookDelivery.findFirst({
      where: { endpointId, eventId: delivery.eventId },
      select: { id: true },
    });
    if (existing === null) {
      await client.integrationWebhookDelivery.create({
        data: { endpointId, ...delivery },
      });
      return;
    }
    await client.integrationWebhookDelivery.update({
      where: { id: existing.id },
      data: { ...delivery },
    });
  }

  async listDeliveries(endpointId: string, take: number): Promise<WebhookDeliveryRow[]> {
    const rows = await this.prisma.integrationWebhookDelivery.findMany({
      where: { endpointId },
      orderBy: { receivedAt: "desc" },
      take,
      select: {
        id: true,
        eventId: true,
        eventType: true,
        signatureValid: true,
        accepted: true,
        duplicate: true,
        message: true,
        receivedAt: true,
      },
    });
    return rows as WebhookDeliveryRow[];
  }
}
