"use client";

import * as React from "react";
import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import {
  formatDuration,
  formatR,
  formatSignedMoney,
  parseDecimal,
  type Currency,
  type Grade,
  type Instrument,
  type RevealPayload,
  type Trade,
} from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { useInstruments, useStrategies, useTrades } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import { sizeUnitLabel } from "@/lib/utils/instrument";
import { closeJudgmentFlow, revealFinished } from "@/lib/hooks/use-judgment-flow";
import { openTradeModal, type TradeContextSeed } from "@/lib/hooks/use-trade-modal";
import { setRevealAnimation, useRevealAnimation } from "@/lib/utils/preferences";

/**
 * The Reveal (trade-entry-ux.md §5) — the signature moment AFTER the grade.
 * Everything arrives in one RevealPayload from POST /trades/:id/decision
 * (the only P&L carrier in the app). Coaching copy is the 4-quadrant matrix,
 * VERBATIM — it is product copy, not to be reworded.
 */

/** Coaching matrix — Win/Loss × Decision(A/B|D/F), VERBATIM product copy. */
const COACHING_COPY: Record<string, string> = {
  win_ab: "Solid process, deserved result.",
  loss_ab: "Good decision, unfavorable outcome — nothing to fix.",
  win_df: "Lucky gain — this result does not reinforce the habit.",
  loss_df: "The process failed, not luck.",
};

const GRADE_TAG: Record<Grade, string> = {
  A: "Exemplary",
  B: "Solid",
  C: "Average",
  D: "Sloppy",
  F: "Impulsive",
};

/** Build the fast-loop seed from the revealed trade (spec §7). */
function seedFromTrade(trade: Trade): TradeContextSeed {
  return {
    instrumentId: trade.instrumentId,
    direction: trade.direction,
    strategyId: trade.strategyId,
    outOfPlaybook: trade.strategyId === null,
    emotionBefore: trade.emotionBefore,
    entryAtISO: trade.exitAt ?? trade.entryAt,
  };
}

export interface RevealProps {
  reveal: RevealPayload;
  currency: Currency;
  decision: { grade: Grade; followedPlan: boolean };
}

export function Reveal({ reveal, currency, decision }: RevealProps) {
  const { data: tradesData } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const { data: strategiesData } = useStrategies();
  const animationEnabled = useRevealAnimation();

  const trade = tradesData?.trades.find((item) => item.id === reveal.tradeId) ?? null;
  const instrument: Instrument | undefined = instrumentsData?.instruments.find(
    (item) => item.id === trade?.instrumentId,
  );
  const strategy = strategiesData?.strategies.find((item) => item.id === trade?.strategyId);

  const rValue = parseDecimal(reveal.rMultiple) ?? 0;
  const win = rValue >= 0;

  // Animation guard: ≤ 500 ms per spec, skippable (any key / click), and
  // disable-able from the preferences toggle right on this screen. The
  // initial state already matches the preference (client-only render); the
  // effect only owns the auto-stop timer.
  const [animated, setAnimated] = React.useState(animationEnabled);
  React.useEffect(() => {
    if (!animationEnabled) return;
    const timer = window.setTimeout(() => setAnimated(false), 500);
    return () => window.clearTimeout(timer);
  }, [animationEnabled]);
  const playing = animated && animationEnabled;

  // Skippable: any key or click ends the animation immediately.
  React.useEffect(() => {
    if (!animated) return;
    const skip = () => setAnimated(false);
    document.addEventListener("keydown", skip);
    document.addEventListener("pointerdown", skip);
    return () => {
      document.removeEventListener("keydown", skip);
      document.removeEventListener("pointerdown", skip);
    };
  }, [animated]);

  const newTrade = React.useCallback(() => {
    closeJudgmentFlow();
    openTradeModal(trade !== null ? seedFromTrade(trade) : null);
  }, [trade]);

  // Fast loop keys (§7): Enter = finish → Reflect, N = new trade.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        revealFinished();
      } else if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        newTrade();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [newTrade]);

  const coaching = COACHING_COPY[reveal.coachingKey] ?? COACHING_COPY.loss_ab!;
  const durationText =
    trade !== null ? formatDuration(trade.entryAt, trade.exitAt ?? trade.entryAt) : "—";
  const animClass = (enabled: boolean) => (playing && enabled ? "animate-reveal-fade-up" : "");

  return (
    <div className="space-y-5" data-testid="reveal">
      {/* The star — subtle constellation motif (mockup: the_reveal) */}
      <div className="flex flex-col items-center gap-3">
        <RevealStar animated={animationEnabled} />
        <div className="flex flex-wrap items-center justify-center gap-1.5 font-mono text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{instrument?.symbol ?? "—"}</span>
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-semibold text-foreground">
            {trade?.direction ?? "—"}
          </span>
          <span aria-hidden="true">·</span>
          <span>{durationText}</span>
          <span aria-hidden="true">·</span>
          <span>{strategy?.name ?? "Out of playbook"}</span>
          {trade !== null ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {trade.quantity} {instrument !== undefined ? sizeUnitLabel(instrument.assetClass) : ""}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* Large mono result — the ONLY place P&L exists, profit/loss colors */}
      <div className={`text-center ${animClass(true)}`} data-testid="reveal-result">
        <p
          className={cn(
            "font-mono text-5xl font-bold tracking-tight tabular-nums",
            win ? "text-profit" : "text-loss",
          )}
        >
          {formatR(reveal.rMultiple)}
        </p>
        <p
          className={cn(
            "mt-1 font-mono text-lg font-medium tabular-nums",
            win ? "text-profit" : "text-loss",
          )}
        >
          {formatSignedMoney(reveal.pnlNet, currency, { digits: 2 })} net
        </p>
      </div>

      {/* Behavioral guardian — coaching line from the 4-quadrant matrix */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
            Coaching
          </span>
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
            Grade {decision.grade} · {GRADE_TAG[decision.grade]}
          </span>
        </div>
        <p className="font-heading text-sm italic text-foreground" data-testid="reveal-coaching">
          “{coaching}”
        </p>
      </div>

      {/* Stats strip — Discipline Saved today (server-computed) */}
      <div className="grid grid-cols-2 gap-2.5" data-testid="reveal-stats">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {win ? <TrendingUp className="size-3.5" aria-hidden="true" /> : <TrendingDown className="size-3.5" aria-hidden="true" />}
            Setups avoided today
          </p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
            {reveal.savedSetupsToday}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">R saved</p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-profit">
            {reveal.savedRToday !== null ? formatR(reveal.savedRToday) : "—"}
          </p>
        </div>
      </div>

      {/* Actions — fast loop: Enter finishes, N opens a pre-filled trade */}
      <div className="grid grid-cols-2 gap-2.5">
        <Button type="button" variant="outline" onClick={newTrade} className="h-11">
          New trade
          <kbd className="ml-1.5 rounded-sm bg-muted px-1 font-mono text-[10px]">N</kbd>
        </Button>
        <Button type="button" onClick={revealFinished} className="h-11">
          Finish
          <kbd className="ml-1.5 rounded-sm bg-accent-foreground/10 px-1 font-mono text-[10px]">⏎</kbd>
        </Button>
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setRevealAnimation(!animationEnabled)}
          data-testid="reveal-animation-toggle"
          className="font-mono text-[11px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Star animation: {animationEnabled ? "on" : "off"} (settings)
        </button>
      </div>
    </div>
  );
}

/**
 * Constellation star — 5 glowing nodes + connections (CSS/SVG only). The
 * motif stays in the ACCENT color for every outcome (golden rule: green/red
 * are reserved for P&L text — the constellation is UI, the R/P&L line is
 * the verdict). Purely celebratory: no result hint in the motif itself.
 */
function RevealStar({ animated }: { animated: boolean }) {
  const nodes: readonly { x: number; y: number }[] = [
    { x: 60, y: 14 },
    { x: 104, y: 46 },
    { x: 87, y: 98 },
    { x: 33, y: 98 },
    { x: 16, y: 46 },
  ];
  const center = { x: 60, y: 58 };
  const links: readonly [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 0],
  ];
  const color = "text-accent";

  return (
    <svg
      viewBox="0 0 120 112"
      role="img"
      aria-label="Reveal constellation"
      className={cn("size-28", color, animated ? "animate-reveal-star" : "")}
      style={{ filter: "drop-shadow(0 0 14px currentColor)" }}
    >
      {links.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={nodes[a]!.x}
          y1={nodes[a]!.y}
          x2={nodes[b]!.x}
          y2={nodes[b]!.y}
          stroke="currentColor"
          strokeWidth={1.2}
          opacity={0.55}
        />
      ))}
      {links.map(([a, b]) => (
        <line
          key={`c-${a}-${b}`}
          x1={(nodes[a]!.x + center.x) / 2}
          y1={(nodes[a]!.y + center.y) / 2}
          x2={center.x}
          y2={center.y}
          stroke="currentColor"
          strokeWidth={0.8}
          opacity={0.3}
        />
      ))}
      {nodes.map((node, index) => (
        <circle key={index} cx={node.x} cy={node.y} r={4.5} fill="currentColor" opacity={0.95} />
      ))}
      <circle cx={center.x} cy={center.y} r={6} fill="currentColor" />
    </svg>
  );
}
