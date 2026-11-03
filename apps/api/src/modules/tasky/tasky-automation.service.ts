import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";

import {
  taskyAutomationConfigSchema,
  taskyAutomationRuleCreateSchema,
  taskyAutomationRuleSchema,
  taskyAutomationRuleUpdateSchema,
  taskyAutomationRunSchema,
  taskyKanbanBoardStateSchema,
  type TaskyAutomationRule,
  type TaskyAutomationRuleCreateInput,
  type TaskyKanbanBoardState,
} from "../../shared/contracts";
import { DisciplineService } from "../discipline/discipline.service";
import { TaskyRepository } from "./tasky.repository";

type RuleRow = Awaited<ReturnType<TaskyRepository["listAutomations"]>>[number];
type RunRow = Awaited<ReturnType<TaskyRepository["listAutomationRuns"]>>[number];
type ColumnLocation = { columnId: string; columnTitle: string; card: TaskyKanbanBoardState["columns"][number]["cards"][number] };

const REMINDER_INTERVAL_MS = 60_000;

export function taskyDateKeyInTimezone(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  }
}

export function taskyDaysBetweenDateKeys(from: string, to: string): number {
  const parse = (key: string) => {
    const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(key);
    if (!match) return Number.NaN;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

function boardLocations(board: TaskyKanbanBoardState): Map<string, ColumnLocation> {
  return new Map(board.columns.flatMap((column) =>
    column.cards.map((card) => [card.id, { columnId: column.id, columnTitle: column.title, card }] as const),
  ));
}

function isCompletedColumn(id: string, title: string): boolean {
  const normalized = `${id} ${title}`.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
  return /(^|\\s)(done|complete|completed|finished|fini|finie|termine|terminee)(\\s|$)/.test(normalized);
}

function uuidFromKey(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected automation error";
  return message.replace(/[\\r\\n]+/g, " ").slice(0, 500);
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

@Injectable()
export class TaskyAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskyAutomationService.name);
  private timer: NodeJS.Timeout | undefined;
  private reminderSweepRunning = false;

  constructor(
    private readonly repository: TaskyRepository,
    private readonly discipline: DisciplineService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runScheduledReminders();
    }, REMINDER_INTERVAL_MS);
    this.timer.unref?.();
    void this.runScheduledReminders();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async listRules(userId: string) {
    const rows = await this.repository.listAutomations(userId);
    return { rules: rows.map((row) => this.toRule(row)) };
  }

  async createRule(userId: string, input: unknown) {
    const parsed = taskyAutomationRuleCreateSchema.parse(input);
    await this.validateColumnCondition(userId, parsed);
    const row = await this.repository.createAutomation(userId, parsed);
    return { rule: this.toRule(row) };
  }

  async updateRule(userId: string, id: string, input: unknown) {
    const patch = taskyAutomationRuleUpdateSchema.parse(input);
    const row = await this.repository.findAutomation(userId, id);
    if (!row) throw new NotFoundException("Tasky automation rule not found.");
    const combined = taskyAutomationRuleCreateSchema.parse({
      name: patch.name ?? row.name,
      trigger: patch.trigger ?? row.trigger,
      enabled: patch.enabled ?? row.enabled,
      config: patch.config ?? row.config,
    });
    // Pausing or renaming a stale rule must remain possible even if its
    // destination column was removed from the board after the rule was created.
    if (patch.config !== undefined || patch.trigger !== undefined || (patch.enabled === true && !row.enabled)) {
      await this.validateColumnCondition(userId, combined);
    }
    const updated = await this.repository.updateAutomation(userId, id, combined);
    if (!updated) throw new NotFoundException("Tasky automation rule not found.");
    return { rule: this.toRule(updated) };
  }

  async deleteRule(userId: string, id: string) {
    const deleted = await this.repository.deleteAutomation(userId, id);
    if (!deleted) throw new NotFoundException("Tasky automation rule not found.");
    return { deleted: true as const, id };
  }

  async listRuns(userId: string) {
    const rows = await this.repository.listAutomationRuns(userId, 50);
    return { runs: rows.map((row) => this.toRun(row)) };
  }

  /** Compare consecutive persisted snapshots; only genuine column transitions trigger a rule. */
  async onBoardSaved(
    userId: string,
    previous: TaskyKanbanBoardState,
    current: TaskyKanbanBoardState,
  ): Promise<TaskyKanbanBoardState> {
    const before = boardLocations(previous);
    const after = boardLocations(current);
    const rules = (await this.repository.listAutomations(userId))
      .filter((row) => row.enabled && row.trigger === "CARD_MOVED")
      .map((row) => this.toRule(row));
    let updatedBoard = current;
    let boardChanged = false;
    const priorityApplied = new Set<string>();
    const notifications: Array<{
      userId: string;
      rule: TaskyAutomationRule;
      trigger: string;
      cardId: string;
      cardTitle: string;
      message: string;
      payload: Record<string, unknown>;
    }> = [];

    for (const [cardId, location] of after) {
      const old = before.get(cardId);
      if (!old || old.columnId === location.columnId || location.card.archivedAt) continue;
      for (const rule of rules) {
        if (rule.config.destinationColumnId !== location.columnId) continue;

        let priorityChanged = false;
        const targetPriority = rule.config.targetPriority;
        if (
          rule.config.action === "SET_PRIORITY" &&
          targetPriority &&
          !priorityApplied.has(cardId)
        ) {
          const previousCard = updatedBoard.columns
            .flatMap((column) => column.cards)
            .find((card) => card.id === cardId);
          if (previousCard && previousCard.priority !== targetPriority) {
            const activity = {
              id: randomUUID(),
              type: "updated" as const,
              message: `Automation “${rule.name}” set priority to ${targetPriority}.`.slice(0, 180),
              createdAt: new Date().toISOString(),
            };
            updatedBoard = {
              columns: updatedBoard.columns.map((column) => ({
                ...column,
                cards: column.cards.map((card) => card.id === cardId
                  ? {
                      ...card,
                      priority: targetPriority,
                      activity: [...(card.activity ?? []), activity].slice(-100),
                    }
                  : card),
              })),
            };
            boardChanged = true;
            priorityChanged = true;
          }
          // For overlapping rules, the most recently updated priority rule wins.
          priorityApplied.add(cardId);
        }

        const defaultMessage = priorityChanged
          ? `“${location.card.title}” moved to ${location.columnTitle}; priority set to ${targetPriority}.`
          : `“${location.card.title}” moved from ${old.columnTitle} to ${location.columnTitle}.`;
        const message = rule.config.notificationMessage?.trim() || defaultMessage;
        notifications.push({
          userId,
          rule,
          trigger: "CARD_MOVED",
          cardId,
          cardTitle: location.card.title,
          message,
          payload: {
            source: "tasky",
            automationId: rule.id,
            cardId,
            cardTitle: location.card.title,
            fromColumnId: old.columnId,
            toColumnId: location.columnId,
            action: priorityChanged ? "SET_PRIORITY" : "NOTIFY",
            ...(priorityChanged ? { priority: targetPriority } : {}),
          },
        });
      }
    }

    // Commit the card mutation before recording notification success. A failed
    // action write must never be reported as a successful automation run.
    if (boardChanged) {
      const saved = await this.repository.saveForUser(userId, updatedBoard);
      const validated = taskyKanbanBoardStateSchema.safeParse(saved.data);
      if (!validated.success) {
        throw new BadRequestException("The Tasky board failed validation after an automation action.");
      }
      updatedBoard = validated.data;
    }

    for (const notification of notifications) {
      await this.recordNotification(notification);
    }
    return updatedBoard;
  }

  /** Manual button and background worker both use the same idempotent due-date evaluator. */
  async runDueDateChecks(userId: string) {
    const created = await this.checkDueDatesForUser(userId);
    return { checked: true as const, notificationsCreated: created };
  }

  async remindCard(userId: string, cardId: string) {
    const row = await this.repository.findByUserId(userId);
    if (!row) throw new NotFoundException("Tasky board not found.");
    const parsed = taskyKanbanBoardStateSchema.safeParse(row.data);
    if (!parsed.success) throw new BadRequestException("The saved Tasky board could not be read safely.");
    const location = boardLocations(parsed.data).get(cardId);
    if (!location || location.card.archivedAt) throw new NotFoundException("Active Tasky card not found.");

    const message = `Manual reminder requested for “${location.card.title}”.`;
    await this.recordNotification({
      userId,
      rule: null,
      trigger: "MANUAL_REMINDER",
      cardId,
      cardTitle: location.card.title,
      message,
      payload: { source: "tasky", cardId, cardTitle: location.card.title, columnId: location.columnId },
    });
    return { sent: true as const };
  }

  private async validateColumnCondition(
    userId: string,
    rule: TaskyAutomationRuleCreateInput,
  ): Promise<void> {
    if (rule.trigger !== "CARD_MOVED") return;
    const boardRow = await this.repository.findByUserId(userId);
    if (!boardRow) throw new BadRequestException("Create your Tasky board before configuring a column rule.");
    const board = taskyKanbanBoardStateSchema.safeParse(boardRow.data);
    if (!board.success) throw new BadRequestException("The saved Tasky board could not be read safely.");
    if (!board.data.columns.some((column) => column.id === rule.config.destinationColumnId)) {
      throw new BadRequestException("The destination column does not exist on your Tasky board.");
    }
  }

  private toRule(row: RuleRow): TaskyAutomationRule {
    return taskyAutomationRuleSchema.parse({
      id: row.id,
      name: row.name,
      trigger: row.trigger,
      enabled: row.enabled,
      config: taskyAutomationConfigSchema.parse(row.config),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private toRun(row: RunRow) {
    return taskyAutomationRunSchema.parse({
      id: row.id,
      automationId: row.automationId,
      automationName: row.automationName,
      trigger: row.trigger,
      cardId: row.cardId,
      cardTitle: row.cardTitle,
      status: row.status,
      message: row.message,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    });
  }

  private async runScheduledReminders(): Promise<void> {
    if (this.reminderSweepRunning) return;
    this.reminderSweepRunning = true;
    try {
      const rules = await this.repository.listEnabledAutomationsForScheduler();
      const userIds = [...new Set(rules.map((rule) => rule.userId))];
      for (const userId of userIds) await this.checkDueDatesForUser(userId);
    } catch (error) {
      this.logger.error(`Tasky reminder sweep failed: ${safeError(error)}`);
    } finally {
      this.reminderSweepRunning = false;
    }
  }

  private async checkDueDatesForUser(userId: string): Promise<number> {
    const boardRow = await this.repository.findByUserId(userId);
    if (!boardRow) return 0;
    const parsedBoard = taskyKanbanBoardStateSchema.safeParse(boardRow.data);
    if (!parsedBoard.success) {
      this.logger.warn("Skipped Tasky reminders because a saved board failed validation.");
      return 0;
    }

    const rules = (await this.repository.listAutomations(userId))
      .filter((row) => row.enabled && (row.trigger === "DUE_SOON" || row.trigger === "OVERDUE"))
      .map((row) => this.toRule(row));
    if (rules.length === 0) return 0;
    const timezone = await this.repository.getUserTimezone(userId);
    const today = taskyDateKeyInTimezone(new Date(), timezone);
    let notificationsCreated = 0;

    for (const column of parsedBoard.data.columns) {
      if (isCompletedColumn(column.id, column.title)) continue;
      for (const card of column.cards) {
        if (!card.due || card.archivedAt) continue;
        const daysUntilDue = taskyDaysBetweenDateKeys(today, card.due);
        for (const rule of rules) {
          const isDueSoon = rule.trigger === "DUE_SOON" &&
            daysUntilDue >= 0 && daysUntilDue <= (rule.config.daysBeforeDue ?? 1);
          const isOverdue = rule.trigger === "OVERDUE" && daysUntilDue < 0;
          if (!isDueSoon && !isOverdue) continue;

          const dedupeKey = `tasky:${rule.id}:${card.id}:${rule.trigger}:${card.due}`;
          const message = rule.config.notificationMessage?.trim() ||
            (isOverdue
              ? `“${card.title}” is overdue (due ${card.due}).`
              : `“${card.title}” is due ${daysUntilDue === 0 ? "today" : `in ${daysUntilDue} day(s)`}.`);
          const created = await this.recordNotification({
            userId,
            rule,
            trigger: rule.trigger,
            cardId: card.id,
            cardTitle: card.title,
            message,
            dedupeKey,
            payload: {
              source: "tasky",
              automationId: rule.id,
              cardId: card.id,
              cardTitle: card.title,
              dueDate: card.due,
              columnId: column.id,
            },
          });
          if (created) notificationsCreated += 1;
        }
      }
    }
    return notificationsCreated;
  }

  /** Persist a RUNNING record first, then publish to Euforia's existing inbox. */
  private async recordNotification(input: {
    userId: string;
    rule: TaskyAutomationRule | null;
    trigger: string;
    cardId: string | null;
    cardTitle: string | null;
    message: string;
    payload: Record<string, unknown>;
    dedupeKey?: string;
  }): Promise<boolean> {
    let run: RunRow | null = null;
    if (input.dedupeKey) {
      const existing = await this.repository.findAutomationRunByDedupeKey(input.dedupeKey);
      if (existing?.status === "SUCCEEDED") return false;
      if (existing?.status === "RUNNING" && Date.now() - existing.createdAt.getTime() < 5 * 60_000) return false;
      if (existing) {
        run = await this.repository.updateAutomationRun(existing.id, {
          status: "RUNNING",
          message: input.message.slice(0, 240),
          error: null,
        });
      }
    }

    if (!run) {
      try {
        run = await this.repository.createAutomationRun({
          userId: input.userId,
          automationId: input.rule?.id ?? null,
          automationName: input.rule?.name ?? "Manual Tasky reminder",
          trigger: input.trigger,
          cardId: input.cardId,
          cardTitle: input.cardTitle,
          status: "RUNNING",
          message: input.message.slice(0, 240),
          dedupeKey: input.dedupeKey,
        });
      } catch (error) {
        if (!input.dedupeKey || !isDuplicateKeyError(error)) throw error;
        const existing = await this.repository.findAutomationRunByDedupeKey(input.dedupeKey);
        if (!existing || existing.status === "SUCCEEDED") return false;
        if (existing.status === "RUNNING" && Date.now() - existing.createdAt.getTime() < 5 * 60_000) return false;
        run = await this.repository.updateAutomationRun(existing.id, {
          status: "RUNNING",
          message: input.message.slice(0, 240),
          error: null,
        });
      }
    }

    try {
      const alertKey = input.dedupeKey ?? `tasky-manual:${run.id}`;
      await this.discipline.publishAlert(input.userId, {
        id: uuidFromKey(alertKey),
        type: "SYSTEM",
        severity: input.trigger === "OVERDUE" ? "WARN" : "NOTIFY",
        title: input.rule ? `Tasky · ${input.rule.name}` : "Tasky reminder",
        message: input.message.slice(0, 500),
        payload: input.payload,
        tradeId: null,
      });
      await this.repository.updateAutomationRun(run.id, {
        status: "SUCCEEDED",
        message: input.message.slice(0, 240),
        error: null,
      });
      return true;
    } catch (error) {
      await this.repository.updateAutomationRun(run.id, {
        status: "FAILED",
        message: "Automation failed while publishing a notification.",
        error: safeError(error),
      });
      this.logger.warn(`Tasky automation failed: ${safeError(error)}`);
      return false;
    }
  }
}
