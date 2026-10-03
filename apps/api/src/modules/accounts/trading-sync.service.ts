/**
 * Synchronization orchestration (Phase 3 §16–§18, §37–§38, §46, §50).
 *
 *   connection (validated credentials)
 *        ↓ provider adapter (read-only, timeout-guarded)
 *        ↓ normalization boundary (schema-validated)
 *        ↓ ONE transaction: snapshot + positions + orders + deals + run + lastSyncAt
 *        ↓ observable run record (status, counts, duration, error code)
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
import { TRADING_ERROR_CODES } from "../../shared/contracts";
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
import { SecurityEventService } from "../identity/security-event.service";
import { toSyncRunView, toSynchronizationView } from "./mappers";

/** Provider failure codes that mean "the stored credentials stopped working". */
const AUTH_CLASS_CODES = new Set(["INVALID_CREDENTIALS", "UNAUTHORIZED_PROVIDER_ACCESS"]);

/** Normalize any provider-side failure into the existing error architecture (§36). */
export function normalizeProviderError(error: unknown): AppError {
  if (error instanceof ProviderError) {
    switch (error.code) {
      case "INVALID_CREDENTIALS":
        return new BusinessRuleError(error.message, TRADING_ERROR_CODES.INVALID_CREDENTIALS);
      case "RATE_LIMITED":
        return new RateLimitError(
          "The trading provider asked us to slow down.",
          TRADING_ERROR_CODES.RATE_LIMITED,
          60,
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
    trigger: "INITIAL" | "MANUAL",
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

  private async executeSync(input: {
    account: TradingAccountRow;
    connection: TradingConnectionRow;
    runId: string;
    trigger: "INITIAL" | "MANUAL";
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
    };

    try {
      const timeoutMs = this.config.accounts.providerTimeoutMs;
      const snapshot = await withProviderTimeout(
        adapter.fetchSnapshot(context),
        timeoutMs,
      );
      const positions = await withProviderTimeout(
        adapter.fetchPositions(context),
        timeoutMs,
      );
      const orders = await withProviderTimeout(
        adapter.fetchOrders(context),
        timeoutMs,
      );
      const deals = await withProviderTimeout(
        adapter.fetchDeals(context),
        timeoutMs,
      );

      // Normalization boundary — a type-broken provider response never enters the DB.
      const safeSnapshot = parseOrInvalid(normalizedSnapshotSchema, snapshot);
      const safePositions = parseOrInvalid(normalizedPositionsSchema, positions);
      const safeOrders = parseOrInvalid(normalizedOrdersSchema, orders);
      const safeDeals = parseOrInvalid(normalizedDealsSchema, deals);

      const syncedAt = new Date();
      await this.repository.persistSyncResult({
        runId: input.runId,
        accountId: input.account.id,
        currency: input.account.currency,
        durationMs: Date.now() - startedAt,
        snapshot: {
          ...safeSnapshot,
          unrealizedPnl: deriveUnrealizedPnl(safeSnapshot.balance, safeSnapshot.equity),
          syncedAt,
        },
        positions: safePositions.map((p) => ({ ...p, openedAt: new Date(p.openedAt) })),
        orders: safeOrders,
        deals: safeDeals.map((d) => ({ ...d, executedAt: new Date(d.executedAt) })),
      });
      this.logger?.info(
        {
          userId: input.userId,
          accountId: input.account.id,
          provider: input.connection.providerId,
          syncRunId: input.runId,
          trigger: input.trigger,
          durationMs: Date.now() - startedAt,
          positions: safePositions.length,
          orders: safeOrders.length,
          deals: safeDeals.length,
        },
        "trading-account sync completed",
      );
    } catch (error) {
      const code =
        error instanceof ProviderError
          ? TRADING_ERROR_CODES[error.code]
          : TRADING_ERROR_CODES.SYNC_FAILED;
      await this.repository.failSyncRun(input.runId, code);
      if (error instanceof ProviderError && AUTH_CLASS_CODES.has(error.code)) {
        await this.repository.setConnectionError(input.account.id, error.message);
      }
      this.logger?.warn(
        {
          userId: input.userId,
          accountId: input.account.id,
          provider: input.connection.providerId,
          syncRunId: input.runId,
          trigger: input.trigger,
          durationMs: Date.now() - startedAt,
          errorCode: code,
        },
        "trading-account sync failed",
      );
      await this.events.record({
        userId: input.userId,
        type: "TRADING_ACCOUNT_SYNC_FAILED",
        actor: "system",
        context: `Sync failed for provider ${input.connection.providerId} (code ${code}).`,
        outcome: "FAILURE",
      });
      throw normalizeProviderError(error);
    }
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
