import { z } from "zod";
import { assetClassSchema, currencySchema } from "../enums";
import { decimalStringSchema, uuidSchema } from "./primitives";

/**
 * Instrument — data-model.md "Domaine 2".
 * Specs live per instrument (pipSize, contractSize, digits); there are NO
 * per-asset-class constants in code (synthetic indices ≠ forex lots).
 */
export const instrumentSchema = z.object({
  id: uuidSchema,
  /** Unique ticker, e.g. "EURUSD", "VOL75(1s)", "BOOM500", "BTCUSDT". */
  symbol: z.string().min(1),
  name: z.string().min(1),
  assetClass: assetClassSchema,
  quoteCurrency: currencySchema,
  /** Price increment of one pip, e.g. "0.0001" forex, "1.0" Boom/Crash. */
  pipSize: decimalStringSchema,
  /** Display digits for prices (drives formatPrice). */
  digits: z.number().int().min(0).max(10),
  contractSize: decimalStringSchema,
  isActive: z.boolean(),
});

export type Instrument = z.infer<typeof instrumentSchema>;
