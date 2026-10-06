/**
 * Backup service (B2) — full authored-data export/import (feature 12,
 * Priorité 3). Export serves the WIRE shapes (trades via the journal
 * mapper, playbook strategies, tags); import validates the payload
 * against the shared backup schema, re-owns every imported row to the
 * requesting user, REPLACES the trades and MERGES strategies + tags by id
 * (mock parity). A restoration touches several bounded contexts, so the
 * service uses Prisma directly — the one sanctioned exception, documented
 * here (backup is an infrastructure operation over stored data).
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { BackupPayload, ImportBackupResponse } from "../../shared/contracts";
import { ValidationError } from "../../shared/errors/app-error";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { PlaybookRepository } from "../playbook/playbook.repository";
import { TradesRepository } from "../trades/trades.repository";
import { toTradeView } from "../trades/mappers";

@Injectable()
export class BackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trades: TradesRepository,
    private readonly playbook: PlaybookRepository,
  ) {}

  /** GET /export/backup — the full authored-data snapshot (wire shapes). */
  async exportBackup(userId: string): Promise<BackupPayload> {
    const [tradeRows, tagRows, strategyRows] = await Promise.all([
      this.trades.listTrades(userId, {}),
      this.prisma.tagRow.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      this.playbook.listByKind(userId, "STRATEGY"),
    ]);

    const trades = tradeRows
      .filter((row) => row.deletedAt === null)
      .map((row) => toTradeView(row));

    const tags = tagRows.map((row) => {
      const payload = row.data as { id?: string; name: string; category: string; color: string | null; parentId: string | null };
      return {
        id: payload.id ?? row.id,
        userId,
        name: payload.name,
        category: payload.category as BackupPayload["tags"][number]["category"],
        color: payload.color,
        parentId: payload.parentId,
      };
    });

    const strategies = strategyRows.map((row) => row.data as unknown as BackupPayload["strategies"][number]);

    return {
      app: "cosmoz",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      trades,
      strategies,
      tags,
    };
  }

  /**
   * POST /import/backup — replace trades, merge strategies + tags by id.
   * Every imported row is re-owned by the requesting user: a backup file
   * carries data, never identity.
   */
  async importBackup(userId: string, payload: BackupPayload): Promise<ImportBackupResponse> {
    const strategyRows = await this.playbook.listByKind(userId, "STRATEGY");
    const existingStrategyIds = new Set(strategyRows.map((row) => row.id));
    const tagRows = await this.prisma.tagRow.findMany({ where: { userId } });
    const existingTagIds = new Set(tagRows.map((row) => row.id));

    // Trade rows carry an account FK: references that do not exist for the
    // IMPORTING user are re-pointed at their default account. Without one,
    // the import is refused honestly — connect an account first.
    const accounts = await this.prisma.tradingAccount.findMany({ where: { userId } });
    if (payload.trades.length > 0 && accounts.length === 0) {
      throw new ValidationError(
        "No trading account to attach the imported trades to.",
        [{ path: "trades", message: "Connect a trading account before importing a backup" }],
      );
    }
    const defaultAccount = accounts.find((a) => a.isDefault) ?? accounts[0];
    const ownedAccountIds = new Set(accounts.map((a) => a.id));
    const mappedAccountId = (original: string): string =>
      ownedAccountIds.has(original) ? original : defaultAccount!.id;

    // ── Trades: REPLACE (hard delete, then re-insert the snapshot) ─────────
    await this.prisma.$transaction(async (tx) => {
      await tx.tradeEvent.deleteMany({ where: { trade: { userId } } });
      await tx.tradeExit.deleteMany({ where: { trade: { userId } } });
      await tx.tradeSubRow.deleteMany({ where: { userId } });
      await tx.tradeScreenshot.deleteMany({ where: { trade: { userId } } });
      await tx.trade.deleteMany({ where: { userId } });

      for (const trade of payload.trades) {
        // Trade ids are a GLOBAL primary key (the mock scopes them per
        // user): keep the payload id when it is free — a same-user restore
        // keeps every id stable, because the old rows were just deleted —
        // and mint a fresh one when another user already owns it.
        const existing = await tx.trade.findUnique({ where: { id: trade.id } });
        const tradeId = existing === null ? trade.id : crypto.randomUUID();
        await tx.trade.create({
          data: {
            id: tradeId,
            userId,
            accountId: mappedAccountId(trade.accountId),
            instrumentId: trade.instrumentId,
            strategyId: trade.strategyId,
            setupId: trade.setupId ?? null,
            strategyVersion: trade.strategyVersion ?? null,
            status: trade.status,
            direction: trade.direction,
            source: trade.source ?? "MANUAL",
            entryPrice: new Prisma.Decimal(trade.entryPrice),
            entryAt: new Date(trade.entryAt),
            quantity: new Prisma.Decimal(trade.quantity),
            initialStop: trade.initialStop === null ? null : new Prisma.Decimal(trade.initialStop),
            initialTP: trade.initialTP === null ? null : new Prisma.Decimal(trade.initialTP),
            plannedRR: trade.plannedRR === null ? null : new Prisma.Decimal(trade.plannedRR),
            riskAmount: trade.riskAmount === null ? null : new Prisma.Decimal(trade.riskAmount),
            finalStop: trade.finalStop === null ? null : new Prisma.Decimal(trade.finalStop),
            exitPrice: trade.exitPrice === null ? null : new Prisma.Decimal(trade.exitPrice),
            exitAt: trade.exitAt === null ? null : new Date(trade.exitAt),
            exitReason: trade.exitReason,
            fees: new Prisma.Decimal(trade.fees),
            swap: new Prisma.Decimal(trade.swap),
            pnlGross: trade.pnlGross === null ? null : new Prisma.Decimal(trade.pnlGross),
            pnlNet: trade.pnlNet === null ? null : new Prisma.Decimal(trade.pnlNet),
            rMultiple: trade.rMultiple === null ? null : new Prisma.Decimal(trade.rMultiple),
            mfePrice: trade.mfePrice === null ? null : new Prisma.Decimal(trade.mfePrice),
            maePrice: trade.maePrice === null ? null : new Prisma.Decimal(trade.maePrice),
            mfeR: trade.mfeR === null ? null : new Prisma.Decimal(trade.mfeR),
            maeR: trade.maeR === null ? null : new Prisma.Decimal(trade.maeR),
            emotionBefore: trade.emotionBefore,
            emotionAfter: trade.emotionAfter,
            confidence: trade.confidence ?? null,
            decisionGrade: trade.decisionGrade,
            decisionAt: null,
            followedPlan: trade.followedPlan ?? null,
            checklistSnap: (trade.checklistSnap ?? null) as Prisma.InputJsonValue,
            notes: trade.notes ?? null,
            lessons: trade.lessons ?? null,
            tradingDate: new Date(`${trade.tradingDate}T00:00:00Z`),
            externalRef: trade.externalRef ?? null,
          },
        });
      }
    });

    // ── Strategies + tags: MERGE by id (absent → insert, present → keep) ───
    // Cross-user imports mint fresh row ids, so id matching cannot dedupe
    // a repeat import — the importeur's existing NAMES close that gap
    // (the journal identity fields stay untouched).
    const existingStrategyNames = new Set(
      strategyRows.map((row) => String((row.data as { name?: string }).name ?? "").toLowerCase()),
    );
    const existingTagNames = new Set(
      tagRows.map((row) => String((row.data as { name?: string }).name ?? "").toLowerCase()),
    );
    let strategiesAdded = 0;
    for (const strategy of payload.strategies) {
      if (existingStrategyIds.has(strategy.id)) continue;
      if (existingStrategyNames.has(strategy.name.toLowerCase())) continue;
      // Row ids are a GLOBAL primary key: keep the payload id when free
      // (same-user restore keeps ids stable), mint a fresh one otherwise.
      const existingRow = await this.prisma.playbookRow.findUnique({ where: { id: strategy.id } });
      const rowId = existingRow === null ? strategy.id : crypto.randomUUID();
      await this.playbook.insert(
        userId,
        "STRATEGY",
        rowId,
        { ...strategy, id: rowId } as unknown as never,
      );
      strategiesAdded += 1;
    }

    let tagsAdded = 0;
    for (const tag of payload.tags) {
      if (existingTagIds.has(tag.id)) continue;
      if (existingTagNames.has(tag.name.toLowerCase())) continue;
      const { id: _tagId, userId: _tagUserId, ...tagData } = tag;
      void _tagId;
      void _tagUserId;
      const existingTag = await this.prisma.tagRow.findUnique({ where: { id: tag.id } });
      const tagRowId = existingTag === null ? tag.id : crypto.randomUUID();
      await this.prisma.tagRow.create({
        data: { userId, id: tagRowId, data: tagData },
      });
      tagsAdded += 1;
    }

    return {
      imported: {
        trades: payload.trades.length,
        strategies: strategiesAdded,
        tags: tagsAdded,
      },
    };
  }
}
