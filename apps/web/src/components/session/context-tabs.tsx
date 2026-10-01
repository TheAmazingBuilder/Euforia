"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, CalendarClock, CheckCircle2, CloudUpload, FileDown, RotateCcw, Scale, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiErrorMessage } from "@/lib/api/client";
import { formatPrice } from "@cosmoz/shared";
import type {
  CreateSavedAnalysisInput,
  EcoEvent,
  IndicatorConfig,
  DrawingObject,
  KeyLevel,
  MarketBias,
  MarketInterval,
  SavedAnalysis,
  TradingSession,
} from "@cosmoz/shared";
import {
  useCreateNofyNote,
  useCreateSavedAnalysis,
  useDeleteSavedAnalysis,
  useEcoEvents,
  useRulesStatus,
  useSetups,
  useStrategies,
} from "@/lib/api/queries";
import { useNowMs } from "@/lib/realtime/use-now";
import { cn } from "@/lib/utils";

/**
 * Bottom context strip (§73 bottom band / Phases 9-11-12): Playbook context,
 * Rules Engine status, economic events and the Saved Analyses journal —
 * each fed by its canonical module. Read-only context everywhere: the
 * Playbook stays the source of truth, rules report factual status.
 */

// ── Playbook context (§25 — read-only, canonical data stays in Playbook) ────

function PlaybookTab({ initialStrategyId, initialSetupId }: { initialStrategyId: string | null; initialSetupId: string | null }) {
  const { data: strategiesData } = useStrategies();
  const { data: setupsData } = useSetups();
  const strategies = strategiesData?.strategies ?? [];
  const setups = setupsData?.setups ?? [];

  // Derived selection: user override wins; the session's strategy is the
  // default (no sync effect — setState-in-effect is forbidden here).
  const [override, setOverride] = React.useState<{ strategyId: string; setupId: string } | null>(null);
  const strategyId = override?.strategyId ?? initialStrategyId ?? "";
  const setupId = override?.setupId ?? initialSetupId ?? "";

  const strategy = strategies.find((item) => item.id === strategyId) ?? null;
  const setup = setups.find((item) => item.id === setupId) ?? null;
  const strategySetups = setups.filter((item) => item.strategyId === strategyId);

  const field = "rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent/60";

  return (
    <div className="space-y-3" data-testid="playbook-context">
      <div className="flex flex-wrap items-center gap-2">
        <select value={strategyId} onChange={(event) => { setOverride({ strategyId: event.target.value, setupId: "" }); }} aria-label="Strategy" data-testid="context-strategy-select" className={cn(field, "max-w-[220px] flex-1")}>
          <option value="">— Select a strategy —</option>
          {strategies.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <select value={setupId} onChange={(event) => setOverride({ strategyId, setupId: event.target.value })} aria-label="Setup" disabled={strategyId === ""} className={cn(field, "max-w-[220px] flex-1 disabled:opacity-50")}>
          <option value="">— Setup —</option>
          {strategySetups.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link href="/playbook">
            <BookOpen className="size-3.5" aria-hidden="true" />
            Open Playbook
          </Link>
        </Button>
      </div>

      {strategy === null ? (
        <p className="rounded-lg border border-border bg-surface-raised px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">
          Select a strategy to keep its entry conditions, invalidations and risk beside the chart. The canonical definition stays in the
          Playbook — Session Live only mirrors it read-only.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface-raised px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entry conditions</p>
            {(strategy.entryConditions ?? []).length === 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">Not specified in the Playbook.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {(strategy.entryConditions ?? []).map((condition) => (
                  <li key={condition.id} className="flex items-start gap-1.5 text-xs text-foreground">
                    <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-profit" aria-hidden="true" />
                    <span>
                      {condition.text}
                      {condition.group ? <span className="ml-1 text-[10px] text-muted-foreground">(group {condition.group})</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-border bg-surface-raised px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invalidation</p>
            {(strategy.invalidations ?? []).length === 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">Not specified in the Playbook.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {(strategy.invalidations ?? []).map((text, index) => (
                  <li key={index} className="flex items-start gap-1.5 text-xs text-foreground">
                    <TriangleAlert className="mt-0.5 size-3 shrink-0 text-warning" aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>
            )}
            {setup !== null ? <p className="mt-2 rounded bg-surface px-2 py-1 text-[11px] text-muted-foreground">Setup: <span className="font-semibold text-foreground">{setup.name}</span></p> : null}
          </div>
          <div className="rounded-lg border border-border bg-surface-raised px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Risk</p>
            <dl className="mt-1.5 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Default risk</dt>
                <dd className="font-mono text-foreground">{strategy.risk?.defaultRiskPct !== null && strategy.risk?.defaultRiskPct !== undefined ? `${strategy.risk.defaultRiskPct}%` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Min R:R</dt>
                <dd className="font-mono text-foreground">{strategy.risk?.minRR ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Stop methodology</dt>
                <dd className="max-w-[60%] truncate text-right text-foreground" title={strategy.risk?.stopMethodology ?? undefined}>
                  {strategy.risk?.stopMethodology ?? "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Rules Engine status (§26 — factual, neutral language) ───────────────────

function RulesTab() {
  const { data, isLoading } = useRulesStatus();

  if (isLoading || data === undefined) {
    return <p className="px-1 py-6 text-center text-xs text-muted-foreground">Loading rule status…</p>;
  }

  const spentPct = Math.min(Number(data.riskBudgetSpentPct), 100);
  const overBudget = Number(data.riskBudgetSpentPct) >= 100;

  return (
    <div className="space-y-3" data-testid="rules-context">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Trades today", value: data.tradesToday, testId: "rules-trades-today" },
          { label: "Losses today", value: data.lossesToday },
          { label: "Violations today", value: data.violationsToday, testId: "rules-violations" },
          { label: "Risk budget", value: `${Number(data.riskBudgetSpentPct).toFixed(0)}%` },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-surface-raised px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
            <p className="font-mono text-lg tabular-nums text-foreground" data-testid={item.testId}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Daily risk budget consumed</span>
          <span className={cn("font-mono tabular-nums", overBudget ? "text-loss" : "text-foreground")}>{Number(data.riskBudgetSpentPct).toFixed(1)}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-raised">
          <div className={cn("h-full rounded-full transition-all", overBudget ? "bg-loss" : spentPct > 70 ? "bg-warning" : "bg-profit")} style={{ width: `${Math.max(spentPct, 2)}%` }} />
        </div>
      </div>

      {data.limits.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-raised px-3 py-4 text-center text-xs text-muted-foreground">
          No active discipline rules. Define limits in the Discipline module and their factual status will report here.
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="rules-limit-list">
          {data.limits.map((limit) => {
            const current = Number(limit.current);
            const cap = Number(limit.limit);
            const breached = current >= cap && cap > 0;
            const ratio = cap > 0 ? Math.min((current / cap) * 100, 100) : 0;
            return (
              <li key={limit.ruleId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  {breached ? (
                    <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="size-3.5 shrink-0 text-profit" aria-hidden="true" />
                  )}
                  <span className="truncate text-xs text-foreground">{limit.type.replace(/_/g, " ")}</span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {current} / {cap}
                  <span className={cn("ml-2 font-semibold", breached ? "text-warning" : "text-profit")}>{breached ? "LIMIT REACHED" : "WITHIN LIMIT"}</span>
                </span>
                <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-surface sm:block">
                  <span className={cn("block h-full rounded-full", breached ? "bg-warning" : "bg-profit")} style={{ width: `${ratio}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Economic calendar (§22/§23 + Phase 10) ──────────────────────────────────

const IMPACT_TONE: Record<EcoEvent["impact"], string> = {
  HIGH: "border-loss/50 bg-loss/10 text-loss",
  MEDIUM: "border-warning/50 bg-warning/10 text-warning",
  LOW: "border-border bg-surface-raised text-muted-foreground",
};

function EconomyTab({ symbol }: { symbol: string }) {
  const { data, isLoading } = useEcoEvents();
  const nowMs = useNowMs();
  const [highOnly, setHighOnly] = React.useState(false);

  const events = React.useMemo(() => {
    const all = data?.events ?? [];
    const upcoming = all
      .filter((event) => nowMs === null || Date.parse(event.scheduledAt) + 30 * 60_000 >= nowMs)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return highOnly ? upcoming.filter((event) => event.impact === "HIGH") : upcoming;
  }, [data, highOnly, nowMs]);

  const proximity = React.useMemo(() => {
    if (nowMs === null) return null;
    let best: { event: EcoEvent; minutes: number } | null = null;
    for (const event of data?.events ?? []) {
      if (event.impact !== "HIGH") continue;
      const minutes = Math.round((Date.parse(event.scheduledAt) - nowMs) / 60_000);
      if (minutes >= 0 && minutes <= 120 && (best === null || minutes < best.minutes)) {
        best = { event, minutes };
      }
    }
    return best;
  }, [data, nowMs]);

  // Currencies plausibly relevant to the symbol (objective mapping, best effort).
  const relevantCurrency = React.useMemo(() => {
    if (symbol.startsWith("XAU") || symbol.startsWith("XAG")) return "USD";
    if (symbol.length >= 6 && !["BTC", "ETH"].includes(symbol.slice(0, 3))) return symbol.slice(3, 6);
    return null;
  }, [symbol]);

  return (
    <div className="space-y-3" data-testid="economy-context">
      {proximity !== null ? (
        <div
          role="status"
          data-testid="event-proximity-banner"
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
            proximity.minutes <= 60 ? "border-loss/50 bg-loss/10 text-loss" : "border-warning/50 bg-warning/10 text-warning",
          )}
        >
          <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
          HIGH IMPACT EVENT IN {proximity.minutes} MIN — {proximity.event.currency} {proximity.event.title}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Upcoming releases{relevantCurrency !== null ? ` — ${relevantCurrency}-relevant first` : ""}
        </p>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={highOnly} onChange={(event) => setHighOnly(event.target.checked)} className="size-3.5 accent-[var(--accent)]" data-testid="eco-high-only" />
          High impact only
        </label>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Loading economic calendar…</p>
      ) : events.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-raised px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">
          No upcoming economic event in the loaded window.
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="eco-event-list">
          {events.slice(0, 8).map((event) => {
            const minutes = nowMs !== null ? Math.round((Date.parse(event.scheduledAt) - nowMs) / 60_000) : null;
            const relevant = relevantCurrency !== null && event.currency === relevantCurrency;
            return (
              <li
                key={event.id}
                className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2", relevant ? "border-accent/30 bg-accent/5" : "border-border bg-surface-raised")}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {new Date(event.scheduledAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {event.currency} · {event.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {minutes !== null && minutes >= 0 ? `in ${minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)}h`}` : "released"}
                      {event.forecast !== null ? ` · forecast ${event.forecast}` : ""}
                      {event.actual !== null ? ` · actual ${event.actual}` : ""}
                    </span>
                  </span>
                </span>
                <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide", IMPACT_TONE[event.impact])}>{event.impact}</span>
              </li>
            );
          })}
        </ul>
      )}
      {events.length > 8 ? <p className="text-center text-[11px] text-muted-foreground">+{events.length - 8} more events in the loaded window</p> : null}
    </div>
  );
}

// ── Saved analyses (§41/§42 + Phase 11) ─────────────────────────────────────

interface SaveAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string;
  interval: MarketInterval;
  currentPrice: number | null;
  activeSession: TradingSession | null;
  indicators: IndicatorConfig[];
  drawings: DrawingObject[];
  levels: KeyLevel[];
}

function SaveAnalysisDialog(props: SaveAnalysisDialogProps) {
  // Radix unmounts DialogContent when closed — keeping the form state in the
  // content component gives a fresh form on every open, with no reset effect.
  if (!props.open) return null;
  return <SaveAnalysisForm {...props} />;
}

function SaveAnalysisForm({ onOpenChange, symbol, interval, currentPrice, activeSession, indicators, drawings, levels }: SaveAnalysisDialogProps) {
  const create = useCreateSavedAnalysis();

  const [bias, setBias] = React.useState<MarketBias>(activeSession?.marketBias ?? "NEUTRAL");
  const [bullish, setBullish] = React.useState("");
  const [bearish, setBearish] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [includeChart, setIncludeChart] = React.useState(true);

  const field = "w-full rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60";

  const submit = () => {
    const payload: CreateSavedAnalysisInput = {
      sessionId: activeSession?.id ?? null,
      symbol,
      timeframe: interval,
      priceAtSave: currentPrice,
      bias,
      bullishScenario: bullish.trim() !== "" ? bullish.trim() : null,
      bearishScenario: bearish.trim() !== "" ? bearish.trim() : null,
      strategyId: activeSession?.strategyId ?? null,
      notes: notes.trim() !== "" ? notes.trim() : null,
      indicators: includeChart ? indicators : [],
      drawings: includeChart ? drawings : [],
      levels: includeChart ? levels : [],
    };
    create.mutate(payload, {
      onSuccess: () => {
        toast.success("Analysis saved — it becomes part of the historical record.");
        onOpenChange(false);
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Unable to save the analysis.")),
    });
  };

  return (
    <DialogShell
      open
      onOpenChange={onOpenChange}
      title="Save analysis"
      description={`Freeze the ${symbol} ${interval} context — bias, scenarios, levels, indicators and drawings.`}
      testId="save-analysis-dialog"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending} data-testid="save-analysis-confirm">
            <CloudUpload className="size-3.5" aria-hidden="true" />
            {create.isPending ? "Saving…" : "Save analysis"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">Bias</p>
          <div className="flex overflow-hidden rounded-md border border-border">
            {(["BULLISH", "BEARISH", "NEUTRAL"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={bias === item} onClick={() => setBias(item)}
                className={cn("flex-1 py-1.5 text-xs font-semibold transition-colors", bias === item ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground")}>
                {item === "BULLISH" ? "Bullish" : item === "BEARISH" ? "Bearish" : "Neutral"}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="sa-bullish" className="text-xs font-medium text-foreground">Bullish scenario <span className="text-muted-foreground">(condition → confirmation → target → invalidation)</span></label>
          <textarea id="sa-bullish" value={bullish} onChange={(event) => setBullish(event.target.value)} maxLength={2000} rows={2} className={field} data-testid="scenario-bullish" placeholder="Price sweeps 3850 and reclaims; 15m MSS; target 3865; invalid below 3845." />
        </div>
        <div className="space-y-1">
          <label htmlFor="sa-bearish" className="text-xs font-medium text-foreground">Bearish scenario</label>
          <textarea id="sa-bearish" value={bearish} onChange={(event) => setBearish(event.target.value)} maxLength={2000} rows={2} className={field} data-testid="scenario-bearish" placeholder="Failure above 3858; LTF breakdown; target 3840; invalid above 3865." />
        </div>
        <div className="space-y-1">
          <label htmlFor="sa-notes" className="text-xs font-medium text-foreground">Notes</label>
          <textarea id="sa-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000} rows={2} className={field} placeholder="Anything the chart alone will not remember." />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeChart} onChange={(event) => setIncludeChart(event.target.checked)} className="size-3.5 accent-[var(--accent)]" data-testid="save-analysis-include-chart" />
          Include chart configuration ({indicators.length} indicators, {drawings.length} drawings, {levels.length} levels)
        </label>
      </div>
    </DialogShell>
  );
}


/** Local dialog wrapper to keep the call sites tidy. */
function DialogShell(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  testId: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto" data-testid={props.testId}>
        <DialogHeader>
          <DialogTitle className="font-heading">{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        {props.children}
        <DialogFooter>{props.footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnalysesTab(props: {
  symbol: string;
  interval: MarketInterval;
  currentPrice: number | null;
  activeSession: TradingSession | null;
  digits: number;
  indicators: IndicatorConfig[];
  drawings: DrawingObject[];
  levels: KeyLevel[];
  analyses: SavedAnalysis[];
  isLoading: boolean;
  onRestore: (analysis: SavedAnalysis) => void;
}) {
  const { analyses, isLoading } = props;
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const remove = useDeleteSavedAnalysis();
  const createNote = useCreateNofyNote();

  const symbolAnalyses = analyses.filter((analysis) => analysis.symbol === props.symbol);

  const saveToNofy = () => {
    const latest = symbolAnalyses[0] ?? null;
    createNote.mutate(
      {
        title: `${props.symbol} — Session Analysis`,
        blocks: [
          { id: "n1", type: "h2", text: "Market snapshot" },
          { id: "n2", type: "callout", tone: "info", text: `${props.symbol} ${props.interval} — bias ${latest?.bias ?? "not recorded"}${props.currentPrice !== null ? `, price ${formatPrice(props.currentPrice, props.digits)} at capture` : ""}` },
          { id: "n3", type: "h2", text: "Key levels" },
          ...(props.levels.length > 0
            ? props.levels.map((level, index) => ({ id: `nl-${index}`, type: "bullet" as const, text: `${level.kind.replace(/_/g, " ")} — ${formatPrice(level.price, props.digits)}${level.note !== null ? ` (${level.note})` : ""}` }))
            : [{ id: "nl-none", type: "paragraph" as const, text: "No key level documented at capture time." }]),
          ...(latest?.bullishScenario ? [{ id: "n4", type: "h3" as const, text: "Bullish scenario" }, { id: "n5", type: "paragraph" as const, text: latest.bullishScenario }] : []),
          ...(latest?.bearishScenario ? [{ id: "n6", type: "h3" as const, text: "Bearish scenario" }, { id: "n7", type: "paragraph" as const, text: latest.bearishScenario }] : []),
          { id: "n8", type: "ref", text: "", ref: { kind: "SYMBOL", id: props.symbol, label: props.symbol, meta: `${props.interval} chart`, href: "/session" } },
          ...(props.activeSession?.strategyId ? [{ id: "n9", type: "ref" as const, text: "", ref: { kind: "STRATEGY" as const, id: props.activeSession.strategyId, label: "Linked strategy", meta: null, href: "/playbook" } }] : []),
        ],
      },
      {
        onSuccess: () => toast.success("Saved to Nofy — the note links this symbol and strategy."),
        onError: (error) => toast.error(apiErrorMessage(error, "Unable to create the Nofy note.")),
      },
    );
  };

  return (
    <div className="space-y-3" data-testid="analyses-context">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setDialogOpen(true)} data-testid="save-analysis-button">
          <CloudUpload className="size-3.5" aria-hidden="true" />
          Save Analysis
        </Button>
        <Button size="sm" variant="outline" onClick={saveToNofy} disabled={createNote.isPending} data-testid="save-to-nofy-button">
          <FileDown className="size-3.5" aria-hidden="true" />
          Save to Nofy
        </Button>
        <p className="ml-auto text-[11px] text-muted-foreground">
          Analyses are historical snapshots — restoring reloads indicators, drawings and levels without touching the live feed.
        </p>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Loading saved analyses…</p>
      ) : analyses.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-raised px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">
          No saved analyses yet. Analyze a market, define your bias and scenarios, then save your first setup.
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="analysis-list">
          {analyses.slice(0, 12).map((analysis) => (
            <li key={analysis.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-foreground">{analysis.symbol}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{analysis.timeframe}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", analysis.bias === "BULLISH" ? "bg-profit/10 text-profit" : analysis.bias === "BEARISH" ? "bg-loss/10 text-loss" : "bg-accent/10 text-accent")}>
                    {analysis.bias}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(analysis.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {analysis.bullishScenario ?? analysis.bearishScenario ?? analysis.notes ?? "No scenario text"}
                  <span className="ml-1.5">
                    ({analysis.indicators.length} ind · {analysis.drawings.length} draw · {analysis.levels.length} levels)
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => props.onRestore(analysis)} data-testid={`restore-analysis-${analysis.id}`}>
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Restore
                </Button>
                <button
                  type="button"
                  onClick={() => remove.mutate(analysis.id)}
                  aria-label={`Delete analysis of ${analysis.symbol}`}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:text-loss"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <SaveAnalysisDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        symbol={props.symbol}
        interval={props.interval}
        currentPrice={props.currentPrice}
        activeSession={props.activeSession}
        indicators={props.indicators}
        drawings={props.drawings}
        levels={props.levels}
      />
    </div>
  );
}

// ── Tabs container ──────────────────────────────────────────────────────────

export interface ContextTabsProps {
  symbol: string;
  interval: MarketInterval;
  digits: number;
  currentPrice: number | null;
  activeSession: TradingSession | null;
  indicators: IndicatorConfig[];
  drawings: DrawingObject[];
  levels: KeyLevel[];
  analyses: SavedAnalysis[];
  analysesLoading: boolean;
  onRestoreAnalysis: (analysis: SavedAnalysis) => void;
}

export function ContextTabs(props: ContextTabsProps) {
  return (
    <Tabs defaultValue="playbook" className="rounded-xl border border-border bg-surface">
      <TabsList className="w-full justify-start gap-1 overflow-x-auto rounded-b-none border-b border-border bg-surface-raised px-2 py-1.5" aria-label="Session context">
        <TabsTrigger value="playbook" className="gap-1.5" data-testid="context-tab-playbook">
          <BookOpen className="size-3.5" aria-hidden="true" />
          Playbook
        </TabsTrigger>
        <TabsTrigger value="rules" className="gap-1.5" data-testid="context-tab-rules">
          <Scale className="size-3.5" aria-hidden="true" />
          Rules
        </TabsTrigger>
        <TabsTrigger value="economy" className="gap-1.5" data-testid="context-tab-economy">
          <CalendarClock className="size-3.5" aria-hidden="true" />
          Economy
        </TabsTrigger>
        <TabsTrigger value="analyses" className="gap-1.5" data-testid="context-tab-analyses">
          <CloudUpload className="size-3.5" aria-hidden="true" />
          Analyses
        </TabsTrigger>
      </TabsList>
      <TabsContent value="playbook" className="px-4 py-3">
        <PlaybookTab initialStrategyId={props.activeSession?.strategyId ?? null} initialSetupId={props.activeSession?.setupId ?? null} />
      </TabsContent>
      <TabsContent value="rules" className="px-4 py-3">
        <RulesTab />
      </TabsContent>
      <TabsContent value="economy" className="px-4 py-3">
        <EconomyTab symbol={props.symbol} />
      </TabsContent>
      <TabsContent value="analyses" className="px-4 py-3">
        <AnalysesTab
          symbol={props.symbol}
          interval={props.interval}
          currentPrice={props.currentPrice}
          activeSession={props.activeSession}
          digits={props.digits}
          indicators={props.indicators}
          drawings={props.drawings}
          levels={props.levels}
          analyses={props.analyses}
          isLoading={props.analysesLoading}
          onRestore={props.onRestoreAnalysis}
        />
      </TabsContent>
    </Tabs>
  );
}
