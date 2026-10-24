/**
 * Nofy built-in templates (Phase 12 §23) - the product's five starter
 * structures, ported VERBATIM from the mock engine (the parity reference,
 * same block order, texts and tones). Code-owned immutable content: the
 * Phase 7 playbook-templates / Phase 11 academy-content precedent - the
 * product has no template CMS and no template draft/publish lifecycle, so
 * no database rows exist for them. Only USER templates are persisted.
 *
 * These are NOT educational content (Academy owns that): they are the
 * trader's personal-workspace scaffolding - idea framing, market reads,
 * strategy definitions, trade reviews and lesson consolidation.
 */
import type { NofyBlock, NofyTemplate } from "../../../shared/contracts";

import { newBlockId } from "./nofy-content";

const BUILT_IN_AT = "2026-01-01T00:00:00.000Z";

/** Authoring helper - terse seed blocks (mock parity). */
function blk(type: NofyBlock["type"], text: string, extra: Partial<NofyBlock> = {}): NofyBlock {
  return { id: newBlockId(), type, text, ...extra };
}

export interface NofyBuiltInTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  blocks: NofyBlock[];
  builtIn: true;
  createdAt: string;
}

function template(id: string, name: string, description: string, icon: string, blocks: NofyBlock[]): NofyBuiltInTemplate {
  return { id, name, description, icon, blocks, builtIn: true, createdAt: BUILT_IN_AT };
}

const TEMPLATE_IDS = {
  tradingIdea: "tpl-trading-idea",
  marketAnalysis: "tpl-market-analysis",
  strategyIdea: "tpl-strategy-idea",
  tradeReview: "tpl-trade-review",
  learningNote: "tpl-learning-note",
} as const;

export const NOFY_BUILT_IN_TEMPLATES: NofyBuiltInTemplate[] = [
  template(
    TEMPLATE_IDS.tradingIdea,
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
    TEMPLATE_IDS.marketAnalysis,
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
    TEMPLATE_IDS.strategyIdea,
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
    TEMPLATE_IDS.tradeReview,
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
    TEMPLATE_IDS.learningNote,
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

/** Lookup by template id (create-from-template + instantiate flows). */
export function findBuiltInTemplate(templateId: string): NofyBuiltInTemplate | null {
  return NOFY_BUILT_IN_TEMPLATES.find((candidate) => candidate.id === templateId) ?? null;
}

/** Wire-shape template (NofyTemplate contract) for a built-in entry. */
export function builtInTemplateToContract(entry: NofyBuiltInTemplate): NofyTemplate {
  return { ...entry, blocks: entry.blocks.map((block) => ({ ...block })) };
}
