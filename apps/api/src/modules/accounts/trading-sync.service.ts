/**
 * Synchronization orchestration (Phase 3 §16–§18, §37–§38, §46, §50;
 * Phase 03 — segment-based execution with PARTIAL semantics, doc B §8.2).
 *
 *   connection (validated credentials)
 *        ↓ provider adapter (read-only, timeout-guarded, capability-gated)
 *        ↓ normalization boundary (schema-validated)
 *        ↓ per-SEGMENT transactions: snapshot / positions / orders / deals
 *          (each segment persists independently — a failing segment never
 *           rolls back persisted siblings; run keeps per-segment timestamps)
 *        ↓ observable run record (COMPLETED | PARTIAL | FAILED, counts,
 *          duration, FIRST failing segment's error code)
 *
 * Concurrency (§38): at most ONE RUNNING run per account — enforced inside a
 * transaction and backed by a partial unique index; a second trigger gets
 * 409 SYNC_ALREADY_RUNNING. No distributed locking for a modular monolith.
 */
import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ZodTypeAny, z as zod } from "zod";
import type { RootLogger } from "../../infrastructure/logging/logger.factory";
import { ROOT_LOGGER } from "../../infrastructure/logging/logger.factory";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import {
  ConflictError,
  RateLimitError,
  type AppError,
} from "../../shared/errors/app-error";
import { ExternalProviderError } from "../../shared/errors/app-error";
import { BusinessRuleError } from "../../shared/errors/app-error";
import { TRADING_ERROR_CODES, capabilitySupportLevel } from "../../shared/contracts";
import {
  normalizedDealsSchema,
  normalizedOrdersSchema,
  normalizedPositionsSchema,
  normalizedSnapshotSchema,
} from "./normalization";
import { ProviderError, withProviderTimeout } from "./provider.types";
import type { ProviderCredentials, ProviderRequestContext } from "./provider.types";
import { AccountsRepository } from "./accounts.repository";
import type { SyncRunRow, TradingAccountRow, TradingConnectionRow } from "./accounts.repository";
import { CredentialsEncryptionService } from "./credentials-encryption.service";
import { ProviderRegistryService } from "./provider-registry.service";
import { SecurityEventService } from "../security/security-event.service";
import { toSyncRunView, toSynchronizationView } from "./mappers";
import {
  DEFAULT_SEGMENT_RETRY_OPTIONS,
  withSegmentRetries,
} from "./sync-retry";

/** Provider failure codes that mean "the stored credentials stopped working".
 * Exported for the Monitoring module's connection-health mapping (Phase 17). */
export const AUTH_CLASS_CODES = new Set(["INVALID_CREDENTIALS", "UNAUTHORIZED_PROVIDER_ACCESS"]);

/** Normalize any provider-side failure into the existing error architecture (§36). */
export function normalizeProviderError(error: unknown): AppError {
  if (error instanceof ProviderError) {
    switch (error.code) {
      case "INVALID_CREDENTIALS":
        return new BusinessRuleError(error.message, TRADING_ERROR_CODES.INVALID_CREDENTIALS);
      case "UNSUPPORTED_CAPABILITY":
        // Phase 03 (doc B §10): the operation is outside the provider's
        // declared capabilities — client-pickable → 422.
        return new BusinessRuleError(error.message, TRADING_ERROR_CODES.UNSUPPORTED_CAPABILITY);
      case "RATE_LIMITED":
        return new RateLimitError(
          "The trading provider asked us to slow down.",
          TRADING_ERROR_CODES.RATE_LIMITED,
          error.retryAfterSeconds ?? 60,
        );
      case "CONNECTION_TIMEOUT":
      case "PROVIDER_UNAVAILABLE":
      case "UNSUPPORTED_ACCOUNT":
      case "UNAUTHORIZED_PROVIDER_ACCESS":
      case "INVALID_PROVIDER_RESPONSE":
        return new ExternalProviderError(error.message, TRADING_ERROR_CODES[error.code]);
    }
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new ConflictError(
      "A synchronization run is already in progress for this account.",
      TRADING_ERROR_CODES.SYNC_ALREADY_RUNNING,
    );
  }
  // Unknown failure — honest 502 without internals.
  return new ExternalProviderError(
    "The trading provider could not be synchronized.",
    TRADING_ERROR_CODES.SYNC_FAILED,
  );
}

@Injectable()
export class TradingSyncService {
  constructor(
    private readonly repository: AccountsRepository,
    private readonly registry: ProviderRegistryService,
    private readonly credentials: CredentialsEncryptionService,
    private readonly events: SecurityEventService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
  ) {}

  /**
   * User-triggered synchronization (rate-limited, ownership-checked by the caller).
   * Returns the contract response shape: derived synchronization view + the run.
   */
  async synchronize(input: {
    userId: string;
    account: TradingAccountRow;
    connection: TradingConnectionRow;
    requestId: string | null;
  }): Promise<{
    accountId: string;
    synchronization: ReturnType<typeof toSynchronizationView>;
    run: ReturnType<typeof toSyncRunView>;
  }> {
    const run = await this.startRun(input.account.id, "MANUAL", input.requestId);
    await this.executeSync({
      account: input.account,
      connection: input.connection,
      runId: run.id,
      trigger: "MANUAL",
      userId: input.userId,
    });
    const [latest, connection] = await Promise.all([
      this.repository.latestSyncRun(input.account.id),
      this.repository.findConnectionByAccountId(input.account.id),
    ]);
    return {
      accountId: input.account.id,
      synchronization: toSynchronizationView(
        connection?.lastSyncAt ?? null,
        latest ?? run,
        Date.now(),
      ),
      run: toSyncRunView(latest ?? run),
    };
  }

  /**
   * Initial synchronization right after connect/reconnect (§17). Runs inside
   * the connect request (the mock is fast); the caller catches failures so
   * the account registration itself still succeeds — the error surfaces in
   * the details view and a fresh sync can be triggered.
   */
  async runInitialSync(input: {
    userId: string;
    account: TradingAccountRow;
    connection: TradingConnectionRow;
    credentials: ProviderCredentials;
    requestId: string | null;
  }): Promise<void> {
    const run = await this.startRun(input.account.id, "INITIAL", input.requestId);
    await this.executeSync({
      account: input.account,
      connection: input.connection,
      runId: run.id,
      trigger: "INITIAL",
      userId: input.userId,
      credentialsOverride: input.credentials,
    });
  }

  /**
   * Scheduled synchronization (Phase 05 §9) — the scheduler's per-connection
   * entry point. Same orchestration, SCHEDULED trigger: the run record keeps
   * the trigger provenance (§10) and the frontend can distinguish automatic
   * refreshes from user actions. Concurrency (one RUNNING run per account)
   * is enforced by startRun exactly as for MANUAL — the scheduler treats a
   * 409 as "already running" and skips. Failures propagate: the scheduler
   * isolates them per connection (§9.1: one user's failing connection never
   * blocks another).
   */
  async runScheduledSync(input: {
    userId: string;
    account: TradingAccountRow;
    connection: TradingConnectionRow;
  }): Promise<void> {
    const run = await this.startRun(input.account.id, "SCHEDULED", null);
    await this.executeSync({
      account: input.account,
      connection: input.connection,
      runId: run.id,
      trigger: "SCHEDULED",
      userId: input.userId,
    });
  }

  /** Rate limiting for the MANUAL vector (§37) — service-owned, keyed by user. */
  checkSyncRateLimit(limiter: { check(scope: string, key: string): { allowed: boolean; retryAfterSeconds: number } }, userId: string): void {
    const check = limiter.check("sync", userId);
    if (!check.allowed) {
      throw new RateLimitError(
        "Too many synchronizations. Please wait before trying again.",
        TRADING_ERROR_CODES.RATE_LIMITED,
        check.retryAfterSeconds,
      );
    }
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async startRun(
    accountId: string,
    trigger: "INITIAL" | "MANUAL" | "SCHEDULED",
    requestId: string | null,
  ): Promise<SyncRunRow> {
    try {
      return await this.repository.createSyncRun({ accountId, trigger, requestId });
    } catch (error) {
      // Partial unique index: at most one RUNNING run per account (§38).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError(
          "A synchronization run is already in progress for this account.",
          TRADING_ERROR_CODES.SYNC_ALREADY_RUNNING,
        );
      }
      throw error;
    }
  }

  /**
   * Segment-based orchestration (Phase 03 — doc B §8.2).
   *
   * The four port reads are SEGMENTS, each gated by the adapter's declared
   * capability and persisted independently:
   *
   *   for each segment (snapshot → positions → orders → deals):
   *     - capability gate BEFORE the call: a segment whose capability is not
   *       SUPPORTED is a capability FACT — skipped, never a failure (§8.2).
   *     - call (timeout-guarded) → normalize (zod boundary) → persist segment.
   *     - a failing segment records its code and lets the others continue.
   *   afterwards:
   *     - 0 failed segments                    → COMPLETED
   *     - ≥1 succeeded AND ≥1 failed           → PARTIAL + first error code
   *     - every supported segment failed       → FAILED (historical path:
   *       failSyncRun + auth-class connection ERROR + security event + throw)
   *
   * lastSyncAt advances only when the SNAPSHOT segment persisted (doc B §9 —
   * the freshness axis is snapshot-anchored); the run keeps per-segment
   * observation timestamps so a 0-count segment is distinguishable from a
   * failed one.
   */
  private async executeSync(input: {
    account: TradingAccountRow;
    connection: TradingConnectionRow;
    runId: string;
    trigger: "INITIAL" | "MANUAL" | "SCHEDULED";
    userId: string;
    credentialsOverride?: ProviderCredentials;
  }): Promise<void> {
    const startedAt = Date.now();
    const adapter = this.registry.require(input.connection.providerId);
    const credentials =
      input.credentialsOverride ?? this.loadCredentials(input.connection);
    const context: ProviderRequestContext = {
      credentials,
      externalAccountId: input.account.externalAccountId,
      environment: input.account.type as ProviderRequestContext["environment"],
      // Phase 05 — the incremental deals checkpoint (opaque to the domain;
      // the adapter maps it onto the provider's documented cursor).
      dealsCursor: input.connection.dealsCheckpoint ?? null,
    };
    const timeoutMs = this.config.accounts.providerTimeoutMs;
    // Phase 05 — bounded transient retries (spec §15). Sleep is real here;
    // tests inject their own timing. The config value is defensively
    // coalesced: an env-sourced config always carries it (schema default),
    // and an unbounded retry loop must be structurally impossible.
    const retryOptions: Parameters<typeof withSegmentRetries>[1] = {
      ...DEFAULT_SEGMENT_RETRY_OPTIONS,
      maxRetries:
        this.config.accounts.syncSegmentRetries ?? DEFAULT_SEGMENT_RETRY_OPTIONS.maxRetries,
    };

    type SegmentName = "snapshot" | "positions" | "orders" | "deals";
    type CapabilityKeyForSegment = "balanceEquity" | "openPositions" | "orders" | "deals";
    const plan: Array<{ segment: SegmentName; capabilityKey: CapabilityKeyForSegment }> = [
      { segment: "snapshot", capabilityKey: "balanceEquity" },
      { segment: "positions", capabilityKey: "openPositions" },
      { segment: "orders", capabilityKey: "orders" },
      { segment: "deals", capabilityKey: "deals" },
    ];

    interface SegmentOutcome {
      ok: boolean;
      skipped: boolean;
      errorCode: string | null;
    }
    const outcomes = new Map<SegmentName, SegmentOutcome>();
    const failedInPlanOrder: Array<{ segment: SegmentName; code: string; error: unknown }> = [];
    let authClassFailure = false;

    for (const { segment, capabilityKey } of plan) {
      // Capability gate BEFORE the call (doc A §4.4): not-SUPPORTED = the
      // segment cannot run — a capability fact, not a run failure (§8.2).
      if (capabilitySupportLevel(adapter.descriptor.capabilities, capabilityKey) !== "SUPPORTED") {
        outcomes.set(segment, { ok: false, skipped: true, errorCode: null });
        this.logger?.info(
          {
            userId: input.userId,
            accountId: input.account.id,
            provider: input.connection.providerId,
            syncRunId: input.runId,
            segment,
            capability: capabilityKey,
          },
          "trading-account sync segment skipped (capability)",
        );
        continue;
      }

      try {
        switch (segment) {
          case "snapshot": {
            const raw = await withSegmentRetries(
              () => withProviderTimeout(adapter.fetchSnapshot(context), timeoutMs),
              retryOptions,
            );
            const safe = parseOrInvalid(normalizedSnapshotSchema, raw);
            const syncedAt = new Date();
            await this.repository.persistSnapshotSegment({
              runId: input.runId,
              accountId: input.account.id,
              currency: input.account.currency,
              snapshot: {
                ...safe,
                unrealizedPnl: deriveUnrealizedPnl(safe.balance, safe.equity),
                syncedAt,
              },
            });
            break;
          }
          case "positions": {
            const result = await withSegmentRetries(
              () => withProviderTimeout(adapter.fetchPositions(context), timeoutMs),
              retryOptions,
            );
            const safe = parseOrInvalid(normalizedPositionsSchema, result.positions);
            await this.repository.persistPositionsSegment({
              runId: input.runId,
              accountId: input.account.id,
              positions: safe.map((p) => ({ ...p, openedAt: new Date(p.openedAt) })),
              syncedAt: new Date(),
              // Reconciliation (§13.2): closure ONLY on the adapter's
              // completeness fact — a capped/failed page never closes.
              completeExternalIds: result.complete
                ? safe.map((p) => p.externalPositionId)
                : null,
            });
            break;
          }
          case "orders": {
            const raw = await withSegmentRetries(
              () => withProviderTimeout(adapter.fetchOrders(context), timeoutMs),
              retryOptions,
            );
            const safe = parseOrInvalid(normalizedOrdersSchema, raw);
            await this.repository.persistOrdersSegment({
              runId: input.runId,
              accountId: input.account.id,
              orders: safe,
              syncedAt: new Date(),
            });
            break;
          }
          case "deals": {
            const result = await withSegmentRetries(
              () => withProviderTimeout(adapter.fetchDeals(context), timeoutMs),
              retryOptions,
            );
            const safe = parseOrInvalid(normalizedDealsSchema, result.deals);
            await this.repository.persistDealsSegment({
              runId: input.runId,
              accountId: input.account.id,
              deals: safe.map((d) => ({ ...d, executedAt: new Date(d.executedAt) })),
              syncedAt: new Date(),
              // §8.4 — the checkpoint advances ONLY through the persistence
              // transaction and ONLY over observed+persisted rows; null/
              // undefined leaves the existing checkpoint untouched.
              checkpoint: result.observedThrough,
            });
            break;
          }
        }
        outcomes.set(segment, { ok: true, skipped: false, errorCode: null });
      } catch (error) {
        // Adapter-level enforcement backstop: an UNSUPPORTED_CAPABILITY thrown
        // by the adapter itself is STILL a capability fact (§8.2) — skip.
        if (error instanceof ProviderError && error.code === "UNSUPPORTED_CAPABILITY") {
          outcomes.set(segment, { ok: false, skipped: true, errorCode: null });
          this.logger?.info(
            {
              userId: input.userId,
              accountId: input.account.id,
              provider: input.connection.providerId,
              syncRunId: input.runId,
              segment,
            },
            "trading-account sync segment skipped (adapter capability refusal)",
          );
          continue;
        }
        const code =
          error instanceof ProviderError
            ? TRADING_ERROR_CODES[error.code]
            : TRADING_ERROR_CODES.SYNC_FAILED;
        outcomes.set(segment, { ok: false, skipped: false, errorCode: code });
        failedInPlanOrder.push({ segment, code, error });
        if (error instanceof ProviderError && AUTH_CLASS_CODES.has(error.code)) {
          authClassFailure = true;
        }
        this.logger?.warn(
          {
            userId: input.userId,
            accountId: input.account.id,
            provider: input.connection.providerId,
            syncRunId: input.runId,
            segment,
            errorCode: code,
          },
          "trading-account sync segment failed",
        );
      }
    }

    const succeeded = plan.filter(({ segment }) => outcomes.get(segment)?.ok === true);
    const failed = failedInPlanOrder;

    if (failed.length === 0) {
      // Full success — or the all-skipped edge (nothing supported, nothing
      // failed): COMPLETED with the segments that actually ran.
      await this.repository.finalizeSyncRun({
        runId: input.runId,
        status: "COMPLETED",
        errorCode: null,
        durationMs: Date.now() - startedAt,
      });
      this.logger?.info(
        {
          userId: input.userId,
          accountId: input.account.id,
          provider: input.connection.providerId,
          syncRunId: input.runId,
          trigger: input.trigger,
          durationMs: Date.now() - startedAt,
        },
        "trading-account sync completed",
      );
      return;
    }

    const firstFailure = failed[0];
    if (firstFailure === undefined) {
      // Unreachable (failed.length === 0 returned above) — kept as an honest
      // guard instead of a non-null assertion.
      return;
    }

    if (succeeded.length === 0) {
      // Every supported segment failed — the historical FAILED path (§16).
      await this.repository.failSyncRun(input.runId, firstFailure.code);
      if (authClassFailure) {
        const message = firstFailure.error instanceof ProviderError
          ? firstFailure.error.message
          : "The trading provider could not be synchronized.";
        await this.repository.setConnectionError(input.account.id, message);
      }
      this.logger?.warn(
        {
          userId: input.userId,
          accountId: input.account.id,
          provider: input.connection.providerId,
          syncRunId: input.runId,
          trigger: input.trigger,
          durationMs: Date.now() - startedAt,
          errorCode: firstFailure.code,
        },
        "trading-account sync failed",
      );
      await this.events.record({
        userId: input.userId,
        type: "TRADING_ACCOUNT_SYNC_FAILED",
        actor: "system",
        context: `Sync failed for provider ${input.connection.providerId} (code ${firstFailure.code}).`,
        outcome: "FAILURE",
      });
      throw normalizeProviderError(firstFailure.error);
    }

    // PARTIAL (doc B §8.2): ≥1 succeeded AND ≥1 failed. Throws nothing — the
    // honest representation IS the run row (status PARTIAL + first error).
    await this.repository.finalizeSyncRun({
      runId: input.runId,
      status: "PARTIAL",
      errorCode: firstFailure.code,
      durationMs: Date.now() - startedAt,
    });
    if (authClassFailure) {
      const message = firstFailure.error instanceof ProviderError
        ? firstFailure.error.message
        : "The trading provider could not be synchronized.";
      await this.repository.setConnectionError(input.account.id, message);
    }
    this.logger?.warn(
      {
        userId: input.userId,
        accountId: input.account.id,
        provider: input.connection.providerId,
        syncRunId: input.runId,
        trigger: input.trigger,
        durationMs: Date.now() - startedAt,
        errorCode: firstFailure.code,
        failedSegments: failed.map((f) => f.segment),
        succeededSegments: succeeded.map((s) => s.segment),
      },
      "trading-account sync partial",
    );
  }

  /** Decrypt stored credentials; a corrupted blob is an INVALID_CREDENTIALS state. */
  private loadCredentials(connection: TradingConnectionRow): ProviderCredentials {
    const secret = this.credentials.decrypt(connection.credentialsEnc);
    if (!secret) {
      throw new ProviderError(
        "INVALID_CREDENTIALS",
        "The stored credentials could not be used. Please reconnect the account.",
      );
    }
    return { method: "API_KEY", secret };
  }
}

/**
 * Validate one normalized payload; failure = INVALID_PROVIDER_RESPONSE (§36).
 */
function parseOrInvalid<S extends ZodTypeAny>(schema: S, value: unknown): zod.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ProviderError(
      "INVALID_PROVIDER_RESPONSE",
      "The trading provider returned an unexpected response.",
    );
  }
  return result.data;
}

/** equity − balance in exact decimal arithmetic (no floats, §65); null if unknown. */
function deriveUnrealizedPnl(balance: string | null, equity: string | null): string | null {
  if (balance === null || equity === null) return null;
  try {
    return new Prisma.Decimal(equity).minus(balance).toFixed();
  } catch {
    return null;
  }
}
