"use client";

import * as React from "react";
import { ArrowRight, CircleCheck, Dumbbell, RotateCcw, Shuffle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CandleSeries, StructureFigure } from "@/components/academy/visuals";
import { Flashcards, ScenarioPlayer } from "@/components/academy/academy-flashcards";
import { PositionSizingDrill, SrDrill, ZoneDrill } from "@/components/academy/academy-practice-drills";
import { useAcademyPatternDrill, useAcademyPracticeStats, useLogPractice } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Practice zone — six ways to train recognition, not prediction:
 * 1. Flashcards — daily spaced repetition (glossary + lesson takeaways);
 * 2. Pattern Identification — randomized drills, engine-graded, with a
 *    weakness bank that resurfaces missed patterns;
 * 3. Support/Resistance + Supply/Demand — read the level / the zone;
 * 4. Candle Lab — the interactive OHLC simulator (spec §25);
 * 5. Position Sizing — risk arithmetic with tolerance grading;
 * 6. Structure Reading + Scenario Player — decision training.
 * Every attempt lands in the practice ledger (per-drill accuracy below).
 */

export function AcademyPracticePanel() {
  return (
    <div className="space-y-8" data-testid="academy-practice">
      <PracticeStats />
      <Flashcards />
      <PatternDrill />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SrDrill />
        <ZoneDrill />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CandleLab />
        <PositionSizingDrill />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StructureDrill />
        <ScenarioPlayer />
      </div>
    </div>
  );
}

// ── Practice ledger (per-drill accuracy + recent rows) ──────────────────

function PracticeStats() {
  const { data } = useAcademyPracticeStats();
  const { dict } = useI18n();
  const V = dict.academy.practice;
  if (!data) return null;
  const used = data.perDrill.filter((row) => row.attempts > 0);
  return (
    <section aria-label={V.ledgerAria} className="rounded-lg border bg-surface px-4 py-3.5" data-testid="academy-practice-stats">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-sm font-semibold">
          <Dumbbell className="size-4 text-accent" aria-hidden="true" />
          {V.ledgerTitle}
        </h2>
        {data.recent.length > 0 ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {V.lastAttemptsPrefix}
            {data.recent.length}
            {V.lastAttemptsSuffix}
          </span>
        ) : null}
      </div>
      {used.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{V.ledgerEmpty}</p>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {used.map((row) => (
            <span
              key={row.drill}
              title={`${row.correct}/${row.attempts}${V.correctTitleSuffix}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                (row.accuracy ?? 0) >= 70 && "border-profit/40 bg-profit/10 text-profit",
                (row.accuracy ?? 0) < 70 && (row.accuracy ?? 0) >= 45 && "border-warning/40 bg-warning/10 text-warning",
                (row.accuracy ?? 0) < 45 && "border-loss/40 bg-loss/10 text-loss",
              )}
            >
              {row.label} {row.accuracy}%
            </span>
          ))}
        </div>
      )}
      {data.recent.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {data.recent.map((row, index) => (
            <li key={`${row.at}-${index}`} className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              <span aria-hidden="true" className={cn("size-1.5 rounded-full", row.correct ? "bg-profit" : "bg-loss")} />
              {row.drill.replace("_", " ").toLowerCase()}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// ── 1. Pattern identification drill ──────────────────────────────────────────

/**
 * Candle-ink palettes — the color-independence teaching device. Every
 * palette re-inks the SAME anatomy via [data-candle-ink] CSS variables
 * (globals.css): "inverse" mirrors the East-Asian convention (red = up),
 * "mono" is the classic hollow/filled newspaper chart. The lesson: the
 * pattern is the geometry and its location — never the color.
 */
const INK_PALETTES = [
  { id: "classic" },
  { id: "inverse" },
  { id: "ocean" },
  { id: "violet" },
  { id: "mono" },
] as const;

// Palette machine ids — labels resolve through dict.academy.practice.inkPalettes.
type InkPaletteId = (typeof INK_PALETTES)[number]["id"];

const INK_STORAGE_KEY = "cosmoz:candle-ink";

function CandleInkPicker({ value, onChange }: { value: InkPaletteId; onChange: (id: InkPaletteId) => void }) {
  const { dict } = useI18n();
  const V = dict.academy.practice;
  return (
    <div className="flex items-center gap-2" data-testid="academy-ink-picker">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{V.inkLabel}</span>
      <div role="radiogroup" aria-label={V.inkAria} className="flex items-center gap-1">
        {INK_PALETTES.map((palette) => {
          const label = V.inkPalettes[palette.id];
          return (
            <button
              key={palette.id}
              type="button"
              role="radio"
              aria-checked={value === palette.id}
              aria-label={`${label}${V.inkColorsSuffix}`}
              title={`${label}${V.inkTitleSuffix}`}
              onClick={() => onChange(palette.id)}
              data-candle-ink={palette.id}
              data-testid={`academy-ink-${palette.id}`}
              className={cn(
                "flex items-center gap-0.5 rounded-full border px-1.5 py-1 transition-colors",
                value === palette.id ? "border-accent bg-accent/10" : "border-border bg-surface hover:bg-muted",
              )}
            >
              {/* Swatch dots resolve the palette's own CSS variables locally. */}
              <span aria-hidden="true" className="size-2.5 rounded-full border border-foreground/15" style={{ background: "var(--candle-bull)" }} />
              <span aria-hidden="true" className="size-2.5 rounded-full border border-foreground/15" style={{ background: "var(--candle-bear)" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PatternDrill() {
  const drillQuery = useAcademyPatternDrill();
  const logPractice = useLogPractice();
  const [choice, setChoice] = React.useState<number | null>(null);
  const [round, setRound] = React.useState(0);
  const { dict } = useI18n();
  const V = dict.academy.practice;
  const [ink, setInk] = React.useState<InkPaletteId>(() => {
    if (typeof window === "undefined") return "classic";
    try {
      const stored = window.localStorage.getItem(INK_STORAGE_KEY);
      return INK_PALETTES.some((palette) => palette.id === stored) ? (stored as InkPaletteId) : "classic";
    } catch {
      return "classic";
    }
  });

  const changeInk = (id: InkPaletteId) => {
    setInk(id);
    try {
      window.localStorage.setItem(INK_STORAGE_KEY, id);
    } catch {
      /* private mode — palette stays session-only */
    }
  };

  const drill = drillQuery.data;
  const answered = choice !== null && drill !== null;

  const nextDrill = () => {
    setChoice(null);
    setRound((prev) => prev + 1);
    void drillQuery.refetch();
  };

  const biasTone = drill?.bias
    ? drill.bias.startsWith("Bullish")
      ? "border-profit/40 bg-profit/10 text-profit"
      : drill.bias.startsWith("Bearish")
        ? "border-loss/40 bg-loss/10 text-loss"
        : "border-border bg-muted text-muted-foreground"
    : "";

  return (
    <section aria-label={V.patternAria} className="rounded-lg border bg-surface px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
          <Shuffle className="size-4 text-accent" aria-hidden="true" />
          {V.patternTitle}
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          {V.roundPrefix}
          <span className="tabular-nums">{round + 1}</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {V.patternIntro}
        {drill?.context ? `${V.contextPrefix}${drill.context}` : ""}
      </p>

      {drillQuery.isLoading || !drill ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="mx-auto h-44 w-full max-w-sm" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center gap-1.5" data-testid="academy-drill-tags">
              {drill.family ? (
                <span className="inline-flex items-center rounded-sm border border-border bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {drill.family}
                </span>
              ) : null}
              {drill.bias ? (
                <span className={cn("inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider", biasTone)}>
                  {drill.bias}
                </span>
              ) : null}
            </div>
            <CandleInkPicker value={ink} onChange={changeInk} />
          </div>

          <div
            data-candle-ink={ink}
            data-testid="academy-drill-chart"
            className="chart-paper mx-auto mt-3 flex max-w-sm items-center justify-center rounded-md border border-border px-3 py-4"
          >
            <CandleSeries candles={drill.candles} width={280} height={170} />
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground" data-testid="academy-ink-hint">
            {V.inkHint}
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={V.optionsAria} data-testid="academy-drill-options">
            {drill.options.map((option, index) => {
              const isCorrect = index === drill.answer;
              const state = !answered ? "idle" : isCorrect ? "correct" : index === choice ? "wrong" : "dim";
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={choice === index}
                  disabled={answered}
                  onClick={() => {
                    setChoice(index);
                    logPractice.mutate({ drill: "PATTERN_ID", correct: isCorrect, refId: drill.patternId });
                  }}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    state === "idle" && "border-border bg-surface hover:bg-muted",
                    state === "correct" && "border-profit/50 bg-profit/10 text-foreground",
                    state === "wrong" && "border-loss/50 bg-loss/10 text-foreground",
                    state === "dim" && "border-border bg-surface opacity-50",
                  )}
                  data-testid={`academy-drill-option-${index}`}
                >
                  {option.label}
                  {state === "correct" ? <CircleCheck className="size-4 shrink-0 text-profit" aria-hidden="true" /> : null}
                  {state === "wrong" ? <X className="size-4 shrink-0 text-loss" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>

          {answered ? (
            <div className="mt-4 space-y-3" data-testid="academy-drill-feedback">
              <aside
                className={cn(
                  "rounded-md border px-3.5 py-3 text-sm leading-relaxed",
                  choice === drill.answer ? "border-profit/40 bg-profit/5" : "border-loss/40 bg-loss/5",
                )}
              >
                <p className="font-medium">{choice === drill.answer ? V.correct : V.notThisOne}</p>
                <p className="mt-1 text-foreground/85">{drill.explanation}</p>
              </aside>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={nextDrill} data-testid="academy-drill-next">
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {V.nextDrill}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

// ── 2. Candle Lab — the interactive OHLC simulator (spec §25) ───────────────

type Ohlc = { o: number; h: number; l: number; c: number };

function CandleLab() {
  const [ohlc, setOhlc] = React.useState<Ohlc>({ o: 30, h: 42, l: 20, c: 38 });
  const { dict } = useI18n();
  const V = dict.academy.practice;

  const set = (key: keyof Ohlc) => (value: number) => {
    setOhlc((prev) => {
      const next = { ...prev, [key]: value };
      // Keep h ≥ max(o, c) and l ≤ min(o, c) — physics of a candle.
      next.h = Math.max(next.h, next.o, next.c);
      next.l = Math.min(next.l, next.o, next.c);
      return next;
    });
  };

  const bullish = ohlc.c >= ohlc.o;
  const bodySize = Math.abs(ohlc.c - ohlc.o);
  const upperWick = ohlc.h - Math.max(ohlc.o, ohlc.c);
  const lowerWick = Math.min(ohlc.o, ohlc.c) - ohlc.l;

  const read = [
    { label: V.readDirection, value: bullish ? V.bullDir : V.bearDir },
    { label: V.readBody, value: bodySize < 3 ? V.bodySmall : bodySize > 8 ? V.bodyLarge : V.bodyMedium },
    { label: V.readUpperWick, value: upperWick > 6 ? V.wickLongHighs : upperWick < 2 ? V.wickNone : V.wickShort },
    { label: V.readLowerWick, value: lowerWick > 6 ? V.wickLongLows : lowerWick < 2 ? V.wickNone : V.wickShort },
  ];

  return (
    <section aria-label={V.labAria} className="rounded-lg border bg-surface px-4 py-4 sm:px-5">
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
        <Dumbbell className="size-4 text-accent" aria-hidden="true" />
        {V.labTitle}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{V.labDesc}</p>

      <div className="chart-paper mx-auto mt-3 max-w-[240px] rounded-md border border-border px-3 py-3">
        <CandleSeries candles={[ohlc]} width={200} height={160} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {(
          [
            [V.ohlc.open, ohlc.o, "o"],
            [V.ohlc.high, ohlc.h, "h"],
            [V.ohlc.low, ohlc.l, "l"],
            [V.ohlc.close, ohlc.c, "c"],
          ] as [string, number, keyof Ohlc][]
        ).map(([label, value, key]) => (
          <label key={key} className="block">
            <span className="ledger-label flex items-center justify-between">
              {label}
              <span className="font-mono tabular-nums text-foreground">{value}</span>
            </span>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={value}
              onChange={(event) => set(key)(Number(event.target.value))}
              className="mt-1 w-full accent-[var(--accent)]"
              aria-label={`${label}${V.priceSuffix}`}
              data-testid={`academy-lab-${key}`}
            />
          </label>
        ))}
      </div>

      <dl className="mt-4 divide-y divide-border rounded-md border border-border">
        {read.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{row.label}</dt>
            <dd className="text-right text-xs font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ── 3. Structure reading drill ──────────────────────────────────────────────

// Scenario machine ids — the content (context/prompt/options/explanation)
// resolves through dict.academy.practice.scenarios; the variant id doubles
// as the StructureFigure geometry key and stays API-stable.
const STRUCTURE_VARIANTS = ["uptrend", "bos-up", "choch", "range", "liquidity-sweep", "double-top"] as const;

const SCENARIO_KEY = {
  "uptrend": "uptrend",
  "bos-up": "bosUp",
  choch: "choch",
  range: "range",
  "liquidity-sweep": "liquiditySweep",
  "double-top": "doubleTop",
} as const;

function StructureDrill() {
  const logPractice = useLogPractice();
  const [index, setIndex] = React.useState(() => Math.floor(Math.random() * STRUCTURE_VARIANTS.length));
  const [choice, setChoice] = React.useState<number | null>(null);
  const { dict } = useI18n();
  const V = dict.academy.practice;

  const scenario = V.scenarios[SCENARIO_KEY[STRUCTURE_VARIANTS[index]]];
  const answered = choice !== null;

  const next = () => {
    setChoice(null);
    setIndex((prev) => (prev + 1 + Math.floor(Math.random() * (STRUCTURE_VARIANTS.length - 1))) % STRUCTURE_VARIANTS.length);
  };

  return (
    <section aria-label={V.structureAria} className="rounded-lg border bg-surface px-4 py-4 sm:px-5">
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
        <Dumbbell className="size-4 text-accent" aria-hidden="true" />
        {V.structureTitle}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {V.structureIntro}
        {scenario.context}
      </p>

      <div className="mt-3">
        <StructureFigure variant={STRUCTURE_VARIANTS[index]} />
      </div>

      <p className="mt-1 text-sm font-medium">{scenario.prompt}</p>
      <div className="mt-2 space-y-1.5">
        {[scenario.opt1, scenario.opt2, scenario.opt3].map((label, optionIndex) => {
          const correct = optionIndex === 0;
          const state = !answered ? "idle" : correct ? "correct" : optionIndex === choice ? "wrong" : "dim";
          return (
            <button
              key={optionIndex}
              type="button"
              disabled={answered}
              onClick={() => {
                setChoice(optionIndex);
                logPractice.mutate({ drill: "STRUCTURE", correct });
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                state === "idle" && "border-border bg-surface hover:bg-muted",
                state === "correct" && "border-profit/50 bg-profit/10",
                state === "wrong" && "border-loss/50 bg-loss/10",
                state === "dim" && "border-border bg-surface opacity-50",
              )}
              data-testid={`academy-structure-option-${optionIndex}`}
            >
              {label}
              {state === "correct" ? <CircleCheck className="size-4 shrink-0 text-profit" aria-hidden="true" /> : null}
              {state === "wrong" ? <X className="size-4 shrink-0 text-loss" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      {answered ? (
        <div className="mt-3 space-y-3">
          <p className="rounded-md border border-border bg-surface-raised px-3 py-2.5 text-xs leading-relaxed text-foreground/90">{scenario.explanation}</p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={next}>
            {V.nextScenario}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
