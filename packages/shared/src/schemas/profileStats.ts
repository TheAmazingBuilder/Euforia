import { z } from "zod";
import { currencySchema } from "../enums";
import { dateKeySchema, decimalStringSchema } from "./primitives";

/**
 * Profile extras - GET /me/stats.
 *
 * The Profile screen pairs three things:
 *  1. TRADING SNAPSHOT - lifetime KPIs computed SERVER-SIDE from the REAL
 *     journal (closed trades + DailyStat rows), never user-entered.
 *  2. ACHIEVEMENTS - deterministic milestones evaluated server-side from the
 *     same journal; locked badges carry their progress so the client only
 *     renders.
 *  3. COMMUNITY IDENTITY - the social handle / visibility live in the social
 *     domain (GET/PATCH /social/me), the Profile screen just edits them.
 *
 * Snapshot numbers travel raw (decimal strings for money, numbers for
 * ratios) so the client formats with its own helpers - same contract as
 * goal progress.
 */

// ── Trading snapshot ─────────────────────────────────────────────────────────

export const profileSnapshotSchema = z.object({
  /** Closed, non-deleted trades across every account. */
  totalTrades: z.number().int().min(0),
  /** Win rate over closed trades, percent units 0–100. */
  winRate: z.number().min(0).max(100),
  /** Average R-multiple over closed trades (null when no trade). */
  avgR: z.number().nullable(),
  /** Lifetime net P&L (money, decimal string). */
  netPnl: decimalStringSchema,
  /** Longest run of consecutive green (net > 0) trading days. */
  bestStreak: z.number().int().min(0),
  /** Days whose net P&L is positive. */
  greenDays: z.number().int().min(0),
  /** Mean discipline score over scored days (null when none). */
  disciplineAvg: z.number().nullable(),
  /** Distinct trading days with at least one closed trade. */
  tradingDays: z.number().int().min(0),
  /** First closed-trade date (YYYY-MM-DD) - "trading since". */
  firstTradeDate: dateKeySchema.nullable(),
});
export type ProfileSnapshot = z.infer<typeof profileSnapshotSchema>;

// ── Achievements ─────────────────────────────────────────────────────────────

/** Stable badge ids - the client maps them to icons/tints, never invents. */
export const achievementIdSchema = z.enum([
  "FIRST_TRADE",
  "GREEN_STREAK_5",
  "WIN_RATE_50",
  "AVG_R_20",
  "DISCIPLINE_75",
  "CLEAN_MONTH",
  "TARGET_HIT",
  "CENTURY",
]);
export type AchievementId = z.infer<typeof achievementIdSchema>;

export const achievementSchema = z.object({
  id: achievementIdSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  unlocked: z.boolean(),
  /** 0–1 fill for locked badges (null once unlocked - nothing left to fill). */
  progress: z.number().min(0).max(1).nullable(),
  /** Short server-computed status line, e.g. "3/5 green days". */
  progressLabel: z.string().nullable(),
  /** Unlock date when trivially derivable (first trade), else null. */
  unlockedAt: dateKeySchema.nullable(),
});
export type Achievement = z.infer<typeof achievementSchema>;

// ── Response envelope ────────────────────────────────────────────────────────

export const profileStatsResponseSchema = z.object({
  currency: currencySchema,
  snapshot: profileSnapshotSchema,
  achievements: z.array(achievementSchema),
});
export type ProfileStatsResponse = z.infer<typeof profileStatsResponseSchema>;
