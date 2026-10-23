import type {
  NofyActivityWeek,
  NofyBlock,
  NofyBlockInput,
  NofyFolder,
  NofyFolderCreateInput,
  NofyFolderUpdateInput,
  NofyNote,
  NofyNoteCreateInput,
  NofyNoteDuplicateInput,
  NofyNotesResponse,
  NofyNoteRow,
  NofyNoteUpdateInput,
  NofyOverviewResponse,
  NofyRefKind,
  NofyRefResolved,
  NofyRefsResponse,
  NofySearchResponse,
  NofyTag,
  NofyTemplate,
  NofyTemplateCreateInput,
  NofyTemplateInstantiateInput,
  NofyVersionResponse,
  NofyVersionsResponse,
} from "@cosmoz/shared";

import { COURSES } from "./academy/catalog";
import { MockError, mockStore } from "./store";

/**
 * Nofy engine — the knowledge workspace's server-side brain.
 *
 * Owns per-user Nofy state (notes composed of ordered blocks, folders,
 * tags, templates, version history) exactly like the Academy engine owns
 * learning state. Trading-entity references are stored as relational
 * pointers (kind + id) and RE-RESOLVED on every read, so display labels
 * and deep links can never go stale (spec §24/§31).
 *
 * The mock is single-user behind a `userKey`, mirroring the Academy engine.
 */

// ── State ────────────────────────────────────────────────────────────────────

type NofyVersionRecord = {
  id: string;
  noteId: string;
  title: string;
  blocks: NofyBlock[];
  savedAt: string;
};

type NofyState = {
  userKey: string;
  folders: NofyFolder[];
  tags: NofyTag[];
  templates: NofyTemplate[];
  notes: NofyNote[];
  /** noteId → version snapshots (newest first, capped). */
  versions: Map<string, NofyVersionRecord[]>;
  seeded: boolean;
};

const state: NofyState = {
  userKey: "demo-user",
  folders: [],
  tags: [],
  templates: [],
  notes: [],
  versions: new Map(),
  seeded: false,
};

// ── Small helpers ────────────────────────────────────────────────────────────

const nowIso = (): string => new Date().toISOString();
const daysAgoIso = (days: number, hourOffset = 0): string =>
  new Date(Date.now() - days * 86_400_000 - hourOffset * 3_600_000).toISOString();

let blockCounter = 0;
const newBlockId = (): string => `nb-${Date.now().toString(36)}-${(blockCounter++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Authoring helper — keeps seed blocks terse. */
function blk(type: NofyBlock["type"], text: string, extra: Partial<NofyBlock> = {}): NofyBlock {
  return { id: newBlockId(), type, text, ...extra };
}

const TEXT_BEARING = new Set<NofyBlock["type"]>([
  "paragraph", "h1", "h2", "h3", "bullet", "numbered", "todo", "quote", "callout", "code",
]);

/** Plain-text projection of a block list — search, excerpt and word count. */
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

const wordCountOf = (text: string): number =>
  text.split(/\s+/).filter((word) => word !== "").length;

const countWords = (blocks: NofyBlock[]): number => wordCountOf(textOfBlocks(blocks));

const countOpenTodos = (blocks: NofyBlock[]): number =>
  blocks.filter((block) => block.type === "todo" && !block.checked).length;

/** ~180-char excerpt from the first text-bearing blocks. */
function excerptOf(blocks: NofyBlock[]): string {
  const text = textOfBlocks(blocks).replace(/\n+/g, " · ");
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

// ── Reference resolution (relational pointers → fresh display data) ─────────

/** Resolve a stored pointer against the live app entities. */
function resolveRef(kind: NofyRefKind, id: string): NofyRefResolved | null {
  try {
    switch (kind) {
      case "TRADE": {
        const trade = mockStore.data.trades.find((t) => t.id === id);
        if (!trade) return null;
        const instrument = mockStore.data.instruments.find((i) => i.id === trade.instrumentId);
        const symbol = instrument?.symbol ?? "-";
        const meta = trade.status === "CLOSED"
          ? `${symbol} ${trade.direction} · ${trade.status} · ${Number(trade.rMultiple ?? 0) >= 0 ? "+" : ""}${Number(trade.rMultiple ?? 0).toFixed(2)}R`
          : `${symbol} ${trade.direction} · ${trade.status}`;
        return { kind, id, label: `Trade ${symbol} ${trade.direction}`, meta, href: `/trades?trade=${trade.id}` };
      }
      case "STRATEGY": {
        const strategy = mockStore.data.strategies.find((s) => s.id === id);
        if (!strategy) return null;
        return { kind, id, label: strategy.name, meta: "Playbook strategy", href: "/playbook?tab=strategies" };
      }
      case "SETUP": {
        const setup = mockStore.listSetups().setups.find((s) => s.id === id);
        if (!setup) return null;
        return { kind, id, label: setup.name, meta: "Playbook setup", href: "/playbook?tab=setups" };
      }
      case "RULE": {
        const rule = mockStore.listPlaybookRules().rules.find((r) => r.id === id);
        if (!rule) return null;
        return { kind, id, label: rule.title, meta: "Playbook rule", href: "/playbook?tab=rules" };
      }
      case "LESSON": {
        for (const course of COURSES) {
          const lesson = course.lessons.find((l) => l.id === id);
          if (lesson) {
            return {
              kind,
              id,
              label: lesson.title,
              meta: `${course.title} · Academy`,
              href: `/academy?tab=courses&course=${course.id}&lesson=${lesson.id}`,
            };
          }
        }
        return null;
      }
      case "EVENT": {
        const event = mockStore.data.ecoEvents.find((e) => e.id === id);
        if (!event) return null;
        return { kind, id, label: event.title, meta: `${event.currency} · ${event.impact} impact`, href: "/calendar" };
      }
      case "SYMBOL": {
        const instrument = mockStore.data.instruments.find((i) => i.id === id || i.symbol === id);
        if (!instrument) return null;
        return { kind, id: instrument.id, label: instrument.symbol, meta: instrument.assetClass, href: "/trades" };
      }
      case "NOTE": {
        const note = state.notes.find((n) => n.id === id && n.deletedAt === null);
        if (!note) return null;
        return { kind, id, label: note.title === "" ? "Untitled note" : note.title, meta: "Nofy note", href: `/nofy?tab=notes&note=${note.id}` };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Resolve every ref block of a note in place (server-authoritative labels). */
function resolveNoteRefs(note: NofyNote): void {
  for (const block of note.blocks) {
    if (block.type === "ref" && block.ref) {
      const resolved = resolveRef(block.ref.kind, block.ref.id);
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

// ── Projections ──────────────────────────────────────────────────────────────

const folderNameOf = (folderId: string | null): string | null =>
  folderId === null ? null : state.folders.find((folder) => folder.id === folderId)?.name ?? null;

const tagNamesOf = (tagIds: string[]): string[] =>
  tagIds
    .map((tagId) => state.tags.find((tag) => tag.id === tagId)?.name ?? null)
    .filter((name): name is string => name !== null);

function toRow(note: NofyNote): NofyNoteRow {
  return {
    id: note.id,
    title: note.title,
    icon: note.icon,
    folderId: note.folderId,
    folderName: folderNameOf(note.folderId),
    tagIds: [...note.tagIds],
    tagNames: tagNamesOf(note.tagIds),
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

const byUpdatedDesc = (a: NofyNote, b: NofyNote): number => b.updatedAt.localeCompare(a.updatedAt);

// ── Seed content ─────────────────────────────────────────────────────────────

const FOLDER_SEEDS = [
  { name: "Strategies", ageDays: 24 },
  { name: "Market Analysis", ageDays: 24 },
  { name: "Psychology", ageDays: 23 },
  { name: "Research", ageDays: 21 },
  { name: "Trade Ideas", ageDays: 20 },
  { name: "Checklists", ageDays: 19 },
  { name: "Learning", ageDays: 18 },
];

const TAG_SEEDS = ["XAUUSD", "NASDAQ", "Forex", "Breakout", "Liquidity", "Psychology", "RiskManagement", "LondonSession", "CPI", "StrategyIdea"];

/** Built-in templates — the spec §23 set, authored as real block lists. */
function builtInTemplates(): NofyTemplate[] {
  const at = daysAgoIso(30);
  const template = (name: string, description: string, icon: string, blocks: NofyBlock[]): NofyTemplate => ({
    id: `tpl-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    name,
    description,
    icon,
    blocks,
    builtIn: true,
    createdAt: at,
  });

  return [
    template(
      "Trading Idea",
      "Structure a hypothesis before risking a dollar on it.",
      "📈",
      [
        blk("h2", "Context"),
        blk("paragraph", "Market, symbol and the conditions that make this idea relevant right now."),
        blk("h2", "Hypothesis"),
        blk("paragraph", "What I expect to happen, and why the market should reward it."),
        blk("h2", "Entry conditions"),
        blk("todo", "Condition one", { checked: false }),
        blk("todo", "Condition two", { checked: false }),
        blk("h2", "Invalidation"),
        blk("paragraph", "The observation that proves this idea wrong."),
        blk("h2", "Risk"),
        blk("paragraph", "Position size, stop distance, and the R I am willing to lose."),
        blk("h2", "Expected scenario / Alternative scenario"),
        blk("bullet", "Primary path…"),
        blk("bullet", "If invalidated…"),
      ],
    ),
    template(
      "Market Analysis",
      "A structured read of one market before the session opens.",
      "🧭",
      [
        blk("h2", "Market / Symbol / Timeframe / Session"),
        blk("paragraph", "e.g. XAUUSD · H1 · London"),
        blk("h2", "Market context"),
        blk("paragraph", "Where price is inside the larger structure."),
        blk("h2", "Structure & liquidity"),
        blk("paragraph", "Swings, ranges, and where orders might be resting."),
        blk("h2", "Key levels"),
        blk("bullet", "Level one"),
        blk("bullet", "Level two"),
        blk("h2", "Scenarios"),
        blk("callout", "Bullish case - what confirms it.", { tone: "tip" }),
        blk("callout", "Bearish case - what confirms it.", { tone: "warn" }),
        blk("h2", "Invalidation"),
        blk("paragraph", "The read is wrong if…"),
      ],
    ),
    template(
      "Strategy Idea",
      "Define a repeatable strategy the same way the Playbook will grade it.",
      "🛠️",
      [
        blk("h2", "Strategy name"),
        blk("paragraph", ""),
        blk("h2", "Market & conditions"),
        blk("paragraph", "Where it applies, and the regime it needs."),
        blk("h2", "Setup & entry conditions"),
        blk("todo", "Trigger", { checked: false }),
        blk("todo", "Confirmation", { checked: false }),
        blk("h2", "Stop loss / Take profit"),
        blk("paragraph", "Where the idea is structurally wrong, and where it pays."),
        blk("h2", "Risk management & trade management"),
        blk("paragraph", "Sizing rule, break-even rule, partials, trailing."),
        blk("h2", "Observations"),
        blk("paragraph", ""),
      ],
    ),
    template(
      "Trade Review",
      "Turn one execution into one durable lesson.",
      "🔍",
      [
        blk("h2", "Trade"),
        blk("paragraph", "Reference the trade from the Trades module (slash command → Trade)."),
        blk("h2", "Context"),
        blk("paragraph", "What the market offered when I entered."),
        blk("h2", "Why I entered"),
        blk("paragraph", ""),
        blk("h2", "What went well / What went wrong"),
        blk("bullet", ""),
        blk("h2", "Rule adherence"),
        blk("callout", "Did I follow the plan? Every deviation costs more than the loss itself.", { tone: "risk" }),
        blk("h2", "Psychology"),
        blk("paragraph", "Emotion before, during, after."),
        blk("h2", "Lesson learned & action item"),
        blk("todo", "Action item", { checked: false }),
      ],
    ),
    template(
      "Learning Note",
      "Consolidate an Academy lesson into your own words.",
      "📚",
      [
        blk("h2", "Topic"),
        blk("paragraph", ""),
        blk("h2", "What I learned"),
        blk("paragraph", ""),
        blk("h2", "Key concepts & definitions"),
        blk("bullet", ""),
        blk("h2", "Examples"),
        blk("paragraph", ""),
        blk("h2", "Questions"),
        blk("paragraph", ""),
        blk("h2", "How I can apply it"),
        blk("todo", "Application step", { checked: false }),
      ],
    ),
  ];
}

/**
 * Seed once — professional demo content whose references point at REAL
 * entities of the running journal (trades, strategies, setups, lessons,
 * economic events, symbols), resolved at seed time by id.
 */
function ensureSeed(): void {
  if (state.seeded) return;
  state.seeded = true;

  state.folders = FOLDER_SEEDS.map((seed) => ({
    id: crypto.randomUUID(),
    name: seed.name,
    createdAt: daysAgoIso(seed.ageDays),
  }));
  const folder = (name: string): string | null =>
    state.folders.find((f) => f.name === name)?.id ?? null;

  state.tags = TAG_SEEDS.map((name) => ({ id: crypto.randomUUID(), name }));
  const tag = (name: string): string => state.tags.find((t) => t.name === name)!.id;

  state.templates = builtInTemplates();

  // ── Real entity ids for seeded references ──
  const closedTrades = mockStore.data.trades.filter((t) => t.status === "CLOSED");
  const losingTrade = closedTrades.find((t) => Number(t.rMultiple ?? 0) < -0.5) ?? closedTrades[0];
  const winningTrade = closedTrades.find((t) => Number(t.rMultiple ?? 0) >= 1.5) ?? closedTrades[1] ?? closedTrades[0];
  const strategy = mockStore.data.strategies[0];
  const setup = mockStore.listSetups().setups[0];
  const lessonCourse = COURSES.find((c) => c.id === "crs-risk-fundamentals") ?? COURSES[0];
  const lesson = lessonCourse.lessons[0];
  const highImpactEvent = mockStore.data.ecoEvents.find((e) => e.impact === "HIGH") ?? mockStore.data.ecoEvents[0];
  const xauusd = mockStore.data.instruments.find((i) => i.symbol === "XAUUSD") ?? mockStore.data.instruments[0];

  const note = (n: Omit<NofyNote, "userId">): NofyNote => ({ userId: state.userKey, ...n });

  state.notes = [
    note({
      id: crypto.randomUUID(),
      title: "XAUUSD London Breakout - observations",
      icon: "📈",
      folderId: folder("Market Analysis"),
      tagIds: [tag("XAUUSD"), tag("LondonSession"), tag("Breakout")],
      favorite: true,
      templateId: null,
      lessonRef: null,
      blocks: [
        blk("h2", "Session behaviour"),
        blk("paragraph", "Gold tends to sweep the Asian range in the first 15 minutes of London, then rotate. The sweep is tradeable only when the reclaim holds on the 5m close - otherwise it is continuation, not reversal."),
        blk("paragraph", "Three weeks of journaling the same window: **11 qualified sweeps, 7 reclaimed**. The edge is the reclaim, never the sweep itself."),
        blk("h2", "Qualification checklist"),
        blk("todo", "Asian range defined (≥ 6 candles, clean highs/lows)", { checked: true }),
        blk("todo", "Sweep with momentum, not a drift", { checked: true }),
        blk("todo", "5m reclaim close back inside range", { checked: true }),
        blk("todo", "No high-impact release inside the window", { checked: false }),
        blk("h2", "Observation ledger"),
        blk("table", "", {
          rows: [
            ["Condition", "Observation", "Result"],
            ["London open + clean range", "Liquidity sweep then reclaim", "Valid"],
            ["NY open, no range", "No confirmation, mid-range chop", "Invalid"],
            ["CPI day", "Sweep ignored - spreads widened", "Skipped"],
          ],
        }),
        blk("callout", "The sweep is bait. The reclaim is the setup - wait for it, every time.", { tone: "warn" }),
      ],
      createdAt: daysAgoIso(16, 2),
      updatedAt: daysAgoIso(1, 3),
      lastViewedAt: daysAgoIso(1, 3),
      deletedAt: null,
    }),
    note({
      id: crypto.randomUUID(),
      title: "Why I entered too early",
      icon: "🧠",
      folderId: folder("Psychology"),
      tagIds: [tag("Psychology"), tag("RiskManagement")],
      favorite: true,
      templateId: null,
      lessonRef: null,
      blocks: [
        blk("paragraph", "Pattern I keep repeating: I see the setup forming and I front-run the confirmation because I am afraid to miss it. The entry feels brave in the moment and always costs more than the missed trade would have."),
        blk("quote", "Missing a trade costs nothing. Entering early costs the full R.", ),
        blk("callout", "Rule: confirmation candle or nothing. If it already left without me, it was never my trade.", { tone: "risk" }),
        blk("h2", "Evidence from the journal"),
        blk("paragraph", "The losing trade below is the third front-run this month. Same emotion before entry, same feeling at exit."),
        blk("ref", "", { ref: losingTrade ? { kind: "TRADE", id: losingTrade.id, label: "Linked trade" } : undefined }),
        strategy ? blk("ref", "", { ref: { kind: "STRATEGY", id: strategy.id } }) : blk("paragraph", ""),
        blk("h2", "Action items"),
        blk("todo", "Write the confirmation rule at the top of the pre-session checklist", { checked: true }),
        blk("todo", "Journal every entry where confirmation was missing - 10 sessions", { checked: false }),
      ],
      createdAt: daysAgoIso(9, 5),
      updatedAt: daysAgoIso(2, 1),
      lastViewedAt: daysAgoIso(2, 1),
      deletedAt: null,
    }),
    note({
      id: crypto.randomUUID(),
      title: "Liquidity sweep research",
      icon: "🔬",
      folderId: folder("Research"),
      tagIds: [tag("Liquidity"), tag("XAUUSD")],
      favorite: false,
      templateId: null,
      lessonRef: null,
      blocks: [
        blk("h2", "Working definition"),
        blk("paragraph", "A liquidity sweep is a push through a visible swing high/low that does not hold - engineered to fill larger orders. It fails as a breakout within one to three candles."),
        blk("h2", "What makes it exploitable"),
        blk("numbered", "A clean prior level everyone can see"),
        blk("numbered", "Momentum into the level, not a slow drift"),
        blk("numbered", "Fast rejection - the reclaim candle is the tell"),
        blk("h2", "What it is NOT"),
        blk("bullet", "A guaranteed reversal - sweeps fail constantly in trend"),
        blk("bullet", "A reason to skip the confirmation candle"),
        blk("callout", "Counter-trend by nature. Grade it against the higher-timeframe structure before anything else.", { tone: "info" }),
        blk("h2", "Coursework"),
        blk("ref", "", { ref: lesson ? { kind: "LESSON", id: lesson.id } : undefined }),
      ],
      createdAt: daysAgoIso(12, 4),
      updatedAt: daysAgoIso(4, 2),
      lastViewedAt: daysAgoIso(4, 2),
      deletedAt: null,
    }),
    note({
      id: crypto.randomUUID(),
      title: "CPI reaction study",
      icon: "📊",
      folderId: folder("Research"),
      tagIds: [tag("CPI"), tag("XAUUSD"), tag("Forex")],
      favorite: false,
      templateId: null,
      lessonRef: null,
      blocks: [
        blk("paragraph", "Studying how gold reacts to US CPI releases - the goal is not to trade the release, it is to understand the post-release range so the second move can be traded safely."),
        highImpactEvent ? blk("ref", "", { ref: { kind: "EVENT", id: highImpactEvent.id } }) : blk("paragraph", ""),
        blk("h2", "Observations"),
        blk("bullet", "First move is noise - spreads widen, both sides get wicked"),
        blk("bullet", "The tradeable move is usually the second impulse, 5–15 minutes after the release"),
        blk("bullet", "Initial spike range becomes the day's high or low surprisingly often"),
        blk("callout", "No entries inside the first five minutes. Ever.", { tone: "risk" }),
      ],
      createdAt: daysAgoIso(7, 6),
      updatedAt: daysAgoIso(5, 4),
      lastViewedAt: null,
      deletedAt: null,
    }),
    note({
      id: crypto.randomUUID(),
      title: "New strategy idea: NY open range fade",
      icon: "💡",
      folderId: folder("Trade Ideas"),
      tagIds: [tag("StrategyIdea"), tag("NASDAQ")],
      favorite: true,
      templateId: "tpl-strategy-idea",
      lessonRef: null,
      blocks: [
        blk("h2", "Hypothesis"),
        blk("paragraph", "When the NY opening range is unusually narrow (< 0.3 × ATR(14) H1), the first breakout often fails and price rotates back through the range. Fade the failed breakout, target the opposite side."),
        setup ? blk("ref", "", { ref: { kind: "SETUP", id: setup.id } }) : blk("paragraph", ""),
        blk("h2", "Entry conditions"),
        blk("todo", "Range width < 0.3 × ATR(14)", { checked: false }),
        blk("todo", "Breakout candle closes back inside the range", { checked: false }),
        blk("todo", "No Tier-1 release in the next hour", { checked: false }),
        blk("h2", "Invalidation"),
        blk("paragraph", "A close beyond the range on rising volume kills the fade idea for the day."),
        xauusd ? blk("ref", "", { ref: { kind: "SYMBOL", id: xauusd.id } }) : blk("paragraph", ""),
        blk("callout", "Backtest at least 30 occurrences before this graduates to the Playbook.", { tone: "tip" }),
      ],
      createdAt: daysAgoIso(3, 7),
      updatedAt: daysAgoIso(0, 5),
      lastViewedAt: daysAgoIso(0, 5),
      deletedAt: null,
    }),
    note({
      id: crypto.randomUUID(),
      title: "Pre-session checklist",
      icon: "✅",
      folderId: folder("Checklists"),
      tagIds: [tag("RiskManagement")],
      favorite: false,
      templateId: null,
      lessonRef: null,
      blocks: [
        blk("paragraph", "Run this before every session. Five minutes here is cheaper than any violation."),
        blk("h2", "Before the open"),
        blk("todo", "Daily loss limit re-read out loud", { checked: true }),
        blk("todo", "Economic calendar scanned for the session window", { checked: true }),
        blk("todo", "Higher-timeframe bias written in one sentence", { checked: false }),
        blk("todo", "Maximum 2 trades planned - count them", { checked: false }),
        blk("callout", "If the checklist cannot be completed, the session does not start.", { tone: "warn" }),
      ],
      createdAt: daysAgoIso(18, 1),
      updatedAt: daysAgoIso(0, 8),
      lastViewedAt: daysAgoIso(0, 8),
      deletedAt: null,
    }),
    note({
      id: crypto.randomUUID(),
      title: "Position sizing - my notes",
      icon: "📚",
      folderId: folder("Learning"),
      tagIds: [tag("RiskManagement"), tag("Forex")],
      favorite: false,
      templateId: null,
      lessonRef: lesson
        ? { courseId: lessonCourse.id, courseTitle: lessonCourse.title, lessonId: lesson.id, lessonTitle: lesson.title }
        : null,
      blocks: [
        blk("paragraph", "Personal consolidation of the Academy lesson on position sizing - written in my own words so it sticks."),
        blk("h2", "The core arithmetic"),
        blk("paragraph", "Risk amount = balance × risk %. Position size = risk amount ÷ (stop distance × value per unit). The stop distance is GIVEN by the structure - sizing adapts to it, never the other way around."),
        blk("h2", "What I keep getting wrong"),
        blk("bullet", "Widening the stop to keep the size - that is risk denial, not sizing"),
        blk("bullet", "Forgetting the spread on wide instruments like gold"),
        blk("h2", "Application"),
        blk("todo", "Compute size by hand on the next 5 trades before checking the sizer", { checked: false }),
      ],
      createdAt: daysAgoIso(6, 3),
      updatedAt: daysAgoIso(6, 1),
      lastViewedAt: daysAgoIso(6, 1),
      deletedAt: null,
    }),
    note({
      id: crypto.randomUUID(),
      title: "Weekly review - what the data says",
      icon: "🧾",
      folderId: folder("Strategies"),
      tagIds: [tag("XAUUSD"), tag("Breakout")],
      favorite: false,
      templateId: null,
      lessonRef: null,
      blocks: [
        blk("paragraph", "Aggregated from the last journal review: the breakout strategy pays when the range qualifies, and bleeds when I force it in chop. The fix is a filter, not a new strategy."),
        winningTrade ? blk("ref", "", { ref: { kind: "TRADE", id: winningTrade.id } }) : blk("paragraph", ""),
        blk("h2", "Decisions"),
        blk("numbered", "Add the ATR filter to the strategy definition"),
        blk("numbered", "No breakout trades on red-folder news days"),
        blk("numbered", "Re-grade every forced breakout as a violation"),
        state.notes[0] ? blk("ref", "", { ref: { kind: "NOTE", id: "PENDING" } }) : blk("paragraph", ""),
      ],
      createdAt: daysAgoIso(2, 6),
      updatedAt: daysAgoIso(0, 2),
      lastViewedAt: daysAgoIso(0, 2),
      deletedAt: null,
    }),
  ];

  // Second-pass: resolve the note-to-note pointer (note 8 → note 1) and
  // resolve all ref display fields once so the seed data is authoritative.
  if (state.notes[0] && state.notes[7]) {
    for (const block of state.notes[7]!.blocks) {
      if (block.type === "ref" && block.ref?.id === "PENDING") {
        block.ref = { kind: "NOTE", id: state.notes[0]!.id };
      }
    }
  }
  for (const seeded of state.notes) resolveNoteRefs(seeded);

  // One trashed note so the Trash page demonstrates restore/purge honestly.
  state.notes.push(
    note({
      id: crypto.randomUUID(),
      title: "Random itch - scalp the open",
      icon: "🗑️",
      folderId: null,
      tagIds: [],
      favorite: false,
      templateId: null,
      lessonRef: null,
      blocks: [blk("paragraph", "Impulse idea written mid-session, deleted on review - kept in trash as a reminder.")],
      createdAt: daysAgoIso(3, 2),
      updatedAt: daysAgoIso(3, 1),
      lastViewedAt: null,
      deletedAt: daysAgoIso(2, 4),
    }),
  );
}

// ── Read operations ──────────────────────────────────────────────────────────

export type NofyListScope =
  | { view: "all" | "favorites" | "trash" | "recent" }
  | { view: "folder"; folderId: string }
  | { view: "tag"; tagId: string };

export function listNotes(scope: NofyListScope, query?: { q?: string; sort?: string }): NofyNotesResponse {
  ensureSeed();
  let notes = state.notes.filter((n) => n.deletedAt === null);
  if (scope.view === "trash") notes = state.notes.filter((n) => n.deletedAt !== null);
  if (scope.view === "favorites") notes = notes.filter((n) => n.favorite);
  if (scope.view === "folder" && "folderId" in scope) notes = notes.filter((n) => n.folderId === scope.folderId);
  if (scope.view === "tag" && "tagId" in scope) notes = notes.filter((n) => n.tagIds.includes(scope.tagId));

  const q = query?.q?.trim().toLowerCase() ?? "";
  if (q !== "") {
    notes = notes.filter((note) => {
      const inTitle = note.title.toLowerCase().includes(q);
      const inText = textOfBlocks(note.blocks).toLowerCase().includes(q);
      const inTags = tagNamesOf(note.tagIds).some((name) => name.toLowerCase().includes(q));
      const inFolder = (folderNameOf(note.folderId) ?? "").toLowerCase().includes(q);
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
  return { notes: sorted.map(toRow), total: sorted.length };
}

/**
 * Notes linked to an app entity — the Playbook / Trade Review side of the
 * integration. A note is "linked" when it carries a ref block pointing at
 * the entity; rows are the same projection the browser shows.
 */
export function listNotesLinkedTo(kind: NofyRefKind, id: string): NofyNotesResponse {
  ensureSeed();
  const linked = state.notes
    .filter((n) => n.deletedAt === null)
    .filter((n) => n.blocks.some((b) => b.type === "ref" && b.ref?.kind === kind && b.ref?.id === id))
    .sort(byUpdatedDesc);
  return { notes: linked.map(toRow), total: linked.length };
}

export function nofyOverview(): NofyOverviewResponse {
  ensureSeed();
  const active = state.notes.filter((n) => n.deletedAt === null);
  const weekAgo = daysAgoIso(7);
  const nowMs = Date.now();
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

  const tagCounts = new Map<string, number>();
  for (const note of active) for (const tagId of note.tagIds) tagCounts.set(tagId, (tagCounts.get(tagId) ?? 0) + 1);

  const foldersWithCounts = state.folders.map((f) => ({
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
      createdThisWeek: active.filter((n) => n.createdAt >= weekAgo).length,
      favorites: active.filter((n) => n.favorite).length,
      folders: state.folders.length,
      tags: state.tags.length,
      trashed: state.notes.filter((n) => n.deletedAt !== null).length,
    },
    recentEdited: [...active].sort(byUpdatedDesc).slice(0, 6).map(toRow),
    recentViewed: recentlyViewed.map(toRow),
    favorites: active.filter((n) => n.favorite).sort(byUpdatedDesc).slice(0, 5).map(toRow),
    folders: foldersWithCounts,
    topTags: [...tagCounts.entries()]
      .map(([tagId, noteCount]) => ({ ...state.tags.find((t) => t.id === tagId)!, noteCount }))
      .filter((t) => Boolean(t.id))
      .sort((a, b) => b.noteCount - a.noteCount)
      .slice(0, 8),
    activity,
    templates: state.templates.slice(0, 4),
  };
}

export function getNote(id: string, options: { touchViewed?: boolean } = {}): { note: NofyNote; folderName: string | null; tagNames: string[] } {
  ensureSeed();
  const note = state.notes.find((n) => n.id === id);
  if (!note) throw new MockError(404, "Note not found");
  if (options.touchViewed) note.lastViewedAt = nowIso();
  resolveNoteRefs(note);
  return { note, folderName: folderNameOf(note.folderId), tagNames: tagNamesOf(note.tagIds) };
}

export function searchNofy(q: string): NofySearchResponse {
  ensureSeed();
  const query = q.trim().toLowerCase();
  if (query === "") return { results: [], total: 0 };

  const results = state.notes
    .filter((n) => n.deletedAt === null)
    .map((note) => {
      const titleHit = note.title.toLowerCase().includes(query);
      const fullText = textOfBlocks(note.blocks);
      const textHit = fullText.toLowerCase().includes(query);
      const tagHit = tagNamesOf(note.tagIds).some((t) => t.toLowerCase().includes(query));
      if (!titleHit && !textHit && !tagHit) return null;

      let snippet = excerptOf(note.blocks);
      if (textHit) {
        const index = fullText.toLowerCase().indexOf(query);
        const start = Math.max(0, index - 60);
        snippet = `${start > 0 ? "…" : ""}${fullText.slice(start, Math.min(fullText.length, index + query.length + 80)).replace(/\n+/g, " ")}${index + query.length + 80 < fullText.length ? "…" : ""}`;
      }
      return { ...toRow(note), snippet };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 30);

  return { results, total: results.length };
}

/** Entity picker — referenceable entities across the whole app. */
export function listRefs(q: string, kind?: string): NofyRefsResponse {
  const query = q.trim().toLowerCase();
  const ALL_KINDS: NofyRefKind[] = ["TRADE", "STRATEGY", "SETUP", "RULE", "LESSON", "EVENT", "SYMBOL", "NOTE"];
  const kinds: NofyRefKind[] = kind && ALL_KINDS.includes(kind as NofyRefKind) ? [kind as NofyRefKind] : ALL_KINDS;

  const hits: NofyRefsResponse["refs"] = [];
  const push = (kind: NofyRefKind, id: string): void => {
    const resolved = resolveRef(kind, id);
    if (resolved) hits.push(resolved);
  };

  if (kinds.includes("TRADE")) {
    for (const trade of mockStore.data.trades.filter((t) => t.deletedAt === null).slice(0, 60)) push("TRADE", trade.id);
  }
  if (kinds.includes("STRATEGY")) for (const s of mockStore.data.strategies) push("STRATEGY", s.id);
  if (kinds.includes("SETUP")) for (const s of mockStore.listSetups().setups) push("SETUP", s.id);
  if (kinds.includes("RULE")) for (const r of mockStore.listPlaybookRules().rules) push("RULE", r.id);
  if (kinds.includes("LESSON")) {
    for (const course of COURSES) for (const lesson of course.lessons) push("LESSON", lesson.id);
  }
  if (kinds.includes("EVENT")) for (const e of mockStore.data.ecoEvents.slice(0, 40)) push("EVENT", e.id);
  if (kinds.includes("SYMBOL")) for (const i of mockStore.data.instruments) push("SYMBOL", i.id);
  if (kinds.includes("NOTE")) {
    ensureSeed();
    for (const n of state.notes.filter((n) => n.deletedAt === null)) push("NOTE", n.id);
  }

  const filtered = query === ""
    ? hits
    : hits.filter((hit) => `${hit.label} ${hit.meta ?? ""}`.toLowerCase().includes(query));
  return { refs: filtered.slice(0, 40) };
}

// ── Note mutations ───────────────────────────────────────────────────────────

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

export function createNote(input: NofyNoteCreateInput): { note: NofyNote; folderName: string | null; tagNames: string[] } {
  ensureSeed();
  const template = input.templateId ? state.templates.find((t) => t.id === input.templateId) ?? null : null;
  const note: NofyNote = {
    id: crypto.randomUUID(),
    userId: state.userKey,
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
        ? structuredClone(template.blocks).map((block) => ({ ...block, id: newBlockId() }))
        : [blk("paragraph", "")],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastViewedAt: nowIso(),
    deletedAt: null,
  };
  state.notes.unshift(note);
  resolveNoteRefs(note);
  return { note, folderName: folderNameOf(note.folderId), tagNames: [] };
}

const VERSION_INTERVAL_MS = 3 * 60_000;
const VERSION_CAP = 12;

function maybeSnapshotVersion(note: NofyNote): void {
  const versions = state.versions.get(note.id) ?? [];
  const newest = versions[0];
  if (newest && nowIso().slice(0, 16) === newest.savedAt.slice(0, 16)) return;
  if (newest && new Date(nowIso()).getTime() - new Date(newest.savedAt).getTime() < VERSION_INTERVAL_MS) return;
  versions.unshift({ id: crypto.randomUUID(), noteId: note.id, title: note.title, blocks: structuredClone(note.blocks), savedAt: note.updatedAt });
  state.versions.set(note.id, versions.slice(0, VERSION_CAP));
}

export function updateNote(id: string, input: NofyNoteUpdateInput): { note: NofyNote; folderName: string | null; tagNames: string[] } {
  ensureSeed();
  const note = state.notes.find((n) => n.id === id && n.deletedAt === null);
  if (!note) throw new MockNotFoundError();

  const hasMeaningfulChange =
    input.title !== undefined || input.icon !== undefined || input.folderId !== undefined ||
    input.tagIds !== undefined || input.favorite !== undefined || input.blocks !== undefined;

  if (input.touchViewed) {
    note.lastViewedAt = nowIso();
  }
  if (hasMeaningfulChange) {
    maybeSnapshotVersion(note);
    if (input.title !== undefined) note.title = input.title.trim();
    if (input.icon !== undefined) note.icon = input.icon;
    if (input.folderId !== undefined) note.folderId = input.folderId;
    if (input.tagIds !== undefined) {
      const known = new Set(state.tags.map((t) => t.id));
      note.tagIds = input.tagIds.filter((tagId) => known.has(tagId));
    }
    if (input.favorite !== undefined) note.favorite = input.favorite;
    if (input.blocks !== undefined) note.blocks = normalizeBlocks(input.blocks);
    note.updatedAt = nowIso();
  }
  resolveNoteRefs(note);
  return { note, folderName: folderNameOf(note.folderId), tagNames: tagNamesOf(note.tagIds) };
}

export function trashNote(id: string): { ok: true } {
  ensureSeed();
  const note = state.notes.find((n) => n.id === id && n.deletedAt === null);
  if (!note) throw new MockNotFoundError();
  note.deletedAt = nowIso();
  return { ok: true };
}

export function restoreNote(id: string): { ok: true } {
  ensureSeed();
  const note = state.notes.find((n) => n.id === id && n.deletedAt !== null);
  if (!note) throw new MockNotFoundError();
  note.deletedAt = null;
  note.updatedAt = nowIso();
  return { ok: true };
}

export function purgeNote(id: string): { ok: true } {
  ensureSeed();
  const index = state.notes.findIndex((n) => n.id === id && n.deletedAt !== null);
  if (index === -1) throw new MockNotFoundError();
  state.notes.splice(index, 1);
  state.versions.delete(id);
  return { ok: true };
}

export function duplicateNote(id: string, input: NofyNoteDuplicateInput): { note: NofyNote; folderName: string | null; tagNames: string[] } {
  ensureSeed();
  const source = state.notes.find((n) => n.id === id && n.deletedAt === null);
  if (!source) throw new MockNotFoundError();
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
  copy.blocks = copy.blocks.map((block) => ({ ...block, id: newBlockId() }));
  state.notes.unshift(copy);
  resolveNoteRefs(copy);
  return { note: copy, folderName: folderNameOf(copy.folderId), tagNames: tagNamesOf(copy.tagIds) };
}

// ── Folder mutations ─────────────────────────────────────────────────────────

export function listFolders() {
  ensureSeed();
  const active = state.notes.filter((n) => n.deletedAt === null);
  return {
    folders: state.folders
      .map((f) => ({ ...f, noteCount: active.filter((n) => n.folderId === f.id).length }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function createFolder(input: NofyFolderCreateInput): NofyFolder & { noteCount: number } {
  ensureSeed();
  const name = input.name.trim();
  if (name === "") throw new MockBadRequest("Folder name is required");
  if (state.folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
    throw new MockConflict("A folder with this name already exists");
  }
  const folder: NofyFolder = { id: crypto.randomUUID(), name, createdAt: nowIso() };
  state.folders.push(folder);
  return { ...folder, noteCount: 0 };
}

export function updateFolder(id: string, input: NofyFolderUpdateInput): NofyFolder & { noteCount: number } {
  ensureSeed();
  const folder = state.folders.find((f) => f.id === id);
  if (!folder) throw new MockNotFoundError();
  const name = input.name.trim();
  if (name === "") throw new MockBadRequest("Folder name is required");
  if (state.folders.some((f) => f.id !== id && f.name.toLowerCase() === name.toLowerCase())) {
    throw new MockConflict("A folder with this name already exists");
  }
  folder.name = name;
  const active = state.notes.filter((n) => n.deletedAt === null);
  return { ...folder, noteCount: active.filter((n) => n.folderId === folder.id).length };
}

export function deleteFolder(id: string): { ok: true } {
  ensureSeed();
  const index = state.folders.findIndex((f) => f.id === id);
  if (index === -1) throw new MockNotFoundError();
  state.folders.splice(index, 1);
  for (const note of state.notes) if (note.folderId === id) note.folderId = null;
  return { ok: true };
}

// ── Tag mutations ────────────────────────────────────────────────────────────

export function listTags() {
  ensureSeed();
  const active = state.notes.filter((n) => n.deletedAt === null);
  return {
    tags: state.tags
      .map((t) => ({ ...t, noteCount: active.filter((n) => n.tagIds.includes(t.id)).length }))
      .sort((a, b) => b.noteCount - a.noteCount || a.name.localeCompare(b.name)),
  };
}

export function createTag(name: string): NofyTag & { noteCount: number } {
  ensureSeed();
  const trimmed = name.trim().replace(/^#/, "");
  if (trimmed === "") throw new MockBadRequest("Tag name is required");
  const existing = state.tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    const active = state.notes.filter((n) => n.deletedAt === null);
    return { ...existing, noteCount: active.filter((n) => n.tagIds.includes(existing.id)).length };
  }
  const tag: NofyTag = { id: crypto.randomUUID(), name: trimmed };
  state.tags.push(tag);
  return { ...tag, noteCount: 0 };
}

// ── Templates ────────────────────────────────────────────────────────────────

export function listTemplates() {
  ensureSeed();
  return { templates: [...state.templates] };
}

export function createTemplate(input: NofyTemplateCreateInput): NofyTemplate {
  ensureSeed();
  let blocks: NofyBlock[];
  if (input.blocks) {
    blocks = normalizeBlocks(input.blocks);
  } else if (input.fromNoteId) {
    const source = state.notes.find((n) => n.id === input.fromNoteId && n.deletedAt === null);
    if (!source) throw new MockNotFoundError();
    blocks = structuredClone(source.blocks).map((block) => {
      const clone = { ...block, id: newBlockId() };
      delete clone.ref; // references are personal to the note, not the template
      return clone;
    });
  } else {
    blocks = [blk("paragraph", "")];
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
  state.templates.push(template);
  return template;
}

export function instantiateTemplate(input: NofyTemplateInstantiateInput): { note: NofyNote; folderName: string | null; tagNames: string[] } {
  ensureSeed();
  const template = state.templates.find((t) => t.id === input.templateId);
  if (!template) throw new MockNotFoundError();
  return createNote({
    title: input.title?.trim() || template.name,
    folderId: input.folderId ?? null,
    templateId: template.id,
  });
}

// ── Versions ─────────────────────────────────────────────────────────────────

export function listVersions(noteId: string): NofyVersionsResponse {
  ensureSeed();
  const versions = state.versions.get(noteId) ?? [];
  return {
    versions: versions.map((version) => ({
      id: version.id,
      title: version.title,
      savedAt: version.savedAt,
      wordCount: countWords(version.blocks),
    })),
  };
}

export function getVersion(noteId: string, versionId: string): NofyVersionResponse {
  ensureSeed();
  const version = (state.versions.get(noteId) ?? []).find((v) => v.id === versionId);
  if (!version) throw new MockNotFoundError();
  return { version: { id: version.id, title: version.title, savedAt: version.savedAt, blocks: structuredClone(version.blocks) } };
}

export function restoreVersion(noteId: string, versionId: string): { note: NofyNote; folderName: string | null; tagNames: string[] } {
  ensureSeed();
  const note = state.notes.find((n) => n.id === noteId && n.deletedAt === null);
  if (!note) throw new MockNotFoundError();
  const version = (state.versions.get(noteId) ?? []).find((v) => v.id === versionId);
  if (!version) throw new MockNotFoundError();
  maybeSnapshotVersion(note);
  note.title = version.title;
  note.blocks = structuredClone(version.blocks).map((block) => ({ ...block, id: newBlockId() }));
  note.updatedAt = nowIso();
  resolveNoteRefs(note);
  return { note, folderName: folderNameOf(note.folderId), tagNames: tagNamesOf(note.tagIds) };
}

// ── Mock errors — subclasses of store.MockError so handlers map status ───────

export class MockNotFoundError extends MockError {
  constructor(message = "Not found") {
    super(404, message);
    this.name = "MockNotFoundError";
  }
}
export class MockBadRequest extends MockError {
  constructor(message: string) {
    super(400, message);
    this.name = "MockBadRequest";
  }
}
export class MockConflict extends MockError {
  constructor(message: string) {
    super(409, message);
    this.name = "MockConflict";
  }
}
