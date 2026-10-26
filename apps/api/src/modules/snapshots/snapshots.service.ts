/**
 * Performance snapshots application service (Dashboard Customization
 * Phase 08).
 *
 * Owns: snapshot capture (server-side, from the ONE authoritative analytics
 * engine), list/get/patch/delete, and the per-user unique-name rule.
 *
 * Authority rules (spec §3/§6/§9):
 *   - Captured metrics come from AnalyticsService.getAnalyticsSuite - the
 *     EXACT dataset the Analytics page renders. This service computes NO
 *     financial math of its own (no duplicated analytics engine, spec §2).
 *   - A capture freezes: the summary band + currency context + the RESOLVED
 *     period (periodFrom/periodTo) + the human scope descriptor. Preset
 *     periods (YTD, MTD…) can never silently shift a stored snapshot later.
 *   - Captured values are immutable: PATCH accepts name/notes only (the
 *     update input schema has no metric field - the shape is the guarantee)
 *     and the repository merge is metadata-only.
 *   - Each POST creates a NEW row; duplicates by name are rejected with
 *     SNAPSHOT_NAME_TAKEN (case-insensitive, storage-level unique index).
 *
 * Security: every read/write is scoped by userId from the auth principal;
 * account/strategy references are validated against the user's own catalog
 * (spec §11) before any capture; cross-user reads are 404 (IDOR convention).
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  performanceSnapshotSchema,
  performanceSnapshotsResponseSchema,
  SNAPSHOT_ERROR_CODES,
  SNAPSHOT_SCHEMA_VERSION,
  type CreatePerformanceSnapshotInput,
  type PerformanceSnapshot,
  type PerformanceSnapshotsResponse,
  type SnapshotScope,
  type UpdatePerformanceSnapshotInput,
} from "../../shared/contracts";
import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { AnalyticsService } from "../analytics/analytics.service";
import { AccountsRepository } from "../accounts/accounts.repository";
import { PlaybookRepository } from "../playbook/playbook.repository";
import { SnapshotsRepository } from "./snapshots.repository";

type CreateInput = CreatePerformanceSnapshotInput;

/** Minimal Monte-Carlo sims (engine clamps 100–2000): a snapshot needs the
 * summary band only - the smallest authoritative pass, never a custom engine. */
const CAPTURE_SIMS = 100;

/** List bound (spec §11: reasonable row limits, no unbounded reads). */
const LIST_LIMIT = 200;

function nameKeyOf(name: string): string {
  return name.trim().toLowerCase();
}

/** Non-period half of the filter bag - the frozen scope. */
function scopeOfFilters(filters: CreateInput["filters"]): SnapshotScope {
  const scope: SnapshotScope = {};
  if (filters.accountId !== undefined) scope.accountId = filters.accountId;
  if (filters.instrumentId !== undefined) scope.instrumentId = filters.instrumentId;
  if (filters.assetClass !== undefined) scope.assetClass = filters.assetClass;
  if (filters.strategyId !== undefined) scope.strategyId = filters.strategyId;
  if (filters.direction !== undefined) scope.direction = filters.direction;
  if (filters.session !== undefined) scope.session = filters.session;
  if (filters.emotion !== undefined) scope.emotion = filters.emotion;
  if (filters.exitReason !== undefined) scope.exitReason = filters.exitReason;
  if (filters.tagId !== undefined) scope.tagId = filters.tagId;
  return scope;
}

function parseStored(row: { data: Record<string, unknown> }): PerformanceSnapshot {
  return performanceSnapshotSchema.parse(row.data);
}

@Injectable()
export class SnapshotsService {
  constructor(
    private readonly snapshots: SnapshotsRepository,
    private readonly analytics: AnalyticsService,
    private readonly accountsRepository: AccountsRepository,
    private readonly playbookRepository: PlaybookRepository,
  ) {}

  async list(userId: string): Promise<PerformanceSnapshotsResponse> {
    const rows = await this.snapshots.listByUser(userId, LIST_LIMIT);
    return performanceSnapshotsResponseSchema.parse({
      snapshots: rows.map((row) => parseStored(row)),
    });
  }

  async get(userId: string, snapshotId: string): Promise<PerformanceSnapshot> {
    const row = await this.snapshots.findForUser(userId, snapshotId);
    if (row === null) {
      throw new NotFoundError("Snapshot not found", SNAPSHOT_ERROR_CODES.SNAPSHOT_NOT_FOUND);
    }
    return parseStored(row);
  }

  async create(userId: string, input: CreateInput): Promise<PerformanceSnapshot> {
    // Spec §11 - validate account/strategy references against the
    // authenticated user BEFORE any capture (a foreign id is 404, never a
    // silently-empty snapshot).
    if (input.filters.accountId !== undefined) {
      const accounts = await this.accountsRepository.listAccountsByUser(userId);
      if (!accounts.some((account) => account.id === input.filters.accountId)) {
        throw new NotFoundError(
          "Account not found",
          SNAPSHOT_ERROR_CODES.SNAPSHOT_NOT_FOUND,
        );
      }
    }
    if (input.filters.strategyId !== undefined && input.filters.strategyId !== "none") {
      const strategies = await this.playbookRepository.listStrategies(userId);
      if (!strategies.some((strategy) => strategy.id === input.filters.strategyId)) {
        throw new NotFoundError(
          "Strategy not found",
          SNAPSHOT_ERROR_CODES.SNAPSHOT_NOT_FOUND,
        );
      }
    }

    // THE capture - one authoritative suite pass; everything below is frozen
    // from its response (meta descriptor + resolved window + currency).
    const suite = await this.analytics.getAnalyticsSuite(userId, input.filters, CAPTURE_SIMS);

    const now = new Date();
    const doc: PerformanceSnapshot = {
      id: randomUUID(),
      name: input.name.trim(),
      notes: input.notes,
      capturedAt: now.toISOString(),
      period: input.filters.period,
      periodFrom: suite.meta.resolvedFrom,
      periodTo: suite.meta.resolvedTo,
      scope: scopeOfFilters(input.filters),
      descriptor: suite.meta.descriptor,
      currency: suite.meta.singleCurrency ? suite.currency : null,
      singleCurrency: suite.meta.singleCurrency,
      metrics: {
        netPnl: suite.summary.netPnl,
        winRate: suite.summary.winRate,
        profitFactor: suite.summary.profitFactor,
        trades: suite.summary.trades,
        avgR: suite.summary.avgR,
        expectancyR: suite.summary.expectancyR,
        maxDrawdownR: suite.summary.maxDrawdownR,
        maxDrawdownPct: suite.summary.maxDrawdownPct,
      },
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    };

    // Contract-authority check: what we store MUST parse as what we promise.
    const parsed = performanceSnapshotSchema.parse(doc);

    try {
      const row = await this.snapshots.insert(
        userId,
        parsed.id,
        nameKeyOf(parsed.name),
        now,
        parsed,
      );
      return parseStored(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictError(
          "A snapshot with this name already exists",
          SNAPSHOT_ERROR_CODES.SNAPSHOT_NAME_TAKEN,
        );
      }
      throw error;
    }
  }

  /**
   * Metadata-only patch (name/notes). Metrics, scope, period, currency and
   * capture timestamp are structurally unreachable - the input schema has no
   * such field and the merge below copies ONLY name/notes over the stored doc.
   */
  async update(
    userId: string,
    snapshotId: string,
    patch: UpdatePerformanceSnapshotInput,
  ): Promise<PerformanceSnapshot> {
    const row = await this.snapshots.findForUser(userId, snapshotId);
    if (row === null) {
      throw new NotFoundError("Snapshot not found", SNAPSHOT_ERROR_CODES.SNAPSHOT_NOT_FOUND);
    }
    const stored = parseStored(row);

    const nextName = patch.name !== undefined ? patch.name.trim() : stored.name;
    const nextNotes = patch.notes !== undefined ? patch.notes : stored.notes;
    const nextNameKey = patch.name !== undefined ? nameKeyOf(nextName) : null;

    // Rename to an existing name is the same conflict as a create.
    if (nextNameKey !== null && nextNameKey !== nameKeyOf(stored.name)) {
      const rows = await this.snapshots.listByUser(userId, LIST_LIMIT);
      if (rows.some((other) => other.id !== snapshotId && other.nameKey === nextNameKey)) {
        throw new ConflictError(
          "A snapshot with this name already exists",
          SNAPSHOT_ERROR_CODES.SNAPSHOT_NAME_TAKEN,
        );
      }
    }

    const merged: PerformanceSnapshot = {
      ...stored,
      name: nextName,
      notes: nextNotes,
    };
    const parsed = performanceSnapshotSchema.parse(merged);
    const updated = await this.snapshots.updateData(
      userId,
      snapshotId,
      nextNameKey,
      parsed,
    );
    if (updated === null) {
      throw new NotFoundError("Snapshot not found", SNAPSHOT_ERROR_CODES.SNAPSHOT_NOT_FOUND);
    }
    return parseStored(updated);
  }

  async remove(userId: string, snapshotId: string): Promise<void> {
    const deleted = await this.snapshots.deleteForUser(userId, snapshotId);
    if (!deleted) {
      throw new NotFoundError("Snapshot not found", SNAPSHOT_ERROR_CODES.SNAPSHOT_NOT_FOUND);
    }
  }
}
