"use client";

/**
 * Pip & Tick Value Calculator (TOOLS module, frontend-only V1) — answers one
 * question precisely: what is one pip / one tick worth, per lot and for the
 * whole position, in the ACCOUNT currency. Same conversion model as the Lot
 * Size tool (quote==account → derived; base==account → converted at the
 * price; explicit override wins) — declared via the source badge, never
 * mysterious. Live calculation; the tick defaults to one tenth of a pip and
 * is user-overridable for instruments with a different smallest increment.
 */

import * as React from "react";
import { usePreferences } from "@/lib/api/queries/preferences";
import { Copy, Info } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatNumber } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/i18n-provider";
import {
  CALCULATOR_CURRENCIES,
  CUSTOM_INSTRUMENT_SYMBOL,
  INSTRUMENT_PRESETS,
  isCalculatorCurrency,
  resolveSpecification,
  type CalculatorCurrency,
} from "@/lib/calculators/instruments";
import { calculatePipValue } from "@/lib/calculators/pip-value";
import {
  pipValueCalculatorInputSchema,
  pipValueIssues,
  type PipValueField,
  type PipValueIssueCode,
} from "@/lib/calculators/schemas";
import type { PipValueResult } from "@/lib/calculators/pip-value";
import { cn } from "@/lib/utils";

const LOT_PRESETS = ["0.01", "0.1", "0.5", "1", "5"] as const;
const PRICE_PRESETS: Record<string, string> = {
  EURUSD: "1.0850",
  GBPUSD: "1.2700",
  USDJPY: "150.00",
  XAUUSD: "2650.00",
  NAS100: "18000",
  BTCUSD: "67000",
};

export function PipValueCalculator() {
  const { dict } = useI18n();
  const V = dict.calculators.pipValue;
  const S = dict.calculators.shared;
  const preferences = usePreferences();

  const [instrumentSymbol, setInstrumentSymbol] = React.useState<string>(INSTRUMENT_PRESETS[0]?.symbol ?? CUSTOM_INSTRUMENT_SYMBOL);
  const [lots, setLots] = React.useState("1");
  const [price, setPrice] = React.useState(PRICE_PRESETS[INSTRUMENT_PRESETS[0]?.symbol ?? ""] ?? "");
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [tickSize, setTickSize] = React.useState("");
  const [pipValuePerLot, setPipValuePerLot] = React.useState("");

  // ── Currency: the preference seeds it; an explicit user choice wins. ──
  const preferredCurrency = preferences.data?.trading.displayCurrency;
  const [userCurrency, setUserCurrency] = React.useState<CalculatorCurrency | null>(null);
  const currency: CalculatorCurrency =
    userCurrency ??
    (preferredCurrency !== undefined && isCalculatorCurrency(preferredCurrency)
      ? preferredCurrency
      : "USD");

  const spec = resolveSpecification(instrumentSymbol);

  // ── Live validation + calculation — one source, memoized. ──────────────
  const parsed = React.useMemo(
    () =>
      pipValueCalculatorInputSchema.safeParse({
        lots,
        price,
        overrides: { tickSize, pipValuePerLot },
      }),
    [lots, price, tickSize, pipValuePerLot],
  );
  const issues: Partial<Record<PipValueField, PipValueIssueCode>> = React.useMemo(
    () => (parsed.success ? {} : pipValueIssues(parsed.error)),
    [parsed],
  );
  const computed: { result: PipValueResult | null; errorCode: string | null } = React.useMemo(() => {
    if (!parsed.success) {
      return { result: null, errorCode: null };
    }
    const overrides = {
      tickSize: parsed.data.overrides.tickSize === "" ? undefined : Number(parsed.data.overrides.tickSize),
      pipValuePerLot:
        parsed.data.overrides.pipValuePerLot === "" ? undefined : Number(parsed.data.overrides.pipValuePerLot),
    };
    const priceValue = parsed.data.price === "" ? 0 : Number(parsed.data.price);
    const calculation = calculatePipValue({
      spec,
      lots: Number(parsed.data.lots),
      price: priceValue,
      accountCurrency: currency,
      overrides,
    });
    return calculation.ok
      ? { result: calculation.value, errorCode: null }
      : { result: null, errorCode: calculation.code };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spec derives from instrumentSymbol + defaults
  }, [parsed, instrumentSymbol, currency]);
  const result = computed.result;
  const calcErrorCode = computed.errorCode;

  const issueText = (field: PipValueField) =>
    issues[field] !== undefined ? V.validation[issues[field]!] : null;
  const engineError =
    calcErrorCode !== null
      ? calcErrorCode === "PIP_VALUE_REQUIRED"
        ? V.enginePipValueRequired
        : calcErrorCode === "INVALID_TICK_SIZE"
          ? V.engineInvalidTick
          : V.engineGeneric
      : null;

  const copySummary = () => {
    if (result === null) return;
    const rows = [
      `${V.copyInstrument}: ${instrumentSymbol}`,
      `${V.copyLots}: ${formatNumber(lots, 2)}`,
      `${V.copyPipPerLot}: ${formatMoney(result.pipValuePerLot, currency)}`,
      `${V.copyTickPerLot}: ${formatMoney(result.tickValuePerLot, currency)}`,
      `${V.copyPipPosition}: ${formatMoney(result.pipValuePosition, currency)}`,
      `${V.copyTickPosition}: ${formatMoney(result.tickValuePosition, currency)}`,
    ];
    try {
      void navigator.clipboard.writeText(rows.join("\n")).then(() => toast.success(V.toastCopied));
    } catch {
      toast.error(V.copyFailed);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* ── Inputs ─────────────────────────────────────────────────────── */}
      <Card className="bg-surface lg:col-span-5" data-testid="pip-value-inputs">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">{V.inputsTitle}</CardTitle>
          <CardDescription className="text-xs">{V.liveNote}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Currency (display) — seeded by the preference. */}
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="pip-value-currency" className="text-xs font-medium">
              {S.currencyLabel}
            </Label>
            <Select
              value={currency}
              onValueChange={(value) => setUserCurrency(value as CalculatorCurrency)}
            >
              <SelectTrigger
                id="pip-value-currency"
                className="h-8 w-[100px] text-xs"
                aria-label={S.currencyAria}
                data-testid="pip-value-currency"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALCULATOR_CURRENCIES.map((option) => (
                  <SelectItem key={option} value={option} className="text-xs">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Instrument */}
          <div className="space-y-1.5">
            <Label htmlFor="pip-value-instrument" className="text-xs font-medium">
              {V.instrumentLabel}
            </Label>
            <Select
              value={instrumentSymbol}
              onValueChange={(value) => {
                setInstrumentSymbol(value);
                setPrice(PRICE_PRESETS[value] ?? "");
              }}
            >
              <SelectTrigger
                id="pip-value-instrument"
                className="h-9 w-full text-sm"
                aria-label={V.instrumentAria}
                data-testid="pip-value-instrument"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INSTRUMENT_PRESETS.map((preset) => (
                  <SelectItem key={preset.symbol} value={preset.symbol} className="text-sm">
                    {preset.symbol} <span className="text-muted-foreground">· {preset.name}</span>
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_INSTRUMENT_SYMBOL} className="text-sm">
                  {V.instrumentCustom}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground" data-testid="pip-value-spec">
              {spec.assetClass} · {formatNumber(spec.contractSize, 0)} / lot · pip {formatNumber(spec.pipSize, spec.pipSize < 0.01 ? 4 : 2)}
            </p>
          </div>

          {/* Lots */}
          <div className="space-y-1.5">
            <Label htmlFor="pip-value-lots" className="text-xs font-medium">
              {V.lotsLabel}
            </Label>
            <Input
              id="pip-value-lots"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={lots}
              onChange={(event) => setLots(event.target.value)}
              aria-invalid={issues.lots !== undefined}
              aria-label={V.lotsAria}
              data-testid="pip-value-lots"
              className={cn(
                "font-mono tabular-nums",
                issues.lots !== undefined && "border-loss focus-visible:ring-loss",
              )}
            />
            <FieldAlert text={issueText("lots")} testid="pip-value-lots-error" />
            <div className="flex flex-wrap gap-1" aria-label={S.presetsLabel} data-testid="pip-value-lot-presets">
              {LOT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLots(preset)}
                  className={cn(
                    "rounded-md border px-2 py-0.5 font-mono text-[11px] tabular-nums outline-none transition-colors hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-ring",
                    lots === preset ? "border-accent/50 bg-accent/10" : "border-border text-muted-foreground",
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Price (conversion) */}
          <div className="space-y-1.5">
            <Label htmlFor="pip-value-price" className="text-xs font-medium">
              {V.priceLabel}
              <span className="ml-1 text-[10px] text-muted-foreground">{V.priceHint}</span>
            </Label>
            <Input
              id="pip-value-price"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              aria-invalid={issues.price !== undefined}
              aria-label={V.priceAria}
              data-testid="pip-value-price"
              className={cn(
                "font-mono tabular-nums",
                issues.price !== undefined && "border-loss focus-visible:ring-loss",
              )}
            />
            <FieldAlert text={issueText("price")} testid="pip-value-price-error" />
            <p className="text-[11px] text-muted-foreground">{V.priceNote}</p>
          </div>

          {/* Advanced — tick size / pip value override. */}
          <details
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen((event.target as HTMLDetailsElement).open)}
            data-testid="pip-value-advanced"
          >
            <summary className="cursor-pointer text-xs font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {V.advancedTitle}
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pip-value-tick" className="text-xs font-medium">
                    {V.advancedTickSize}
                    <span className="ml-1 text-[10px] text-muted-foreground">{V.advancedTickHint}</span>
                  </Label>
                  <Input
                    id="pip-value-tick"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={tickSize}
                    onChange={(event) => setTickSize(event.target.value)}
                    aria-invalid={issues.advanced !== undefined}
                    aria-label={V.advancedTickAria}
                    data-testid="pip-value-tick-size"
                    className={cn(
                      "font-mono tabular-nums",
                      issues.advanced !== undefined && "border-loss focus-visible:ring-loss",
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pip-value-override" className="text-xs font-medium">
                    {V.advancedPipValue}
                  </Label>
                  <Input
                    id="pip-value-override"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={pipValuePerLot}
                    onChange={(event) => setPipValuePerLot(event.target.value)}
                    aria-invalid={issues.advanced !== undefined}
                    aria-label={V.advancedPipValueAria}
                    data-testid="pip-value-override"
                    className={cn(
                      "font-mono tabular-nums",
                      issues.advanced !== undefined && "border-loss focus-visible:ring-loss",
                    )}
                  />
                </div>
              </div>
              <FieldAlert text={issueText("advanced")} testid="pip-value-advanced-error" />
            </div>
          </details>

          {/* Explanation — compact. */}
          <div className="rounded-lg border border-border bg-surface-raised p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {V.howTitle}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{V.howBody}</p>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground/80">
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            <span>{V.disclaimer}</span>
          </p>
        </CardContent>
      </Card>

      {/* ── Results ────────────────────────────────────────────────────── */}
      <div className="space-y-4 lg:col-span-7">
        <Card className="bg-surface" data-testid="pip-value-summary">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="font-heading text-base font-semibold">{V.resultsTitle}</CardTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copySummary}
              disabled={result === null}
              data-testid="pip-value-copy"
            >
              <Copy className="size-3.5" aria-hidden="true" />
              {V.copySummary}
            </Button>
          </CardHeader>
          <CardContent>
            <div aria-live="polite" data-testid="pip-value-summary-grid">
              {result !== null ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <ResultCell
                      label={V.resultPipPerLot}
                      value={formatMoney(result.pipValuePerLot, currency)}
                      testid="pip-value-pip-per-lot"
                    />
                    <ResultCell
                      label={V.resultTickPerLot}
                      value={formatMoney(result.tickValuePerLot, currency)}
                      testid="pip-value-tick-per-lot"
                    />
                    <ResultCell
                      label={V.resultPipPosition}
                      value={formatMoney(result.pipValuePosition, currency)}
                      testid="pip-value-pip-position"
                    />
                    <ResultCell
                      label={V.resultTickPosition}
                      value={formatMoney(result.tickValuePosition, currency)}
                      testid="pip-value-tick-position"
                    />
                  </div>

                  <dl className="mt-4 space-y-1 rounded-lg border border-border bg-surface-raised p-3 text-[11px]" data-testid="pip-value-details">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{V.detailsTickSize}</dt>
                      <dd className="font-mono tabular-nums">{formatNumber(result.tickSize, result.tickSize < 0.01 ? 5 : 3)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{V.detailsUnits}</dt>
                      <dd className="font-mono tabular-nums">{formatNumber(result.units, 2)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{V.detailsSource}</dt>
                      <dd className="font-mono tabular-nums">
                        {result.pipValueSource === "OVERRIDE"
                          ? V.sourceOverride
                          : result.pipValueSource === "ENTRY_CONVERTED"
                            ? V.sourceConverted
                            : V.sourceDerived}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {engineError ?? V.resultsEmpty}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResultCell({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-3" data-testid={testid}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function FieldAlert({ text, testid }: { text: string | null; testid: string }) {
  if (text === null) return null;
  return (
    <p role="alert" className="text-xs text-loss" data-testid={testid}>
      {text}
    </p>
  );
}
