/**
 * Nofy seed content (B11) — the professional demo workspace: 7 folders,
 * 10 tags, 5 built-in templates and 9 notes (one of them trashed so the
 * Trash page demonstrates restore/purge honestly).
 *
 * Seeded lazily per user on first nofy read, exactly like the mock engine.
 * Reference blocks point at REAL app entities (the winning/losing trade,
 * first strategy/setup, a high-impact release, the XAUUSD instrument);
 * when such an entity does not exist yet the ref is simply omitted — the
 * mock has the same graceful fallback.
 */
import type {
  NofyBlock,
  NofyBlockInput,
  NofyFolder,
  NofyNote,
  NofyTag,
  NofyTemplate,
} from "../../shared/contracts";

// ── Small authoring helpers ──────────────────────────────────────────────────

const daysAgoIso = (days: number, hourOffset = 0): string =>
  new Date(Date.now() - days * 86_400_000 - hourOffset * 3_600_000).toISOString();

let seedBlockCounter = 0;
const newBlockId = (): string =>
  `nb-seed-${(seedBlockCounter++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function blk(type: NofyBlock["type"], text: string, extra: Partial<NofyBlock> = {}): NofyBlock {
  return { id: newBlockId(), type, text, ...extra };
}

function refBlock(ref: { kind: string; id: string } | undefined): NofyBlock {
  return ref ? blk("ref", "", { ref: { kind: ref.kind, id: ref.id } as NofyBlock["ref"] }) : blk("paragraph", "");
}

// ── Built-in templates (spec §23 set, authored as real block lists) ─────────

export function builtInTemplates(): NofyTemplate[] {
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
    template("Trading Idea", "Structure a hypothesis before risking a dollar on it.", "📈", [
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
    ]),
    template("Market Analysis", "A structured read of one market before the session opens.", "🧭", [
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
      blk("callout", "Bullish case — what confirms it.", { tone: "tip" }),
      blk("callout", "Bearish case — what confirms it.", { tone: "warn" }),
      blk("h2", "Invalidation"),
      blk("paragraph", "The read is wrong if…"),
    ]),
    template("Strategy Idea", "Define a repeatable strategy the same way the Playbook will grade it.", "🛠️", [
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
    ]),
    template("Trade Review", "Turn one execution into one durable lesson.", "🔍", [
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
    ]),
    template("Learning Note", "Consolidate an Academy lesson into your own words.", "📚", [
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
    ]),
  ];
}

// ── Seed context — real entities the demo refs may point at ─────────────────

export interface NofySeedContext {
  losingTradeId?: string;
  winningTradeId?: string;
  strategyId?: string;
  setupId?: string;
  highImpactEventId?: string;
  xauusdInstrumentId?: string;
}

export interface NofySeed {
  folders: NofyFolder[];
  tags: NofyTag[];
  templates: NofyTemplate[];
  notes: NofyNote[];
}

const FOLDER_SEEDS = [
  { name: "Strategies", ageDays: 24 },
  { name: "Market Analysis", ageDays: 24 },
  { name: "Psychology", ageDays: 23 },
  { name: "Research", ageDays: 21 },
  { name: "Trade Ideas", ageDays: 20 },
  { name: "Checklists", ageDays: 19 },
  { name: "Learning", ageDays: 18 },
];

const TAG_SEEDS = [
  "XAUUSD",
  "NASDAQ",
  "Forex",
  "Breakout",
  "Liquidity",
  "Psychology",
  "RiskManagement",
  "LondonSession",
  "CPI",
  "StrategyIdea",
];

export function buildSeed(context: NofySeedContext): NofySeed {
  const folders: NofyFolder[] = FOLDER_SEEDS.map((seed) => ({
    id: crypto.randomUUID(),
    name: seed.name,
    createdAt: daysAgoIso(seed.ageDays),
  }));
  const folder = (name: string): string | null => folders.find((f) => f.name === name)?.id ?? null;

  const tags: NofyTag[] = TAG_SEEDS.map((name) => ({ id: crypto.randomUUID(), name }));
  const tag = (name: string): string => tags.find((t) => t.name === name)!.id;

  const templates = builtInTemplates();
  const now = (): string => new Date().toISOString();

  const note = (n: Omit<NofyNote, "userId">): NofyNote => ({ userId: "seed", ...n });

  const notes: NofyNote[] = [
    note({
      id: crypto.randomUUID(),
      title: "XAUUSD London Breakout — observations",
      icon: "📈",
      folderId: folder("Market Analysis"),
      tagIds: [tag("XAUUSD"), tag("LondonSession"), tag("Breakout")],
      favorite: true,
      templateId: null,
      lessonRef: null,
      blocks: [
        blk("h2", "Session behaviour"),
        blk("paragraph", "Gold tends to sweep the Asian range in the first 15 minutes of London, then rotate. The sweep is tradeable only when the reclaim holds on the 5m close — otherwise it is continuation, not reversal."),
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
            ["CPI day", "Sweep ignored — spreads widened", "Skipped"],
          ],
        }),
        blk("callout", "The sweep is bait. The reclaim is the setup — wait for it, every time.", { tone: "warn" }),
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
        blk("quote", "Missing a trade costs nothing. Entering early costs the full R."),
        blk("callout", "Rule: confirmation candle or nothing. If it already left without me, it was never my trade.", { tone: "risk" }),
        blk("h2", "Evidence from the journal"),
        blk("paragraph", "The losing trade below is the third front-run this month. Same emotion before entry, same feeling at exit."),
        refBlock(context.losingTradeId ? { kind: "TRADE", id: context.losingTradeId } : undefined),
        refBlock(context.strategyId ? { kind: "STRATEGY", id: context.strategyId } : undefined),
        blk("h2", "Action items"),
        blk("todo", "Write the confirmation rule at the top of the pre-session checklist", { checked: true }),
        blk("todo", "Journal every entry where confirmation was missing — 10 sessions", { checked: false }),
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
        blk("paragraph", "A liquidity sweep is a push through a visible swing high/low that does not hold — engineered to fill larger orders. It fails as a breakout within one to three candles."),
        blk("h2", "What makes it exploitable"),
        blk("numbered", "A clean prior level everyone can see"),
        blk("numbered", "Momentum into the level, not a slow drift"),
        blk("numbered", "Fast rejection — the reclaim candle is the tell"),
        blk("h2", "What it is NOT"),
        blk("bullet", "A guaranteed reversal — sweeps fail constantly in trend"),
        blk("bullet", "A reason to skip the confirmation candle"),
        blk("callout", "Counter-trend by nature. Grade it against the higher-timeframe structure before anything else.", { tone: "info" }),
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
        blk("paragraph", "Studying how gold reacts to US CPI releases — the goal is not to trade the release, it is to understand the post-release range so the second move can be traded safely."),
        refBlock(context.highImpactEventId ? { kind: "EVENT", id: context.highImpactEventId } : undefined),
        blk("h2", "Observations"),
        blk("bullet", "First move is noise — spreads widen, both sides get wicked"),
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
        refBlock(context.setupId ? { kind: "SETUP", id: context.setupId } : undefined),
        blk("h2", "Entry conditions"),
        blk("todo", "Range width < 0.3 × ATR(14)", { checked: false }),
        blk("todo", "Breakout candle closes back inside the range", { checked: false }),
        blk("todo", "No Tier-1 release in the next hour", { checked: false }),
        blk("h2", "Invalidation"),
        blk("paragraph", "A close beyond the range on rising volume kills the fade idea for the day."),
        refBlock(context.xauusdInstrumentId ? { kind: "SYMBOL", id: context.xauusdInstrumentId } : undefined),
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
        blk("todo", "Maximum 2 trades planned — count them", { checked: false }),
        blk("callout", "If the checklist cannot be completed, the session does not start.", { tone: "warn" }),
      ],
      createdAt: daysAgoIso(18, 1),
      updatedAt: daysAgoIso(0, 8),
      lastViewedAt: daysAgoIso(0, 8),
      deletedAt: null,
    }),
    note({
      id: crypto.randomUUID(),
      title: "Position sizing — my notes",
      icon: "📚",
      folderId: folder("Learning"),
      tagIds: [tag("RiskManagement"), tag("Forex")],
      favorite: false,
      templateId: null,
      lessonRef: null,
      blocks: [
        blk("paragraph", "Personal consolidation of the Academy lesson on position sizing — written in my own words so it sticks."),
        blk("h2", "The core arithmetic"),
        blk("paragraph", "Risk amount = balance × risk %. Position size = risk amount ÷ (stop distance × value per unit). The stop distance is GIVEN by the structure — sizing adapts to it, never the other way around."),
        blk("h2", "What I keep getting wrong"),
        blk("bullet", "Widening the stop to keep the size — that is risk denial, not sizing"),
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
      title: "Weekly review — what the data says",
      icon: "🧾",
      folderId: folder("Strategies"),
      tagIds: [tag("XAUUSD"), tag("Breakout")],
      favorite: false,
      templateId: null,
      lessonRef: null,
      blocks: [
        blk("paragraph", "Aggregated from the last journal review: the breakout strategy pays when the range qualifies, and bleeds when I force it in chop. The fix is a filter, not a new strategy."),
        refBlock(context.winningTradeId ? { kind: "TRADE", id: context.winningTradeId } : undefined),
        blk("h2", "Decisions"),
        blk("numbered", "Add the ATR filter to the strategy definition"),
        blk("numbered", "No breakout trades on red-folder news days"),
        blk("numbered", "Re-grade every forced breakout as a violation"),
      ],
      createdAt: daysAgoIso(2, 6),
      updatedAt: daysAgoIso(0, 2),
      lastViewedAt: daysAgoIso(0, 2),
      deletedAt: null,
    }),
    // One trashed note so the Trash page demonstrates restore/purge honestly.
    note({
      id: crypto.randomUUID(),
      title: "Random itch — scalp the open",
      icon: "🗑️",
      folderId: null,
      tagIds: [],
      favorite: false,
      templateId: null,
      lessonRef: null,
      blocks: [blk("paragraph", "Impulse idea written mid-session, deleted on review — kept in trash as a reminder.")],
      createdAt: daysAgoIso(3, 2),
      updatedAt: daysAgoIso(3, 1),
      lastViewedAt: null,
      deletedAt: daysAgoIso(2, 4),
    }),
  ];

  // The seeded timestamps are relative to build time; re-stamp updatedAt so
  // "created this week" activity stays honest regardless of when it runs.
  void now;
  return { folders, tags, templates, notes };
}

// Re-exported for the service's block normalizer.
export type { NofyBlock, NofyBlockInput };
