import { z } from "zod";
import { decimalStringSchema, positiveDecimalStringSchema } from "./primitives";

/**
 * Goals — data-model.md "goal periods are calendar months (YYYY-MM)".
 *
 * The Goals screen pairs two things:
 *  1. GOAL SETTINGS — the trader's monthly targets (authored data, editable).
 *  2. GOAL PROGRESS — how the CURRENT behavior compares with those targets,
 *     computed SERVER-SIDE from DailyStat rows (never user-entered).
 *
 * Money targets travel as decimal strings; ratios expressed in percent units
 * (win rate, discipline, pace) travel as numbers 0–100, matching DailyStat.
 */

// ── Goal settings (GET/PATCH /goals/settings) ───────────────────────────────

export const goalSettingsSchema = z.object({
  /** Net P&L the trader wants to close the month with (money, > 0). */
  monthlyPnlTarget: positiveDecimalStringSchema,
  /** Average R-multiple target for the month (e.g. "0.30"). */
  avgRTarget: positiveDecimalStringSchema,
  /** Win rate target, in percent units (0–100). */
  winRateTargetPct: z.number().min(0).max(100),
  /** Green trading days targeted this month (0–31). */
  greenDaysTarget: z.number().int().min(0).max(31),
  /** Average discipline score target, in percent units (0–100). */
  disciplineTargetPct: z.number().min(0).max(100),
  /** Behavior ceiling — max trades allowed in ONE day (lower is better). */
  maxTradesPerDay: z.number().int().min(1).max(50),
  /** Last time the targets were edited (UTC ISO-8601). */
  updatedAt: z.string().min(1),
});
export type GoalSettings = z.infer<typeof goalSettingsSchema>;

export const updateGoalSettingsInputSchema = z
  .object({
    monthlyPnlTarget: positiveDecimalStringSchema.optional(),
    avgRTarget: positiveDecimalStringSchema.optional(),
    winRateTargetPct: z.number().min(0).max(100).optional(),
    greenDaysTarget: z.number().int().min(0).max(31).optional(),
    disciplineTargetPct: z.number().min(0).max(100).optional(),
    maxTradesPerDay: z.number().int().min(1).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one goal field",
  });
export type UpdateGoalSettingsInput = z.infer<typeof updateGoalSettingsInputSchema>;

// ── Goal progress (GET /goals/progress?month=YYYY-MM) ───────────────────────

export const goalProgressStatusSchema = z.enum(["ACHIEVED", "ON_TRACK", "AT_RISK", "OFF_TRACK"]);
export type GoalProgressStatus = z.infer<typeof goalProgressStatusSchema>;

/** One goal row: the target, the actual behavior, and where that leaves us. */
export const goalProgressRowSchema = z.object({
  key: z.enum([
    "monthlyPnl",
    "winRate",
    "avgR",
    "greenDays",
    "discipline",
    "maxTradesPerDay",
  ]),
  label: z.string().min(1),
  /** Formatted-free numbers for the client to render with its own helpers. */
  target: z.number(),
  actual: z.number(),
  /** 0–1+ for higher-is-better goals; usage ratio for lower-is-better ones. */
  pct: z.number(),
  status: goalProgressStatusSchema,
  /** false = behavior ceiling (max trades per day) — under is better. */
  higherIsBetter: z.boolean(),
  /** Optional human note computed server-side (e.g. projection at pace). */
  note: z.string().nullable(),
});
export type GoalProgressRow = z.infer<typeof goalProgressRowSchema>;

/**
 * Goal progress for one month. Everything is computed server-side from the
 * DailyStat rows of the requested calendar month (UTC trading dates).
 */
export const goalProgressResponseSchema = z.object({
  /** `YYYY-MM` — the evaluated month. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  /** e.g. "September 2026". */
  label: z.string().min(1),
  currency: z.string().min(1),
  /** Where we are in the month (1-based), to pace the progress fairly. */
  dayOfMonth: z.number().int().min(1),
  daysInMonth: z.number().int().min(28).max(31),
  /** dayOfMonth / daysInMonth (0–1) — the fair "on track" line. */
  pacePct: decimalStringSchema,
  rows: z.array(goalProgressRowSchema),
  /** Months with DailyStat data, descending — for the period selector. */
  availableMonths: z.array(z.string().regex(/^\d{4}-\d{2}$/)),
});
export type GoalProgressResponse = z.infer<typeof goalProgressResponseSchema>;

// ── API envelope ─────────────────────────────────────────────────────────────

export const goalSettingsResponseSchema = z.object({
  settings: goalSettingsSchema,
});
export type GoalSettingsResponse = z.infer<typeof goalSettingsResponseSchema>;
