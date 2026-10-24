import { z } from "zod";

/**
 * Shared schema primitives.
 *
 * COSMOZ contract (data-model.md §1 + AGENTS.md golden rules):
 * - Money / prices / quantities / R-values NEVER travel as `number`.
 *   They are decimal-as-string, matching Prisma's numeric(18,8) serialization.
 * - All timestamps are UTC ISO-8601 with the `Z` suffix.
 * - "Date" columns (tradingDate, journal date, goal periods) are calendar
 *   days serialized as `YYYY-MM-DD`.
 */

// ── Decimal-as-string ────────────────────────────────────────────────────────

const DECIMAL_STRING_REGEX = /^-?\d+(\.\d+)?$/;

/**
 * Decimal-as-string: `123.45`, `-0.00012`. No exponent, no thousands
 * separators, no trailing garbage. This is the ONLY allowed wire format for
 * money, prices, quantities and R-multiples (never `number`).
 */
export const decimalStringSchema = z
  .string()
  .regex(DECIMAL_STRING_REGEX, "Expected a decimal string (e.g. \"123.45\")");

export type DecimalString = z.infer<typeof decimalStringSchema>;

/** Strictly positive decimal string - for prices, quantities, risk values. */
export const positiveDecimalStringSchema = decimalStringSchema.refine(
  (value) => Number(value) > 0,
  "Must be a decimal string > 0",
);

/** Zero or positive decimal string - for fees, counts-as-amounts. */
export const nonNegativeDecimalStringSchema = decimalStringSchema.refine(
  (value) => Number(value) >= 0,
  "Must be a decimal string >= 0",
);

// ── Timestamps (UTC) ─────────────────────────────────────────────────────────

/** UTC timestamp, e.g. `"2026-09-17T14:30:00.000Z"`. `Z` suffix required. */
export const isoDateTimeSchema = z.string().datetime({
  offset: false,
  message: "Expected a UTC ISO-8601 timestamp with Z suffix",
});

export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;

// ── Calendar dates ───────────────────────────────────────────────────────────

/**
 * Calendar day `YYYY-MM-DD`, calendar-validated (rejects `2026-02-30`).
 * Used for tradingDate, journal dates, goal periods.
 */
export const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .superRefine((value, ctx) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Not a valid calendar date",
      });
    }
  });

export type DateKey = z.infer<typeof dateKeySchema>;

// ── Identifiers ──────────────────────────────────────────────────────────────

/** Entity id (UUID v4 as produced by the API). */
export const uuidSchema = z.string().uuid();

export type UuidString = z.infer<typeof uuidSchema>;

// ── JSON columns ─────────────────────────────────────────────────────────────

/**
 * Mirror of Prisma's `Json` column type - strictly typed, no `any`.
 * Used for columns the spec leaves schema-free: `checklistSnap`, `params`,
 * `payload`, `context`, `detectionHint`, `annotations`, `errorLog`.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

/** Object-shaped JSON column (keys are strings). */
export const jsonObjectSchema = z.record(jsonValueSchema);

export type JsonObject = { [key: string]: JsonValue };
