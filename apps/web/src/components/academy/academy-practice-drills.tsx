"use client";

import * as React from "react";
import { CheckCircle2, Layers, Ruler, RotateCcw, TrendingUp, X } from "lucide-react";

import type { AcademyCandle } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAcademyPositionDrill, useAcademySrDrill, useAcademyZoneDrill, useLogPractice } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Engine-generated drills - support/resistance reading, position sizing
 * arithmetic, supply/demand zone identification. Charts are drawn from the
 * engine's candle data; levels and bands are annotated in the ledger chart
 * language (token inks, hairline grid, mono tags).
 */

// ── Shared candle chart with overlays ───────────────────────────────────────

function candleGeometry(candles: AcademyCandle[], width: number, height: number) {
  const pad = 14;
  const max = Math.max(...candles.map((candle) => candle.h));
  const min = Math.min(...candles.map((candle) => candle.l));
  const span = max - min || 1;
  const slot = (width - pad * 2) / candles.length;
  const bodyWidth = Math.min(slot * 0.62, 26);
  const yOf = (price: number) => pad + (1 - (price - min) / span) * (height - pad * 2);
  return { pad, slot, bodyWidth, yOf, width, height };
}

function CandleChart({
  candles,
  width = 300,
  height = 170,
  level,
  bands,
  answered,
}: {
  candles: AcademyCandle[];
  width?: number;
  height?: number;
  level?: number;
  bands?: { top: number; bottom: number; tag: string }[];
  /** After answering, bands reveal their identity by ink. */
  answered?: { demandTags: string[] } | null;
}) {
  const { pad, slot, bodyWidth, yOf, width: w } = candleGeometry(candles, width, height);
  const { dict } = useI18n();

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={dict.academy.drills.chartAria}
      style={{ width: "100%", height: "auto", maxWidth: width }}
    >
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={pad}
          x2={width - pad}
          y1={pad + t * (height - pad * 2)}
          y2={pad + t * (height - pad * 2)}
          style={{ stroke: "var(--border)", strokeWidth: 0.5, strokeDasharray: "3 4" }}
        />
      ))}

      {bands?.map((band) => {
        const y1 = yOf(band.top);
        const y2 = yOf(band.bottom);
        const isDemand = answered?.demandTags.includes(band.tag);
        const isSupply = answered && !answered.demandTags.includes(band.tag);
        return (
          <g key={band.tag}>
            <rect
              x={pad}
              y={y1}
              width={w - pad * 2}
              height={Math.max(y2 - y1, 3)}
              style={{
                fill: isDemand ? "var(--profit)" : isSupply ? "var(--loss)" : "var(--accent)",
                opacity: answered ? 0.14 : 0.1,
              }}
            />
            <text
              x={pad + 4}
              y={y1 + 11}
              style={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700 }}
            >
              BAND {band.tag}
            </text>
          </g>
        );
      })}

      {level !== undefined ? (
        <g>
          <line
            x1={pad}
            x2={width - pad}
            y1={yOf(level)}
            y2={yOf(level)}
            style={{ stroke: "var(--warning)", strokeWidth: 1.2, strokeDasharray: "6 4" }}
          />
          <text
            x={width - pad - 2}
            y={yOf(level) - 4}
            textAnchor="end"
            style={{ fill: "var(--warning)", fontSize: 9, fontFamily: "var(--font-mono)", fontWeight: 600 }}
          >
            LEVEL
          </text>
        </g>
      ) : null}

      {candles.map((candle, index) => {
        const x = pad + slot * index + slot / 2;
        const bullish = candle.c >= candle.o;
        const color = bullish ? "var(--profit)" : "var(--loss)";
        const bodyTop = yOf(Math.max(candle.o, candle.c));
        const bodyBottom = yOf(Math.min(candle.o, candle.c));
        return (
          <g key={index}>
            <line x1={x} x2={x} y1={yOf(candle.h)} y2={yOf(candle.l)} style={{ stroke: color, strokeWidth: 1.4 }} />
            <rect
              x={x - bodyWidth / 2}
              y={bodyTop}
              width={bodyWidth}
              height={Math.max(bodyBottom - bodyTop, 1.6)}
              rx={1}
              style={{ fill: bullish ? "transparent" : color, stroke: color, strokeWidth: 1.4 }}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ── Shared option buttons (server-graded reveal) ───────────────────────────

function DrillOptions({
  options,
  answer,
  choice,
  onChoose,
  testid,
}: {
  options: { id: string; label: string }[];
  answer: number;
  choice: number | null;
  onChoose: (index: number) => void;
  testid: string;
}) {
  const answered = choice !== null;
  return (
    <div className="mt-3 space-y-1.5" data-testid={testid}>
      {options.map((option, index) => {
        const state = !answered ? "idle" : index === answer ? "correct" : index === choice ? "wrong" : "dim";
        return (
          <button
            key={option.id}
            type="button"
            disabled={answered}
            onClick={() => onChoose(index)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
              state === "idle" && "border-border bg-surface hover:bg-muted",
              state === "correct" && "border-profit/50 bg-profit/10",
              state === "wrong" && "border-loss/50 bg-loss/10",
              state === "dim" && "border-border bg-surface opacity-50",
            )}
          >
            {option.label}
            {state === "correct" ? <CheckCircle2 className="size-4 shrink-0 text-profit" aria-hidden="true" /> : null}
            {state === "wrong" ? <X className="size-4 shrink-0 text-loss" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function DrillExplanation({ correct, text }: { correct: boolean; text: string }) {
  return (
    <div className="mt-3 space-y-2.5" data-testid="academy-drill-feedback">
      <p className={cn("rounded-md border px-3 py-2.5 text-xs leading-relaxed", correct ? "border-profit/40 bg-profit/5" : "border-loss/40 bg-loss/5")}>
        {text}
      </p>
    </div>
  );
}

function DrillNextButton({ onNext, label }: { onNext: () => void; label: string }) {
  return (
    <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={onNext} data-testid="academy-drill-next">
      <RotateCcw className="size-3.5" aria-hidden="true" />
      {label}
    </Button>
  );
}

// ── Support / Resistance drill ──────────────────────────────────────────────

export function SrDrill() {
  const drillQuery = useAcademySrDrill();
  const logPractice = useLogPractice();
  const [choice, setChoice] = React.useState<number | null>(null);
  const [round, setRound] = React.useState(0);
  const { dict } = useI18n();
  const V = dict.academy.drills;
  const drill = drillQuery.data;
  const answered = choice !== null && drill !== null;

  const next = () => {
    setChoice(null);
    setRound((prev) => prev + 1);
    void drillQuery.refetch();
  };

  return (
    <section aria-label={V.srAria} className="rounded-lg border bg-surface px-4 py-4 sm:px-5" data-testid="academy-sr-drill">
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
        <Ruler className="size-4 text-cat-ta" aria-hidden="true" />
        {V.srTitle}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{V.srDesc}</p>

      {drillQuery.isLoading || !drill ? (
        <Skeleton className="mt-3 h-48 w-full rounded-md" />
      ) : (
        <>
          <div className="chart-paper mx-auto mt-3 flex max-w-sm items-center justify-center rounded-md border border-border px-3 py-4">
            <CandleChart candles={drill.candles} level={drill.level} />
          </div>
          <p className="mt-2.5 text-sm font-medium">{drill.prompt}</p>
          <DrillOptions
            options={drill.options}
            answer={drill.answer}
            choice={choice}
            onChoose={(index) => {
              setChoice(index);
              logPractice.mutate({ drill: "SR_LEVEL", correct: index === drill.answer });
            }}
            testid="academy-sr-options"
          />
          {answered ? (
            <>
              <DrillExplanation correct={choice === drill.answer} text={drill.explanation} />
              <DrillNextButton onNext={next} label={V.nextLevel} />
            </>
          ) : null}
          <p className="mt-2 text-right font-mono text-[10px] text-muted-foreground">
            {V.roundPrefix}
            {round + 1}
          </p>
        </>
      )}
    </section>
  );
}

// ── Position sizing drill ───────────────────────────────────────────────────

export function PositionSizingDrill() {
  const drillQuery = useAcademyPositionDrill();
  const logPractice = useLogPractice();
  const [input, setInput] = React.useState("");
  const [result, setResult] = React.useState<{ correct: boolean; explanation: string } | null>(null);
  const [round, setRound] = React.useState(0);
  const { dict } = useI18n();
  const V = dict.academy.drills;
  const drill = drillQuery.data;

  const next = () => {
    setInput("");
    setResult(null);
    setRound((prev) => prev + 1);
    void drillQuery.refetch();
  };

  const submit = () => {
    if (!drill || input === "") return;
    const value = Number(input);
    const tolerance = drill.tolerance * Math.abs(drill.answer);
    const correct = Number.isFinite(value) && Math.abs(value - drill.answer) <= Math.max(tolerance, 1e-9);
    setResult({ correct, explanation: drill.explanation });
    logPractice.mutate({ drill: "POSITION_SIZE", correct });
  };

  return (
    <section aria-label={V.positionAria} className="rounded-lg border bg-surface px-4 py-4 sm:px-5" data-testid="academy-position-drill">
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
        <Ruler className="size-4 text-cat-risk" aria-hidden="true" />
        {V.positionTitle}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{V.positionDesc}</p>

      {drillQuery.isLoading || !drill ? (
        <Skeleton className="mt-3 h-28 w-full rounded-md" />
      ) : (
        <>
          <p className="mt-3 rounded-md border border-border bg-surface-raised px-3 py-2.5 font-mono text-xs leading-relaxed">{drill.prompt}</p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              disabled={result !== null}
              className="w-36 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              aria-label={V.positionInputAria}
              placeholder={drill.unit}
              data-testid="academy-position-input"
            />
            {result === null ? (
              <Button size="sm" variant="outline" onClick={submit} disabled={input === ""} data-testid="academy-position-submit">
                {V.check}
              </Button>
            ) : null}
          </div>
          {result ? (
            <>
              <p
                className={cn(
                  "mt-2.5 inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider",
                  result.correct ? "border-profit/40 bg-profit/10 text-profit" : "border-loss/40 bg-loss/10 text-loss",
                )}
                data-testid="academy-position-verdict"
              >
                {result.correct ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
                {result.correct ? V.withinBudget : V.outsideBudget}
              </p>
              <DrillExplanation correct={result.correct} text={result.explanation} />
              <DrillNextButton onNext={next} label={V.nextScenario} />
            </>
          ) : null}
          <p className="mt-2 text-right font-mono text-[10px] text-muted-foreground">
            {V.roundPrefix}
            {round + 1}
          </p>
        </>
      )}
    </section>
  );
}

// ── Supply / Demand zone drill ──────────────────────────────────────────────

export function ZoneDrill() {
  const drillQuery = useAcademyZoneDrill();
  const logPractice = useLogPractice();
  const [choice, setChoice] = React.useState<number | null>(null);
  const [round, setRound] = React.useState(0);
  const { dict } = useI18n();
  const V = dict.academy.drills;
  const drill = drillQuery.data;
  const answered = choice !== null && drill !== null;

  const next = () => {
    setChoice(null);
    setRound((prev) => prev + 1);
    void drillQuery.refetch();
  };

  return (
    <section aria-label={V.zoneAria} className="rounded-lg border bg-surface px-4 py-4 sm:px-5" data-testid="academy-zone-drill">
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
        <Layers className="size-4 text-cat-pa" aria-hidden="true" />
        {V.zoneTitle}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{V.zoneDesc}</p>

      {drillQuery.isLoading || !drill ? (
        <Skeleton className="mt-3 h-48 w-full rounded-md" />
      ) : (
        <>
          <div className="chart-paper mx-auto mt-3 flex max-w-sm items-center justify-center rounded-md border border-border px-3 py-4">
            <CandleChart
              candles={drill.candles}
              bands={drill.zones}
              answered={answered ? { demandTags: [drill.answer === 0 ? "A" : "B"] } : null}
            />
          </div>
          <p className="mt-2.5 text-sm font-medium">{drill.prompt}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <TrendingUp className="size-3" aria-hidden="true" />
            {drill.context}
          </p>
          <DrillOptions
            options={drill.options}
            answer={drill.answer}
            choice={choice}
            onChoose={(index) => {
              setChoice(index);
              logPractice.mutate({ drill: "ZONE_ID", correct: index === drill.answer });
            }}
            testid="academy-zone-options"
          />
          {answered ? (
            <>
              <DrillExplanation correct={choice === drill.answer} text={drill.explanation} />
              <DrillNextButton onNext={next} label={V.nextChart} />
            </>
          ) : null}
          <p className="mt-2 text-right font-mono text-[10px] text-muted-foreground">
            {V.roundPrefix}
            {round + 1}
          </p>
        </>
      )}
    </section>
  );
}
