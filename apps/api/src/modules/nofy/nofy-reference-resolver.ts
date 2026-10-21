/**
 * Nofy reference resolver (Phase 12 §18/§19/§41) — turns stored relational
 * pointers (kind + id) into FRESH display data (label / meta / SPA href)
 * at read time, so links can never go stale. Pointers are never copied:
 * the referenced domain remains authoritative, Nofy only stores the id.
 *
 * Cross-context access goes through the owning contexts' PUBLIC contracts
 * only (Academy Phase 11 precedent):
 *   - TradingRepository  (TradingModule)          → TRADE
 *   - PlaybookRepository (PlaybookModule)         → STRATEGY / SETUP / RULE
 *   - INSTRUMENT_SPECIFICATION_PROVIDER (TradePlanningModule) → SYMBOL
 *   - academy content catalog (code-owned immutable data — the Phase 7
 *     playbook-templates precedent; NO runtime Academy coupling) → LESSON
 *   - CalendarQueriesService (CalendarModule, Phase 13) → EVENT
 *   - NofyRepository (this context)               → NOTE
 */
import { Injectable, Inject } from "@nestjs/common";

import { TradingRepository, type TradeRow } from "../trading/trading.repository";
import { PlaybookRepository } from "../playbook/playbook.repository";
import { INSTRUMENT_SPECIFICATION_PROVIDER } from "../trade-planning/trade-planning.tokens";
import type { InstrumentSpecificationProvider } from "../trade-planning/domain/ports";
import { CalendarQueriesService } from "../calendar/calendar-queries.service";
import { COURSES } from "../academy/content/catalog";
import type { NofyRefHit, NofyRefKind, NofyRefResolved } from "../../shared/contracts";

const ALL_KINDS: NofyRefKind[] = ["TRADE", "STRATEGY", "SETUP", "RULE", "LESSON", "EVENT", "SYMBOL", "NOTE"];

/** Picker scan bounds — bounded queries, never unbounded table scans (§43). */
const PICKER_TRADE_LIMIT = 60;
const PICKER_RESULT_LIMIT = 40;

@Injectable()
export class NofyReferenceResolver {
  constructor(
    private readonly trading: TradingRepository,
    private readonly playbook: PlaybookRepository,
    @Inject(INSTRUMENT_SPECIFICATION_PROVIDER)
    private readonly instruments: InstrumentSpecificationProvider,
    private readonly calendar: CalendarQueriesService,
  ) {}

  /** All kinds the picker may serve (EVENT is canonical since Phase 13). */
  supportedKinds(): NofyRefKind[] {
    return [...ALL_KINDS];
  }

  /**
   * Resolve ONE pointer for the given principal. Ownership is enforced by
   * the consuming repository (foreign/unowned ids resolve to null → the
   * caller's fallback), never by trusting client labels.
   */
  async resolveOne(kind: NofyRefKind, id: string, userId: string): Promise<NofyRefResolved | null> {
    switch (kind) {
      case "TRADE":
        return this.resolveTrade(id, userId);
      case "STRATEGY":
        return this.resolveFromMap(kind, id, await this.playbook.listStrategies(userId), (s) => ({
          label: s.name,
          meta: "Playbook strategy",
          href: "/playbook?tab=strategies",
        }));
      case "SETUP":
        return this.resolveFromMap(kind, id, await this.playbook.listSetups(userId), (s) => ({
          label: s.name,
          meta: "Playbook setup",
          href: "/playbook?tab=setups",
        }));
      case "RULE":
        return this.resolveFromMap(kind, id, await this.playbook.listRules(userId), (r) => ({
          label: r.title,
          meta: "Playbook rule",
          href: "/playbook?tab=rules",
        }));
      case "LESSON":
        return resolveLesson(id);
      case "SYMBOL":
        return this.resolveSymbol(id);
      case "NOTE":
        return this.resolveNote(id, userId);
      case "EVENT":
        // Phase 13 — the Calendar is the canonical economic-event layer.
        // Economic events are SHARED reference data (no user scope).
        return this.resolveEvent(id);
      default:
        return null;
    }
  }

  /**
   * Re-resolve every ref block of a note IN PLACE (server-authoritative
   * labels/hrefs). Unresolvable pointers keep the client's stored label and
   * null meta/href — matching the mock engine's fallback exactly.
   */
  async resolveNoteBlocks(
    blocks: import("../../shared/contracts").NofyBlock[],
    userId: string,
  ): Promise<void> {
    const cache = new Map<string, NofyRefResolved | null>();
    for (const block of blocks) {
      if (block.type !== "ref" || !block.ref) continue;
      const key = `${block.ref.kind}:${block.ref.id}`;
      const cached = cache.get(key);
      const resolved = cached !== undefined ? cached : await this.resolveOne(block.ref.kind, block.ref.id, userId);
      if (cached === undefined) cache.set(key, resolved);
      block.ref = {
        kind: block.ref.kind,
        id: block.ref.id,
        label: resolved?.label ?? block.ref.label ?? "Unresolved reference",
        meta: resolved?.meta ?? null,
        href: resolved?.href ?? null,
      };
    }
  }

  /**
   * Entity picker (GET /nofy/refs) — scans the principal's referenceable
   * entities per kind, filters by `q` over label+meta, bounded result.
   */
  async listHits(userId: string, q: string, kindFilter?: string): Promise<NofyRefHit[]> {
    const query = q.trim().toLowerCase();
    const kinds: NofyRefKind[] =
      kindFilter !== undefined && ALL_KINDS.includes(kindFilter as NofyRefKind)
        ? [kindFilter as NofyRefKind]
        : this.supportedKinds();

    const hits: NofyRefHit[] = [];
    const push = (hit: NofyRefResolved | null): void => {
      if (hit) hits.push(hit);
    };

    if (kinds.includes("TRADE")) {
      const { rows } = await this.trading.listTrades({
        userId,
        sort: "entryAt",
        order: "desc",
        page: 1,
        limit: PICKER_TRADE_LIMIT,
      });
      for (const row of rows) push(this.tradeHit(row));
    }
    if (kinds.includes("STRATEGY")) {
      for (const s of await this.playbook.listStrategies(userId)) {
        push({ kind: "STRATEGY", id: s.id, label: s.name, meta: "Playbook strategy", href: "/playbook?tab=strategies" });
      }
    }
    if (kinds.includes("SETUP")) {
      for (const s of await this.playbook.listSetups(userId)) {
        push({ kind: "SETUP", id: s.id, label: s.name, meta: "Playbook setup", href: "/playbook?tab=setups" });
      }
    }
    if (kinds.includes("RULE")) {
      for (const r of await this.playbook.listRules(userId)) {
        push({ kind: "RULE", id: r.id, label: r.title, meta: "Playbook rule", href: "/playbook?tab=rules" });
      }
    }
    if (kinds.includes("LESSON")) {
      for (const course of COURSES) {
        for (const lesson of course.lessons) push(resolveLesson(lesson.id));
      }
    }
    if (kinds.includes("EVENT")) {
      // Mock parity: the first 40 chronological canonical events (bounded).
      for (const event of await this.calendar.listPickerEvents(PICKER_TRADE_LIMIT)) {
        push({ kind: "EVENT", id: event.id, label: event.title, meta: `${event.currency} · ${event.impact} impact`, href: "/calendar" });
      }
    }
    if (kinds.includes("SYMBOL")) {
      for (const spec of await this.instruments.listSpecifications()) {
        push({ kind: "SYMBOL", id: spec.id, label: spec.symbol, meta: spec.assetClass, href: "/session" });
      }
    }
    if (kinds.includes("NOTE")) {
      for (const note of await this.nofyNotes(userId)) {
        push({
          kind: "NOTE",
          id: note.id,
          label: note.title === "" ? "Untitled note" : note.title,
          meta: "Nofy note",
          href: `/nofy?tab=notes&note=${note.id}`,
        });
      }
    }

    const filtered = query === "" ? hits : hits.filter((hit) => `${hit.label} ${hit.meta ?? ""}`.toLowerCase().includes(query));
    return filtered.slice(0, PICKER_RESULT_LIMIT);
  }

  /** NOTE resolution needs this context's repository — set by the module. */
  private nofyNotesProvider?: (userId: string) => Promise<Array<{ id: string; title: string }>>;
  private nofyNoteProvider?: (noteId: string, userId: string) => Promise<{ id: string; title: string } | null>;

  /** Called by NofyModule at construction (avoids a circular provider graph). */
  bindNofyNotes(
    listProvider: (userId: string) => Promise<Array<{ id: string; title: string }>>,
    oneProvider: (noteId: string, userId: string) => Promise<{ id: string; title: string } | null>,
  ): void {
    this.nofyNotesProvider = listProvider;
    this.nofyNoteProvider = oneProvider;
  }

  private async nofyNotes(userId: string): Promise<Array<{ id: string; title: string }>> {
    return this.nofyNotesProvider ? this.nofyNotesProvider(userId) : [];
  }

  private async resolveNote(id: string, userId: string): Promise<NofyRefResolved | null> {
    const note = this.nofyNoteProvider ? await this.nofyNoteProvider(id, userId) : null;
    if (!note) return null;
    return {
      kind: "NOTE",
      id: note.id,
      label: note.title === "" ? "Untitled note" : note.title,
      meta: "Nofy note",
      href: `/nofy?tab=notes&note=${note.id}`,
    };
  }

  private tradeHit(row: TradeRow): NofyRefResolved {
    const symbol = row.symbol;
    const direction = row.direction;
    const status = row.status;
    const meta =
      status === "CLOSED"
        ? `${symbol} ${direction} · ${status} · ${formatR(row.rMultiple)}R`
        : `${symbol} ${direction} · ${status}`;
    return {
      kind: "TRADE",
      id: row.id,
      label: `Trade ${symbol} ${direction}`,
      meta,
      href: `/trades?trade=${row.id}`,
    };
  }

  private async resolveTrade(id: string, userId: string): Promise<NofyRefResolved | null> {
    const row = await this.trading.findTradeForUser(id, userId);
    if (!row) return null;
    return this.tradeHit(row);
  }

  private async resolveSymbol(id: string): Promise<NofyRefResolved | null> {
    // Mock parity: a SYMBOL pointer matches the instrument id OR the ticker.
    for (const spec of await this.instruments.listSpecifications()) {
      if (spec.id === id || spec.symbol === id) {
        return { kind: "SYMBOL", id: spec.id, label: spec.symbol, meta: spec.assetClass, href: "/session" };
      }
    }
    return null;
  }

  /** Mock parity (§19): label = title, meta = "USD · HIGH impact", href = "/calendar". */
  private async resolveEvent(id: string): Promise<NofyRefResolved | null> {
    const event = await this.calendar.findEventById(id);
    if (!event) return null;
    return {
      kind: "EVENT",
      id: event.id,
      label: event.title,
      meta: `${event.currency} · ${event.impact} impact`,
      href: "/calendar",
    };
  }

  private async resolveFromMap<T>(
    kind: NofyRefKind,
    id: string,
    rows: T[],
    project: (row: T) => { label: string; meta: string | null; href: string | null },
  ): Promise<NofyRefResolved | null> {
    for (const row of rows) {
      if ((row as { id: string }).id === id) {
        return { kind, id, ...project(row) };
      }
    }
    return null;
  }
}

/** Signed R multiple, two decimals (mock parity: "+1.83R" / "-0.75R"). */
function formatR(rMultiple: unknown): string {
  const value = rMultiple === null || rMultiple === undefined ? 0 : Number(rMultiple.toString());
  const rounded = Number.isFinite(value) ? value : 0;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(2)}`;
}

function resolveLesson(id: string): NofyRefResolved | null {
  for (const course of COURSES) {
    const lesson = course.lessons.find((candidate) => candidate.id === id);
    if (lesson) {
      return {
        kind: "LESSON",
        id,
        label: lesson.title,
        meta: `${course.title} · Academy`,
        href: `/academy?tab=courses&course=${course.id}&lesson=${lesson.id}`,
      };
    }
  }
  return null;
}
