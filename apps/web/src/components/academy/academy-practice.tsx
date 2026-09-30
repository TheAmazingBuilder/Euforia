"use client";

import * as React from "react";
import { ArrowRight, CircleCheck, Dumbbell, RotateCcw, Shuffle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CandleSeries, StructureFigure } from "@/components/academy/visuals";
import { useAcademyPatternDrill, useLogPractice } from "@/lib/api/queries";

/**
 * Practice zone — three drills that train recognition, not prediction:
 * 1. Pattern Identification — randomized candle-pattern drills graded by the
 *    engine (answers never leak pre-submission);
 * 2. Candle Lab — the interactive OHLC simulator (spec §25);
 * 3. Structure Reading — scenario drills over the structure diagrams.
 * Every answered attempt is logged server-side for the Progress stats.
 */

export function AcademyPracticePanel() {
  return (
    <div className="space-y-8" data-testid="academy-practice">
      <PatternDrill />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CandleLab />
        <StructureDrill />
      </div>
    </div>
  );
}

// ── 1. Pattern identification drill ──────────────────────────────────────────

function PatternDrill() {
  const drillQuery = useAcademyPatternDrill();
  const logPractice = useLogPractice();
  const [choice, setChoice] = React.useState<number | null>(null);
  const [round, setRound] = React.useState(0);

  const drill = drillQuery.data;
  const answered = choice !== null && drill !== null;

  const nextDrill = () => {
    setChoice(null);
    setRound((prev) => prev + 1);
    void drillQuery.refetch();
  };

  return (
    <section aria-label="Identify the pattern" className="rounded-lg border bg-surface px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
          <Shuffle className="size-4 text-accent" aria-hidden="true" />
          Identify the pattern
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          round <span className="tabular-nums">{round + 1}</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        A formation is drawn below. Name it — then read the explanation. {drill?.context ? `Context: ${drill.context}` : ""}
      </p>

      {drillQuery.isLoading || !drill ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="mx-auto h-44 w-full max-w-sm" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          <div className="chart-paper mx-auto mt-4 flex max-w-sm items-center justify-center rounded-md border border-border px-3 py-4">
            <CandleSeries candles={drill.candles} width={280} height={170} />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Pattern options" data-testid="academy-drill-options">
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
                    logPractice.mutate({ drill: "PATTERN_ID", correct: isCorrect });
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
                <p className="font-medium">{choice === drill.answer ? "Correct." : "Not this one."}</p>
                <p className="mt-1 text-foreground/85">{drill.explanation}</p>
              </aside>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={nextDrill} data-testid="academy-drill-next">
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Next drill
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
    { label: "Direction", value: bullish ? "Bullish — close above open" : "Bearish — close below open" },
    { label: "Body", value: bodySize < 3 ? "Small — balance between sides" : bodySize > 8 ? "Large — one side dominated" : "Medium" },
    { label: "Upper wick", value: upperWick > 6 ? "Long — highs rejected" : upperWick < 2 ? "None meaningful" : "Short" },
    { label: "Lower wick", value: lowerWick > 6 ? "Long — lows rejected, buyers stepped in" : lowerWick < 2 ? "None meaningful" : "Short" },
  ];

  return (
    <section aria-label="Candle lab" className="rounded-lg border bg-surface px-4 py-4 sm:px-5">
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
        <Dumbbell className="size-4 text-accent" aria-hidden="true" />
        Candle Lab
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Drag open, high, low and close — watch the candle rebuild and read what it says. The anatomy every pattern assumes.
      </p>

      <div className="chart-paper mx-auto mt-3 max-w-[240px] rounded-md border border-border px-3 py-3">
        <CandleSeries candles={[ohlc]} width={200} height={160} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {(
          [
            ["Open", ohlc.o, "o"],
            ["High", ohlc.h, "h"],
            ["Low", ohlc.l, "l"],
            ["Close", ohlc.c, "c"],
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
              aria-label={`${label} price`}
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

type StructureScenario = {
  variant: string;
  context: string;
  prompt: string;
  options: { label: string; correct: boolean }[];
  explanation: string;
};

const STRUCTURE_SCENARIOS: StructureScenario[] = [
  {
    variant: "uptrend",
    context: "Daily timeframe, no news scheduled.",
    prompt: "What state is this market in?",
    options: [
      { label: "Uptrend — repeating HH/HL sequence", correct: true },
      { label: "Downtrend", correct: false },
      { label: "Range — no directional progression", correct: false },
    ],
    explanation:
      "Higher highs and higher lows repeating: an uptrend by definition. Trend tactics apply — pullback entries, not fades.",
  },
  {
    variant: "bos-up",
    context: "Within an established uptrend.",
    prompt: "The highlighted event is best labeled…",
    options: [
      { label: "BOS — break of structure, continuation", correct: true },
      { label: "CHoCH — change of character", correct: false },
      { label: "Liquidity sweep", correct: false },
    ],
    explanation:
      "A decisive close above the prior swing high IN the trend's direction is a break of structure — a continuation event, not a reversal warning.",
  },
  {
    variant: "choch",
    context: "After a long series of HH/HL.",
    prompt: "Price just closed below the last higher low. This event is…",
    options: [
      { label: "CHoCH — first warning of a possible reversal", correct: true },
      { label: "A confirmed downtrend — go short at market", correct: false },
      { label: " meaningless noise", correct: false },
    ],
    explanation:
      "First counter-trend structural break = change of character. It is a warning, not a confirmed reversal — the MSS (LH then LL) is the confirmation stage.",
  },
  {
    variant: "range",
    context: "Two levels tested repeatedly over weeks.",
    prompt: "The highest-expectation tactics here are…",
    options: [
      { label: "Fade the extremes toward the middle", correct: true },
      { label: "Chase mid-range breakouts", correct: false },
      { label: "Trend-follow the middle", correct: false },
    ],
    explanation:
      "In ranges, extremes carry the information; mid-range breakouts die. Range tactics and trend tactics are not interchangeable.",
  },
  {
    variant: "liquidity-sweep",
    context: "Equal lows, then a quick pierce and sharp reversal.",
    prompt: "What did the pierce below the equal lows most plausibly do?",
    options: [
      { label: "Swept resting sell-stops, then reversed", correct: true },
      { label: "Confirmed a breakdown", correct: false },
      { label: "Nothing — it is a data error", correct: false },
    ],
    explanation:
      "The observable sequence — pierce beyond obvious lows, fast reversal — is the classic sweep. Trade the reversal sequence with a stop beyond the sweep extreme.",
  },
  {
    variant: "double-top",
    context: "Two peaks at the same supply area.",
    prompt: "When is this formation actually complete?",
    options: [
      { label: "On the decisive neckline (pullback low) break", correct: true },
      { label: "When the second peak prints", correct: false },
      { label: "Three candles after the first peak", correct: false },
    ],
    explanation:
      "Until the neckline breaks, it is only a range. The break is the event; before it, shorting the 'top' is anticipation.",
  },
];

function StructureDrill() {
  const logPractice = useLogPractice();
  const [index, setIndex] = React.useState(() => Math.floor(Math.random() * STRUCTURE_SCENARIOS.length));
  const [choice, setChoice] = React.useState<number | null>(null);

  const scenario = STRUCTURE_SCENARIOS[index];
  const answered = choice !== null;

  const next = () => {
    setChoice(null);
    setIndex((prev) => (prev + 1 + Math.floor(Math.random() * (STRUCTURE_SCENARIOS.length - 1))) % STRUCTURE_SCENARIOS.length);
  };

  return (
    <section aria-label="Structure reading drill" className="rounded-lg border bg-surface px-4 py-4 sm:px-5">
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
        <Dumbbell className="size-4 text-accent" aria-hidden="true" />
        Structure reading
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">Read the diagram, answer, get the reason. Context: {scenario.context}</p>

      <div className="mt-3">
        <StructureFigure variant={scenario.variant} />
      </div>

      <p className="mt-1 text-sm font-medium">{scenario.prompt}</p>
      <div className="mt-2 space-y-1.5">
        {scenario.options.map((option, optionIndex) => {
          const state = !answered ? "idle" : option.correct ? "correct" : optionIndex === choice ? "wrong" : "dim";
          return (
            <button
              key={optionIndex}
              type="button"
              disabled={answered}
              onClick={() => {
                setChoice(optionIndex);
                logPractice.mutate({ drill: "STRUCTURE", correct: option.correct });
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
              {option.label}
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
            Next scenario
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
