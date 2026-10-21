"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Check, Lock, ShieldCheck, X } from "lucide-react";
import { formatDuration, type Grade, type Instrument, type RevealPayload, type Strategy, type Trade } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  useDecision,
  useInstruments,
  useStrategies,
  useTrades,
} from "@/lib/api/queries";
import { isoToLocalInput } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";
import { closeJudgmentFlow, type GateDecision } from "@/lib/hooks/use-judgment-flow";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * ACT 2 — The Judgment Gate (trade-entry-ux.md §5, the signature moment).
 * The user grades the DECISION — based only on what was known at entry —
 * before any result exists in the UI. The component receives a tradeId and
 * fetches context only: it structurally CANNOT show P&L, because the create
 * response never carried it and the reveal payload only arrives after this
 * gate is submitted (hard API contract, §13).
 */

// Grade letters stay raw (display + keyboard 1–5 mapping below); the hint
// words resolve through dict.trades.reveal.gradeTag at render time.
const GRADE_OPTIONS: readonly Grade[] = ["A", "B", "C", "D", "F"];

const GRADE_BY_KEY: Record<string, Grade> = {
  "1": "A",
  "2": "B",
  "3": "C",
  "4": "D",
  "5": "F",
};

export interface JudgmentGateProps {
  tradeId: string;
  /** Called with the reveal payload once the decision POST succeeds. */
  onGraded: (reveal: RevealPayload, decision: GateDecision) => void;
}

export function JudgmentGate({ tradeId, onGraded }: JudgmentGateProps) {
  const { dict } = useI18n();
  const T = dict.trades;
  const { data: tradesData } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const { data: strategiesData } = useStrategies();
  const decision = useDecision();

  const trade: Trade | undefined = tradesData?.trades.find((item) => item.id === tradeId);
  const instruments: Instrument[] = instrumentsData?.instruments ?? [];
  const strategies: Strategy[] = strategiesData?.strategies ?? [];
  const instrument = instruments.find((item) => item.id === trade?.instrumentId);
  const strategy = strategies.find((item) => item.id === trade?.strategyId);

  const [followedPlan, setFollowedPlan] = React.useState<boolean | null>(null);
  const [grade, setGrade] = React.useState<Grade | null>(null);
  const ready = followedPlan !== null && grade !== null;
  const pending = decision.isPending;

  // Keyboard-first grading (spec §4): 1–5 select the grade, Enter submits,
  // Esc closes the modal (= grade later, handled by the flow host).
  const submitRef = React.useRef<() => void>(() => {});
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
      const mapped = GRADE_BY_KEY[event.key];
      if (mapped !== undefined) {
        event.preventDefault();
        setGrade(mapped);
      } else if (event.key === "Enter") {
        event.preventDefault();
        submitRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const submit = () => {
    if (!ready || pending) return;
    const chosen: GateDecision = { grade: grade!, followedPlan: followedPlan! };
    decision.mutate(
      { tradeId, input: { grade: chosen.grade, followedPlan: chosen.followedPlan } },
      {
        onSuccess: (reveal) => {
          // The response IS the reveal payload — the only P&L carrier in the
          // app (§13). Hand it up; the host advances to the Reveal stage.
          onGraded(reveal, chosen);
        },
      },
    );
  };

  // Keep the hotkey handler's ref pointed at the latest submit — assigned
  // post-commit (effects), never during render.
  React.useEffect(() => {
    submitRef.current = submit;
  });

  return (
    <div className="space-y-5" data-testid="judgment-gate">
      {/* Context strip — entry-time facts ONLY. No exit reason, no P&L. */}
      <div
        className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2.5 font-mono text-xs text-muted-foreground"
        data-testid="gate-context"
      >
        <span className="font-semibold text-foreground">{instrument?.symbol ?? "—"}</span>
        <span
          className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-semibold text-foreground"
        >
          {trade?.direction === "SELL" ? (
            <ArrowDownRight className="size-3" aria-hidden="true" />
          ) : (
            <ArrowUpRight className="size-3" aria-hidden="true" />
          )}
          {trade?.direction ?? "—"}
        </span>
        <span aria-hidden="true">·</span>
        <span>{strategy?.name ?? T.shared.outOfPlaybook}</span>
        {trade !== undefined ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{T.judgment.entryPrefix} {isoToLocalInput(trade.entryAt).replace("T", " ")}</span>
            {trade.exitAt !== null ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatDuration(trade.entryAt, trade.exitAt)} {T.judgment.inPosition}</span>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Step 1 — plan adherence */}
      <section className="space-y-2.5" aria-labelledby="gate-plan-question">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="gate-plan-question" className="font-heading text-base font-semibold text-foreground">
            <span className="mr-2 inline-grid size-5 place-items-center rounded-full bg-accent align-middle font-mono text-[11px] font-bold text-accent-foreground">1</span>
            {T.judgment.planQuestion}
          </h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{T.judgment.binaryCheck}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-labelledby="gate-plan-question">
          <PlanCard
            selected={followedPlan === true}
            onSelect={() => setFollowedPlan(true)}
            icon={<Check className="size-5" aria-hidden="true" />}
            title={T.judgment.planYes}
            description={T.judgment.planYesDesc}
          />
          <PlanCard
            selected={followedPlan === false}
            onSelect={() => setFollowedPlan(false)}
            icon={<X className="size-5" aria-hidden="true" />}
            title={T.judgment.planNo}
            description={T.judgment.planNoDesc}
          />
        </div>
      </section>

      {/* Step 2 — decision grade, blind to the result */}
      <section className="space-y-2.5" aria-labelledby="gate-grade-question">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="gate-grade-question" className="font-heading text-base font-semibold text-foreground">
            <span className="mr-2 inline-grid size-5 place-items-center rounded-full bg-accent align-middle font-mono text-[11px] font-bold text-accent-foreground">2</span>
            {T.judgment.gradeQuestion}
          </h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{T.judgment.keysHint}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {T.judgment.blind}
        </p>
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-labelledby="gate-grade-question">
          {GRADE_OPTIONS.map((option) => {
            const selected = grade === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${T.shared.gradeWord} ${option} — ${T.reveal.gradeTag[option]}`}
                onClick={() => setGrade(option)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg border py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-foreground hover:border-accent/60",
                )}
              >
                <span className="font-heading text-2xl font-bold leading-none">{option}</span>
                <span className={cn("text-[10px]", selected ? "text-accent-foreground/80" : "text-muted-foreground")}>
                  {T.reveal.gradeTag[option]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Submit — the grade locks BEFORE the outcome exists */}
      <Button type="button" onClick={submit} disabled={!ready || pending} className="h-11 w-full text-sm font-semibold">
        <Lock className="size-4" aria-hidden="true" />
        {pending ? T.judgment.sealing : T.judgment.lockGrade}
        <kbd className="ml-1.5 rounded-sm bg-accent-foreground/10 px-1 font-mono text-[10px]">⏎</kbd>
      </Button>

      {/* Discreet skip — one click, but it must be sought (§5) */}
      <div className="text-center">
        <button
          type="button"
          onClick={closeJudgmentFlow}
          data-testid="gate-skip"
          className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {T.judgment.skip}
        </button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center font-mono text-[11px] text-muted-foreground">
        <ShieldCheck className="size-3.5 text-accent" aria-hidden="true" />
        {T.judgment.sealed}
      </p>
    </div>
  );
}

function PlanCard({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-accent/60",
      )}
    >
      <span className="flex w-full items-center justify-between">
        <span
          className={cn(
            "flex items-center gap-1.5 font-heading text-sm font-semibold",
            selected ? "text-accent" : "text-foreground",
          )}
        >
          {icon}
          {title}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "size-3.5 rounded-full border",
            selected ? "border-accent bg-accent" : "border-muted-foreground/50",
          )}
        />
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
