import { z } from "zod";
import { accountTypeSchema, brokerSchema, currencySchema } from "../enums";
import { decimalStringSchema, isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * Prop-firm challenge config, stored as JSON on the account
 * (data-model.md: "les règles du challenge vivent ici, pas dans une table dédiée").
 * All numeric values are user-entered config, not measured amounts.
 */
export const propFirmConfigSchema = z.object({
  firm: z.string().min(1).optional(),
  /** Max loss for one day, in percent of starting balance (e.g. 5 for 5%). */
  maxDailyLossPct: z.number().optional(),
  /** Max total drawdown, in percent of starting balance. */
  maxTotalDd: z.number().optional(),
  /** Profit target, in percent of starting balance. */
  profitTarget: z.number().optional(),
  minTradingDays: z.number().int().min(0).optional(),
});

export type PropFirmConfig = z.infer<typeof propFirmConfigSchema>;

/** Account - data-model.md "Domaine 2". */
export const accountSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  /** e.g. "Deriv Live", "FTMO Challenge 2". */
  name: z.string().min(1),
  type: accountTypeSchema,
  broker: brokerSchema,
  currency: currencySchema,
  startingBalance: decimalStringSchema,
  isDefault: z.boolean(),
  propConfig: propFirmConfigSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export type Account = z.infer<typeof accountSchema>;
