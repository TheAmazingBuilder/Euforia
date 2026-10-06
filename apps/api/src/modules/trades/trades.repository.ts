/**
 * Trading Core data access (infrastructure) — Phase 4.
 *
 * The ONLY place in the trades context that touches Prisma. All methods
 * return narrow row projections — no Prisma type crosses into services or
 * controllers. Ownership is part of every lookup: foreign ids are simply
 * not found (IDOR → 404, repository-wide convention). Transactions protect
 * meaningful invariants only (§54): trade+legs writes and bulk sets.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

// ── Narrow row shapes (no Prisma types exported) ─────────────────────────────

export interface TradeRow {
  id: string;
  userId: string;
  accountId: string;
  instrumentId: string;
  strategyId: string | null;
  setupId: string | null;
  strategyVersion: number | null;
  status: string;
  direction: string;
  source: string;

  entryPrice: Prisma.Decimal;
  entryAt: Date;
  quantity: Prisma.Decimal;
  initialStop: Prisma.Decimal | null;
  initialTP: Prisma.Decimal | null;
  plannedRR: Prisma.Decimal | null;
  riskAmount: Prisma.Decimal | null;

  finalStop: Prisma.Decimal | null;
  exitPrice: Prisma.Decimal | null;
  exitAt: Date | null;
  exitReason: string | null;
  fees: Prisma.Decimal;
  swap: Prisma.Decimal;

  pnlGross: Prisma.Decimal | null;
  pnlNet: Prisma.Decimal | null;
  rMultiple: Prisma.Decimal | null;
  mfePrice: Prisma.Decimal | null;
  maePrice: Prisma.Decimal | null;
  mfeR: Prisma.Decimal | null;
  maeR: Prisma.Decimal | null;

  emotionBefore: string | null;
  emotionAfter: string | null;
  confidence: number | null;

  decisionGrade: string | null;
  decisionAt: Date | null;
  followedPlan: boolean | null;
  checklistSnap: Prisma.JsonValue | null;

  notes: string | null;
  lessons: string | null;
  tradingDate: Date;
  externalRef: string | null;
  importBatchId: string | null;
  externalPositionId: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TradeExitRow {
  id: string;
  tradeId: string;
  price: Prisma.Decimal;
  quantity: Prisma.Decimal;
  exitedAt: Date;
  reason: string;
  note: string | null;
}

export interface TradeEventRow {
  id: string;
  tradeId: string;
  type: string;
  payload: Prisma.JsonValue;
  source: string;
  createdAt: Date;
}

export interface TradeScreenshotRow {
  id: string;
  tradeId: string;
  kind: string;
  storageKey: string;
  checksumSha256: string;
  mime: string;
  sizeBytes: number;
  caption: string | null;
  annotations: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface InstrumentRow {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  quoteCurrency: string;
  pipSize: Prisma.Decimal;
  digits: number;
  contractSize: Prisma.Decimal;
  isActive: boolean;
}

export interface SavedTradeViewRow {
  id: string;
  userId: string;
  name: string;
  scope: string;
  filters: Prisma.JsonValue;
  analyticsFilters: Prisma.JsonValue | null;
  columns: string[];
  sortKey: string;
  sortDir: string;
  createdAt: Date;
}

export interface TradeListFilters {
  status?: string;
  /** true = graded (decisionGrade set); false = the "to grade" queue. */
  graded?: boolean;
  accountId?: string;
}

/** TagRow projection — the row id IS the tag id (data holds the rest). */
export interface TagRowData {
  name: string;
  category: string;
  color: string | null;
  parentId: string | null;
}

export interface TagRow {
  id: string;
  userId: string;
  data: TagRowData;
}

/** TradeSubRow (MISTAKE | TAG) projection — data holds the sub-resource. */
export interface TradeSubRow {
  id: string;
  userId: string;
  tradeId: string;
  kind: string;
  data: Record<string, unknown>;
}

@Injectable()
export class TradesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Instruments (Domaine 2 catalog) ─────────────────────────────────────────

  async findInstrument(instrumentId: string): Promise<InstrumentRow | null> {
    const row = await this.prisma.instrument.findUnique({ where: { id: instrumentId } });
    return (row as InstrumentRow) ?? null;
  }

  async findInstrumentBySymbol(symbol: string): Promise<InstrumentRow | null> {
    const row = await this.prisma.instrument.findUnique({ where: { symbol } });
    return (row as InstrumentRow) ?? null;
  }

  async listActiveInstruments(): Promise<InstrumentRow[]> {
    const rows = await this.prisma.instrument.findMany({
      where: { isActive: true },
      orderBy: { symbol: "asc" },
    });
    return rows as InstrumentRow[];
  }

  // ── Trade lookups ────────────────────────────────────────────────────────────

  /** Ownership is part of the lookup — foreign trades are simply not found. */
  async findTradeForUser(tradeId: string, userId: string): Promise<TradeRow | null> {
    const row = await this.prisma.trade.findFirst({
      where: { id: tradeId, userId, deletedAt: null },
    });
    return (row as TradeRow) ?? null;
  }

  /** Idempotency anchor for the external mapping (§27). */
  async findTradeByExternalPosition(
    accountId: string,
    externalPositionId: string,
  ): Promise<TradeRow | null> {
    const row = await this.prisma.trade.findUnique({
      where: { accountId_externalPositionId: { accountId, externalPositionId } },
    });
    return (row as TradeRow) ?? null;
  }

  /** Import idempotency anchor (§27) — non-deleted rows only. */
  async findLiveTradeByExternalRef(
    accountId: string,
    externalRef: string,
  ): Promise<TradeRow | null> {
    const row = await this.prisma.trade.findFirst({
      where: { accountId, externalRef, deletedAt: null },
    });
    return (row as TradeRow) ?? null;
  }

  async listTrades(userId: string, filters: TradeListFilters): Promise<TradeRow[]> {
    const where: Prisma.TradeWhereInput = {
      userId,
      deletedAt: null,
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.graded === true
        ? { decisionGrade: { not: null } }
        : filters.graded === false
          ? { status: "CLOSED", decisionGrade: null }
          : {}),
      ...(filters.accountId !== undefined ? { accountId: filters.accountId } : {}),
    };
    const rows = await this.prisma.trade.findMany({
      where,
      // Closed trades sort by their exit, open ones by their entry (§36 —
      // server-side temporal sorting; deterministic tie-break on id).
      orderBy: [
        { exitAt: { sort: "desc", nulls: "last" } },
        { entryAt: "desc" },
        { id: "asc" },
      ],
    });
    return rows as TradeRow[];
  }

  // ── Trade writes ─────────────────────────────────────────────────────────────

  /**
   * One transaction for a trade + its optional legs (§54): a partial close
   * never persists exits without the closed trade header (and vice versa).
   */
  async createTradeWithLegs(data: {
    trade: {
      userId: string;
      accountId: string;
      instrumentId: string;
      strategyId: string | null;
      setupId: string | null;
      strategyVersion: number | null;
      status: string;
      direction: string;
      source: string;
      entryPrice: string;
      entryAt: Date;
      quantity: string;
      initialStop: string | null;
      initialTP: string | null;
      plannedRR: string | null;
      riskAmount: string | null;
      finalStop: string | null;
      exitPrice: string | null;
      exitAt: Date | null;
      exitReason: string | null;
      fees: string;
      swap: string;
      pnlGross: string | null;
      pnlNet: string | null;
      rMultiple: string | null;
      mfePrice: string | null;
      maePrice: string | null;
      mfeR: string | null;
      maeR: string | null;
      emotionBefore: string | null;
      confidence: number | null;
      notes: string | null;
      tradingDate: Date;
      externalRef: string | null;
      importBatchId: string | null;
      externalPositionId: string | null;
    };
    exits: Array<{ price: string; quantity: string; exitedAt: Date; reason: string; note: string | null }>;
  }): Promise<TradeRow> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trade.create({ data: data.trade });
      for (const exit of data.exits) {
        await tx.tradeExit.create({
          data: { tradeId: created.id, ...exit },
        });
      }
      return created;
    });
    return row as TradeRow;
  }

  async updateTradeFields(
    tradeId: string,
    data: Partial<{
      status: string;
      quantity: string;
      initialStop: string | null;
      initialTP: string | null;
      plannedRR: string | null;
      riskAmount: string | null;
      finalStop: string | null;
      exitPrice: string | null;
      exitAt: Date | null;
      exitReason: string | null;
      fees: string;
      swap: string;
      pnlGross: string | null;
      pnlNet: string | null;
      rMultiple: string | null;
      mfePrice: string | null;
      maePrice: string | null;
      mfeR: string | null;
      maeR: string | null;
      emotionBefore: string | null;
      emotionAfter: string | null;
      confidence: number | null;
      decisionGrade: string | null;
      decisionAt: Date | null;
      followedPlan: boolean | null;
      notes: string | null;
      lessons: string | null;
      tradingDate: Date;
      entryPrice: string;
      entryAt: Date;
      direction: string;
      instrumentId: string;
      strategyId: string | null;
      setupId: string | null;
      strategyVersion: number | null;
      deletedAt: Date | null;
    }>,
  ): Promise<TradeRow> {
    const row = await this.prisma.trade.update({
      where: { id: tradeId },
      data,
    });
    return row as TradeRow;
  }

  /** Soft delete (§57) — synchronized history is never hard-deleted. */
  async softDeleteTrade(tradeId: string): Promise<void> {
    const now = new Date();
    await this.prisma.trade.update({
      where: { id: tradeId },
      data: { deletedAt: now, updatedAt: now },
    });
  }

  /** Bulk soft delete within one transaction (§54). Returns the ids removed. */
  async bulkSoftDelete(userId: string, tradeIds: string[]): Promise<number> {
    const result = await this.prisma.trade.updateMany({
      where: { id: { in: tradeIds }, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }

  /** Bulk decision grade — CLOSED trades only, honest per-row behavior. */
  async bulkGrade(
    userId: string,
    tradeIds: string[],
    grade: string,
  ): Promise<number> {
    const result = await this.prisma.trade.updateMany({
      where: { id: { in: tradeIds }, userId, deletedAt: null, status: "CLOSED" },
      data: { decisionGrade: grade },
    });
    return result.count;
  }

  // ── Trade legs ───────────────────────────────────────────────────────────────

  async listExits(tradeId: string): Promise<TradeExitRow[]> {
    const rows = await this.prisma.tradeExit.findMany({
      where: { tradeId },
      orderBy: { exitedAt: "asc" },
    });
    return rows as TradeExitRow[];
  }

  /** Replace the exit legs of a SYNC trade inside a transaction (reconciled
   * broker-derived legs are never user-editable, §30). */
  async replaceExits(
    tradeId: string,
    exits: Array<{ price: string; quantity: string; exitedAt: Date; reason: string; note: string | null }>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.tradeExit.deleteMany({ where: { tradeId } });
      for (const exit of exits) {
        await tx.tradeExit.create({ data: { tradeId, ...exit } });
      }
    });
  }

  async listEvents(tradeId: string): Promise<TradeEventRow[]> {
    const rows = await this.prisma.tradeEvent.findMany({
      where: { tradeId },
      orderBy: { createdAt: "asc" },
    });
    return rows as TradeEventRow[];
  }

  async appendEvent(data: {
    tradeId: string;
    type: string;
    payload: Prisma.InputJsonValue;
    source: string;
  }): Promise<TradeEventRow> {
    const row = await this.prisma.tradeEvent.create({ data });
    return row as TradeEventRow;
  }

  // ── Screenshots ──────────────────────────────────────────────────────────────

  async listScreenshots(tradeId: string): Promise<TradeScreenshotRow[]> {
    const rows = await this.prisma.tradeScreenshot.findMany({
      where: { tradeId },
      orderBy: { createdAt: "asc" },
    });
    return rows as TradeScreenshotRow[];
  }

  async findScreenshotForUser(
    screenshotId: string,
    tradeId: string,
  ): Promise<TradeScreenshotRow | null> {
    const row = await this.prisma.tradeScreenshot.findFirst({
      where: { id: screenshotId, tradeId },
    });
    return (row as TradeScreenshotRow) ?? null;
  }

  async insertScreenshot(data: {
    tradeId: string;
    kind: string;
    storageKey: string;
    checksumSha256: string;
    mime: string;
    sizeBytes: number;
    caption: string | null;
    annotations: Prisma.InputJsonValue | null;
  }): Promise<TradeScreenshotRow> {
    const row = await this.prisma.tradeScreenshot.create({
      data: {
        ...data,
        annotations:
          data.annotations === null ? Prisma.JsonNull : data.annotations,
      },
    });
    return row as TradeScreenshotRow;
  }

  async deleteScreenshot(screenshotId: string): Promise<void> {
    await this.prisma.tradeScreenshot.delete({ where: { id: screenshotId } });
  }

  // ── Saved trade views (named filter + column presets) ────────────────────────

  async listViews(userId: string): Promise<SavedTradeViewRow[]> {
    const rows = await this.prisma.savedTradeView.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return rows as SavedTradeViewRow[];
  }

  async findViewForUser(viewId: string, userId: string): Promise<SavedTradeViewRow | null> {
    const row = await this.prisma.savedTradeView.findFirst({
      where: { id: viewId, userId },
    });
    return (row as SavedTradeViewRow) ?? null;
  }

  async findViewByName(userId: string, name: string): Promise<SavedTradeViewRow | null> {
    const row = await this.prisma.savedTradeView.findFirst({
      where: { userId, name: { equals: name, mode: "insensitive" } },
    });
    return (row as SavedTradeViewRow) ?? null;
  }

  async insertView(data: {
    userId: string;
    name: string;
    scope: string;
    filters: Prisma.InputJsonValue;
    analyticsFilters: Prisma.InputJsonValue | null;
    columns: string[];
    sortKey: string;
    sortDir: string;
  }): Promise<SavedTradeViewRow> {
    const row = await this.prisma.savedTradeView.create({
      data: {
        ...data,
        analyticsFilters:
          data.analyticsFilters === null
            ? Prisma.JsonNull
            : data.analyticsFilters,
      },
    });
    return row as SavedTradeViewRow;
  }

  async deleteView(viewId: string): Promise<void> {
    await this.prisma.savedTradeView.delete({ where: { id: viewId } });
  }

  // ── Tag catalog (B3 — Domaine 4, per-user) ─────────────────────────────────

  async listTagRows(userId: string): Promise<TagRow[]> {
    const rows = await this.prisma.tagRow.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as TagRow[];
  }

  async insertTagRows(
    userId: string,
    rows: TagRowData[],
  ): Promise<void> {
    await this.prisma.tagRow.createMany({
      data: rows.map((data) => ({ userId, data: data as unknown as Prisma.InputJsonValue })),
    });
  }

  async insertTagRow(userId: string, data: TagRowData): Promise<TagRow> {
    const row = await this.prisma.tagRow.create({
      data: { userId, data: data as unknown as Prisma.InputJsonValue },
    });
    return row as unknown as TagRow;
  }

  // ── Trade sub-rows (B3 — mistake detections + trade↔tag joins) ────────────

  async listSubRows(userId: string, tradeId: string, kind: string): Promise<TradeSubRow[]> {
    const rows = await this.prisma.tradeSubRow.findMany({
      where: { userId, tradeId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as TradeSubRow[];
  }

  /** All TAG joins for a whole set of trades (list projection tagIds). */
  async listTagJoinsForTrades(
    userId: string,
    tradeIds: string[],
  ): Promise<TradeSubRow[]> {
    if (tradeIds.length === 0) return [];
    const rows = await this.prisma.tradeSubRow.findMany({
      where: { userId, kind: "TAG", tradeId: { in: tradeIds } },
    });
    return rows as unknown as TradeSubRow[];
  }

  /** All sub-rows of one kind for a user, across every trade (aggregates). */
  async listSubRowsByUser(userId: string, kind: string): Promise<TradeSubRow[]> {
    const rows = await this.prisma.tradeSubRow.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as TradeSubRow[];
  }

  async findSubRowForUser(
    userId: string,
    tradeId: string,
    rowId: string,
    kind: string,
  ): Promise<TradeSubRow | null> {
    const row = await this.prisma.tradeSubRow.findFirst({
      where: { userId, tradeId, kind, id: rowId },
    });
    return (row as unknown as TradeSubRow) ?? null;
  }

  async insertSubRow(
    userId: string,
    tradeId: string,
    kind: string,
    data: Prisma.InputJsonValue,
  ): Promise<TradeSubRow> {
    const row = await this.prisma.tradeSubRow.create({
      data: { userId, tradeId, kind, data },
    });
    return row as unknown as TradeSubRow;
  }

  async updateSubRowData(
    id: string,
    data: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.tradeSubRow.update({ where: { id }, data: { data } });
  }

  /** Replace the trade↔tag join set (full replacement semantics, mock parity). */
  async replaceTagJoins(
    userId: string,
    tradeId: string,
    tagIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.tradeSubRow.deleteMany({ where: { userId, tradeId, kind: "TAG" } });
      for (const tagId of tagIds) {
        await tx.tradeSubRow.create({
          data: { userId, tradeId, kind: "TAG", data: { tagId } },
        });
      }
    });
  }

  /** Recent closed LOSING trade before `before` (revenge detection window). */
  async findRecentClosedLoss(
    userId: string,
    before: Date,
    windowMinutes: number,
  ): Promise<TradeRow | null> {
    const row = await this.prisma.trade.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: "CLOSED",
        pnlNet: { lt: 0 },
        exitAt: {
          gte: new Date(before.getTime() - windowMinutes * 60_000),
          lt: before,
        },
      },
      orderBy: { exitAt: "desc" },
    });
    return (row as TradeRow) ?? null;
  }
}
