"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  Check,
  ChevronDown,
  ClipboardCopy,
  Info,
  Scale,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalculatorField as Field } from "@/components/tools/calculator-field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  calculateLotSize,
  CUSTOM_INSTRUMENT,
  findPreset,
  INSTRUMENT_PRESETS,
  RISK_PRESETS,
  type AssetClass,
  type LotSizeCalculatorInput,
  type LotSizeField,
  type LotSizeIssue,
  type LotSizeResult,
  type TradeDirection,
} from "@/lib/calculations/lot-size";
import { cn } from "@/lib/utils";

/**
 * Lot Size Calculator — premium, risk-first position sizing.
 * Frontend-only V1: every number is computed by the pure module
 * `lib/calculations/lot-size.ts` (deterministic, no network, no storage).
 */

// ── Parsing / formatting helpers ─────────────────────────────────────────────

function num(s: string): number | null {
  // Strip regular/thin spaces (thousand separators) before parsing, then
  // accept a decimal comma.
  const t = s
    .replace(/[\s\u00A0\u202F]/g, "")
    .replace(",", ".");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function fmt(value: number, maxFraction = 2, minFraction = 0): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(minFraction, maxFraction),
    maximumFractionDigits: maxFraction,
  });
}

function fmtUnits(units: number): string {
  const max = units >= 100 ? 2 : units >= 1 ? 4 : 6;
  return units.toLocaleString("en-US", { maximumFractionDigits: max });
}

const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  forex: "Forex",
  metal: "Metals",
  index: "Indices",
  crypto: "Crypto",
};

const DEFAULT_STATE = {
  balance: "10 000",
  riskPercent: "1",
  entry: "",
  stopLoss: "",
  takeProfit: "",
};

export function LotSizeCalculator() {
  const [instrumentKey, setInstrumentKey] = React.useState<string>("EURUSD");
  const [customSymbol, setCustomSymbol] = React.useState("");
  const [direction, setDirection] = React.useState<TradeDirection>("long");
  const [values, setValues] = React.useState(DEFAULT_STATE);
  const [advanced, setAdvanced] = React.useState<Record<string, string>>({
    pipSize: "",
    contractSize: "",
    pipValuePerLot: "",
    tickSize: "",
    pointSize: "",
  });
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const preset = findPreset(instrumentKey);
  const symbol =
    instrumentKey === CUSTOM_INSTRUMENT
      ? customSymbol.trim() || "CUSTOM"
      : instrumentKey;

  const set = (key: keyof typeof values) => (v: string) =>
    setValues((prev) => ({ ...prev, [key]: v }));
  const setAdv = (key: string) => (v: string) =>
    setAdvanced((prev) => ({ ...prev, [key]: v }));

  function onInstrumentChange(key: string) {
    setInstrumentKey(key);
    const p = findPreset(key);
    if (p) {
      setAdvanced({
        pipSize: String(p.pipSize),
        contractSize: String(p.contractSize),
        pipValuePerLot: "",
        tickSize: String(p.tickSize),
        pointSize: String(p.pointSize),
      });
      if (showAdvanced === false && key !== "EURUSD") setShowAdvanced(false);
    }
  }

  // ── Live computation ───────────────────────────────────────────────────────
  type LiveOutcome =
    | { status: "incomplete" }
    | { status: "valid"; result: LotSizeResult }
    | { status: "invalid"; issues: LotSizeIssue[] };

  const outcome = React.useMemo<LiveOutcome>(() => {
    const balance = num(values.balance);
    const riskPercent = num(values.riskPercent);
    const entry = num(values.entry);
    const stopLoss = num(values.stopLoss);
    const takeProfitRaw = num(values.takeProfit);
    const pipSize = num(advanced.pipSize) ?? preset?.pipSize;
    const contractSize = num(advanced.contractSize) ?? preset?.contractSize;
    const pipValuePerLot = num(advanced.pipValuePerLot) ?? null;
    const tickSize = num(advanced.tickSize) ?? preset?.tickSize;
    const pointSize = num(advanced.pointSize) ?? preset?.pointSize;

    if (
      balance == null ||
      riskPercent == null ||
      entry == null ||
      stopLoss == null ||
      pipSize == null ||
      contractSize == null ||
      tickSize == null ||
      pointSize == null
    ) {
      return { status: "incomplete" as const };
    }

    const input: LotSizeCalculatorInput = {
      balance,
      riskPercent,
      direction,
      entry,
      stopLoss,
      takeProfit: takeProfitRaw,
      symbol,
      pipSize,
      contractSize,
      pipValuePerLot,
      tickSize,
      pointSize,
    };
    const out = calculateLotSize(input);
    return out.ok
      ? { status: "valid" as const, result: out.result }
      : { status: "invalid" as const, issues: out.issues };
  }, [values, advanced, direction, symbol, preset]);

  const fieldErrors = React.useMemo(() => {
    const map = new Map<LotSizeField, string>();
    if (outcome.status === "invalid") {
      for (const issue of outcome.issues) {
        if (!map.has(issue.field)) map.set(issue.field, issue.message);
      }
    }
    return map;
  }, [outcome]);

  const result: LotSizeResult | null =
    outcome.status === "valid" ? outcome.result : null;

  async function copySummary() {
    if (!result) return;
    const lines = [
      `${result.symbol} — ${result.direction === "long" ? "Long" : "Short"}`,
      `Position size: ${fmt(result.lots, 2, 2)} lots (${fmtUnits(result.units)} units)`,
      `Risk amount: ${fmt(result.riskAmount, 2, 2)}`,
      `Stop distance: ${fmt(result.stopDistance, 5)} (${fmt(result.stopPips, 1)} pips)`,
      result.reward
        ? `Reward:risk — 1 : ${fmt(result.reward.rr, 2, 0)} · potential profit ${fmt(result.reward.potentialProfit, 2, 2)}`
        : null,
      `Pip value per lot: ${fmt(result.pipValuePerLot, 4)}`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      toast.success("Result copied to clipboard");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  }

  const err = (f: LotSizeField) => fieldErrors.get(f);

  const directionButton = (value: TradeDirection) => {
    const active = direction === value;
    const isLong = value === "long";
    return (
      <button
        key={value}
        type="button"
        aria-pressed={active}
        onClick={() => setDirection(value)}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
          active
            ? isLong
              ? "border-profit/50 bg-profit/10 text-profit"
              : "border-loss/50 bg-loss/10 text-loss"
            : "border-border bg-transparent text-muted-foreground hover:bg-muted/40",
        )}
      >
        {isLong ? (
          <ArrowUpRight className="size-4" aria-hidden="true" />
        ) : (
          <ArrowDownRight className="size-4" aria-hidden="true" />
        )}
        {isLong ? "Long" : "Short"}
      </button>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <Scale className="size-6 text-accent" aria-hidden="true" />
            Lot Size Calculator
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Size every position from your risk — balance, stop and instrument in,
            exact lots out.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs font-medium">
          <Calculator className="size-3.5" aria-hidden="true" />
          Risk-first sizing
        </Badge>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ── Inputs ─────────────────────────────────────────────────────── */}
        <section
          aria-labelledby="lotsize-setup"
          className="rounded-xl border bg-card p-5 sm:p-6"
        >
          <h2 id="lotsize-setup" className="font-heading text-base font-semibold">
            Trade setup
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Everything recalculates live as you type.
          </p>

          <div className="mt-5 space-y-4">
            {/* Instrument */}
            <Field id="instrument" label="Instrument" hint="specs are editable below">
              {({ id, className }) => (
                <div className="flex gap-2">
                  <Select value={instrumentKey} onValueChange={onInstrumentChange}>
                    <SelectTrigger id={id} className={cn("w-full", className.replace("font-mono", ""))}>
                      <SelectValue placeholder="Choose an instrument" />
                    </SelectTrigger>
                    <SelectContent>
                      {(["forex", "metal", "index", "crypto"] as AssetClass[]).map((group) => (
                        <SelectGroup key={group}>
                          <SelectLabel>{ASSET_CLASS_LABEL[group]}</SelectLabel>
                          {INSTRUMENT_PRESETS.filter((p) => p.assetClass === group).map((p) => (
                            <SelectItem key={p.symbol} value={p.symbol}>
                              {p.symbol}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                      <SelectGroup>
                        <SelectLabel>Other</SelectLabel>
                        <SelectItem value={CUSTOM_INSTRUMENT}>Custom symbol…</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {instrumentKey === CUSTOM_INSTRUMENT ? (
                    <Input
                      aria-label="Custom symbol"
                      placeholder="e.g. GER40"
                      value={customSymbol}
                      onChange={(e) => setCustomSymbol(e.target.value)}
                      className="w-32 font-mono uppercase"
                      maxLength={24}
                    />
                  ) : null}
                </div>
              )}
            </Field>

            {/* Balance + Risk */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="balance" label="Account balance" error={err("balance")}>
                {(props) => (
                  <Input
                    {...props}
                    type="text"
                    inputMode="decimal"
                    placeholder="10 000"
                    value={values.balance}
                    onChange={(e) => set("balance")(e.target.value)}
                  />
                )}
              </Field>
              <Field id="riskPercent" label="Risk per trade" hint="% of balance" error={err("riskPercent")}>
                {(props) => (
                  <div className="space-y-2">
                    <Input
                      {...props}
                      type="text"
                      inputMode="decimal"
                      placeholder="1"
                      value={values.riskPercent}
                      onChange={(e) => set("riskPercent")(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Risk presets">
                      {RISK_PRESETS.map((r) => {
                        const active = num(values.riskPercent) === r;
                        return (
                          <button
                            key={r}
                            type="button"
                            aria-pressed={active}
                            onClick={() => set("riskPercent")(String(r))}
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 font-mono text-xs transition-colors",
                              active
                                ? "border-accent/60 bg-accent/10 text-accent"
                                : "border-border text-muted-foreground hover:bg-muted/40",
                            )}
                          >
                            {r}%
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Field>
            </div>

            {/* Direction */}
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <div className="flex gap-2" role="group" aria-label="Trade direction">
                {directionButton("long")}
                {directionButton("short")}
              </div>
            </div>

            {/* Prices */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="entry" label="Entry price" error={err("entry")}>
                {(props) => (
                  <Input
                    {...props}
                    type="text"
                    inputMode="decimal"
                    placeholder={preset ? String(preset.pipSize === 1 ? "18000" : "1.1000") : "1.1000"}
                    value={values.entry}
                    onChange={(e) => set("entry")(e.target.value)}
                  />
                )}
              </Field>
              <Field id="stopLoss" label="Stop loss" error={err("stopLoss")}>
                {(props) => (
                  <Input
                    {...props}
                    type="text"
                    inputMode="decimal"
                    placeholder="1.0950"
                    value={values.stopLoss}
                    onChange={(e) => set("stopLoss")(e.target.value)}
                  />
                )}
              </Field>
              <Field id="takeProfit" label="Take profit" hint="optional" error={err("takeProfit")}>
                {(props) => (
                  <Input
                    {...props}
                    type="text"
                    inputMode="decimal"
                    placeholder="1.1100"
                    value={values.takeProfit}
                    onChange={(e) => set("takeProfit")(e.target.value)}
                  />
                )}
              </Field>
            </div>

            {/* Advanced */}
            <div className="rounded-lg border bg-muted/20">
              <button
                type="button"
                aria-expanded={showAdvanced}
                onClick={() => setShowAdvanced((s) => !s)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
              >
                <span className="flex items-center gap-2">
                  <Info className="size-4 text-muted-foreground" aria-hidden="true" />
                  Instrument specifications
                  <span className="text-xs font-normal text-muted-foreground">
                    (pip size, contract, tick…)
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    showAdvanced && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
              {showAdvanced ? (
                <div className="space-y-4 border-t px-4 pb-4 pt-4">
                  <p className="rounded-md bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
                    Conventions vary between brokers — these are typical defaults,
                    not gospel. Check your platform&apos;s contract specs and adjust
                    here; the math follows YOUR numbers.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="pipSize" label="Pip size" error={err("pipSize")}>
                      {(props) => (
                        <Input
                          {...props}
                          type="text"
                          inputMode="decimal"
                          placeholder={preset ? String(preset.pipSize) : "0.0001"}
                          value={advanced.pipSize}
                          onChange={(e) => setAdv("pipSize")(e.target.value)}
                        />
                      )}
                    </Field>
                    <Field id="contractSize" label="Contract size" hint="units / 1.0 lot" error={err("contractSize")}>
                      {(props) => (
                        <Input
                          {...props}
                          type="text"
                          inputMode="decimal"
                          placeholder={preset ? String(preset.contractSize) : "100000"}
                          value={advanced.contractSize}
                          onChange={(e) => setAdv("contractSize")(e.target.value)}
                        />
                      )}
                    </Field>
                    <Field id="pipValuePerLot" label="Pip value / lot" hint="blank = derived" error={err("pipValuePerLot")}>
                      {(props) => (
                        <Input
                          {...props}
                          type="text"
                          inputMode="decimal"
                          placeholder={
                            advanced.contractSize && advanced.pipSize
                              ? fmt((num(advanced.contractSize) ?? 0) * (num(advanced.pipSize) ?? 0), 4, 0)
                              : "10"
                          }
                          value={advanced.pipValuePerLot}
                          onChange={(e) => setAdv("pipValuePerLot")(e.target.value)}
                        />
                      )}
                    </Field>
                    <Field id="tickSize" label="Tick size" error={err("tickSize")}>
                      {(props) => (
                        <Input
                          {...props}
                          type="text"
                          inputMode="decimal"
                          placeholder={preset ? String(preset.tickSize) : "0.00001"}
                          value={advanced.tickSize}
                          onChange={(e) => setAdv("tickSize")(e.target.value)}
                        />
                      )}
                    </Field>
                    <Field id="pointSize" label="Point size" error={err("pointSize")}>
                      {(props) => (
                        <Input
                          {...props}
                          type="text"
                          inputMode="decimal"
                          placeholder={preset ? String(preset.pointSize) : "0.00001"}
                          value={advanced.pointSize}
                          onChange={(e) => setAdv("pointSize")(e.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                  {advanced.tickSize && advanced.contractSize ? (
                    <p className="text-xs text-muted-foreground">
                      Derived: 1 tick ≈{" "}
                      <span className="font-mono">
                        {fmt((num(advanced.contractSize) ?? 0) * (num(advanced.tickSize) ?? 0), 4, 0)}
                      </span>{" "}
                      · 1 point ≈{" "}
                      <span className="font-mono">
                        {fmt((num(advanced.contractSize) ?? 0) * (num(advanced.pointSize) ?? 0), 4, 0)}
                      </span>{" "}
                      per lot (quote currency).
                    </p>
                  ) : null}
                  {preset ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => onInstrumentChange(preset.symbol)}
                    >
                      Restore {preset.symbol} defaults
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── Results ────────────────────────────────────────────────────── */}
        <div className="space-y-6" aria-live="polite">
          <section
            aria-labelledby="lotsize-result"
            className="rounded-xl border bg-card p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="lotsize-result" className="font-heading text-base font-semibold">
                Position size
              </h2>
              {result ? (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1 font-mono",
                      result.direction === "long"
                        ? "border-profit/40 bg-profit/10 text-profit"
                        : "border-loss/40 bg-loss/10 text-loss",
                    )}
                  >
                    {result.direction === "long" ? (
                      <ArrowUpRight className="size-3" aria-hidden="true" />
                    ) : (
                      <ArrowDownRight className="size-3" aria-hidden="true" />
                    )}
                    {result.direction.toUpperCase()} · {result.symbol}
                  </Badge>
                </div>
              ) : null}
            </div>

            {result ? (
              <>
                <div className="mt-4 rounded-lg border bg-muted/20 p-4">
                  <p className="font-mono text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                    {fmt(result.lots, 2, 2)}
                    <span className="ml-2 text-base font-medium text-muted-foreground">lots</span>
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    ={" "}
                    <span className="font-mono text-foreground">{fmtUnits(result.units)}</span>{" "}
                    units · floored to the 0.01 lot step so you never risk more than planned
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Equivalents:{" "}
                    <span className="font-mono">{fmt(result.miniLots, 1, 1)}</span> mini ·{" "}
                    <span className="font-mono">{fmt(result.microLots, 0, 0)}</span> micro
                  </p>
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">Risk amount</dt>
                    <dd className="mt-1 font-mono text-lg font-semibold">
                      {fmt(result.riskAmount, 2, 2)}
                    </dd>
                  </div>
                  <div className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">Stop distance</dt>
                    <dd className="mt-1 font-mono text-lg font-semibold">
                      {fmt(result.stopPips, 1, 1)}
                      <span className="ml-1 text-xs font-medium text-muted-foreground">pips</span>
                    </dd>
                    <dd className="font-mono text-[11px] text-muted-foreground">
                      {fmt(result.stopDistance, 5)} price
                    </dd>
                  </div>
                  <div className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">Reward : risk</dt>
                    {result.reward ? (
                      <>
                        <dd className="mt-1 font-mono text-lg font-semibold">
                          1 : {fmt(result.reward.rr, 2, 0)}
                        </dd>
                        <dd className="font-mono text-[11px] text-profit">
                          +{fmt(result.reward.potentialProfit, 2, 2)} at TP
                        </dd>
                      </>
                    ) : (
                      <dd className="mt-1 text-xs text-muted-foreground">
                        add a take profit
                      </dd>
                    )}
                  </div>
                </dl>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copySummary}
                  className="mt-4 gap-1.5"
                >
                  {copied ? (
                    <Check className="size-4 text-profit" aria-hidden="true" />
                  ) : (
                    <ClipboardCopy className="size-4" aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy result"}
                </Button>
              </>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed p-6 text-center">
                <Scale className="mx-auto size-8 text-muted-foreground/50" aria-hidden="true" />
                {outcome.status === "incomplete" ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Fill the trade setup — your position size appears here, live.
                  </p>
                ) : outcome.status === "invalid" ? (
                  <div className="mt-2 space-y-2 text-left">
                    <p className="text-center text-sm font-medium text-loss">
                      Fix the highlighted fields to size this trade:
                    </p>
                    <ul className="space-y-1.5">
                      {outcome.issues.map((issue, i) => (
                        <li
                          key={`${issue.field}-${i}`}
                          className="flex items-start gap-1.5 text-sm text-loss"
                        >
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {/* Breakdown */}
          {result ? (
            <section aria-labelledby="lotsize-breakdown" className="rounded-xl border bg-card p-5 sm:p-6">
              <h2 id="lotsize-breakdown" className="font-heading text-base font-semibold">
                Calculation breakdown
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                lots = risk amount ÷ (stop pips × pip value per lot)
              </p>
              <Separator className="my-4" />
              <dl className="space-y-2.5">
                {result.breakdown.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-4">
                    <dt className="text-sm text-muted-foreground">{row.label}</dt>
                    <dd className="truncate font-mono text-sm font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            Educational tool. Amounts are in your account currency; pip value is
            computed in the instrument&apos;s quote currency — when they differ,
            set the pip value manually in Instrument specifications. No broker
            connection, nothing is executed: you stay in full control.
          </p>
        </div>
      </div>
    </div>
  );
}
