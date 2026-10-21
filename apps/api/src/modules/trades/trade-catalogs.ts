/**
 * System catalogs for the trade journal context (B3 — Domaine 4).
 *
 * - SYSTEM_MISTAKES is the Tier-1 error taxonomy: a SEEDED, IMMUTABLE system
 *   catalog (`isSystem: true`, `userId: null`). The ids are fixed literals
 *   (not random) so TradeMistake join rows stay referentially stable across
 *   restarts and environments — the resolve route addresses mistakes by them.
 * - STARTER_TAGS is the lazily-seeded per-user tag starter set (the capture
 *   form "Add details" chips); users freely add their own on top (POST /tags).
 *
 * Both mirror `apps/web/src/mocks/fixtures/catalog.ts` — the MSW engine and
 * this backend must never disagree on the catalog content.
 */
import type { Mistake, Tag } from "../../shared/contracts";

export interface SystemMistake extends Mistake {
  isSystem: true;
  userId: null;
}

/** Fixed literal UUIDs — stable references for the seeded system catalog. */
export const SYSTEM_MISTAKES: readonly SystemMistake[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    key: "moved_stop",
    category: "MANAGEMENT",
    label: "Stop moved against you",
    description: "Stop widened after entry — risk exceeded the plan.",
    severity: 4,
    isSystem: true,
    userId: null,
    detectionHint: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    key: "revenge_trade",
    category: "BEHAVIOR",
    label: "Revenge trade",
    description: "Bigger-than-usual size shortly after a loss — emotional re-entry.",
    severity: 5,
    isSystem: true,
    userId: null,
    detectionHint: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    key: "oversized",
    category: "MANAGEMENT",
    label: "Size above plan",
    description: "Position size exceeds the sizer's suggestion by >40%.",
    severity: 4,
    isSystem: true,
    userId: null,
    detectionHint: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    key: "no_stop_loss",
    category: "ENTRY",
    label: "No stop loss",
    description: "Trade taken without any planned stop.",
    severity: 5,
    isSystem: true,
    userId: null,
    detectionHint: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    key: "out_of_hours",
    category: "ENTRY",
    label: "Out of trading window",
    description: "Entry outside the strategy's declared trading window.",
    severity: 3,
    isSystem: true,
    userId: null,
    detectionHint: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    key: "cut_winner_early",
    category: "EXIT",
    label: "Winner cut early",
    description: "Exit far before the MFE the trade offered.",
    severity: 3,
    isSystem: true,
    userId: null,
    detectionHint: null,
  },
] as const;

const mistakeById = new Map(SYSTEM_MISTAKES.map((m) => [m.id, m]));

/** Catalog lookup for projections (unknown ids degrade to an honest stub). */
export function findSystemMistake(mistakeId: string): SystemMistake | null {
  return mistakeById.get(mistakeId) ?? null;
}

/** System mistake id by stable key (detection rules address mistakes by key). */
export function systemMistakeIdByKey(key: string): string | null {
  const found = SYSTEM_MISTAKES.find((m) => m.key === key);
  return found?.id ?? null;
}

/** Starter tag chips ("Add details") — seeded once, per user, on first read. */
export interface StarterTagDef {
  name: string;
  category: Tag["category"];
}

export const STARTER_TAGS: readonly StarterTagDef[] = [
  { name: "A+ context", category: "SETUP" },
  { name: "HTF aligned", category: "SETUP" },
  { name: "News window", category: "CONTEXT" },
  { name: "London open", category: "CONTEXT" },
  { name: "NY open", category: "CONTEXT" },
  { name: "Overtraded", category: "MISTAKE" },
  { name: "Chased entry", category: "MISTAKE" },
  { name: "Revenge", category: "EMOTION" },
  { name: "FOMO", category: "EMOTION" },
  { name: "Scalp", category: "CUSTOM" },
] as const;
