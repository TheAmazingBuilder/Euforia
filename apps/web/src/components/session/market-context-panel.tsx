"use client";

import * as React from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@cosmoz/shared";
import type { KeyLevel, KeyLevelKind } from "@cosmoz/shared";

import { levelKindLabel, type SessionDict } from "@/i18n/dictionaries/en/session";
import { useI18n } from "@/i18n/i18n-provider";
import { useCreateKeyLevel, useDeleteKeyLevel } from "@/lib/api/queries";
import { useNowMs } from "@/lib/realtime/use-now";
import { cn } from "@/lib/utils";

/**
 * Market Context (§21/Phase 5) + Key Levels (§20) — the two documentation
 * panels beside the chart. The context panel keeps OBJECTIVE market data and
 * TRADER INTERPRETATION in separate, visually distinct sections (§47).
 */

const LEVEL_KINDS: readonly KeyLevelKind[] = [
  "SUPPORT",
  "RESISTANCE",
  "PREV_DAY_HIGH",
  "PREV_DAY_LOW",
  "SESSION_OPEN",
  "WEEKLY_HIGH",
  "WEEKLY_LOW",
  "ASIAN_HIGH",
  "ASIAN_LOW",
  "CUSTOM",
];

/** UTC market-session phase — objective clock arithmetic, nothing more. */
function marketSessionPhase(now: Date, S: SessionDict): string {
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  if (hour >= 13 && hour < 16) return S.context.phaseOverlap;
  if (hour >= 7 && hour < 13) return S.context.phaseLondon;
  if (hour >= 16 && hour < 21) return S.context.phaseNewYork;
  if (hour >= 0 && hour < 7) return S.context.phaseAsian;
  return S.context.phaseAfterHours;
}

export interface MarketContextProps {
  symbol: string;
  digits: number;
  quote: { price: number; prevClose: number; ts: number } | null;
  candles: Array<{ h: number; l: number; c: number }>;
  atr: number | null;
  bias: string | null;
  objective: string | null;
  levels: KeyLevel[];
  savedBiasNote: string | null;
}

export function MarketContextPanel({ symbol, digits, quote, candles, atr, bias, objective, levels, savedBiasNote }: MarketContextProps) {
  const { dict } = useI18n();
  const S = dict.session;
  const nowMs = useNowMs();
  const phase = nowMs !== null ? marketSessionPhase(new Date(nowMs), S) : "—";
  // Bias rendered uppercase here (legacy raw-enum look of this row).
  const biasText =
    bias === "BULLISH"
      ? S.bias.bullish.toUpperCase()
      : bias === "BEARISH"
        ? S.bias.bearish.toUpperCase()
        : bias !== null
          ? S.bias.neutral.toUpperCase()
          : null;
  const changePct = quote !== null && quote.prevClose !== 0 ? ((quote.price - quote.prevClose) / quote.prevClose) * 100 : null;
  const range = React.useMemo(() => {
    if (candles.length === 0) return null;
    let high = -Number.MAX_VALUE;
    let low = Number.MAX_VALUE;
    for (const candle of candles) {
      if (candle.h > high) high = candle.h;
      if (candle.l < low) low = candle.l;
    }
    return { high, low };
  }, [candles]);

  const nearest = React.useMemo(() => {
    if (quote === null || levels.length === 0) return null;
    let best: KeyLevel | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const level of levels) {
      const delta = Math.abs(level.price - quote.price);
      if (delta < bestDelta) {
        best = level;
        bestDelta = delta;
      }
    }
    return best !== null ? { level: best, deltaPct: (bestDelta / quote.price) * 100 } : null;
  }, [quote, levels]);

  const objectiveRow = (label: string, value: React.ReactNode, testId?: string) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs tabular-nums text-foreground" data-testid={testId}>
        {value}
      </span>
    </div>
  );

  return (
    <section className="rounded-xl border border-border bg-surface" data-testid="market-context-panel">
      <header className="border-b border-border px-4 py-3">
        <h2 className="font-heading text-base font-semibold text-foreground">{S.context.title}</h2>
        <p className="text-xs text-muted-foreground">
          {`${symbol} — ${S.context.subtitle}`}
        </p>
      </header>
      <div className="space-y-3 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{S.context.objectiveData}</p>
          <div className="mt-1 divide-y divide-border/50">
            {objectiveRow(S.context.currentPrice, quote !== null ? formatPrice(quote.price, digits) : "—", "context-price")}
            {objectiveRow(
              S.context.change,
              changePct !== null ? (
                <span className={changePct >= 0 ? "text-profit" : "text-loss"}>
                  {changePct >= 0 ? "+" : ""}
                  {changePct.toFixed(2)}%
                </span>
              ) : (
                "—"
              ),
            )}
            {objectiveRow(S.context.marketSession, phase, "context-session")}
            {objectiveRow("ATR(14)", atr !== null ? formatPrice(atr, digits) : "—", "context-atr")}
            {objectiveRow(S.context.windowRange, range !== null ? `${formatPrice(range.low, digits)} – ${formatPrice(range.high, digits)}` : "—")}
            {objectiveRow(S.context.volatilityRead, atr !== null && quote !== null ? `${((atr / quote.price) * 100).toFixed(2)}${S.context.ofPriceSuffix}` : "—")}
          </div>
        </div>

        <div className="rounded-lg border border-accent/25 bg-accent/5 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">{S.context.interpretation}</p>
          <div className="mt-1 divide-y divide-border/50">
            {objectiveRow(
              S.labels.bias,
              biasText !== null ? (
                <span className={cn(bias === "BULLISH" && "text-profit", bias === "BEARISH" && "text-loss")}>
                  {biasText}
                </span>
              ) : (
                <span className="text-muted-foreground">{S.context.setBias}</span>
              ),
              "context-bias",
            )}
            {objectiveRow(S.context.nearestLevel, nearest !== null ? `${levelKindLabel(S, nearest.level.kind)} ${formatPrice(nearest.level.price, digits)}` : "—")}
            {objectiveRow(S.context.distanceToLevel, nearest !== null ? `${nearest.deltaPct.toFixed(2)}%` : "—")}
            {objectiveRow(S.labels.objective, objective ?? "—")}
          </div>
          {savedBiasNote !== null ? <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{`${S.context.lastSaved} ${savedBiasNote}`}</p> : null}
        </div>
      </div>
    </section>
  );
}

// ── Key levels (§20) ────────────────────────────────────────────────────────

interface KeyLevelsPanelProps {
  symbol: string;
  digits: number;
  quote: { price: number } | null;
  levels: KeyLevel[];
  isLoading: boolean;
  visible: boolean;
  onToggleVisible: () => void;
}

export function KeyLevelsPanel({ symbol, digits, quote, levels, isLoading, visible, onToggleVisible }: KeyLevelsPanelProps) {
  const { dict } = useI18n();
  const S = dict.session;
  const create = useCreateKeyLevel();
  const remove = useDeleteKeyLevel();
  const [kind, setKind] = React.useState<KeyLevelKind>("SUPPORT");
  const [priceInput, setPriceInput] = React.useState("");
  const [note, setNote] = React.useState("");

  // The field shows the live price while untouched — derived, no prefill effect.
  const priceValue = priceInput !== "" ? priceInput : quote !== null ? quote.price.toFixed(Math.min(digits, 4)) : "";

  const submit = () => {
    const value = Number(priceValue);
    if (!Number.isFinite(value) || value <= 0 || symbol === "") return;
    create.mutate(
      { symbol, kind, price: value, note: note.trim() !== "" ? note.trim() : null },
      {
          onSuccess: () => {
          setNote("");
          setPriceInput("");
        },
      },
    );
  };

  return (
    <section className="rounded-xl border border-border bg-surface" data-testid="key-levels-panel">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">{S.context.levelsTitle}</h2>
          <p className="text-xs text-muted-foreground">{`${S.context.levelsSub} ${symbol}.`}</p>
        </div>
        <button
          type="button"
          onClick={onToggleVisible}
          aria-pressed={visible}
          data-testid="levels-overlay-toggle"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition-colors",
            visible ? "border-warning/50 bg-warning/10 text-warning" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {visible ? <Eye className="size-3.5" aria-hidden="true" /> : <EyeOff className="size-3.5" aria-hidden="true" />}
          {S.context.chartToggle}
        </button>
      </header>

      <div className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as KeyLevelKind)}
            aria-label={S.context.levelTypeAria}
            data-testid="level-kind"
            className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-foreground outline-none focus:border-accent/60"
          >
            {LEVEL_KINDS.map((item) => (
              <option key={item} value={item}>
                {levelKindLabel(S, item)}
              </option>
            ))}
          </select>
          <input
            value={priceValue}
            onChange={(event) => setPriceInput(event.target.value)}
            type="number"
            step="any"
            min={0}
            placeholder={S.context.pricePlaceholder}
            aria-label={S.context.levelPriceAria}
            data-testid="level-price"
            className="w-24 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-xs text-foreground outline-none focus:border-accent/60"
          />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={S.context.notePlaceholder}
            aria-label={S.context.levelNoteAria}
            maxLength={200}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
          />
          <Button size="sm" variant="outline" onClick={submit} disabled={!Number.isFinite(Number(priceValue)) || Number(priceValue) <= 0} data-testid="level-add">
            <Plus className="size-3.5" aria-hidden="true" />
            {S.context.add}
          </Button>
        </div>

        {isLoading ? (
          <p className="py-3 text-center text-xs text-muted-foreground">{S.context.loadingLevels}</p>
        ) : levels.length === 0 ? (
          <p className="py-3 text-center text-xs leading-relaxed text-muted-foreground">
            {`${S.context.levelsEmptyA} ${symbol} ${S.context.levelsEmptyB}`}
          </p>
        ) : (
          <ul className="space-y-1" data-testid="level-list">
            {levels.map((level) => {
              const distance = quote !== null ? ((level.price - quote.price) / quote.price) * 100 : null;
              return (
                <li key={level.id} className="group flex items-center justify-between gap-2 rounded-md border border-border bg-surface-raised px-2 py-1.5">
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{levelKindLabel(S, level.kind)}</span>
                    <span className="font-mono text-sm tabular-nums text-foreground">{formatPrice(level.price, digits)}</span>
                    {level.note !== null ? <span className="ml-2 text-xs text-muted-foreground">{level.note}</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {distance !== null ? (
                      <span className={cn("font-mono text-xs tabular-nums", distance >= 0 ? "text-profit" : "text-loss")}>
                        {distance >= 0 ? "+" : ""}
                        {distance.toFixed(2)}%
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => remove.mutate(level.id)}
                      aria-label={`${S.context.deleteLevelA} ${levelKindLabel(S, level.kind)} ${S.context.deleteLevelB}`.replace(/\s+/g, " ").trim()}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-loss group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
