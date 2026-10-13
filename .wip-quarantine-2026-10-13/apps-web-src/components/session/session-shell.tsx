"use client";

import * as React from "react";
import { CalendarClock, ChevronDown, Clock, Flag, History as HistoryIcon, Play, Square } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/client";
import { formatMoney } from "@cosmoz/shared";
import type {
  EndSessionResponse,
  MarketBias,
  MarketInterval,
  TradingSession,
  TradingWindow,
} from "@cosmoz/shared";
import { useBrokerSession, useCreateNofyNote, useEndSessionLive, useStartSessionLive, useStrategies, useSetups } from "@/lib/api/queries";
import { FeedBadge } from "@/components/session/session-toolbar";
import { biasLabel } from "@/i18n/dictionaries/en/session";
import { useI18n } from "@/i18n/i18n-provider";
import type { FeedPhase, LiveQuote, PriceSnapshot } from "@/lib/realtime/market";
import { useNowMs } from "@/lib/realtime/use-now";
import { cn } from "@/lib/utils";

/**
 * Session Live SHELL (Phase 2/6/13): the lifecycle UI around the workspace —
 * status header (session state + duration + feed/broker badges), Start
 * Session context form (§6 — every field optional), End Session summary
 * (§43) with an optional reflection saved to Nofy (§44/Phase 13), and the
 * history drawer (§45) computed from real trade data.
 */

const TIMEFRAMES: readonly MarketInterval[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];
const WINDOWS: readonly TradingWindow[] = ["LONDON", "NEW_YORK", "ASIAN", "SYDNEY", "OTHER"];
const BIASES: readonly MarketBias[] = ["BULLISH", "BEARISH", "NEUTRAL"];

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return `${hours}h ${String(rest).padStart(2, "0")}m`;
}

/** TradingWindow enum → dict label (exhaustive — the enum has five members). */
function windowLabel(S: ReturnType<typeof useI18n>["dict"]["session"], window: TradingWindow): string {
  const labels: Record<TradingWindow, string> = {
    LONDON: S.windows.london,
    NEW_YORK: S.windows.newYork,
    ASIAN: S.windows.asian,
    SYDNEY: S.windows.sydney,
    OTHER: S.windows.other,
  };
  return labels[window];
}

// ── Header ──────────────────────────────────────────────────────────────────

interface SessionLiveHeaderProps {
  activeSession: TradingSession | null;
  quote: LiveQuote | null;
  phase: FeedPhase;
  authError?: PriceSnapshot["authError"];
  onBiasChange: (bias: MarketBias) => void;
  onStartClick: () => void;
  onEndClick: () => void;
  onOpenHistory: () => void;
}

function BrokerBadge() {
  // Compact honest state for the header row (detail lives in the account panel).
  const { dict } = useI18n();
  const S = dict.session;
  const { data } = useBrokerSession();
  const state = data?.state ?? "UNKNOWN";
  const connected = state === "CONNECTED";
  const configured = state !== "NOT_CONFIGURED" && state !== "UNKNOWN";
  return (
    <span
      data-testid="broker-badge"
      data-state={state.toLowerCase()}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide",
        connected && "border-accent/40 bg-accent/10 text-accent",
        !connected && configured && "border-warning/50 bg-warning/10 text-warning",
        !configured && "border-border bg-surface-raised text-muted-foreground",
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", connected ? "bg-accent" : !configured ? "bg-muted-foreground" : "bg-warning")} />
      {connected ? S.shell.broker : configured ? state : S.shell.noBroker}
    </span>
  );
}

export function SessionLiveHeader({ activeSession, quote, phase, authError, onBiasChange, onStartClick, onEndClick, onOpenHistory }: SessionLiveHeaderProps) {
  const { dict } = useI18n();
  const S = dict.session;
  const nowMs = useNowMs();
  const elapsed = React.useMemo(() => {
    if (!activeSession) return null;
    const started = Date.parse(activeSession.startedAt);
    if (Number.isNaN(started) || nowMs === null) return null;
    return Math.max(0, Math.round((nowMs - started) / 60_000));
  }, [activeSession, nowMs]);

  return (
    <section className="rounded-xl border border-border bg-surface" data-testid="session-live-header">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-muted-foreground">{S.shell.sessionStatus}</h2>
            {activeSession ? (
              <Badge className="border-accent/40 bg-accent/10 text-accent hover:bg-accent/10" data-testid="session-status-active">
                <span aria-hidden="true" className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-accent" />
                {S.shell.liveSession}
              </Badge>
            ) : (
              <Badge variant="outline" data-testid="session-status-none">
                {S.shell.noActiveSession}
              </Badge>
            )}
            {activeSession && elapsed !== null ? (
              <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-foreground" data-testid="session-duration">
                <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {formatDuration(elapsed)}
              </span>
            ) : null}
          </div>
          {activeSession ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {activeSession.primarySymbol} · {activeSession.primaryTimeframe} · {windowLabel(S, activeSession.tradingWindow)}
              {activeSession.sessionObjective ? ` — ${activeSession.sessionObjective}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              {S.shell.freeMode}
            </p>
          )}
        </div>

        {/* Bias editor (trader interpretation — never presented as market fact) */}
        <div className="space-y-1">
          <p className="ledger-label">{S.shell.marketBias}</p>
          <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label={S.shell.biasGroupAria}>
            {BIASES.map((bias) => (
              <button
                key={bias}
                type="button"
                disabled={!activeSession}
                aria-pressed={activeSession?.marketBias === bias}
                data-testid={`bias-${bias.toLowerCase()}`}
                onClick={() => onBiasChange(bias)}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  activeSession?.marketBias === bias
                    ? bias === "BULLISH"
                      ? "bg-profit/15 text-profit"
                      : bias === "BEARISH"
                        ? "bg-loss/15 text-loss"
                        : "bg-accent/10 text-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {biasLabel(S, bias)}
              </button>
            ))}
          </div>
        </div>

        {/* Connection statuses (§35) */}
        <div className="flex items-center gap-3">
          <FeedBadge quote={quote} phase={phase} authError={authError} />
          <BrokerBadge />
        </div>

        {/* Lifecycle actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenHistory} data-testid="session-history-button">
            <HistoryIcon className="size-3.5" aria-hidden="true" />
            {S.shell.history}
          </Button>
          {activeSession ? (
            <Button variant="outline" size="sm" onClick={onEndClick} data-testid="end-session-button" className="border-loss/40 text-loss hover:bg-loss/10">
              <Square className="size-3.5" aria-hidden="true" />
              {S.shell.endSession}
            </Button>
          ) : (
            <Button size="sm" onClick={onStartClick} data-testid="start-session-button">
              <Play className="size-3.5" aria-hidden="true" />
              {S.shell.startSession}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Start session dialog (§6 — configurable, never forced) ─────────────────

interface StartSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSymbol: string;
  defaultInterval: MarketInterval;
}

export function StartSessionDialog(props: StartSessionDialogProps) {
  // Radix unmounts the content when closed — the form state lives in the
  // mounted child, so every open starts fresh (no reset effect).
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <StartSessionForm {...props} /> : null}
    </Dialog>
  );
}

function StartSessionForm({ onOpenChange, defaultSymbol, defaultInterval }: StartSessionDialogProps) {
  const { dict } = useI18n();
  const S = dict.session;
  const start = useStartSessionLive();
  const { data: strategiesData } = useStrategies();
  const { data: setupsData } = useSetups();
  const strategies = strategiesData?.strategies ?? [];
  const setups = setupsData?.setups ?? [];

  const [symbol, setSymbol] = React.useState(defaultSymbol);
  const [interval, setInterval] = React.useState<MarketInterval>(defaultInterval);
  const [window, setWindow] = React.useState<TradingWindow>("LONDON");
  const [strategyId, setStrategyId] = React.useState<string>("");
  const [setupId, setSetupId] = React.useState<string>("");
  const [bias, setBias] = React.useState<MarketBias>("NEUTRAL");
  const [risk, setRisk] = React.useState("");
  const [limit, setLimit] = React.useState("");
  const [objective, setObjective] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const strategySetups = setups.filter((setup) => setup.strategyId === strategyId);
  const selectedStrategy = strategies.find((item) => item.id === strategyId) ?? null;

  const submit = () => {
    start.mutate(
      {
        primarySymbol: symbol || undefined,
        primaryTimeframe: interval,
        tradingWindow: window,
        strategyId: strategyId || null,
        setupId: setupId || null,
        marketBias: bias,
        sessionObjective: objective.trim() !== "" ? objective.trim() : null,
        notes: notes.trim() !== "" ? notes.trim() : null,
        riskPerTradePct: risk !== "" ? Number(risk) : null,
        dailyRiskLimitPct: limit !== "" ? Number(limit) : null,
      },
      {
        onSuccess: () => {
          toast.success(S.shell.toastStarted);
          onOpenChange(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, S.shell.toastStartFailed)),
      },
    );
  };

  const field = "w-full rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent/60";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto" data-testid="start-session-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">{S.shell.startTitle}</DialogTitle>
          <DialogDescription>
            {S.shell.startDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ss-symbol">{S.labels.market}</Label>
              <Input id="ss-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ss-interval">{S.shell.primaryTimeframe}</Label>
              <select id="ss-interval" value={interval} onChange={(event) => setInterval(event.target.value as MarketInterval)} className={cn(field, "font-mono")}>
                {TIMEFRAMES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ss-window">{S.shell.tradingSession}</Label>
              <select id="ss-window" value={window} onChange={(event) => setWindow(event.target.value as TradingWindow)} className={field}>
                {WINDOWS.map((item) => (
                  <option key={item} value={item}>
                    {windowLabel(S, item)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{S.shell.marketBias}</Label>
              <div className="flex overflow-hidden rounded-md border border-border">
                {BIASES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={bias === item}
                    onClick={() => setBias(item)}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-semibold transition-colors",
                      bias === item ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {biasLabel(S, item)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ss-strategy">{S.shell.strategyLabel}</Label>
              <select
                id="ss-strategy"
                value={strategyId}
                onChange={(event) => {
                  setStrategyId(event.target.value);
                  setSetupId("");
                }}
                className={field}
              >
                <option value="">{S.shell.none}</option>
                {strategies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ss-setup">{S.labels.setup}</Label>
              <select id="ss-setup" value={setupId} onChange={(event) => setSetupId(event.target.value)} className={field} disabled={strategyId === ""}>
                <option value="">{S.shell.none}</option>
                {strategySetups.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ss-risk">{S.shell.riskPerTrade}</Label>
              <Input id="ss-risk" type="number" min={0} max={100} step={0.1} value={risk} onChange={(event) => setRisk(event.target.value)} placeholder="1" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ss-limit">{S.shell.dailyRiskLimit}</Label>
              <Input id="ss-limit" type="number" min={0} max={100} step={0.1} value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="2" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ss-objective">{S.shell.sessionObjective}</Label>
            <Input id="ss-objective" value={objective} onChange={(event) => setObjective(event.target.value)} placeholder={S.shell.objectivePlaceholder} maxLength={400} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ss-notes">{S.labels.notes}</Label>
            <Textarea id="ss-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={S.shell.notesPlaceholder} maxLength={4000} className="min-h-[64px]" />
          </div>

          {selectedStrategy ? (
            <p className="rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs text-muted-foreground">
              {`${S.shell.playbookContextA} `}<span className="font-semibold text-foreground">{selectedStrategy.name}</span>{` ${S.shell.playbookContextB}`}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {dict.common.cancel}
          </Button>
          <Button onClick={submit} disabled={start.isPending} data-testid="start-session-confirm">
            <Play className="size-3.5" aria-hidden="true" />
            {start.isPending ? S.shell.starting : S.shell.startSession}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── End session dialog (§43 summary + §44 reflection) ───────────────────────

interface EndSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: TradingSession;
  strategyName: string | null;
}

export function EndSessionDialog(props: EndSessionDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <EndSessionForm {...props} /> : null}
    </Dialog>
  );
}

function EndSessionForm({ onOpenChange, session, strategyName }: EndSessionDialogProps) {
  const { dict } = useI18n();
  const S = dict.session;
  const end = useEndSessionLive();
  const createNote = useCreateNofyNote();
  const [result, setResult] = React.useState<EndSessionResponse | null>(null);
  const [reflection, setReflection] = React.useState<Record<string, string>>({ happened: "", well: "", change: "" });
  const [saveToNofy, setSaveToNofy] = React.useState(true);

  const reflectionQuestions = [
    { key: "happened", label: S.shell.q1, placeholder: S.shell.q1Placeholder },
    { key: "well", label: S.shell.q2, placeholder: S.shell.q2Placeholder },
    { key: "change", label: S.shell.q3, placeholder: S.shell.q3Placeholder },
  ] as const;

  const reflectionFilled = Object.values(reflection).some((value) => value.trim() !== "");

  const finish = () => {
    end.mutate(
      { sessionId: session.id, notes: null },
      {
        onSuccess: (data) => {
          setResult(data);
          if (saveToNofy && reflectionFilled) {
            createNote.mutate(
              {
                title: `${S.shell.nofyNoteTitle} — ${session.primarySymbol} — ${new Date(session.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
                blocks: [
                  { id: "b1", type: "h2", text: S.shell.summaryTitle },
                  {
                    id: "b2",
                    type: "table",
                    text: "",
                    rows: [
                      [S.shell.metric, S.shell.value],
                      [S.shell.duration, formatDuration(data.summary.durationMinutes)],
                      [S.shell.markets, data.summary.markets.join(", ") || "—"],
                      [S.shell.trades, String(data.summary.tradeCount)],
                      [S.shell.netPnl, data.summary.netPnl !== null ? formatMoney(data.summary.netPnl, "USD") : "—"],
                      [S.shell.avgR, data.summary.avgR !== null ? `${data.summary.avgR}R` : "—"],
                      [S.shell.violations, String(data.summary.violationsCount)],
                      [S.shell.ecoEvents, String(data.summary.ecoEventsCount)],
                      [S.labels.notes, String(data.summary.notesCount)],
                      [S.shell.savedAnalyses, String(data.summary.analysesCount)],
                    ],
                  },
                  ...(strategyName
                    ? [{ id: "b3", type: "ref" as const, text: "", ref: { kind: "STRATEGY" as const, id: session.strategyId ?? "", label: strategyName, meta: null, href: "/playbook" } }]
                    : []),
                  { id: "b4", type: "h2", text: S.shell.q1 },
                  { id: "b5", type: "paragraph", text: reflection.happened || "—" },
                  { id: "b6", type: "h2", text: S.shell.q2 },
                  { id: "b7", type: "paragraph", text: reflection.well || "—" },
                  { id: "b8", type: "h2", text: S.shell.q3 },
                  { id: "b9", type: "paragraph", text: reflection.change || "—" },
                  { id: "b10", type: "callout", tone: "info", text: `${S.shell.biasAtClose} ${biasLabel(S, session.marketBias)}. ${S.shell.objectiveAtClose} ${session.sessionObjective ?? "—"}` },
                ],
              },
              {
                onSuccess: () => toast.success(S.shell.toastReflectionSaved),
                onError: (error) => toast.error(apiErrorMessage(error, S.shell.toastReflectionFailed)),
              },
            );
          }
        },
        onError: (error) => toast.error(apiErrorMessage(error, S.shell.toastEndFailed)),
      },
    );
  };

  const close = () => {
    onOpenChange(false);
  };

  const summaryRow = (label: string, value: React.ReactNode, testId?: string) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums text-foreground" data-testid={testId}>
        {value}
      </span>
    </div>
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto" data-testid="end-session-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">{result ? S.shell.summaryTitle : S.shell.endTitle}</DialogTitle>
          <DialogDescription>
            {result
              ? S.shell.summaryDesc
              : S.shell.endDesc}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="rounded-lg border border-border bg-surface-raised px-3 py-2" data-testid="session-summary">
            {summaryRow(S.shell.duration, formatDuration(result.summary.durationMinutes), "summary-duration")}
            {summaryRow(S.shell.markets, result.summary.markets.join(", ") || "—")}
            {summaryRow(S.shell.trades, result.summary.tradeCount, "summary-trades")}
            {summaryRow(
              S.shell.netPnl,
              result.summary.netPnl !== null ? (
                <span className={result.summary.netPnl >= 0 ? "text-profit" : "text-loss"}>{formatMoney(result.summary.netPnl, "USD")}</span>
              ) : (
                "—"
              ),
            )}
            {summaryRow(S.shell.avgR, result.summary.avgR !== null ? `${result.summary.avgR > 0 ? "+" : ""}${result.summary.avgR}R` : "—")}
            {summaryRow(S.shell.violations, result.summary.violationsCount)}
            {summaryRow(S.shell.ecoEvents, result.summary.ecoEventsCount)}
            {summaryRow(S.labels.notes, result.summary.notesCount)}
            {summaryRow(S.shell.savedAnalyses, result.summary.analysesCount, "summary-analyses")}
          </div>
        ) : (
          <div className="grid gap-3">
            {reflectionQuestions.map((question) => (
              <div key={question.key} className="space-y-1">
                <Label htmlFor={`refl-${question.key}`}>{question.label}</Label>
                <Textarea
                  id={`refl-${question.key}`}
                  value={reflection[question.key]}
                  onChange={(event) => setReflection((current) => ({ ...current, [question.key]: event.target.value }))}
                  placeholder={question.placeholder}
                  maxLength={4000}
                  className="min-h-[56px]"
                  data-testid={`reflection-${question.key}`}
                />
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={saveToNofy}
                onChange={(event) => setSaveToNofy(event.target.checked)}
                className="size-3.5 accent-[var(--accent)]"
                data-testid="reflection-nofy-checkbox"
              />
              {S.shell.saveReflectionNofy}
            </label>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={close} data-testid="session-summary-close">
              {S.shell.done}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {S.shell.keepTrading}
              </Button>
              <Button onClick={finish} disabled={end.isPending} data-testid="end-session-confirm" className="border-loss/40 text-loss hover:bg-loss/10" variant="outline">
                <Flag className="size-3.5" aria-hidden="true" />
                {end.isPending ? S.shell.ending : S.shell.endSession}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── History drawer (§45/Phase 14) ───────────────────────────────────────────

interface SessionHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: TradingSession[];
  strategyNameOf: (strategyId: string | null) => string | null;
  /** Real trades for client-side honest metrics (window-scoped). */
  trades: Array<{ entryAt: string; exitAt: string | null; pnlNet: string | null; pnlGross: string | null }>;
  /** Open the documentation replay for a completed session (increment ②). */
  onReplay?: (session: TradingSession) => void;
}

export function SessionHistoryDrawer({ open, onOpenChange, history, strategyNameOf, trades, onReplay }: SessionHistoryDrawerProps) {
  const { dict } = useI18n();
  const S = dict.session;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] overflow-y-auto sm:max-w-[420px]" data-testid="session-history-drawer">
        <SheetHeader>
          <SheetTitle className="font-heading">{S.shell.historyTitle}</SheetTitle>
          <SheetDescription>{S.shell.historyDesc}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {history.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface-raised px-3 py-6 text-center text-sm text-muted-foreground">
              {S.shell.historyEmpty}
            </p>
          ) : (
            history.map((session) => {
              const windowTrades = trades.filter(
                (trade) => trade.entryAt >= session.startedAt && (session.endedAt === null || trade.entryAt <= session.endedAt),
              );
              const pnls = windowTrades
                .filter((trade) => trade.exitAt !== null)
                .map((trade) => Number(trade.pnlNet ?? trade.pnlGross ?? Number.NaN))
                .filter((value) => Number.isFinite(value));
              const netPnl = pnls.length > 0 ? pnls.reduce((sum, value) => sum + value, 0) : null;
              const strategyName = strategyNameOf(session.strategyId);
              const durationMinutes =
                session.endedAt !== null ? Math.max(0, Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 60_000)) : null;

              return (
                <details key={session.id} className="group rounded-xl border border-border bg-surface-raised" data-testid="history-session-row">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-foreground">{session.primarySymbol}</span>
                        <span className="font-mono text-xs text-muted-foreground">{session.primaryTimeframe}</span>
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", session.status === "COMPLETED" ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning")}>
                          {session.status}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {new Date(session.startedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        {" · "}
                        {new Date(session.startedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                        {durationMinutes !== null ? ` · ${formatDuration(durationMinutes)}` : ""}
                        {strategyName ? ` · ${strategyName}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {netPnl !== null ? (
                        <span className={cn("font-mono text-sm tabular-nums", netPnl >= 0 ? "text-profit" : "text-loss")}>
                          {netPnl >= 0 ? "+" : ""}
                          {formatMoney(netPnl, "USD")}
                        </span>
                      ) : null}
                      <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                    </span>
                  </summary>
                  <div className="border-t border-border px-3 py-2.5 text-xs">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <dt className="text-muted-foreground">{S.shell.tradingWindow}</dt>
                      <dd className="text-right font-mono text-foreground">{windowLabel(S, session.tradingWindow)}</dd>
                      <dt className="text-muted-foreground">{S.shell.biasRow}</dt>
                      <dd className="text-right font-mono text-foreground">{biasLabel(S, session.marketBias).toUpperCase()}</dd>
                      <dt className="text-muted-foreground">{S.shell.tradesInWindow}</dt>
                      <dd className="text-right font-mono text-foreground">{windowTrades.length}</dd>
                      <dt className="text-muted-foreground">{S.shell.riskPerTradeRow}</dt>
                      <dd className="text-right font-mono text-foreground">{session.riskPerTradePct !== null ? `${session.riskPerTradePct}%` : "—"}</dd>
                      <dt className="text-muted-foreground">{S.shell.dailyRiskLimitRow}</dt>
                      <dd className="text-right font-mono text-foreground">{session.dailyRiskLimitPct !== null ? `${session.dailyRiskLimitPct}%` : "—"}</dd>
                    </dl>
                    {session.sessionObjective ? (
                      <p className="mt-2 rounded-md bg-surface px-2 py-1.5 text-muted-foreground">
                        <CalendarClock className="mr-1 inline size-3" aria-hidden="true" />
                        {session.sessionObjective}
                      </p>
                    ) : null}
                    {session.endedAt !== null && onReplay !== undefined ? (
                      <div className="mt-2.5">
                        <Button variant="outline" size="sm" data-testid="history-replay" onClick={() => onReplay(session)}>
                          <Play className="size-3.5" aria-hidden="true" />
                          {S.shell.replaySession}
                        </Button>
                      </div>
                    ) : null}
                    {session.events.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{`${S.shell.timelineCount} (${session.events.length})`}</p>
                        {session.events.slice(0, 8).map((event) => (
                          <p key={event.id} className="flex items-baseline gap-2 text-muted-foreground">
                            <span className="font-mono text-[10px]">{new Date(event.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                            <span className="truncate">{event.label}{event.source ? ` — ${S.labels.source}: ${event.source}` : ""}</span>
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </details>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
