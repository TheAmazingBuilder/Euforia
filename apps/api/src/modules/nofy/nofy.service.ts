/**
 * Nofy service (B11) - the knowledge workspace's server-side brain.
 *
 * Owns per-user Nofy state (notes composed of ordered blocks, folders,
 * tags, templates, version history) in the nofyRow bounded context.
 * Trading-entity references are stored as relational pointers (kind + id)
 * and RE-RESOLVED on every read, so display labels and deep links can
 * never go stale (spec §24/§31).
 *
 * Cross-context reads are contract-narrow: TradesService (journal facts +
 * instruments), PlaybookService (strategies/setups/rules), and the
 * deterministic eco generator (calendar). Academy lessons have no rows in
 * this backend yet - LESSON pointers stay stored and resolve as
 * "Unresolved reference" until B12 lands.
 */
import { Injectable } from "@nestjs/common";
import type {
  NofyActivityWeek,
  NofyBlock,
  NofyBlockInput,
  NofyNote,
  NofyNoteRow,
  NofyRefKind,
  NofyRefResolved,
  NofyTemplate,
} from "../../shared/contracts";
import { generateEcoEvents } from "../calendar/eco-calendar";
import { PlaybookService } from "../playbook/playbook.service";
import { TradesService } from "../trades/trades.service";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { TRADE_ERROR_CODES as TRADING_ERROR } from "../../shared/contracts";
import { buildSeed, builtInTemplates, type NofySeedContext } from "./nofy-seed";
import { NofyRepository, type NofyRow } from "./nofy.repository";

type NofyVersionRecord = {
  id: string;
  noteId: string;
  title: string;
  blocks: NofyBlock[];
  savedAt: string;
};

const nowIso = (): string => new Date().toISOString();

// ── Block text projections ───────────────────────────────────────────────────

const TEXT_BEARING = new Set<NofyBlock["type"]>([
  "paragraph", "h1", "h2", "h3", "bullet", "numbered", "todo", "quote", "callout", "code",
]);

/** Plain-text projection of a block list - search, excerpt and word count. */
function textOfBlocks(blocks: NofyBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (TEXT_BEARING.has(block.type) && block.text.trim() !== "") parts.push(block.text.trim());
    if (block.type === "table" && block.rows) {
      for (const row of block.rows) parts.push(row.join(" - "));
    }
    if (block.type === "image" && block.caption) parts.push(block.caption);
  }
  return parts.join("\n");
}

const wordCountOf = (text: string): number => text.split(/\s+/).filter((word) => word !== "").length;

const countWords = (blocks: NofyBlock[]): number => wordCountOf(textOfBlocks(blocks));

const countOpenTodos = (blocks: NofyBlock[]): number =>
  blocks.filter((block) => block.type === "todo" && !block.checked).length;

/** ~180-char excerpt from the first text-bearing blocks. */
function excerptOf(blocks: NofyBlock[]): string {
  const text = textOfBlocks(blocks).replace(/\n+/g, " · ");
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

function normalizeBlocks(input: NofyBlockInput[]): NofyBlock[] {
  return input.map((block) => {
    const out: NofyBlock = { id: block.id, type: block.type, text: block.text ?? "" };
    if (block.checked !== undefined) out.checked = block.checked;
    if (block.tone !== undefined) out.tone = block.tone;
    if (block.src !== undefined) out.src = block.src;
    if (block.alt !== undefined) out.alt = block.alt;
    if (block.caption !== undefined) out.caption = block.caption;
    if (block.rows !== undefined) out.rows = block.rows;
    if (block.ref !== undefined && block.ref !== null) {
      out.ref = { kind: block.ref.kind, id: block.ref.id };
    }
    return out;
  });
}

const byUpdatedDesc = (a: NofyNote, b: NofyNote): number => b.updatedAt.localeCompare(a.updatedAt);

export type NofyListScope =
  | { view: "all" | "favorites" | "trash" | "recent" }
  | { view: "folder"; folderId: string }
  | { view: "tag"; tagId: string };

@Injectable()
export class NofyService {
  constructor(
    private readonly repository: NofyRepository,
    private readonly trades: TradesService,
    private readonly playbook: PlaybookService,
  ) {}

  // ── State access ───────────────────────────────────────────────────────────

  private async notes(userId: string): Promise<NofyNote[]> {
    const rows = await this.repository.listByKind(userId, "NOTE");
    return rows.map((row) => row.data as unknown as NofyNote);
  }

  private async folders(userId: string): Promise<Array<{ id: string; name: string; createdAt: string }>> {
    const rows = await this.repository.listByKind(userId, "FOLDER");
    return rows.map((row) => row.data as unknown as { id: string; name: string; createdAt: string });
  }

  private async tags(userId: string): Promise<Array<{ id: string; name: string }>> {
    const rows = await this.repository.listByKind(userId, "TAG");
    return rows.map((row) => row.data as unknown as { id: string; name: string });
  }

  private async templates(userId: string): Promise<NofyTemplate[]> {
    const rows = await this.repository.listByKind(userId, "TEMPLATE");
    return rows.map((row) => row.data as unknown as NofyTemplate);
  }

  private async versionsOf(userId: string, noteId: string): Promise<NofyVersionRecord[]> {
    const rows = await this.repository.listByKind(userId, "VERSION");
    return rows
      .map((row) => row.data as unknown as NofyVersionRecord)
      .filter((version) => version.noteId === noteId)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  /**
   * Lazy per-user seed - the demo workspace appears on first read, with
   * reference blocks pointing at the user's REAL entities when available.
   */
  private async ensureSeed(userId: string): Promise<void> {
    const existing = await this.repository.listByKind(userId, "FOLDER");
    if (existing.length > 0) return;

    // Real-entity context for the demo references (same fallbacks as the mock).
    const context: NofySeedContext = {};
    const [trades, strategies, setups, instruments] = await Promise.all([
      this.trades.listTrades(userId, {}).catch(() => ({ trades: [] as Array<Record<string, unknown>> })),
      this.playbook.listStrategies(userId).catch(() => ({ strategies: [] as Array<{ id: string }> })),
      this.playbook.listSetups(userId).catch(() => ({ setups: [] as Array<{ id: string }> })),
      this.trades.listInstruments().catch(() => ({ instruments: [] as Array<{ id: string; symbol: string }> })),
    ]);

    const closed = (trades.trades as Array<Record<string, unknown>>).filter((t) => t.status === "CLOSED");
    const rOf = (t: Record<string, unknown>): number => Number(t.rMultiple ?? 0);
    const losingTrade = closed.find((t) => rOf(t) < -0.5) ?? closed[0];
    const winningTrade = closed.find((t) => rOf(t) >= 1.5) ?? closed[1] ?? closed[0];
    context.losingTradeId = losingTrade ? String(losingTrade.id) : undefined;
    context.winningTradeId = winningTrade ? String(winningTrade.id) : undefined;
    context.strategyId = strategies.strategies[0]?.id;
    context.setupId = setups.setups[0]?.id;
    context.xauusdInstrumentId = instruments.instruments.find((i) => i.symbol === "XAUUSD")?.id
      ?? instruments.instruments[0]?.id;

    const events = generateEcoEvents(new Date());
    context.highImpactEventId = events.find((e) => e.impact === "HIGH")?.id ?? events[0]?.id;

    const seed = buildSeed(context);
    for (const folder of seed.folders) {
      await this.repository.insert(userId, "FOLDER", folder.id, folder as unknown as never);
    }
    for (const tag of seed.tags) {
      await this.repository.insert(userId, "TAG", tag.id, tag as unknown as never);
    }
    for (const template of seed.templates) {
      // Built-in template ids are slug ids (tpl-…), not uuids - the row id
      // column requires a uuid, so the row id is derived while the slug id
      // stays inside the payload.
      await this.repository.insert(
        userId,
        "TEMPLATE",
        crypto.randomUUID(),
        template as unknown as never,
      );
    }
    for (const note of seed.notes) {
      await this.repository.insert(userId, "NOTE", note.id, note as unknown as never);
    }
  }

  // ── Reference resolution (relational pointers → fresh display data) ────────

  private async resolveRef(userId: string, kind: NofyRefKind, id: string): Promise<NofyRefResolved | null> {
    try {
      switch (kind) {
        case "TRADE": {
          const { trades } = await this.trades.listTrades(userId, {});
          const trade = trades.find((t) => t.id === id);
          if (!trade) return null;
          const { instruments } = await this.trades.listInstruments();
          const symbol = instruments.find((i) => i.id === trade.instrumentId)?.symbol ?? "-";
          const r = Number(trade.rMultiple ?? 0);
          const meta = trade.status === "CLOSED"
            ? `${symbol} ${trade.direction} · ${trade.status} · ${r >= 0 ? "+" : ""}${r.toFixed(2)}R`
            : `${symbol} ${trade.direction} · ${trade.status}`;
          return { kind, id, label: `Trade ${symbol} ${trade.direction}`, meta, href: `/trades?trade=${trade.id}` };
        }
        case "STRATEGY": {
          const { strategies } = await this.playbook.listStrategies(userId);
          const strategy = strategies.find((s) => s.id === id);
          if (!strategy) return null;
          return { kind, id, label: strategy.name, meta: "Playbook strategy", href: "/playbook?tab=strategies" };
        }
        case "SETUP": {
          const { setups } = await this.playbook.listSetups(userId);
          const setup = setups.find((s) => s.id === id);
          if (!setup) return null;
          return { kind, id, label: setup.name, meta: "Playbook setup", href: "/playbook?tab=setups" };
        }
        case "RULE": {
          const { rules } = await this.playbook.listPlaybookRules(userId);
          const rule = rules.find((r) => r.id === id);
          if (!rule) return null;
          return { kind, id, label: rule.title, meta: "Playbook rule", href: "/playbook?tab=rules" };
        }
        case "LESSON": {
          // Academy rows do not exist in this backend yet (B12 pending) -
          // the pointer stays stored and renders as unresolved.
          return null;
        }
        case "EVENT": {
          const event = generateEcoEvents(new Date()).find((e) => e.id === id);
          if (!event) return null;
          return { kind, id, label: event.title, meta: `${event.currency} · ${event.impact} impact`, href: "/calendar" };
        }
        case "SYMBOL": {
          const { instruments } = await this.trades.listInstruments();
          const instrument = instruments.find((i) => i.id === id || i.symbol === id);
          if (!instrument) return null;
          return { kind, id: instrument.id, label: instrument.symbol, meta: instrument.assetClass, href: "/session" };
        }
        case "NOTE": {
          const notes = await this.notes(userId);
          const note = notes.find((n) => n.id === id && n.deletedAt === null);
          if (!note) return null;
          return {
            kind,
            id,
            label: note.title === "" ? "Untitled note" : note.title,
            meta: "Nofy note",
            href: `/nofy?tab=notes&note=${note.id}`,
          };
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /** Resolve every ref block of a note in place (server-authoritative labels). */
  private async resolveNoteRefs(userId: string, note: NofyNote): Promise<void> {
    for (const block of note.blocks) {
      if (block.type === "ref" && block.ref) {
        const resolved = await this.resolveRef(userId, block.ref.kind, block.ref.id);
        block.ref = {
          kind: block.ref.kind,
          id: block.ref.id,
          label: resolved?.label ?? block.ref.label ?? "Unresolved reference",
          meta: resolved?.meta ?? null,
          href: resolved?.href ?? null,
        };
      }
    }
  }

  // ── Projections ─────────────────────────────────────────────────────────────

  private folderNameOf(
    folderId: string | null,
    folders: Array<{ id: string; name: string }>,
  ): string | null {
    return folderId === null ? null : folders.find((folder) => folder.id === folderId)?.name ?? null;
  }

  private tagNamesOf(tagIds: string[], tags: Array<{ id: string; name: string }>): string[] {
    return tagIds
      .map((tagId) => tags.find((tag) => tag.id === tagId)?.name ?? null)
      .filter((name): name is string => name !== null);
  }

  private toRow(
    note: NofyNote,
    folders: Array<{ id: string; name: string }>,
    tags: Array<{ id: string; name: string }>,
  ): NofyNoteRow {
    return {
      id: note.id,
      title: note.title,
      icon: note.icon,
      folderId: note.folderId,
      folderName: this.folderNameOf(note.folderId, folders),
      tagIds: [...note.tagIds],
      tagNames: this.tagNamesOf(note.tagIds, tags),
      favorite: note.favorite,
      templateId: note.templateId,
      lessonRef: note.lessonRef,
      excerpt: excerptOf(note.blocks),
      wordCount: countWords(note.blocks),
      blockCount: note.blocks.length,
      refCount: note.blocks.filter((block) => block.type === "ref").length,
      todoOpen: countOpenTodos(note.blocks),
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      lastViewedAt: note.lastViewedAt,
      deletedAt: note.deletedAt,
    };
  }

  private noteResponse(note: NofyNote, folders: Array<{ id: string; name: string }>, tags: Array<{ id: string; name: string }>) {
    return {
      note,
      folderName: this.folderNameOf(note.folderId, folders),
      tagNames: this.tagNamesOf(note.tagIds, tags),
    };
  }

  // ── Reads ───────────────────────────────────────────────────────────────────

  async listNotes(
    userId: string,
    scope: NofyListScope,
    query?: { q?: string; sort?: string },
  ) {
    await this.ensureSeed(userId);
    const [all, folders, tags] = await Promise.all([
      this.notes(userId),
      this.folders(userId),
      this.tags(userId),
    ]);

    let notes = all.filter((n) => n.deletedAt === null);
    if (scope.view === "trash") notes = all.filter((n) => n.deletedAt !== null);
    if (scope.view === "favorites") notes = notes.filter((n) => n.favorite);
    if (scope.view === "recent") notes = notes.filter((n) => n.lastViewedAt !== null);
    if (scope.view === "folder" && "folderId" in scope) notes = notes.filter((n) => n.folderId === scope.folderId);
    if (scope.view === "tag" && "tagId" in scope) notes = notes.filter((n) => n.tagIds.includes(scope.tagId));

    const q = query?.q?.trim().toLowerCase() ?? "";
    if (q !== "") {
      notes = notes.filter((note) => {
        const inTitle = note.title.toLowerCase().includes(q);
        const inText = textOfBlocks(note.blocks).toLowerCase().includes(q);
        const inTags = this.tagNamesOf(note.tagIds, tags).some((name) => name.toLowerCase().includes(q));
        const inFolder = (this.folderNameOf(note.folderId, folders) ?? "").toLowerCase().includes(q);
        return inTitle || inText || inTags || inFolder;
      });
    }

    const sort = query?.sort ?? "updated";
    const sorted = [...notes].sort((a, b) => {
      switch (sort) {
        case "created": return b.createdAt.localeCompare(a.createdAt);
        case "title": return a.title.localeCompare(b.title);
        case "viewed": return (b.lastViewedAt ?? "").localeCompare(a.lastViewedAt ?? "");
        default: return byUpdatedDesc(a, b);
      }
    });
    return { notes: sorted.map((note) => this.toRow(note, folders, tags)), total: sorted.length };
  }

  /** Notes linked to an app entity - the Playbook / Trade Review integration. */
  async listNotesLinkedTo(userId: string, kind: NofyRefKind, id: string) {
    await this.ensureSeed(userId);
    const [all, folders, tags] = await Promise.all([this.notes(userId), this.folders(userId), this.tags(userId)]);
    const linked = all
      .filter((n) => n.deletedAt === null)
      .filter((n) => n.blocks.some((b) => b.type === "ref" && b.ref?.kind === kind && b.ref?.id === id))
      .sort(byUpdatedDesc);
    return { notes: linked.map((note) => this.toRow(note, folders, tags)), total: linked.length };
  }

  async getNote(userId: string, id: string, options: { touchViewed?: boolean } = {}) {
    await this.ensureSeed(userId);
    const row = await this.repository.findForUser(userId, "NOTE", id);
    if (!row) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const note = row.data as unknown as NofyNote;
    if (options.touchViewed) {
      note.lastViewedAt = nowIso();
      await this.repository.updateData(row.id, note as unknown as never);
    }
    await this.resolveNoteRefs(userId, note);
    const [folders, tags] = await Promise.all([this.folders(userId), this.tags(userId)]);
    return this.noteResponse(note, folders, tags);
  }

  async searchNofy(userId: string, q: string) {
    await this.ensureSeed(userId);
    const query = q.trim().toLowerCase();
    const [all, folders, tags] = await Promise.all([this.notes(userId), this.folders(userId), this.tags(userId)]);
    if (query === "") return { results: [], total: 0 };

    const results = all
      .filter((n) => n.deletedAt === null)
      .map((note) => {
        const titleHit = note.title.toLowerCase().includes(query);
        const fullText = textOfBlocks(note.blocks);
        const textHit = fullText.toLowerCase().includes(query);
        const tagHit = this.tagNamesOf(note.tagIds, tags).some((t) => t.toLowerCase().includes(query));
        if (!titleHit && !textHit && !tagHit) return null;

        let snippet = excerptOf(note.blocks);
        if (textHit) {
          const index = fullText.toLowerCase().indexOf(query);
          const start = Math.max(0, index - 60);
          snippet = `${start > 0 ? "…" : ""}${fullText
            .slice(start, Math.min(fullText.length, index + query.length + 80))
            .replace(/\n+/g, " ")}${index + query.length + 80 < fullText.length ? "…" : ""}`;
        }
        return { ...this.toRow(note, folders, tags), snippet };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 30);

    return { results, total: results.length };
  }

  /** Entity picker - referenceable entities across the whole app. */
  async listRefs(userId: string, q: string, kind?: string) {
    const query = q.trim().toLowerCase();
    const ALL_KINDS: NofyRefKind[] = ["TRADE", "STRATEGY", "SETUP", "RULE", "LESSON", "EVENT", "SYMBOL", "NOTE"];
    const kinds: NofyRefKind[] = kind && ALL_KINDS.includes(kind as NofyRefKind) ? [kind as NofyRefKind] : ALL_KINDS;

    const hits: NofyRefResolved[] = [];
    const push = async (refKind: NofyRefKind, id: string): Promise<void> => {
      const resolved = await this.resolveRef(userId, refKind, id);
      if (resolved) hits.push(resolved);
    };

    if (kinds.includes("TRADE")) {
      const { trades } = await this.trades.listTrades(userId, {}).catch(() => ({ trades: [] as Array<{ id: string }> }));
      for (const trade of trades.slice(0, 60)) await push("TRADE", trade.id);
    }
    if (kinds.includes("STRATEGY")) {
      const { strategies } = await this.playbook.listStrategies(userId).catch(() => ({ strategies: [] as Array<{ id: string }> }));
      for (const strategy of strategies) await push("STRATEGY", strategy.id);
    }
    if (kinds.includes("SETUP")) {
      const { setups } = await this.playbook.listSetups(userId).catch(() => ({ setups: [] as Array<{ id: string }> }));
      for (const setup of setups) await push("SETUP", setup.id);
    }
    if (kinds.includes("RULE")) {
      const { rules } = await this.playbook.listPlaybookRules(userId).catch(() => ({ rules: [] as Array<{ id: string }> }));
      for (const rule of rules) await push("RULE", rule.id);
    }
    // LESSON: no Academy rows yet (B12 pending) - nothing to list.
    if (kinds.includes("EVENT")) {
      for (const event of generateEcoEvents(new Date()).slice(0, 40)) await push("EVENT", event.id);
    }
    if (kinds.includes("SYMBOL")) {
      const { instruments } = await this.trades.listInstruments().catch(() => ({ instruments: [] as Array<{ id: string }> }));
      for (const instrument of instruments) await push("SYMBOL", instrument.id);
    }
    if (kinds.includes("NOTE")) {
      await this.ensureSeed(userId);
      for (const note of (await this.notes(userId)).filter((n) => n.deletedAt === null)) await push("NOTE", note.id);
    }

    const filtered = query === ""
      ? hits
      : hits.filter((hit) => `${hit.label} ${hit.meta ?? ""}`.toLowerCase().includes(query));
    return { refs: filtered.slice(0, 40) };
  }

  // ── Overview ────────────────────────────────────────────────────────────────

  async nofyOverview(userId: string) {
    await this.ensureSeed(userId);
    const [all, folderRows, tagRows, templateRows] = await Promise.all([
      this.notes(userId),
      this.folders(userId),
      this.tags(userId),
      this.templates(userId),
    ]);
    const active = all.filter((n) => n.deletedAt === null);
    const weekAgo = nowIso();
    const weekAgoMs = new Date(weekAgo).getTime() - 7 * 86_400_000;
    const nowMs = new Date(nowIso()).getTime();
    const startOfWeekMs = nowMs - ((new Date().getUTCDay() + 6) % 7) * 86_400_000;

    const activity: NofyActivityWeek[] = [];
    for (let weekOffset = 7; weekOffset >= 0; weekOffset -= 1) {
      const weekStartMs = startOfWeekMs - weekOffset * 7 * 86_400_000;
      const weekEndMs = weekStartMs + 7 * 86_400_000;
      const created = active.filter((n) => {
        const at = new Date(n.createdAt).getTime();
        return at >= weekStartMs && at < weekEndMs;
      }).length;
      const edited = active.filter((n) => {
        const at = new Date(n.updatedAt).getTime();
        return at >= weekStartMs && at < weekEndMs && !(new Date(n.createdAt).getTime() >= weekStartMs && new Date(n.createdAt).getTime() < weekEndMs);
      }).length;
      activity.push({ weekStart: new Date(weekStartMs).toISOString().slice(0, 10), created, edited });
    }
    void weekAgoMs;

    const tagCounts = new Map<string, number>();
    for (const note of active) for (const tagId of note.tagIds) tagCounts.set(tagId, (tagCounts.get(tagId) ?? 0) + 1);

    const foldersWithCounts = folderRows.map((f) => ({
      ...f,
      noteCount: active.filter((n) => n.folderId === f.id).length,
    }));

    const recentlyViewed = active
      .filter((n) => n.lastViewedAt !== null)
      .sort((a, b) => (b.lastViewedAt ?? "").localeCompare(a.lastViewedAt ?? ""))
      .slice(0, 5);

    return {
      totals: {
        notes: active.length,
        createdThisWeek: active.filter((n) => new Date(n.createdAt).getTime() >= weekAgoMs).length,
        favorites: active.filter((n) => n.favorite).length,
        folders: folderRows.length,
        tags: tagRows.length,
        trashed: all.filter((n) => n.deletedAt !== null).length,
      },
      recentEdited: [...active].sort(byUpdatedDesc).slice(0, 6).map((note) => this.toRow(note, folderRows, tagRows)),
      recentViewed: recentlyViewed.map((note) => this.toRow(note, folderRows, tagRows)),
      favorites: active.filter((n) => n.favorite).sort(byUpdatedDesc).slice(0, 5).map((note) => this.toRow(note, folderRows, tagRows)),
      folders: foldersWithCounts.sort((a, b) => a.name.localeCompare(b.name)),
      topTags: [...tagCounts.entries()]
        .map(([tagId, noteCount]) => {
          const tag = tagRows.find((t) => t.id === tagId);
          return tag ? { ...tag, noteCount } : null;
        })
        .filter((t): t is NonNullable<typeof t> => t !== null)
        .sort((a, b) => b.noteCount - a.noteCount)
        .slice(0, 8),
      activity,
      templates: templateRows.slice(0, 4),
    };
  }

  // ── Note mutations ──────────────────────────────────────────────────────────

  async createNote(userId: string, input: { title?: string; folderId?: string | null; templateId?: string; lessonRef?: NofyNote["lessonRef"]; blocks?: NofyBlockInput[] }) {
    await this.ensureSeed(userId);
    const [templates, folders] = await Promise.all([this.templates(userId), this.folders(userId)]);
    const template = input.templateId ? templates.find((t) => t.id === input.templateId) ?? null : null;
    if (input.folderId && !folders.some((f) => f.id === input.folderId)) {
      throw new NotFoundError("Folder not found", TRADING_ERROR.TRADE_NOT_FOUND);
    }
    const note: NofyNote = {
      id: crypto.randomUUID(),
      userId,
      title: input.title?.trim() ?? "",
      icon: template?.icon ?? "📝",
      folderId: input.folderId ?? null,
      tagIds: [],
      favorite: false,
      templateId: template?.id ?? null,
      lessonRef: input.lessonRef ?? null,
      blocks: input.blocks
        ? normalizeBlocks(input.blocks)
        : template
          ? structuredClone(template.blocks).map((block) => ({ ...block, id: `nb-${crypto.randomUUID().slice(0, 12)}` }))
          : [{ id: `nb-${crypto.randomUUID().slice(0, 12)}`, type: "paragraph", text: "" }],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastViewedAt: nowIso(),
      deletedAt: null,
    };
    await this.repository.insert(userId, "NOTE", note.id, note as unknown as never);
    await this.resolveNoteRefs(userId, note);
    const tags = await this.tags(userId);
    return this.noteResponse(note, folders, tags);
  }

  // 3 minutes between version snapshots, 12 snapshots max (mock parity).
  private static readonly VERSION_INTERVAL_MS = 3 * 60_000;
  private static readonly VERSION_CAP = 12;

  private async maybeSnapshotVersion(userId: string, note: NofyNote): Promise<void> {
    const versions = await this.versionsOf(userId, note.id);
    const newest = versions[0];
    const now = nowIso();
    if (newest && now.slice(0, 16) === newest.savedAt.slice(0, 16)) return;
    if (newest && new Date(now).getTime() - new Date(newest.savedAt).getTime() < NofyService.VERSION_INTERVAL_MS) return;
    const record: NofyVersionRecord = {
      id: crypto.randomUUID(),
      noteId: note.id,
      title: note.title,
      blocks: structuredClone(note.blocks),
      savedAt: note.updatedAt,
    };
    await this.repository.insert(userId, "VERSION", record.id, {
      ...record,
      blocks: record.blocks,
    } as unknown as never);
    // Keep the cap honest in persistence: drop the oldest snapshots beyond 12.
    const kept = await this.versionsOf(userId, note.id);
    for (const stale of kept.slice(NofyService.VERSION_CAP)) {
      await this.repository.deleteRow(stale.id);
    }
  }

  async updateNote(
    userId: string,
    id: string,
    input: { title?: string; icon?: string | null; folderId?: string | null; tagIds?: string[]; favorite?: boolean; blocks?: NofyBlockInput[]; touchViewed?: boolean },
  ) {
    await this.ensureSeed(userId);
    const row = await this.repository.findForUser(userId, "NOTE", id);
    if (!row) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const note = row.data as unknown as NofyNote;
    if (note.deletedAt !== null) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);

    const hasMeaningfulChange =
      input.title !== undefined || input.icon !== undefined || input.folderId !== undefined ||
      input.tagIds !== undefined || input.favorite !== undefined || input.blocks !== undefined;

    if (input.touchViewed) note.lastViewedAt = nowIso();
    if (hasMeaningfulChange) {
      await this.maybeSnapshotVersion(userId, note);
      if (input.title !== undefined) note.title = input.title.trim();
      if (input.icon !== undefined) note.icon = input.icon;
      if (input.folderId !== undefined) note.folderId = input.folderId;
      if (input.tagIds !== undefined) {
        const known = new Set((await this.tags(userId)).map((t) => t.id));
        note.tagIds = input.tagIds.filter((tagId) => known.has(tagId));
      }
      if (input.favorite !== undefined) note.favorite = input.favorite;
      if (input.blocks !== undefined) note.blocks = normalizeBlocks(input.blocks);
      note.updatedAt = nowIso();
      await this.repository.updateData(row.id, note as unknown as never);
    }
    await this.resolveNoteRefs(userId, note);
    const [folders, tags] = await Promise.all([this.folders(userId), this.tags(userId)]);
    return this.noteResponse(note, folders, tags);
  }

  async trashNote(userId: string, id: string): Promise<{ ok: true }> {
    await this.ensureSeed(userId);
    const row = await this.repository.findForUser(userId, "NOTE", id);
    if (!row) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const note = row.data as unknown as NofyNote;
    if (note.deletedAt !== null) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    note.deletedAt = nowIso();
    await this.repository.updateData(row.id, note as unknown as never);
    return { ok: true };
  }

  async restoreNote(userId: string, id: string): Promise<{ ok: true }> {
    await this.ensureSeed(userId);
    const row = await this.repository.findForUser(userId, "NOTE", id);
    if (!row) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const note = row.data as unknown as NofyNote;
    if (note.deletedAt === null) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    note.deletedAt = null;
    note.updatedAt = nowIso();
    await this.repository.updateData(row.id, note as unknown as never);
    return { ok: true };
  }

  async purgeNote(userId: string, id: string): Promise<{ ok: true }> {
    await this.ensureSeed(userId);
    const row = await this.repository.findForUser(userId, "NOTE", id);
    if (!row) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const note = row.data as unknown as NofyNote;
    if (note.deletedAt === null) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    await this.repository.deleteRow(row.id);
    // Purge also drops the version history (mock parity) - VERSION rows are
    // matched by their embedded noteId (the row id IS the version id).
    for (const versionRow of await this.repository.listByKind(userId, "VERSION")) {
      if ((versionRow.data as { noteId?: string }).noteId === id) {
        await this.repository.deleteRow(versionRow.id);
      }
    }
    return { ok: true };
  }

  async duplicateNote(userId: string, id: string, input: { title?: string }) {
    await this.ensureSeed(userId);
    const row = await this.repository.findForUser(userId, "NOTE", id);
    if (!row) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const source = row.data as unknown as NofyNote;
    if (source.deletedAt !== null) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const copy: NofyNote = {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      title: input.title?.trim() ?? `${source.title === "" ? "Untitled note" : source.title} (copy)`,
      favorite: false,
      templateId: source.templateId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastViewedAt: nowIso(),
      deletedAt: null,
    };
    copy.blocks = copy.blocks.map((block) => ({ ...block, id: `nb-${crypto.randomUUID().slice(0, 12)}` }));
    await this.repository.insert(userId, "NOTE", copy.id, copy as unknown as never);
    await this.resolveNoteRefs(userId, copy);
    const [folders, tags] = await Promise.all([this.folders(userId), this.tags(userId)]);
    return this.noteResponse(copy, folders, tags);
  }

  // ── Folder mutations ────────────────────────────────────────────────────────

  async listFolders(userId: string) {
    await this.ensureSeed(userId);
    const [folders, all] = await Promise.all([this.folders(userId), this.notes(userId)]);
    const active = all.filter((n) => n.deletedAt === null);
    return {
      folders: folders
        .map((f) => ({ ...f, noteCount: active.filter((n) => n.folderId === f.id).length }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async createFolder(userId: string, input: { name: string }) {
    await this.ensureSeed(userId);
    const name = input.name.trim();
    if (name === "") throw new ValidationError("The request payload is invalid.", [{ path: "name", message: "Folder name is required" }]);
    const folders = await this.folders(userId);
    if (folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      throw new ConflictError("A folder with this name already exists");
    }
    const folder = { id: crypto.randomUUID(), name, createdAt: nowIso() };
    await this.repository.insert(userId, "FOLDER", folder.id, folder as unknown as never);
    return { ...folder, noteCount: 0 };
  }

  async updateFolder(userId: string, id: string, input: { name: string }) {
    await this.ensureSeed(userId);
    const row = await this.repository.findForUser(userId, "FOLDER", id);
    if (!row) throw new NotFoundError("Folder not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const folder = row.data as unknown as { id: string; name: string; createdAt: string };
    const name = input.name.trim();
    if (name === "") throw new ValidationError("The request payload is invalid.", [{ path: "name", message: "Folder name is required" }]);
    const folders = await this.folders(userId);
    if (folders.some((f) => f.id !== id && f.name.toLowerCase() === name.toLowerCase())) {
      throw new ConflictError("A folder with this name already exists");
    }
    folder.name = name;
    await this.repository.updateData(row.id, folder as unknown as never);
    const all = await this.notes(userId);
    const active = all.filter((n) => n.deletedAt === null);
    return { ...folder, noteCount: active.filter((n) => n.folderId === folder.id).length };
  }

  async deleteFolder(userId: string, id: string): Promise<{ ok: true }> {
    await this.ensureSeed(userId);
    const row = await this.repository.findForUser(userId, "FOLDER", id);
    if (!row) throw new NotFoundError("Folder not found", TRADING_ERROR.TRADE_NOT_FOUND);
    await this.repository.deleteRow(row.id);
    // Notes fall back to "No folder" (mock parity).
    for (const noteRow of await this.repository.listByKind(userId, "NOTE")) {
      const note = noteRow.data as unknown as NofyNote;
      if (note.folderId === id) {
        note.folderId = null;
        await this.repository.updateData(noteRow.id, note as unknown as never);
      }
    }
    return { ok: true };
  }

  // ── Tag mutations ───────────────────────────────────────────────────────────

  async listTags(userId: string) {
    await this.ensureSeed(userId);
    const [tags, all] = await Promise.all([this.tags(userId), this.notes(userId)]);
    const active = all.filter((n) => n.deletedAt === null);
    return {
      tags: tags
        .map((t) => ({ ...t, noteCount: active.filter((n) => n.tagIds.includes(t.id)).length }))
        .sort((a, b) => b.noteCount - a.noteCount || a.name.localeCompare(b.name)),
    };
  }

  async createTag(userId: string, name: string) {
    await this.ensureSeed(userId);
    const trimmed = name.trim().replace(/^#/, "");
    if (trimmed === "") throw new ValidationError("The request payload is invalid.", [{ path: "name", message: "Tag name is required" }]);
    const tags = await this.tags(userId);
    const existing = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      const active = (await this.notes(userId)).filter((n) => n.deletedAt === null);
      return { ...existing, noteCount: active.filter((n) => n.tagIds.includes(existing.id)).length };
    }
    const tag = { id: crypto.randomUUID(), name: trimmed };
    await this.repository.insert(userId, "TAG", tag.id, tag as unknown as never);
    return { ...tag, noteCount: 0 };
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  async listTemplates(userId: string) {
    await this.ensureSeed(userId);
    const [userTemplates, folders] = await Promise.all([this.templates(userId), this.folders(userId)]);
    void folders;
    // Built-ins first (stable order), then user templates by creation.
    return { templates: [...builtInTemplates(), ...userTemplates.filter((t) => !t.builtIn)] };
  }

  async createTemplate(
    userId: string,
    input: { name: string; description: string; icon: string; fromNoteId?: string; blocks?: NofyBlockInput[] },
  ): Promise<NofyTemplate> {
    await this.ensureSeed(userId);
    let blocks: NofyBlock[];
    if (input.blocks) {
      blocks = normalizeBlocks(input.blocks);
    } else if (input.fromNoteId) {
      const row = await this.repository.findForUser(userId, "NOTE", input.fromNoteId);
      const source = row ? (row.data as unknown as NofyNote) : null;
      if (!source || source.deletedAt !== null) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
      blocks = structuredClone(source.blocks).map((block) => {
        const clone = { ...block, id: `nb-${crypto.randomUUID().slice(0, 12)}` };
        delete clone.ref; // references are personal to the note, not the template
        return clone;
      });
    } else {
      blocks = [{ id: `nb-${crypto.randomUUID().slice(0, 12)}`, type: "paragraph", text: "" }];
    }
    const template: NofyTemplate = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      description: input.description.trim(),
      icon: input.icon || "📄",
      blocks,
      builtIn: false,
      createdAt: nowIso(),
    };
    await this.repository.insert(userId, "TEMPLATE", template.id, template as unknown as never);
    return template;
  }

  async instantiateTemplate(userId: string, input: { templateId: string; title?: string; folderId?: string | null }) {
    await this.ensureSeed(userId);
    const [userTemplates] = await Promise.all([this.templates(userId)]);
    const template = userTemplates.find((t) => t.id === input.templateId)
      ?? builtInTemplates().find((t) => t.id === input.templateId);
    if (!template) throw new NotFoundError("Template not found", TRADING_ERROR.TRADE_NOT_FOUND);
    return this.createNote(userId, {
      title: input.title?.trim() || template.name,
      folderId: input.folderId ?? null,
      templateId: template.id,
    });
  }

  // ── Versions ────────────────────────────────────────────────────────────────

  async listVersions(userId: string, noteId: string) {
    await this.ensureSeed(userId);
    const versions = await this.versionsOf(userId, noteId);
    return {
      versions: versions.map((version) => ({
        id: version.id,
        title: version.title,
        savedAt: version.savedAt,
        wordCount: countWords(version.blocks),
      })),
    };
  }

  async getVersion(userId: string, noteId: string, versionId: string) {
    await this.ensureSeed(userId);
    const version = (await this.versionsOf(userId, noteId)).find((v) => v.id === versionId);
    if (!version) throw new NotFoundError("Version not found", TRADING_ERROR.TRADE_NOT_FOUND);
    return { version: { id: version.id, title: version.title, savedAt: version.savedAt, blocks: structuredClone(version.blocks) } };
  }

  async restoreVersion(userId: string, noteId: string, versionId: string) {
    await this.ensureSeed(userId);
    const row = await this.repository.findForUser(userId, "NOTE", noteId);
    if (!row) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const note = row.data as unknown as NofyNote;
    if (note.deletedAt !== null) throw new NotFoundError("Note not found", TRADING_ERROR.TRADE_NOT_FOUND);
    const version = (await this.versionsOf(userId, noteId)).find((v) => v.id === versionId);
    if (!version) throw new NotFoundError("Version not found", TRADING_ERROR.TRADE_NOT_FOUND);
    await this.maybeSnapshotVersion(userId, note);
    note.title = version.title;
    note.blocks = structuredClone(version.blocks).map((block) => ({ ...block, id: `nb-${crypto.randomUUID().slice(0, 12)}` }));
    note.updatedAt = nowIso();
    await this.repository.updateData(row.id, note as unknown as never);
    await this.resolveNoteRefs(userId, note);
    const [folders, tags] = await Promise.all([this.folders(userId), this.tags(userId)]);
    return this.noteResponse(note, folders, tags);
  }
}

// Re-export for the controller's type narrowing.
export type { NofyRow };
