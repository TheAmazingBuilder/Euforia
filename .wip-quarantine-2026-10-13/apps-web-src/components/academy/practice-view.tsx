"use client";

import * as React from "react";
import {
  CheckCircle2,
  ChevronDown,
  Dumbbell,
  Library,
  RotateCcw,
  Search,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CandleSvg, type Candle } from "@/components/academy/figures";
import {
  PATTERN_LIBRARY,
  type PatternBias,
  type PatternEntry,
} from "@/components/academy/pattern-library";
import { cn } from "@/lib/utils";

/**
 * Practice — the drilling hall. Three rooms, all honest about what they
 * teach: "Identify the pattern" drills shape + context reading (verdicts
 * inline, score kept locally), the Candle Simulator lets you build a candle
 * from OHLC sliders and read what its anatomy says, and the Pattern Library
 * holds the full classical candle vocabulary — every shape with its
 * mechanics, its context and the confirmation a professional waits for.
 * No predictions, no promises. The graded journey stays in the quizzes.
 */

// ── Identify the pattern ─────────────────────────────────────────────────────

type Exercise = {
  candles: Candle[];
  options: string[];
  answer: number;
  context: string;
  explanation: string;
};

const EXERCISES: Exercise[] = [
  {
    candles: [
      { o: 70, h: 76, l: 44, c: 48 },
      { o: 50, h: 55, l: 20, c: 24 },
      { o: 26, h: 34, l: 8, c: 30 },
    ],
    options: ["Doji", "Hammer", "Shooting star", "Marubozu"],
    answer: 1,
    context: "After a decline, at a daily support zone.",
    explanation:
      "Small body at the TOP of the range with a lower wick ≥ 2× body — sellers pushed down, buyers took it back. At support after a decline, the hammer read applies (confirm before acting).",
  },
  {
    candles: [
      { o: 24, h: 66, l: 18, c: 60 },
      { o: 58, h: 92, l: 52, c: 88 },
      { o: 86, h: 90, l: 60, c: 66 },
    ],
    options: ["Inverted hammer", "Shooting star", "Bullish engulfing", "Doji"],
    answer: 1,
    context: "After a two-candle advance, right at a resistance zone.",
    explanation:
      "Small body at the BOTTOM with an upper wick ≥ 2× body: buyers stretched price up, sellers closed it back near the open. After an advance at resistance — shooting star (potential bearish turn).",
  },
  {
    candles: [
      { o: 62, h: 68, l: 40, c: 44 },
      { o: 46, h: 50, l: 30, c: 34 },
      { o: 36, h: 72, l: 34, c: 68 },
    ],
    options: ["Hammer", "Morning star", "Bullish engulfing", "Three white soldiers"],
    answer: 2,
    context: "At the end of a pullback, holding a higher low.",
    explanation:
      "The second body fully swallows the first: buyers erased the whole prior period. Coverage + location at the higher low = bullish engulfing read.",
  },
  {
    candles: [
      { o: 52, h: 60, l: 44, c: 56 },
      { o: 54, h: 62, l: 46, c: 53 },
      { o: 55, h: 61, l: 47, c: 52 },
    ],
    options: ["Three black crows", "Strong uptrend", "Range churn — no signal", "Evening star"],
    answer: 2,
    context: "Mid-range, overlapping closes, no level nearby.",
    explanation:
      "Small overlapping bodies with wicks both sides: indecision churn. The context rule says this is noise — no level, no structure, no trade.",
  },
  {
    candles: [
      { o: 80, h: 88, l: 40, c: 44 },
      { o: 44, h: 52, l: 36, c: 45 },
      { o: 48, h: 86, l: 44, c: 82 },
    ],
    options: ["Three inside up", "Bullish engulfing", "Morning star", "Piercing line"],
    answer: 2,
    context: "After a sharp decline into weekly support.",
    explanation:
      "Strong bearish candle → small-bodied equilibrium → strong bullish close deep into the first body. The middle candle is the story: the sell-off stalled. Morning star.",
  },
];

function IdentifyPattern() {
  const [index, setIndex] = React.useState(0);
  const [choice, setChoice] = React.useState<number | null>(null);
  const [score, setScore] = React.useState({ right: 0, total: 0 });

  const exercise = EXERCISES[index];
  const answered = choice !== null;
  const correct = choice === exercise.answer;

  const pick = (optionIndex: number) => {
    if (answered) return;
    setChoice(optionIndex);
    setScore((prev) => ({
      right: prev.right + (optionIndex === exercise.answer ? 1 : 0),
      total: prev.total + 1,
    }));
  };

  const next = () => {
    setChoice(null);
    setIndex((value) => (value + 1) % EXERCISES.length);
  };

  return (
    <section
      aria-label="Identify the pattern"
      className="rounded-xl border border-border bg-surface p-4 sm:p-5"
      data-testid="practice-identify"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <Dumbbell className="size-4 text-accent" aria-hidden="true" />
          Identify the pattern
        </p>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {score.right}/{score.total} drilled · shape {index + 1} of {EXERCISES.length}
        </p>
      </div>

      <p className="mt-3 rounded-lg border border-border bg-background/40 px-3 py-2 font-mono text-xs text-muted-foreground">
        Context: {exercise.context}
      </p>

      <div className="mt-3 flex justify-center">
        <CandleSvg candles={exercise.candles} height={185} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {exercise.options.map((option, optionIndex) => {
          const isAnswer = optionIndex === exercise.answer;
          const isChosen = choice === optionIndex;
          return (
            <button
              key={option}
              type="button"
              onClick={() => pick(optionIndex)}
              disabled={answered}
              aria-pressed={isChosen}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors",
                !answered &&
                  "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                answered && isAnswer && "border-profit/60 bg-profit/10 text-foreground",
                answered && isChosen && !isAnswer && "border-loss/60 bg-loss/10 text-foreground",
                answered && !isChosen && !isAnswer && "border-border text-muted-foreground/60",
              )}
            >
              {answered && isAnswer ? (
                <CheckCircle2 className="size-4 shrink-0 text-profit" aria-hidden="true" />
              ) : answered && isChosen ? (
                <XCircle className="size-4 shrink-0 text-loss" aria-hidden="true" />
              ) : null}
              {option}
            </button>
          );
        })}
      </div>

      {answered ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p
            className={cn(
              "max-w-xl text-xs leading-relaxed",
              correct ? "text-profit" : "text-loss",
            )}
          >
            {correct ? "Correct — " : "Not this one — "}
            {exercise.explanation}
          </p>
          <Button variant="outline" size="sm" onClick={next}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Next shape
          </Button>
        </div>
      ) : null}
    </section>
  );
}

// ── Candle simulator ────────────────────────────────────────────────────────

function candleRead(c: Candle): { tone: string; body: string } {
  const range = c.h - c.l || 1;
  const body = Math.abs(c.c - c.o);
  const upper = c.h - Math.max(c.o, c.c);
  const lower = Math.min(c.o, c.c) - c.l;
  const bull = c.c >= c.o;
  if (body / range < 0.08) {
    return { tone: "Doji — equilibrium", body: "Open and close are virtually equal: the period ended in a draw. Wait for the next candle or a level to speak." };
  }
  if (lower > body * 2 && upper < body) {
    return { tone: bull ? "Hammer shape" : "Inverted pressure", body: "A long lower wick says the lows were rejected — buyers took price back. Location (support?) decides whether the read means anything." };
  }
  if (upper > body * 2 && lower < body) {
    return { tone: "Shooting-star shape", body: "A long upper wick says the highs were rejected — sellers closed price back down. After an advance at resistance, treat it as a warning." };
  }
  if (body / range > 0.85) {
    return { tone: bull ? "Marubozu — conviction" : "Marubozu — conviction", body: `Full body, no meaningful wicks: one side controlled the whole period. ${bull ? "Buyers" : "Sellers"} owned it.` };
  }
  return { tone: bull ? "Ordinary bullish candle" : "Ordinary bearish candle", body: `Modest wicks: ${bull ? "buyers" : "sellers"} led without extreme rejection. Read it with the candles around it.` };
}

const PRESETS: Array<{ name: string; candle: Candle }> = [
  { name: "Doji", candle: { o: 50, h: 74, l: 26, c: 51 } },
  { name: "Hammer", candle: { o: 70, h: 78, l: 10, c: 76 } },
  { name: "Shooting star", candle: { o: 30, h: 92, l: 24, c: 26 } },
  { name: "Marubozu", candle: { o: 12, h: 88, l: 10, c: 86 } },
];

function CandleSimulator() {
  const [open, setOpen] = React.useState(50);
  const [high, setHigh] = React.useState(78);
  const [low, setLow] = React.useState(22);
  const [close, setClose] = React.useState(70);

  const hi = Math.max(high, open, close);
  const lo = Math.min(low, open, close);
  const candle: Candle = { o: open, h: hi, l: lo, c: close };
  const read = candleRead({ ...candle, h: hi, l: lo });

  const slider = (label: string, value: number, setValue: (v: number) => void, min: number, max: number) => (
    <label className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
      <span className="w-10 shrink-0 uppercase tracking-widest">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        className="h-1.5 flex-1 accent-[var(--accent)]"
        aria-label={`${label} price`}
      />
      <span className="w-8 shrink-0 text-right tabular-nums text-foreground">{value}</span>
    </label>
  );

  return (
    <section
      aria-label="Candle simulator"
      className="rounded-xl border border-border bg-surface p-4 sm:p-5"
      data-testid="practice-simulator"
    >
      <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <SlidersHorizontal className="size-4 text-accent" aria-hidden="true" />
        Candle simulator
      </p>

      <div className="mt-4 grid items-center gap-5 sm:grid-cols-2">
        <div className="flex justify-center rounded-lg border border-border bg-background/40 p-3">
          <CandleSvg candles={[candle]} height={200} />
        </div>
        <div className="space-y-2.5">
          {slider("O", open, setOpen, 5, 95)}
          {slider("H", high, setHigh, 5, 95)}
          {slider("L", low, setLow, 5, 95)}
          {slider("C", close, setClose, 5, 95)}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  setOpen(preset.candle.o);
                  setHigh(preset.candle.h);
                  setLow(preset.candle.l);
                  setClose(preset.candle.c);
                }}
                className="rounded-md border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-background/40 px-3.5 py-3">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
          {read.tone}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{read.body}</p>
      </div>
    </section>
  );
}

// ── Pattern library — the full candle vocabulary ──────────────────────────

const BIAS_FILTERS = [
  { key: "all", label: "All biases" },
  { key: "bullish", label: "Bullish" },
  { key: "bearish", label: "Bearish" },
  { key: "neutral", label: "Neutral" },
] as const;

const GROUP_FILTERS = [
  { key: "all", label: "All shapes" },
  { key: "1", label: "1 candle" },
  { key: "2", label: "2 candles" },
  { key: "3", label: "3+ candles" },
] as const;

type BiasKey = (typeof BIAS_FILTERS)[number]["key"];
type GroupKey = (typeof GROUP_FILTERS)[number]["key"];

const BIAS_CHIP: Record<PatternBias, string> = {
  bullish: "border-profit/40 bg-profit/10 text-profit",
  bearish: "border-loss/40 bg-loss/10 text-loss",
  neutral: "border-warning/40 bg-warning/10 text-warning",
};

function FilterChip({
  active,
  label,
  onClick,
  testid,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  testid: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testid}
      className={cn(
        "rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors",
        active
          ? "border-foreground/50 bg-foreground/10 text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function PatternCard({
  pattern,
  open,
  onToggle,
}: {
  pattern: PatternEntry;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="min-w-0 rounded-xl border border-border bg-surface"
      data-testid="pattern-card"
      data-pattern={pattern.id}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 pt-3.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold tracking-tight text-foreground">
          {pattern.name}
        </span>
        <span
          className={cn(
            "rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest",
            BIAS_CHIP[pattern.bias],
          )}
        >
          {pattern.bias}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <p className="px-3.5 pt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
        {pattern.group} · {pattern.type}
      </p>
      <div className="px-3 pb-2 pt-2">
        <CandleSvg candles={pattern.candles} height={110} />
      </div>
      {open ? (
        <div
          className="space-y-3 border-t border-border px-3.5 py-3.5"
          data-testid="pattern-read"
        >
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
              What it says
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/90">
              {pattern.read}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
              Where it counts
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/90">
              {pattern.context}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
              Confirmation
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/90">
              {pattern.confirm}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PatternLibrary() {
  const [query, setQuery] = React.useState("");
  const [bias, setBias] = React.useState<BiasKey>("all");
  const [group, setGroup] = React.useState<GroupKey>("all");
  const [openIds, setOpenIds] = React.useState<Set<string>>(new Set());

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PATTERN_LIBRARY.filter((pattern) => {
      if (needle !== "" && !pattern.name.toLowerCase().includes(needle)) {
        return false;
      }
      if (bias !== "all" && pattern.bias !== bias) return false;
      if (group === "1" && pattern.count !== 1) return false;
      if (group === "2" && pattern.count !== 2) return false;
      if (group === "3" && pattern.count < 3) return false;
      return true;
    });
  }, [query, bias, group]);

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <section
      aria-label="Pattern library"
      className="rounded-xl border border-border bg-surface p-4 sm:p-5"
      data-testid="practice-library"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <Library className="size-4 text-accent" aria-hidden="true" />
          Pattern library
        </p>
        <p
          className="font-mono text-xs tabular-nums text-muted-foreground"
          data-testid="pattern-count"
        >
          {filtered.length} of {PATTERN_LIBRARY.length} patterns
        </p>
      </div>

      <div className="mt-3 max-w-md">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a pattern (hammer, star, harami… )"
            aria-label="Search the pattern library"
            data-testid="pattern-search"
            className="pl-9"
          />
        </div>
      </div>

      <div
        className="mt-2.5 flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Filter by bias"
      >
        {BIAS_FILTERS.map((filter) => (
          <FilterChip
            key={filter.key}
            active={bias === filter.key}
            label={filter.label}
            testid={`pattern-bias-${filter.key}`}
            onClick={() => setBias(filter.key)}
          />
        ))}
      </div>
      <div
        className="mt-1.5 flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Filter by structure"
      >
        {GROUP_FILTERS.map((filter) => (
          <FilterChip
            key={filter.key}
            active={group === filter.key}
            label={filter.label}
            testid={`pattern-group-${filter.key}`}
            onClick={() => setGroup(filter.key)}
          />
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {filtered.map((pattern) => (
            <PatternCard
              key={pattern.id}
              pattern={pattern}
              open={openIds.has(pattern.id)}
              onToggle={() => toggle(pattern.id)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-background/40 px-4 py-8 text-center">
          <p className="font-heading text-base font-semibold">No pattern matches</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a shorter query — the library reads pattern names only.
          </p>
        </div>
      )}

      <p className="mt-4 text-xs italic leading-relaxed text-muted-foreground/70">
        A pattern is vocabulary, not a verdict: no shape is a trade until
        location, structure and confirmation agree — and even then the
        outcome stays probabilistic.
      </p>
    </section>
  );
}

export function PracticeView() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6" data-testid="academy-practice">
      <header className="space-y-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Academy
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Practice
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Drills, a simulator and the full candle vocabulary: read patterns
          with their context, build candles by hand, and browse every
          classical formation until anatomy is reflex. Grading stays with the
          course quizzes — this room is for repetitions.
        </p>
      </header>
      <IdentifyPattern />
      <CandleSimulator />
      <PatternLibrary />
    </div>
  );
}
