import { z } from "zod";

/**
 * Market data contract between the market service and the Session Live UI.
 * Numbers (not decimal strings) are deliberate here: these are CHART data
 * points, not money amounts - components never do P&L math on them without
 * going through the shared unrealizedPnl helper (lib/realtime).
 */

/** Chart timeframe. "1H"/"4H"/"1D" use the uppercase internal convention. */
export const marketIntervalSchema = z.enum(["1m", "5m", "15m", "30m", "1H", "4H", "1D"]);
export type MarketInterval = z.infer<typeof marketIntervalSchema>;

/**
 * Where a quote/candle comes from. The Session Live MUST label simulated
 * feeds as "SIM" - claiming simulated data is real is a hard product lie.
 */
export const quoteSourceSchema = z.enum(["real", "sim"]);
export type QuoteSource = z.infer<typeof quoteSourceSchema>;

/** OHLCV candle - t = bucket open time (ms epoch), v = base volume. */
export const candleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number(),
});
export type Candle = z.infer<typeof candleSchema>;

/** GET /candles - history window for the session chart datafeed. */
export const candlesResponseSchema = z.object({
  symbol: z.string(),
  interval: marketIntervalSchema,
  source: quoteSourceSchema,
  candles: z.array(candleSchema),
});
export type CandlesResponse = z.infer<typeof candlesResponseSchema>;
