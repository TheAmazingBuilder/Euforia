"use client";

import * as React from "react";
import { Gauge, Layers, TrendingDown } from "lucide-react";
import type { RiskOverviewResponse } from "@cosmoz/shared";
import { formatMoney, formatNumber, formatPercent, parseDecimal } from "@cosmoz/shared";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInstruments, useTrades } from "@/lib/api/queries";
import { deriveSizer } from "@/components/trades/position-sizer";
import { cn } from "@/lib/utils";

/**
 * Operational panels for the Risk Command Center redesign — the "what do I
 * do next" layer on top of the four guardrails:
 * - RiskBudgetPanel: today's remaining risk budget in money terms;
 * - OpenRiskPanel: what is already at risk in open positions;
 * - RecoveryPanel: loss-streak status with the honest next move;
 * - PositionSizerCard: quick sizing check against the per-trade cap.
 * All numbers derive from GET /risk/overview + GET /trades — no new truth.
 */

// ── Risk budget (today) ──────────────────────────────────────────────────────

export function RiskBudgetPanel({ data }: { data: RiskOverviewResponse }) {
  const limitPct = parseDecimal(data.daily.limitPct);
  const spentPct = parseDecimal(data.daily.spentPct) ?? 0;
  const balance = parseDecimal(data.balance) ?? 0;
  const spentAmount = parseDecimal(data.daily.spentAmount) ?? 0;
  const capAmount = limitPct !== null ? (limitPct / 100) * balance : null;
  const leftAmount = capAmount !== null ? Math.max(0, capAmount - spentAmount) : null;
  const ratio =
    limitPct !== null && limitPct > 0 ? Math.min(1.2, spentPct / limitPct) : 0;

  return (
    <div className="col-span-2 space-y-3 sm:col-span-4" data-testid="risk-budget">
      <div className="flex items-center gap-1.5">
        <Gauge className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="ledger-label">Risk budget — today</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums tracking-tight",
            leftAmount !== null && leftAmount <= 0 && "text-loss",
          )}
        >
          {leftAmount === null ? "—" : formatMoney(leftAmount, data.currency, { digits: 0 })}
        </span>
        <span className="text-xs text-muted-foreground">left to risk</span>
      </div>
      {capAmount !== null ? (
        <div className="goal-track" role="img" aria-label={`${formatNumber(spentPct, 1)}% of the daily cap used`}>
          <div
            className="goal-fill"
            style={{
              width: `${Math.min(100, Math.max(0, ratio * 100))}%`,
              backgroundColor:
                ratio >= 1 ? "var(--loss)" : ratio >= 0.5 ? "var(--warning)" : "var(--accent)",
            }}
          />
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No daily-loss rule armed.</p>
      )}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          Spent {formatMoney(spentAmount, data.currency, { digits: 0 })}
        </span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {limitPct !== null ? `cap ${formatMoney(capAmount, data.currency, { digits: 0 })}` : ""}
        </span>
      </div>
    </div>
  );
}

// ── Open risk (open positions) ───────────────────────────────────────────────

export function OpenRiskPanel({ data }: { data: RiskOverviewResponse }) {
  const { data: tradesData } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const instruments = instrumentsData?.instruments ?? [];
  const openTrades = (tradesData?.trades ?? []).filter((trade) => trade.status === "OPEN");
  const totalRisk = openTrades.reduce((sum, trade) => sum + (parseDecimal(trade.riskAmount) ?? 0), 0);
  const balance = parseDecimal(data.balance) ?? 0;
  const riskPct = balance > 0 ? (totalRisk / balance) * 100 : null;
  const perTradeLimit = parseDecimal(data.perTrade.limitPct);

  // Heaviest open position by risk, for the "what hurts" line.
  let heaviest: { symbol: string; risk: number } | null = null;
  for (const trade of openTrades) {
    const risk = parseDecimal(trade.riskAmount) ?? 0;
    if (risk > 0 && (heaviest === null || risk > heaviest.risk)) {
      heaviest = {
        symbol: instruments.find((item) => item.id === trade.instrumentId)?.symbol ?? "—",
        risk,
      };
    }
  }

  return (
    <div className="col-span-2 space-y-3 sm:col-span-4" data-testid="risk-open">
      <div className="flex items-center gap-1.5">
        <Layers className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="ledger-label">Open risk right now</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
          {openTrades.length > 0
            ? formatMoney(totalRisk, data.currency, { digits: 0 })
            : formatMoney(0, data.currency, { digits: 0 })}
        </span>
        <span className="text-xs text-muted-foreground">
          across {openTrades.length} open position{openTrades.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Share of balance</span>
          <span className="font-mono font-medium tabular-nums">
            {riskPct === null ? "—" : formatPercent(riskPct / 100, 1)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-muted-foreground">Heaviest position</span>
          <span className="font-mono font-medium tabular-nums">
            {heaviest === null
              ? "—"
              : `${heaviest.symbol} · ${formatMoney(heaviest.risk, data.currency, { digits: 0 })}`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Per-trade cap</span>
          <span
            className={cn(
              "font-mono font-medium tabular-nums",
              perTradeLimit !== null && riskPct !== null && riskPct / 100 > perTradeLimit
                ? "text-warning"
                : undefined,
            )}
          >
            {perTradeLimit !== null ? `${formatNumber(perTradeLimit, 1)}%` : "no rule"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Recovery status (loss streak) ────────────────────────────────────────────

function recoverySentence(streak: number): { text: string; tone: "calm" | "watch" | "stop" } {
  if (streak <= 0) return { text: "Clean slate — no active loss streak.", tone: "calm" };
  if (streak === 1) return { text: "One loss in the log — stay selective on the next entry.", tone: "watch" };
  if (streak === 2) return { text: "Two in a row — halve the size or skip the next setup.", tone: "watch" };
  return { text: "Loss streak active — the playbook says stop and review before re-entering.", tone: "stop" };
}

export function RecoveryPanel({ data }: { data: RiskOverviewResponse }) {
  const { losses } = data;
  const sentence = recoverySentence(losses.lossStreakCurrent);

  return (
    <div className="col-span-2 space-y-3 sm:col-span-4" data-testid="risk-recovery">
      <div className="flex items-center gap-1.5">
        <TrendingDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="ledger-label">Recovery status</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums tracking-tight",
            sentence.tone === "stop" && "text-loss",
            sentence.tone === "watch" && "text-warning",
            sentence.tone === "calm" && "text-profit",
          )}
        >
          {losses.lossStreakCurrent}
        </span>
        <span className="text-xs text-muted-foreground">
          consecutive loss{losses.lossStreakCurrent === 1 ? "" : "es"} · worst {losses.lossStreakWorst}
        </span>
      </div>
      <p
        className={cn(
          "rounded-md border px-2.5 py-2 text-xs leading-relaxed",
          sentence.tone === "stop" && "border-loss/40 bg-loss/10 text-loss",
          sentence.tone === "watch" && "border-warning/40 bg-warning/10 text-warning",
          sentence.tone === "calm" && "border-border bg-background/40 text-muted-foreground",
        )}
      >
        {sentence.text}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {data.losses.lossesToday} loss{data.losses.lossesToday === 1 ? "" : "es"} and{" "}
        {data.losses.tradesToday} trade{data.losses.tradesToday === 1 ? "" : "s"} today
        {data.losses.maxLossesPerDay !== null
          ? ` · caps ${data.losses.maxLossesPerDay} losses / ${data.losses.maxTradesPerDay ?? "∞"} trades`
          : ""}
      </p>
    </div>
  );
}

// ── Position sizer quick check ───────────────────────────────────────────────

const sizerInputClasses =
  "h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function PositionSizerCard({ data }: { data: RiskOverviewResponse }) {
  const { data: instrumentsData } = useInstruments();
  const instruments = instrumentsData?.instruments ?? [];
  const [instrumentId, setInstrumentId] = React.useState<string | null>(null);
  const [direction, setDirection] = React.useState<"BUY" | "SELL">("BUY");
  const [entry, setEntry] = React.useState("");
  const [stop, setStop] = React.useState("");
  const [riskPercent, setRiskPercent] = React.useState("");

  const active = instruments.filter((item) => item.isActive);
  const selected =
    active.find((item) => item.id === instrumentId) ?? active[0] ?? null;

  // Default the risk % to the armed per-trade cap (never above it) —
  // render-time adjustment pattern, no setState inside effects.
  const capPct = parseDecimal(data.perTrade.limitPct);
  const capKey = capPct === null ? "none" : String(capPct);
  const [riskDefaultFor, setRiskDefaultFor] = React.useState<string | null>(null);
  if (capPct !== null && riskDefaultFor !== capKey) {
    setRiskDefaultFor(capKey);
    if (riskPercent === "") setRiskPercent(String(Math.min(1, capPct)));
  }

  const derived = deriveSizer({
    mode: "risk_percent",
    riskPercent,
    quantity: "",
    entry,
    stop,
    direction,
    balance: data.balance,
    specs: selected === null ? null : { pipSize: selected.pipSize, contractSize: selected.contractSize },
  });

  const overCap =
    derived.riskPct !== null && capPct !== null && derived.riskPct > capPct;

  return (
    <div className="col-span-2 flex flex-col gap-3 sm:col-span-5" data-testid="risk-sizer">
      <div className="flex items-baseline justify-between gap-2">
        <span className="ledger-label">Position sizer — quick check</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          balance {formatMoney(data.balance, data.currency, { digits: 0 })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label htmlFor="sizer-instrument" className="text-[11px] font-medium text-muted-foreground">
              Instrument
            </label>
            <Select
              value={selected?.id ?? ""}
              onValueChange={setInstrumentId}
            >
              <SelectTrigger id="sizer-instrument" className="h-9 w-full font-mono text-sm" data-testid="risk-sizer-instrument">
                <SelectValue placeholder="Instrument" />
              </SelectTrigger>
              <SelectContent>
                {active.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="sizer-direction" className="text-[11px] font-medium text-muted-foreground">
              Direction
            </label>
            <button
              id="sizer-direction"
              type="button"
              onClick={() => setDirection((current) => (current === "BUY" ? "SELL" : "BUY"))}
              className={cn(
                "h-9 w-full rounded-md border font-mono text-sm font-semibold transition-colors",
                direction === "BUY"
                  ? "border-profit/40 bg-profit/10 text-profit"
                  : "border-loss/40 bg-loss/10 text-loss",
              )}
              data-testid="risk-sizer-direction"
            >
              {direction}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="sizer-entry" className="text-[11px] font-medium text-muted-foreground">
            Entry
          </label>
          <input
            id="sizer-entry"
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            inputMode="decimal"
            placeholder={selected?.digits !== undefined ? (selected.digits > 3 ? "1.0000" : "100.00") : "0.00"}
            autoComplete="off"
            className={sizerInputClasses}
            data-testid="risk-sizer-entry"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="sizer-stop" className="text-[11px] font-medium text-muted-foreground">
            Stop
          </label>
          <input
            id="sizer-stop"
            value={stop}
            onChange={(event) => setStop(event.target.value)}
            inputMode="decimal"
            placeholder="stop level"
            autoComplete="off"
            className={sizerInputClasses}
            data-testid="risk-sizer-stop"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <label htmlFor="sizer-risk" className="text-[11px] font-medium text-muted-foreground">
            Risk % {capPct !== null ? `(cap ${formatNumber(capPct, 1)}%)` : ""}
          </label>
          <input
            id="sizer-risk"
            value={riskPercent}
            onChange={(event) => setRiskPercent(event.target.value)}
            inputMode="decimal"
            placeholder="1.0"
            autoComplete="off"
            className={sizerInputClasses}
            data-testid="risk-sizer-risk"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5">
        <div className="space-y-0.5">
          <p className="ledger-label">Size</p>
          <p className="font-mono text-sm font-semibold tabular-nums text-foreground" data-testid="risk-sizer-size">
            {derived.suggestedQuantity === null ? "—" : derived.suggestedQuantity}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="ledger-label">Risk</p>
          <p
            className={cn(
              "font-mono text-sm font-semibold tabular-nums",
              overCap ? "text-warning" : "text-foreground",
            )}
            data-testid="risk-sizer-risk-amount"
          >
            {derived.riskAmount === null
              ? "—"
              : formatMoney(derived.riskAmount, data.currency, { digits: 2 })}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="ledger-label">Stop distance</p>
          <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {derived.stopPips === null ? "—" : `${formatNumber(derived.stopPips, 1)} pips`}
          </p>
        </div>
      </div>
      {overCap ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-warning" data-testid="risk-sizer-overcap">
          Above your {formatNumber(capPct ?? 0, 1)}% per-trade cap — the rules engine will flag this entry.
        </p>
      ) : null}
    </div>
  );
}

// ── Exposure breakdown (open positions by instrument) ────────────────────────

export function ExposureBreakdown({ data }: { data: RiskOverviewResponse }) {
  const { data: tradesData } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const instruments = React.useMemo(() => instrumentsData?.instruments ?? [], [instrumentsData]);
  const openTrades = React.useMemo(
    () => (tradesData?.trades ?? []).filter((trade) => trade.status === "OPEN"),
    [tradesData],
  );

  const rows = React.useMemo(() => {
    const byInstrument = new Map<
      string,
      { symbol: string; positions: number; risk: number; buys: number; sells: number }
    >();
    for (const trade of openTrades) {
      const instrument = instruments.find((item) => item.id === trade.instrumentId);
      const symbol = instrument?.symbol ?? "—";
      const bucket =
        byInstrument.get(symbol) ?? { symbol, positions: 0, risk: 0, buys: 0, sells: 0 };
      bucket.positions += 1;
      bucket.risk += parseDecimal(trade.riskAmount) ?? 0;
      if (trade.direction === "BUY") bucket.buys += 1;
      else bucket.sells += 1;
      byInstrument.set(symbol, bucket);
    }
    return [...byInstrument.values()].sort((a, b) => b.risk - a.risk);
  }, [openTrades, instruments]);

  const totalRisk = rows.reduce((sum, row) => sum + row.risk, 0);

  return (
    <div className="col-span-2 flex flex-col gap-3 sm:col-span-7" data-testid="risk-exposure">
      <div className="flex items-baseline justify-between gap-2">
        <span className="ledger-label">Open exposure — by instrument</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatMoney(totalRisk, data.currency, { digits: 0 })} at risk
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
          <Layers className="size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">No open position</p>
          <p className="text-xs text-muted-foreground">
            The desk is flat — nothing is at risk until the next entry.
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="ledger-label pb-2">Instrument</th>
              <th scope="col" className="ledger-label pb-2 text-right">Positions</th>
              <th scope="col" className="ledger-label pb-2 text-center">Mix</th>
              <th scope="col" className="ledger-label pb-2 text-right">Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 font-mono font-semibold text-foreground">{row.symbol}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                  {row.positions}
                </td>
                <td className="py-2.5 text-center font-mono text-xs">
                  {row.buys > 0 ? <span className="text-profit">{row.buys}B</span> : null}
                  {row.buys > 0 && row.sells > 0 ? <span className="text-muted-foreground"> / </span> : null}
                  {row.sells > 0 ? <span className="text-loss">{row.sells}S</span> : null}
                </td>
                <td className="py-2.5 text-right font-mono font-semibold tabular-nums text-foreground">
                  {formatMoney(row.risk, data.currency, { digits: 0 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
