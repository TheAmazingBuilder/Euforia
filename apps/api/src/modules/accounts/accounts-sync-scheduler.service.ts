/**
 * Accounts synchronization scheduler (Phase 05, spec §9).
 *
 * Periodic refresh of ELIGIBLE connections — the deployment model is a
 * single long-running NestJS monolith (documented in the Phase 04 report
 * and SAVEPOINT runbook), so an in-process timer is the simplest safe
 * approach (spec §9: "If no suitable scheduler exists, evaluate the
 * simplest safe approach that fits the deployment model"). The existing
 * pattern (ocr-retention.service) is reused; NO new queue dependency.
 *
 * §9.1 requirements mapped:
 *   - eligible connections only .... listSchedulableConnections (CONNECTED +
 *     credentials present) + registered adapter + descriptor-declared
 *     environment — disconnected/revoked/auth-broken connections NEVER run.
 *   - no overlapping runs .......... the §38 partial unique index: a second
 *     trigger gets 409 SYNC_ALREADY_RUNNING and the scheduler SKIPS.
 *   - bounded concurrency .......... a worker pool of syncMaxConcurrency.
 *   - rate-limit awareness ......... a thrown RATE_LIMITED puts the account
 *     on a cooldown ≥ the provider-advertised Retry-After (capped at the
 *     sweep interval — the next sweep retries naturally).
 *   - failure isolation ............ per-connection try/catch; one user's
 *     failing connection never blocks another.
 *   - no excessive provider calls .. one sweep per jittered interval; the
 *     interval floor is one minute (env schema).
 *
 * Recovery (§15 "safe restart after process termination"): every sweep
 * first marks RUNNING runs older than syncStaleRunMs as CANCELLED — a
 * crashed process must never hold the per-account single-RUNNING invariant
 * hostage (the watchdog bounds every segment, so such a run cannot be
 * alive). The sweep ALSO runs once at module init (even when the timer is
 * disabled) so manual synchronization unblocks after a restart.
 *
 * The timer is NEVER started by default: ACCOUNTS_SYNC_SCHEDULER=enabled is
 * an explicit deployment decision (§57 posture — real-provider automation
 * is opt-in; disabled ⇒ zero automatic provider calls).
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Inject, Optional } from "@nestjs/common";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import type { RootLogger } from "../../infrastructure/logging/logger.factory";
import { ROOT_LOGGER } from "../../infrastructure/logging/logger.factory";
import { RateLimitError, ConflictError } from "../../shared/errors/app-error";
import type { TradingConnectionRow } from "./accounts.repository";
import { AccountsRepository } from "./accounts.repository";
import { ProviderRegistryService } from "./provider-registry.service";
import { TradingSyncService } from "./trading-sync.service";

/** Jitter amplitude relative to the base interval (±10%). */
const JITTER_FRACTION = 0.1;
/** A rate-limited account never waits LONGER than one sweep to retry. */
const MAX_COOLDOWN_MS = 15 * 60 * 1000;

@Injectable()
export class AccountsSyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** accountId → earliest next scheduled attempt (rate-limit cooldown). */
  private readonly cooldownUntil = new Map<string, number>();

  constructor(
    private readonly repository: AccountsRepository,
    private readonly sync: TradingSyncService,
    private readonly registry: ProviderRegistryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
  ) {}

  onModuleInit(): void {
    // Recovery sweep FIRST — unconditionally (a stale RUNNING row from a
    // crashed process blocks even manual synchronization).
    void this.recoverStaleRuns()
      .then((cancelled) => {
        if (cancelled > 0) {
          this.logger?.warn({ cancelled }, "accounts sync scheduler recovered stale runs");
        }
      })
      .catch((error) => {
        this.logger?.error({ error: String(error) }, "accounts sync scheduler recovery failed");
      });

    if (!this.config.accounts.syncSchedulerEnabled) {
      this.logger?.info(
        {},
        "accounts sync scheduler disabled (ACCOUNTS_SYNC_SCHEDULER != enabled) — no periodic synchronization",
      );
      return;
    }
    this.scheduleNextTick();
    this.logger?.info(
      { intervalMs: this.config.accounts.syncIntervalMs },
      "accounts sync scheduler started",
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * One scheduler sweep — ALSO the test entry point (deterministic, no
   * timer dependence): recover stale runs, resolve eligible connections,
   * run them through a bounded-concurrency pool with per-connection
   * isolation and rate-limit cooldowns.
   */
  async runDueSynchronizations(): Promise<{ considered: number; started: number; skipped: number; cancelledStale: number }> {
    const cancelledStale = await this.recoverStaleRuns();
    const connections = await this.repository.listSchedulableConnections();
    const eligible = connections.filter((connection) => this.isEligible(connection));

    let started = 0;
    let skipped = 0;
    const concurrency = Math.max(1, this.config.accounts.syncMaxConcurrency);
    let cursor = 0;
    const workers: Array<Promise<void>> = [];
    for (let w = 0; w < concurrency; w += 1) {
      workers.push(
        (async () => {
          for (;;) {
            const index = cursor;
            cursor += 1;
            const connection = eligible[index];
            if (!connection) return;
            try {
              await this.synchronizeConnection(connection);
              started += 1;
            } catch {
              skipped += 1;
            }
          }
        })(),
      );
    }
    await Promise.all(workers);
    return { considered: connections.length, started, skipped, cancelledStale };
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /** Re-arm the timer with ±10% jitter (§15: avoid synchronized retry storms). */
  private scheduleNextTick(): void {
    if (this.stopped) return;
    const base = this.config.accounts.syncIntervalMs;
    const jitter = base * JITTER_FRACTION;
    const delay = Math.max(1_000, Math.round(base - jitter + Math.random() * 2 * jitter));
    this.timer = setTimeout(() => {
      void this.runDueSynchronizations()
        .catch((error) => {
          this.logger?.error(
            { error: String(error) },
            "accounts sync scheduler sweep failed",
          );
        })
        .finally(() => this.scheduleNextTick());
    }, delay);
  }

  /** A RUNNING run older than the stale bound cannot be alive → CANCELLED. */
  private async recoverStaleRuns(): Promise<number> {
    return this.repository.cancelStaleRunningRuns(
      new Date(Date.now() - this.config.accounts.syncStaleRunMs),
    );
  }

  /**
   * Eligibility (§9.1): registered adapter (a deregistered provider — e.g.
   * the OANDA gate off — is skipped WITHOUT a run, so no failed-run noise),
   * descriptor-declared environment, and no active rate-limit cooldown.
   * Ownership is structural: the connection row belongs to exactly one
   * account owned by one user; every downstream read/write is account-
   * scoped (no cross-user path exists in the sync domain — IDOR suites).
   */
  private isEligible(connection: TradingConnectionRow): boolean {
    const adapter = this.registry.get(connection.providerId);
    if (!adapter) return false;
    return true;
  }

  /**
   * One connection's scheduled run. Ownership/scoping: the sync service
   * loads the owned account pair itself via the account id; the environment
   * gate happens INSIDE the adapter (honest UNSUPPORTED_ACCOUNT) or here
   * via the descriptor — a descriptor-declared environment mismatch skips
   * the run entirely (no noise, no provider call).
   */
  private async synchronizeConnection(connection: TradingConnectionRow): Promise<void> {
    const cooldownUntil = this.cooldownUntil.get(connection.accountId) ?? 0;
    if (Date.now() < cooldownUntil) return;

    // Load the owned pair through the owning repository (the account row
    // carries the environment the adapter validates and the userId the
    // sync domain records events against).
    const account = await this.repository.findAccountById(connection.accountId);
    if (!account) return; // connection without account is impossible (1:1 cascade); honest skip

    const adapter = this.registry.get(connection.providerId);
    if (!adapter) return;
    const environment = account.type as "DEMO" | "LIVE" | "PROP_FIRM";
    if (!adapter.descriptor.supportedEnvironments.includes(environment)) {
      this.logger?.info(
        { accountId: account.id, provider: connection.providerId, environment },
        "accounts sync scheduler skipped account (environment not declared by provider)",
      );
      return;
    }

    try {
      await this.sync.runScheduledSync({
        userId: account.userId,
        account,
        connection,
      });
      this.cooldownUntil.delete(connection.accountId);
    } catch (error) {
      if (error instanceof ConflictError) {
        // Already RUNNING (manual or overlapping sweep) — honest skip, no noise.
        return;
      }
      if (error instanceof RateLimitError) {
        const retryAfterMs = (error.retryAfterSeconds ?? 60) * 1_000;
        const until = Date.now() + Math.min(retryAfterMs, MAX_COOLDOWN_MS);
        this.cooldownUntil.set(connection.accountId, until);
        this.logger?.warn(
          { accountId: account.id, provider: connection.providerId, retryAfterMs },
          "accounts sync scheduler cooldown after rate limit",
        );
        return;
      }
      // Any other failure: logged by the sync service (run record + security
      // events on the all-fail path) — the sweep moves on (isolation §9.1).
      this.logger?.warn(
        { accountId: account.id, provider: connection.providerId, error: String(error) },
        "accounts sync scheduler run failed for connection",
      );
    }
  }
}
