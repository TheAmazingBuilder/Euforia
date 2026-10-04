/**
 * Normalization boundary (Phase 3 §11/§36).
 *
 * Every payload coming OUT of a provider adapter is validated against these
 * schemas before it may enter the domain or the database. A type-broken
 * provider response becomes INVALID_PROVIDER_RESPONSE — never a corrupted
 * row, never a raw provider error at the API surface.
 *
 * These are backend-internal schemas (adapter → domain boundary); the
 * client-facing wire schemas live in @cosmoz/shared.
 */
import { z } from "zod";
import {
  currencySchema,
  directionSchema,
} from "../../shared/contracts";
import { decimalStringSchema, isoDateTimeSchema } from "../../shared/contracts";

export const normalizedAccountInfoSchema = z.object({
  externalAccountId: z.string().min(1),
  currency: currencySchema,
  leverage: z.string().nullable(),
  server: z.string().nullable(),
});

export const normalizedSnapshotSchema = z.object({
  balance: decimalStringSchema.nullable(),
  equity: decimalStringSchema.nullable(),
  margin: decimalStringSchema.nullable(),
  freeMargin: decimalStringSchema.nullable(),
  marginLevel: decimalStringSchema.nullable(),
});

export const normalizedPositionSchema = z.object({
  externalPositionId: z.string().min(1),
  symbol: z.string().min(1),
  side: directionSchema,
  volume: decimalStringSchema,
  entryPrice: decimalStringSchema,
  currentPrice: decimalStringSchema.nullable(),
  stopLoss: decimalStringSchema.nullable(),
  takeProfit: decimalStringSchema.nullable(),
  profit: decimalStringSchema.nullable(),
  swap: decimalStringSchema.nullable(),
  commission: decimalStringSchema.nullable(),
  openedAt: isoDateTimeSchema,
});

export const normalizedPositionsSchema = z.array(normalizedPositionSchema);

export const normalizedOrderSchema = z.object({
  externalOrderId: z.string().min(1),
  symbol: z.string().min(1),
  type: z.string().min(1),
  volume: decimalStringSchema,
  price: decimalStringSchema,
  stopLoss: decimalStringSchema.nullable(),
  takeProfit: decimalStringSchema.nullable(),
  status: z.string().min(1),
  createdAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema.nullable(),
});

export const normalizedOrdersSchema = z.array(normalizedOrderSchema);

export const normalizedDealSchema = z.object({
  externalDealId: z.string().min(1),
  symbol: z.string().nullable(),
  side: directionSchema,
  volume: decimalStringSchema,
  price: decimalStringSchema.nullable(),
  profit: decimalStringSchema.nullable(),
  commission: decimalStringSchema.nullable(),
  swap: decimalStringSchema.nullable(),
  /** Provider-side position identifier — nullable (balance ops have none). */
  positionId: z.string().min(1).nullable(),
  executedAt: isoDateTimeSchema,
});

export const normalizedDealsSchema = z.array(normalizedDealSchema);
