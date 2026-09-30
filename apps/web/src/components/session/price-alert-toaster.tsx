"use client";

import * as React from "react";
import { toast } from "sonner";

import { formatPrice } from "@cosmoz/shared";
import type { Instrument, Trade } from "@cosmoz/shared";

import type { LiveQuote } from "@/lib/realtime/market";

/**
 * Price-event toasts for OPEN positions (Session Live).
 *
 * Two situations, two voices:
 * - EVENT (this component): the live feed itself touches a planned level
 *   (take profit / stop loss) — a factual, timestamped notice with the
 *   real prices, fired once per transition while the session is open;
 * - ACTION (OpenTradeCard etc.): user-initiated moves — those toasts live
 *   next to the action that caused them and carry the price they changed.
 *
 * Honest mechanics: the first quote observed after mount only ARMS the
 * baseline (no toast for levels already breached before the session was
 * opened — that state is already visible on the position card). A toast
 * fires on a genuine safe-side → breach transition, then re-arms, so a
 * wick into the level fires again only if price truly comes back and
 * crosses again. No synthesized data: no quote, no toast.
 */

type LevelKind = "TP" | "SL";

interface PriceAlertToasterProps {
  trades: Trade[];
  instruments: Instrument[];
  quotes: ReadonlyMap<string, LiveQuote>;
}

/** Which planned level did this price transition cross, if any? */
function crossedLevel(
  direction: Trade["direction"],
  baseline: number,
  price: number,
  tp: number | null,
  sl: number | null,
): LevelKind | null {
  if (direction === "BUY") {
    if (tp !== null && baseline < tp && price >= tp) return "TP";
    if (sl !== null && baseline > sl && price <= sl) return "SL";
  } else {
    if (tp !== null && baseline > tp && price <= tp) return "TP";
    if (sl !== null && baseline < sl && price >= sl) return "SL";
  }
  return null;
}

function PriceLine({ label, value }: { label: string; value: string }) {
  return (
    <span className="font-mono tabular-nums">
      <span className="text-muted-foreground">{label} </span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

export function PriceAlertToaster({ trades, instruments, quotes }: PriceAlertToasterProps) {
  // Latest data in refs: the effect reads them per quote emission without
  // re-subscribing to anything else. Synced in an effect (never during render)
  // that runs after every render — declared BEFORE the quote effect so the
  // quote effect always reads up-to-date props.
  const tradesRef = React.useRef(trades);
  const instrumentsRef = React.useRef(instruments);
  React.useEffect(() => {
    tradesRef.current = trades;
    instrumentsRef.current = instruments;
  });

  // Per-trade state: armed baseline price (null = not armed yet) and the
  // last time each (trade, level) event fired — a re-cross is a REAL event
  // (wick into the level, back out, in again) so it re-alerts, throttled
  // to one toast per minute per level to avoid a flood on a choppy tape.
  const baselineRef = React.useRef<Map<string, number>>(new Map());
  const lastFiredAtRef = React.useRef<Map<string, number>>(new Map());
  const REFIRE_THROTTLE_MS = 60_000;

  React.useEffect(() => {
    for (const trade of tradesRef.current) {
      if (trade.status !== "OPEN") continue;
      const instrument = instrumentsRef.current.find((item) => item.id === trade.instrumentId);
      if (!instrument) continue;
      const quote = quotes.get(instrument.symbol);
      if (!quote) continue;

      const digits = instrument.digits;
      // Levels are decimal strings on the wire — parse once, skip unparseable.
      const tpRaw = trade.initialTP;
      const slRaw = trade.finalStop ?? trade.initialStop;
      const tp = tpRaw !== null && Number.isFinite(Number(tpRaw)) ? Number(tpRaw) : null;
      const sl = slRaw !== null && Number.isFinite(Number(slRaw)) ? Number(slRaw) : null;
      const side = trade.direction === "BUY" ? "Long" : "Short";

      const baseline = baselineRef.current.get(trade.id) ?? null;
      if (baseline === null) {
        // First observation arms the watch — never fires on arrival.
        baselineRef.current.set(trade.id, quote.price);
        continue;
      }

      const kind = crossedLevel(trade.direction, baseline, quote.price, tp, sl);
      baselineRef.current.set(trade.id, quote.price);
      if (kind === null) continue;

      const eventKey = `${trade.id}:${kind}`;
      const now = Date.now();
      const lastFiredAt = lastFiredAtRef.current.get(eventKey) ?? 0;
      if (now - lastFiredAt < REFIRE_THROTTLE_MS) continue;
      lastFiredAtRef.current.set(eventKey, now);

      const level = kind === "TP" ? tp : sl;
      if (level === null) continue;
      const levelLabel = kind === "TP" ? "Take profit touched" : "Stop loss touched";
      const hint =
        kind === "TP"
          ? "Your plan's exit zone is live — manage the position, don't improvise."
          : "The level that invalidates this trade is live — the plan says respect it.";

      const description = (
        <span className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <PriceLine label="Live" value={formatPrice(quote.price, digits)} />
            <PriceLine label={kind} value={formatPrice(level, digits)} />
            <PriceLine label="Entry" value={formatPrice(Number(trade.entryPrice), digits)} />
          </span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </span>
      );

      const payload = {
        description,
        duration: 10_000,
      } as const;

      if (kind === "TP") {
        toast.success(`${levelLabel} — ${side} ${instrument.symbol}`, payload);
      } else {
        toast.warning(`${levelLabel} — ${side} ${instrument.symbol}`, payload);
      }
    }
  }, [quotes]);

  return null;
}
