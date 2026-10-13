"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Copy,
  Info,
  Scale,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/i18n/i18n-provider";
import { usePreferences } from "@/lib/api/queries";
import { formatMoney } from "@cosmoz/shared";
import {
  calculateLotSize,
  calculateRiskReward,
  effectivePipValuePerLot,
  getInstrumentSpec,
  INSTRUMENT_PRESETS,
  lotSizeNumbersSchema,
  validateLotSizeRelationships,
  type InstrumentSpecification,
  type LotSizeResult,
  type TradeDirection,
} from "@/lib/utils/calculators/lot-size";
import { cn } from "@/lib/utils";

/**
 * Lot Size Calculator — Tools module. Live, deterministic, frontend-only:
 * every keystroke re-runs the pure calculators in lib/utils/calculators.
 * The result is never shown silently wrong — invalid inputs surface inline
 * errors and the result panel flips to an explicit empty state.
 */

// ── Local parse/format helpers (display rounds, math keeps precision) ───────

/** Text field → number, or null when empty/invalid. Plain decimals only. */
function parseField(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

const nf = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const RISK_PRESETS = [0.25, 0.5, 1, 1.5, 2] as const;

// ── Component ────────────────────────────────────────────────────────────────

export function LotSizeView() {
  const { dict } = useI18n();
  const V = dict.tools.lotSize;
  const preferences = usePreferences();
  const currency = preferences.data?.trading.displayCurrency ?? "USD";

  // ── Core inputs (raw strings; math parses on the fly) ──
  const [symbol, setSymbol] = React.useState("XAUUSD");
  const [direction, setDirection] = React.useState<TradeDirection>("LONG");
  const [balanceStr, setBalanceStr] = React.useState("10000");
  const [riskStr, setRiskStr] = React.useState("1");
  const [entryStr, setEntryStr] = React.useState("2650.00");
  const [stopStr, setStopStr] = React.useState("2640.00");
  const [tpStr, setTpStr] = React.useState("");

  // ── Advanced overrides (blank = use the instrument preset value) ──
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [advPipSize, setAdvPipSize] = React.useState("");
  const [advPipValue, setAdvPipValue] = React.useState("");
  const [advContract, setAdvContract] = React.useState("");

  const preset = React.useMemo(() => getInstrumentSpec(symbol), [symbol]);

  /** Preset spec merged with any advanced overrides the trader typed. */
  const spec: InstrumentSpecification = React.useMemo(() => {
    const pipSize = parseField(advPipSize);
    const pipValue = parseField(advPipValue);
    const contractSize = parseField(advContract);
    const merged: InstrumentSpecification = { ...preset };
    if (pipSize !== null && pipSize > 0) merged.pipSize = pipSize;
    if (contractSize !== null && contractSize > 0) merged.contractSize = contractSize;
    if (pipValue !== null && pipValue > 0) {
      merged.pipValuePerLot = pipValue;
      merged.quotePipValue = false; // explicit override wins over entry estimate
    }
    return merged;
  }, [preset, advPipSize, advPipValue, advContract]);

  // Reset advanced overrides when the instrument changes.
  const switchInstrument = React.useCallback((next: string) => {
    setSymbol(next);
    setAdvPipSize("");
    setAdvPipValue("");
    setAdvContract("");
  }, []);

  // ── Validation + calculation (pure, memoized) ──
  const balance = parseField(balanceStr);
  const riskPercent = parseField(riskStr);
  const entryPrice = parseField(entryStr);
  const stopLoss = parseField(stopStr);
  const takeProfit = parseField(tpStr);

  const errors = React.useMemo(() => {
    const fieldErrors: Record<string, string> = {};
    if (balance === null || balance <= 0) fieldErrors.balance = V.errBalanceRequired;
    if (riskPercent === null || riskPercent <= 0) fieldErrors.risk = V.errRiskRequired;
    if (entryPrice === null || entryPrice <= 0) fieldErrors.entry = V.errEntryRequired;
    if (stopLoss === null || stopLoss <= 0) fieldErrors.stopLoss = V.errStopRequired;

    // Limit checks via the shared Zod schema — no duplicated rules (§33).
    if (balance !== null && riskPercent !== null && entryPrice !== null && stopLoss !== null) {
      const parsed = lotSizeNumbersSchema.safeParse({
        balance,
        riskPercent,
        entryPrice,
        stopLoss,
        takeProfit: takeProfit === null ? null : takeProfit,
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? "");
          if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
        }
      }
      // Direction sanity (long: SL below entry, short: above).
      if (Object.keys(fieldErrors).length === 0) {
        Object.assign(
          fieldErrors,
          validateLotSizeRelationships({
            direction,
            entryPrice,
            stopLoss,
            takeProfit: takeProfit === null ? null : takeProfit,
          }),
        );
      }
    }
    return fieldErrors;
  }, [balance, riskPercent, entryPrice, stopLoss, takeProfit, direction, V]);

  const valid =
    balance !== null &&
    riskPercent !== null &&
    entryPrice !== null &&
    stopLoss !== null &&
    Object.keys(errors).length === 0;

  const result: LotSizeResult | null = React.useMemo(() => {
    if (!valid) return null;
    return calculateLotSize({
      balance,
      riskPercent,
      direction,
      entryPrice,
      stopLoss,
      takeProfit,
      spec,
    });
  }, [valid, balance, riskPercent, direction, entryPrice, stopLoss, takeProfit, spec]);

  const riskReward = React.useMemo(() => {
    if (!valid || takeProfit === null) return null;
    return calculateRiskReward(entryPrice, stopLoss, takeProfit);
  }, [valid, entryPrice, stopLoss, takeProfit]);

  // Safe locals for the result branch — result is only non-null when every
  // parsed field is non-null, so these defaults never render.
  const resultBalance = balance ?? 0;
  const resultRisk = riskPercent ?? 0;

  const fmtMoney = React.useCallback(
    (value: number) => formatMoney(value, currency, { locale: "en-US" }),
    [currency],
  );
  const fmtPrice = React.useCallback(
    (value: number) =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: Math.max(spec.priceDecimals, 2),
      }).format(value),
    [spec.priceDecimals],
  );

  // ── Copy actions (§39) ──
  const copyLotSize = React.useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(String(result.lotsRounded));
    toast.success(V.copiedLot);
  }, [result, V]);

  const copyCalculation = React.useCallback(async () => {
    if (!result) return;
    const lines = [
      `${V.breakdownBalance}: ${fmtMoney(resultBalance)}`,
      `${V.breakdownRisk}: ${nf.format(resultRisk)}%`,
      `${V.breakdownRiskAmount}: ${fmtMoney(result.riskAmount)}`,
      result.stopPips !== null
        ? `${V.breakdownStopPips}: ${nf.format(result.stopPips)} pips`
        : `${V.breakdownStopPrice}: ${fmtPrice(result.stopDistance)}`,
      result.pipValuePerLot !== null
        ? `${V.breakdownPipValue}: ${fmtMoney(result.pipValuePerLot)} / lot`
        : `${V.breakdownContract}: ${nf.format(result.contractSize)}`,
      `${V.breakdownRiskPerLot}: ${fmtMoney(result.riskPerLot)} / lot`,
      `${V.breakdownLots}: ${result.lotsRounded}`,
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success(V.copiedCalculation);
  }, [result, resultBalance, resultRisk, fmtMoney, fmtPrice, V]);

  const effPipValue =
    entryPrice !== null && entryPrice > 0
      ? effectivePipValuePerLot(spec, entryPrice)
      : null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6" data-testid="lot-size-view">
      {/* Identity band — same language as the other modules */}
      <header className="rounded-xl border bg-surface px-4 py-5 sm:px-6" data-testid="lot-size-header">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          <Scale className="size-6 text-accent sm:size-7" aria-hidden="true" />
          {V.title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{V.subtitle}</p>
      </header>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
        {/* ── Inputs column ── */}
        <Card className="lg:col-span-5" data-testid="lot-size-inputs">
          <CardHeader>
            <CardTitle>{V.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Instrument */}
            <div className="space-y-1.5">
              <Label htmlFor="lot-instrument">{V.instrument}</Label>
              <Select value={symbol} onValueChange={switchInstrument}>
                <SelectTrigger id="lot-instrument" data-testid="lot-size-instrument">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTRUMENT_PRESETS.map((item) => (
                    <SelectItem key={item.symbol} value={item.symbol}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Direction — Long / Short segmented */}
            <div className="space-y-1.5">
              <Label>{V.direction}</Label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/30 p-1" role="group" aria-label={V.direction}>
                {(
                  [
                    { id: "LONG", label: V.long, Icon: ArrowUpRight, tone: "text-profit" },
                    { id: "SHORT", label: V.short, Icon: ArrowDownRight, tone: "text-loss" },
                  ] as const
                ).map(({ id, label, Icon, tone }) => {
                  const selected = direction === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      data-testid={`lot-size-direction-${id.toLowerCase()}`}
                      onClick={() => setDirection(id)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        selected
                          ? "bg-background shadow-sm ring-1 ring-foreground/10"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className={cn("size-4", selected && tone)} aria-hidden="true" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Balance + Risk */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lot-balance">{V.balance}</Label>
                <Input
                  id="lot-balance"
                  inputMode="decimal"
                  autoComplete="off"
                  value={balanceStr}
                  onChange={(event) => setBalanceStr(event.target.value)}
                  aria-invalid={Boolean(errors.balance)}
                  className={cn("font-mono", errors.balance && "border-destructive")}
                  data-testid="lot-size-balance"
                />
                {errors.balance ? <FieldError message={errors.balance} /> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lot-risk">{V.risk} (%)</Label>
                <Input
                  id="lot-risk"
                  inputMode="decimal"
                  autoComplete="off"
                  value={riskStr}
                  onChange={(event) => setRiskStr(event.target.value)}
                  aria-invalid={Boolean(errors.risk)}
                  className={cn("font-mono", errors.risk && "border-destructive")}
                  data-testid="lot-size-risk"
                />
                {errors.risk ? <FieldError message={errors.risk} /> : null}
              </div>
            </div>

            {/* Risk presets — convenience chips, never advice (§17) */}
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">{V.riskPresets}</div>
              <div className="flex flex-wrap gap-1.5">
                {RISK_PRESETS.map((riskPreset) => (
                  <button
                    key={riskPreset}
                    type="button"
                    onClick={() => setRiskStr(String(riskPreset))}
                    className={cn(
                      "rounded-md border px-2.5 py-1 font-mono text-xs transition-colors hover:bg-muted",
                      riskStr === String(riskPreset)
                        ? "border-accent/50 bg-accent/10 text-accent"
                        : "text-muted-foreground",
                    )}
                    data-testid={`lot-size-risk-preset-${riskPreset}`}
                  >
                    {riskPreset}%
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Prices */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lot-entry">{V.entry}</Label>
                <Input
                  id="lot-entry"
                  inputMode="decimal"
                  autoComplete="off"
                  value={entryStr}
                  onChange={(event) => setEntryStr(event.target.value)}
                  aria-invalid={Boolean(errors.entry)}
                  className={cn("font-mono", errors.entry && "border-destructive")}
                  data-testid="lot-size-entry"
                />
                {errors.entry ? <FieldError message={errors.entry} /> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lot-stop">{V.stopLoss}</Label>
                <Input
                  id="lot-stop"
                  inputMode="decimal"
                  autoComplete="off"
                  value={stopStr}
                  onChange={(event) => setStopStr(event.target.value)}
                  aria-invalid={Boolean(errors.stopLoss)}
                  className={cn("font-mono", errors.stopLoss && "border-destructive")}
                  data-testid="lot-size-stop"
                />
                {errors.stopLoss ? <FieldError message={errors.stopLoss} /> : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="lot-tp">{V.takeProfitOptional}</Label>
                <Input
                  id="lot-tp"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="—"
                  value={tpStr}
                  onChange={(event) => setTpStr(event.target.value)}
                  aria-invalid={Boolean(errors.takeProfit)}
                  className={cn("font-mono", errors.takeProfit && "border-destructive")}
                  data-testid="lot-size-tp"
                />
                {errors.takeProfit ? <FieldError message={errors.takeProfit} /> : null}
              </div>
            </div>

            {/* Advanced parameters (§15) */}
            <div className="rounded-lg border bg-muted/20">
              <button
                type="button"
                aria-expanded={advancedOpen}
                data-testid="lot-size-advanced"
                onClick={() => setAdvancedOpen((open) => !open)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium"
              >
                {V.advanced}
                <ChevronDown
                  className={cn("size-4 text-muted-foreground transition-transform", advancedOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </button>
              {advancedOpen ? (
                <div className="space-y-3 border-t px-3 py-3">
                  <p className="text-xs text-muted-foreground">{V.advancedHint}</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="lot-adv-pipsize">{V.pipSize}</Label>
                      <Input
                        id="lot-adv-pipsize"
                        inputMode="decimal"
                        placeholder={String(preset.pipSize)}
                        value={advPipSize}
                        onChange={(event) => setAdvPipSize(event.target.value)}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lot-adv-pipvalue">{V.pipValue}</Label>
                      <Input
                        id="lot-adv-pipvalue"
                        inputMode="decimal"
                        placeholder={
                          preset.quotePipValue && effPipValue !== null
                            ? `${effPipValue.toFixed(4)} — ${V.quotePipNote}`
                            : String(preset.pipValuePerLot)
                        }
                        value={advPipValue}
                        onChange={(event) => setAdvPipValue(event.target.value)}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lot-adv-contract">{V.contractSize}</Label>
                      <Input
                        id="lot-adv-contract"
                        inputMode="decimal"
                        placeholder={String(preset.contractSize)}
                        value={advContract}
                        onChange={(event) => setAdvContract(event.target.value)}
                        className="font-mono"
                      />
                    </div>
                  </div>
                  <p className="flex items-start gap-1.5 text-xs text-warning">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {V.advancedWarning}
                  </p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* ── Result column ── */}
        <div className="space-y-4 sm:space-y-6 lg:col-span-7">
          <Card data-testid="lot-size-result">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{V.resultTitle}</CardTitle>
              {result ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {result.method === "PIP" ? V.methodPip : V.methodContract}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={copyLotSize} data-testid="lot-size-copy-lot">
                    <Copy className="size-3.5" aria-hidden="true" />
                    {V.copyLot}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={copyCalculation} data-testid="lot-size-copy-calc">
                    <Copy className="size-3.5" aria-hidden="true" />
                    {V.copyCalculation}
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              {result ? (
                <div aria-live="polite" className="space-y-5">
                  {/* Hero — the number the trader came for */}
                  <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border bg-muted/20 px-5 py-6">
                    <div>
                      <div className="font-mono text-5xl font-bold tracking-tight tabular-nums" data-testid="lot-size-hero">
                        {nf.format(result.lotsRounded)}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{spec.unitLabel}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">{V.units}</div>
                      <div className="font-mono text-lg tabular-nums" data-testid="lot-size-units">
                        {new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(result.units)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        1 {spec.unitLabel.replace(/s$/, "")} = {nf.format(result.contractSize)}
                      </div>
                    </div>
                  </div>

                  {/* Stat grid */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Stat label={V.riskAmount} value={fmtMoney(result.riskAmount)} testid="lot-size-risk-amount" />
                    <Stat
                      label={result.stopPips !== null ? V.stopPips : V.stopDistance}
                      value={
                        result.stopPips !== null
                          ? `${nf.format(result.stopPips)} pips`
                          : fmtPrice(result.stopDistance)
                      }
                      testid="lot-size-stop-distance"
                    />
                    <Stat
                      label={V.riskPerLot}
                      value={`${fmtMoney(result.riskPerLot)}${result.method === "PIP" ? " / lot" : ` / ${spec.unitLabel.replace(/s$/, "")}`}`}
                      testid="lot-size-risk-per-lot"
                    />
                    <Stat
                      label={V.atRoundedRisk}
                      value={fmtMoney(result.actualRiskAtRounded)}
                      testid="lot-size-actual-risk"
                    />
                    <Stat
                      label={V.riskReward}
                      value={riskReward ? `1 : ${riskReward.ratio.toFixed(2)}` : "—"}
                      testid="lot-size-rr"
                    />
                    <Stat label={V.method} value={result.method === "PIP" ? V.methodPip : V.methodContract} testid="lot-size-method" />
                  </div>

                  {/* Breakdown (§16) — the how, never hidden */}
                  <div data-testid="lot-size-breakdown">
                    <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                      <Info className="size-4 text-muted-foreground" aria-hidden="true" />
                      {V.breakdownTitle}
                    </div>
                    <dl className="overflow-hidden rounded-lg border text-sm">
                      <BreakdownRow label={V.breakdownBalance} value={fmtMoney(resultBalance)} />
                      <BreakdownRow label={V.breakdownRisk} value={`${nf.format(resultRisk)}%`} />
                      <BreakdownRow label={V.breakdownRiskAmount} value={fmtMoney(result.riskAmount)} mono />
                      {result.stopPips !== null ? (
                        <>
                          <BreakdownRow
                            label={V.breakdownStopPips}
                            value={`${fmtPrice(result.stopDistance)} → ${nf.format(result.stopPips)} pips`}
                          />
                          <BreakdownRow
                            label={V.breakdownPipValue}
                            value={`${fmtMoney(result.pipValuePerLot ?? 0)} / lot${spec.quotePipValue ? ` — ${V.quotePipNote}` : ""}`}
                            mono
                          />
                        </>
                      ) : (
                        <>
                          <BreakdownRow label={V.breakdownStopPrice} value={fmtPrice(result.stopDistance)} />
                          <BreakdownRow
                            label={V.breakdownContract}
                            value={`${nf.format(result.contractSize)} — ${V.breakdownMethodNote}`}
                            mono
                          />
                        </>
                      )}
                      <BreakdownRow label={V.breakdownRiskPerLot} value={fmtMoney(result.riskPerLot)} mono />
                      <BreakdownRow label={V.breakdownLots} value={nf.format(result.lotsRounded)} last />
                    </dl>
                  </div>
                </div>
              ) : (
                /* Explicit empty state — never a silent zero (§12) */
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-14 text-center">
                  <Scale className="size-8 text-muted-foreground/50" aria-hidden="true" />
                  <p className="text-sm font-medium">{V.emptyTitle}</p>
                  <p className="max-w-sm text-xs text-muted-foreground">{V.emptyBody}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Disclaimer (§37) — compact, factual */}
          <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {V.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────────

function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

function Stat({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums" data-testid={testid}>
        {value}
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 px-3 py-2", !last && "border-b")}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right tabular-nums", mono ? "font-mono" : "font-medium")}>{value}</dd>
    </div>
  );
}
