"use client";

/**
 * PlanEditor — the planning workspace (spec §5–§19): market, playbook link,
 * levels, risk preview (live estimate through the SHARED risk utils), thesis,
 * invalidation and the embedded checklist with its readiness verdict.
 *
 * Lifecycle actions are server-validated (PATCH status transitions); the
 * editor only disables what the current status makes impossible and maps
 * stable error codes through the dict. The form remounts on server updates
 * (key = updatedAt) so the client never hand-merges server-authoritative
 * risk fields.
 */

import * as React from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type {
  Direction,
  MarketBias,
  Timeframe,
  TradePlan,
} from "@cosmoz/shared";
import {
  computeRR,
  formatMoney,
  formatNumber,
  suggestPositionSize,
} from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/client";
import { useI18n } from "@/i18n/i18n-provider";
import { DirectionSegmented } from "@/components/trades/direction-segmented";
import {
  useAccounts,
  useCurrentBalance,
  useInstruments,
  usePreferences,
  useSetups,
  useStrategies,
  useTrades,
  useTradePlan,
  useUpdateTradePlan,
  useCreateTradePlan,
  useDeleteTradePlan,
} from "@/lib/api/queries";
import { DirectionMark, PlanStatusBadge, blockerMessage, requiredProgressText } from "./planner-shared";
import { PlanChecklist } from "./plan-checklist";

const TIMEFRAMES: readonly Timeframe[] = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"];
const BIASES: readonly MarketBias[] = ["BULLISH", "BEARISH", "NEUTRAL"];
const RISK_PRESETS = [0.5, 1, 2] as const;

interface DraftState {
  instrumentId: string;
  direction: Direction;
  timeframe: Timeframe;
  marketBias: MarketBias;
  strategyId: string;
  setupId: string;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  /** Kept as raw text so decimal typing is never eaten by conversion. */
  riskPercent: string;
  thesis: string;
  invalidation: string;
  notes: string;
}

export function PlanEditor({ planId, onBack, onOpened }: {
  /** null → creation mode. */
  planId: string | null;
  onBack: () => void;
  /** Called after a successful create so the shell can switch to ?plan=<id>. */
  onOpened: (planId: string) => void;
}) {
  const { dict } = useI18n();
  const planQuery = useTradePlan(planId);
  const instrumentsQuery = useInstruments();
  const preferencesQuery = usePreferences();

  if (planId !== null && planQuery.isLoading) {
    return (
      <div className="space-y-3" data-testid="planner-editor-loading">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (planId !== null && planQuery.isError) {
    return (
      <Card data-testid="planner-editor-error">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-muted-foreground">{dict.planner.errors.NOT_FOUND}</p>
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden />
            {dict.planner.view.backToPlans}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const plan = planQuery.data?.plan ?? null;
  const instruments = instrumentsQuery.data?.instruments ?? [];
  const preferences = preferencesQuery.data ?? null;

  return (
    <PlanEditorForm
      key={plan?.updatedAt ?? "create"}
      plan={plan}
      instruments={instruments}
      defaultInstrumentId={preferences?.trading.defaultInstrumentId ?? instruments[0]?.id ?? ""}
      defaultRiskPct={preferences?.risk.defaultRiskPerTradePct ?? 1}
      onBack={onBack}
      onOpened={onOpened}
    />
  );
}

function PlanEditorForm({ plan, instruments, defaultInstrumentId, defaultRiskPct, onBack, onOpened }: {
  plan: TradePlan | null;
  instruments: { id: string; symbol: string; name: string; pipSize: string; contractSize: string }[];
  defaultInstrumentId: string;
  defaultRiskPct: number;
  onBack: () => void;
  onOpened: (planId: string) => void;
}) {
  const { dict } = useI18n();
  const E = dict.planner.editor;
  const editable = plan === null || plan.status === "DRAFT" || plan.status === "READY";
  const readOnly = !editable;

  const strategiesQuery = useStrategies();
  const setupsQuery = useSetups();
  const balanceQuery = useCurrentBalance();
  const accountsQuery = useAccounts();
  const currency =
    (accountsQuery.data?.accounts.find((a) => a.isDefault) ?? accountsQuery.data?.accounts[0])?.currency ?? "USD";

  const createMutation = useCreateTradePlan();
  const updateMutation = useUpdateTradePlan();
  const deleteMutation = useDeleteTradePlan();
  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  // Closed trades for the executed-trade link (plan-vs-actual in Trade Review).
  const closedTradesQuery = useTrades({ status: "CLOSED" });
  const closedTrades = (closedTradesQuery.data?.trades ?? []).slice(0, 50);
  const [linkedTradeId, setLinkedTradeId] = React.useState<string>("");

  const strategies = strategiesQuery.data?.strategies ?? [];
  const allSetups = setupsQuery.data?.setups ?? [];

  const [draft, setDraft] = React.useState<DraftState>(() => ({
    instrumentId: plan?.instrumentId ?? defaultInstrumentId,
    direction: plan?.direction ?? "BUY",
    timeframe: plan?.timeframe ?? "H1",
    marketBias: plan?.marketBias ?? "NEUTRAL",
    strategyId: plan?.strategyId ?? "",
    setupId: plan?.setupId ?? "",
    entryPrice: plan?.entryPrice ?? "",
    stopLoss: plan?.stopLoss ?? "",
    takeProfit: plan?.takeProfit ?? "",
    riskPercent: plan !== null ? String(plan.riskPercent) : String(defaultRiskPct),
    thesis: plan?.thesis ?? "",
    invalidation: plan?.invalidation ?? "",
    notes: plan?.notes ?? "",
  }));
  const set = <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const [confirmAction, setConfirmAction] = React.useState<"EXECUTED" | "CANCELLED" | "EXPIRED" | "DELETE" | null>(null);

  const strategy = draft.strategyId ? (strategies.find((s) => s.id === draft.strategyId) ?? null) : null;
  const strategySetups = strategy ? allSetups.filter((s) => s.strategyId === strategy.id) : [];
  const instrument = instruments.find((i) => i.id === draft.instrumentId) ?? null;
  const balance = Number(balanceQuery?.balance ?? "0");

  const patch = updateMutation.mutateAsync;
  const runPatch = async (planId: string, input: Parameters<typeof patch>[0]["input"], successToast: string) => {
    try {
      await patch({ planId, input });
      toast.success(successToast);
      return true;
    } catch (error) {
      toast.error(E.actionFailedToast, { description: actionErrorText(error, dict) });
      return false;
    }
  };

  const riskValid = /^\d+(\.\d+)?$/.test(draft.riskPercent) && Number(draft.riskPercent) > 0 && Number(draft.riskPercent) <= 100;

  const onSaveDraft = async () => {
    if (plan === null) {
      if (draft.instrumentId === "" || draft.entryPrice.trim() === "" || !riskValid) return;
      try {
        const result = await createMutation.mutateAsync({
          instrumentId: draft.instrumentId,
          direction: draft.direction,
          timeframe: draft.timeframe,
          marketBias: draft.marketBias,
          strategyId: draft.strategyId === "" ? null : draft.strategyId,
          setupId: draft.setupId === "" ? null : draft.setupId,
          entryPrice: draft.entryPrice.trim(),
          stopLoss: draft.stopLoss.trim() === "" ? null : draft.stopLoss.trim(),
          takeProfit: draft.takeProfit.trim() === "" ? null : draft.takeProfit.trim(),
          riskPercent: Number(draft.riskPercent),
          thesis: draft.thesis.trim() === "" ? null : draft.thesis.trim(),
          invalidation: draft.invalidation.trim() === "" ? null : draft.invalidation.trim(),
          notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
        });
        toast.success(E.savedToast);
        onOpened(result.plan.id);
      } catch (error) {
        toast.error(E.saveFailedToast, { description: actionErrorText(error, dict) });
      }
      return;
    }
    await runPatch(plan.id, {
      instrumentId: draft.instrumentId,
      direction: draft.direction,
      timeframe: draft.timeframe,
      marketBias: draft.marketBias,
      strategyId: draft.strategyId === "" ? null : draft.strategyId,
      setupId: draft.setupId === "" ? null : draft.setupId,
      entryPrice: draft.entryPrice.trim(),
      stopLoss: draft.stopLoss.trim() === "" ? null : draft.stopLoss.trim(),
      takeProfit: draft.takeProfit.trim() === "" ? null : draft.takeProfit.trim(),
      riskPercent: riskValid ? Number(draft.riskPercent) : undefined,
      thesis: draft.thesis.trim() === "" ? null : draft.thesis.trim(),
      invalidation: draft.invalidation.trim() === "" ? null : draft.invalidation.trim(),
      notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
    }, E.savedToast);
  };

  const onMarkReady = async () => {
    if (plan === null) return;
    await runPatch(plan.id, { status: "READY" }, E.readyToast);
  };
  const onReopen = async () => {
    if (plan === null) return;
    await runPatch(plan.id, { status: "DRAFT" }, E.reopenedToast);
  };
  const onStatusAction = async () => {
    if (plan === null || confirmAction === null) return;
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "DELETE") {
      // Navigate back BEFORE deleting: the editor observes the singleton
      // cache — unmounting first lets the mutation's cache removal run
      // without triggering a doomed refetch of the deleted resource.
      onBack();
      try {
        await deleteMutation.mutateAsync(plan.id);
        toast.success(E.deletedToast);
      } catch (error) {
        toast.error(E.actionFailedToast, { description: actionErrorText(error, dict) });
      }
      return;
    }
    const toastByStatus = action === "EXECUTED" ? E.executedToast : action === "CANCELLED" ? E.cancelledToast : E.expiredToast;
    if (action === "EXECUTED") {
      // Optional executed-trade link — Trade Review uses it for plan-vs-actual.
      await runPatch(
        plan.id,
        linkedTradeId === "" ? { status: "EXECUTED" } : { status: "EXECUTED", executedTradeId: linkedTradeId },
        toastByStatus,
      );
      return;
    }
    await runPatch(plan.id, { status: action }, toastByStatus);
  };

  const onToggleChecklistItem = async (itemId: string, checked: boolean) => {
    if (plan === null) return;
    await runPatch(plan.id, {
      checklistStates: [{ id: itemId, state: checked ? "CHECKED" : "UNCHECKED" }],
    }, E.savedToast);
  };

  // Live preview — shared risk utils, labeled as an estimate.
  const previewRR =
    draft.entryPrice.trim() !== "" && draft.stopLoss.trim() !== "" && draft.takeProfit.trim() !== ""
      ? computeRR(draft.entryPrice, draft.stopLoss, draft.takeProfit, draft.direction)
      : null;
  const riskPctNumber = Number(draft.riskPercent);
  const previewSuggested =
    draft.entryPrice.trim() !== "" && draft.stopLoss.trim() !== "" && instrument && balance > 0 && riskValid
      ? suggestPositionSize(draft.entryPrice, draft.stopLoss, riskPctNumber, balance, {
          pipSize: instrument.pipSize,
          contractSize: instrument.contractSize,
        })
      : null;
  const previewRiskAmount = balance > 0 && riskValid ? (balance * riskPctNumber) / 100 : null;
  const previewStopDistance =
    draft.entryPrice.trim() !== "" && draft.stopLoss.trim() !== ""
      ? Math.abs(Number(draft.entryPrice) - Number(draft.stopLoss))
      : null;

  const canSave =
    draft.instrumentId !== "" &&
    /^\d+(\.\d+)?$/.test(draft.entryPrice.trim()) &&
    riskValid;
  const canMarkReady = plan !== null && plan.status === "DRAFT" && plan.readiness.status === "READY";

  return (
    <div className="space-y-4" data-testid="planner-editor">
      {/* Header band */}
      <header className="rounded-xl border bg-surface" data-testid="planner-editor-header">
        <div className="flex flex-col gap-3 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={onBack} data-testid="planner-back">
              <ArrowLeft className="size-4" aria-hidden />
              {dict.planner.view.backToPlans}
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-xl font-semibold sm:text-2xl">
                {plan === null ? E.createTitle : E.editTitle}
              </h2>
              {plan !== null && (
                <>
                  <PlanStatusBadge status={plan.status} />
                  <span className="font-heading text-base font-semibold">
                    {instrument?.symbol ?? "—"}
                  </span>
                  <DirectionMark direction={plan.direction} />
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <Button onClick={onSaveDraft} disabled={!canSave || busy} data-testid="planner-action-save">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {busy ? E.saving : E.saveDraft}
              </Button>
            )}
            {plan !== null && plan.status === "DRAFT" && (
              <Button
                variant="outline"
                onClick={onMarkReady}
                disabled={!canMarkReady || busy}
                title={canMarkReady ? undefined : blockerSummary(plan, dict)}
                data-testid="planner-action-ready"
              >
                {E.markReady}
              </Button>
            )}
            {plan !== null && plan.status === "READY" && (
              <>
                <Button onClick={() => setConfirmAction("EXECUTED")} disabled={busy} data-testid="planner-action-executed">
                  {E.markExecuted}
                </Button>
                <Button variant="outline" onClick={onReopen} disabled={busy} data-testid="planner-action-reopen">
                  {E.reopenDraft}
                </Button>
              </>
            )}
            {plan !== null && (plan.status === "CANCELLED" || plan.status === "EXPIRED") && (
              <Button variant="outline" onClick={onReopen} disabled={busy} data-testid="planner-action-reopen">
                {E.reopenDraft}
              </Button>
            )}
            {plan !== null && (plan.status === "DRAFT" || plan.status === "READY") && (
              <Button variant="ghost" onClick={() => setConfirmAction("CANCELLED")} disabled={busy} data-testid="planner-action-cancel">
                {E.cancelPlan}
              </Button>
            )}
            {plan !== null && (plan.status === "DRAFT" || plan.status === "READY") && (
              <Button variant="ghost" onClick={() => setConfirmAction("EXPIRED")} disabled={busy} data-testid="planner-action-expire">
                {E.expirePlan}
              </Button>
            )}
            {plan !== null && (plan.status === "DRAFT" || plan.status === "CANCELLED" || plan.status === "EXPIRED") && (
              <Button variant="destructive" onClick={() => setConfirmAction("DELETE")} disabled={busy} data-testid="planner-action-delete">
                {E.deletePlan}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Readiness verdict (existing plans) */}
      {plan !== null && (
        <Card data-testid="planner-readiness-card">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">{dict.planner.readiness.progressAria}</CardTitle>
              <Badge
                variant={
                  plan.readiness.status === "READY"
                    ? "default"
                    : plan.readiness.status === "BLOCKED"
                      ? "destructive"
                      : "secondary"
                }
                data-testid="planner-readiness-status"
              >
                {dict.planner.readiness[plan.readiness.status]}
              </Badge>
            </div>
            <CardDescription data-testid="planner-readiness-progress">
              {requiredProgressText(dict, plan.readiness.requiredCompleted, plan.readiness.requiredTotal)}
              {" · "}
              {plan.readiness.completed}/{plan.readiness.total}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {plan.readiness.status === "READY"
                ? dict.planner.readiness.readyBody
                : plan.readiness.status === "BLOCKED"
                  ? dict.planner.readiness.blockedBody
                  : dict.planner.readiness.notReadyBody}
            </p>
            {plan.readiness.blockers.length > 0 && (
              <ul className="space-y-1" data-testid="planner-readiness-blockers">
                {plan.readiness.blockers.map((code) => (
                  <li key={code} className="flex items-start gap-2 text-sm text-loss">
                    <span aria-hidden>✗</span>
                    {blockerMessage(dict, code)}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Market + Playbook + Levels + Risk */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{E.sectionMarket}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="planner-instrument">{E.instrumentLabel}</Label>
              <Select
                value={draft.instrumentId}
                onValueChange={(value) => set("instrumentId", value)}
                disabled={readOnly}
              >
                <SelectTrigger id="planner-instrument" data-testid="planner-field-instrument">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {instruments.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.symbol} — {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{E.timeframeLabel}</Label>
              <Select value={draft.timeframe} onValueChange={(value) => set("timeframe", value as Timeframe)} disabled={readOnly}>
                <SelectTrigger data-testid="planner-field-timeframe">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEFRAMES.map((tf) => (
                    <SelectItem key={tf} value={tf}>
                      {tf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{E.directionLabel}</Label>
              <DirectionSegmented value={draft.direction} onChange={(value) => set("direction", value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{E.biasLabel}</Label>
              <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-background p-1" role="radiogroup" aria-label={E.biasAria} data-testid="planner-field-bias">
                {BIASES.map((bias) => {
                  const selected = draft.marketBias === bias;
                  return (
                    <button
                      key={bias}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={readOnly}
                      onClick={() => set("marketBias", bias)}
                      className={
                        selected
                          ? "flex h-9 items-center justify-center rounded-sm bg-accent text-sm font-semibold text-accent-foreground"
                          : "flex h-9 items-center justify-center rounded-sm text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      }
                    >
                      {bias === "BULLISH" ? E.biasBullish : bias === "BEARISH" ? E.biasBearish : E.biasNeutral}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{E.biasHint}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{E.sectionPlaybook}</CardTitle>
            <CardDescription>{E.playbookHint}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{E.strategyLabel}</Label>
                <Select
                  value={draft.strategyId}
                  onValueChange={(value) => {
                    set("strategyId", value);
                    set("setupId", "");
                  }}
                  disabled={readOnly}
                >
                  <SelectTrigger data-testid="planner-field-strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{E.strategyNone}</SelectItem>
                    {strategies.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{E.setupLabel}</Label>
                <Select
                  value={draft.setupId}
                  onValueChange={(value) => set("setupId", value)}
                  disabled={readOnly || draft.strategyId === ""}
                >
                  <SelectTrigger data-testid="planner-field-setup">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{E.setupNone}</SelectItem>
                    {strategySetups.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {strategy?.risk && (
              <div className="rounded-md border border-border/60 bg-muted/30 p-3" data-testid="planner-strategy-risk">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {E.strategyRiskTitle}
                </p>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{E.strategyRiskDefault}</dt>
                    <dd className="font-mono tabular-nums">
                      {strategy.risk.defaultRiskPct === null ? "—" : `${formatNumber(strategy.risk.defaultRiskPct, 2)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{E.strategyRiskMax}</dt>
                    <dd className="font-mono tabular-nums">
                      {strategy.risk.maxRiskPct === null ? "—" : `${formatNumber(strategy.risk.maxRiskPct, 2)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{E.strategyRiskMinRR}</dt>
                    <dd className="font-mono tabular-nums">
                      {strategy.risk.minRR === null ? "—" : `1 : ${formatNumber(strategy.risk.minRR, 2)}`}
                    </dd>
                  </div>
                </dl>
                {strategy.risk.newsRestriction && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {E.strategyRiskNews}: {strategy.risk.newsRestriction}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{E.sectionLevels}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <DecimalField
              id="planner-field-entry"
              label={E.entryLabel}
              value={draft.entryPrice}
              onChange={(value) => set("entryPrice", value)}
              disabled={readOnly}
              testid="planner-field-entry"
            />
            <DecimalField
              id="planner-field-stop"
              label={E.stopLabel}
              value={draft.stopLoss}
              onChange={(value) => set("stopLoss", value)}
              disabled={readOnly}
              testid="planner-field-stop"
            />
            <DecimalField
              id="planner-field-tp"
              label={E.tpLabel}
              value={draft.takeProfit}
              onChange={(value) => set("takeProfit", value)}
              disabled={readOnly}
              testid="planner-field-tp"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{E.sectionRisk}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="planner-field-risk">{E.riskLabel}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="planner-field-risk"
                  inputMode="decimal"
                  value={draft.riskPercent}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === "" || /^\d{0,3}(\.\d{0,4})?$/.test(next)) set("riskPercent", next);
                  }}
                  disabled={readOnly}
                  className="w-24 font-mono tabular-nums"
                  data-testid="planner-field-risk"
                />
                <span className="text-sm text-muted-foreground">{E.riskUnit}</span>
                <div className="ml-auto flex gap-1" role="group" aria-label={E.riskPresetAria}>
                  {RISK_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={readOnly}
                      onClick={() => set("riskPercent", String(preset))}
                      aria-label={`${E.riskPresetAria} ${preset}%`}
                      className="font-mono tabular-nums"
                      data-testid={`planner-risk-preset-${preset}`}
                    >
                      {formatNumber(preset, 2)}%
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {E.previewTitle}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="planner-preview">
                <PreviewCell label={E.previewRiskAmount} value={previewRiskAmount === null ? E.previewUnavailable : formatMoney(previewRiskAmount.toFixed(2), currency)} testid="planner-preview-risk" />
                <PreviewCell label={E.previewPositionSize} value={previewSuggested?.quantity ?? E.previewUnavailable} testid="planner-preview-size" />
                <PreviewCell label={E.previewRR} value={previewRR === null ? E.previewUnavailable : `1 : ${formatNumber(previewRR, 2)}`} testid="planner-preview-rr" />
                <PreviewCell label={E.previewBalance} value={balance > 0 ? formatMoney(balance, currency) : E.previewUnavailable} testid="planner-preview-balance" />
                <PreviewCell label={E.previewStopDistance} value={previewStopDistance === null ? E.previewUnavailable : formatNumber(previewStopDistance, 2)} testid="planner-preview-distance" />
              </div>
              <p className="text-xs text-muted-foreground">{E.previewHint}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Thesis / invalidation / notes */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{E.sectionThesis}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="planner-field-thesis">{E.thesisLabel}</Label>
              <Textarea
                id="planner-field-thesis"
                value={draft.thesis}
                onChange={(event) => set("thesis", event.target.value)}
                placeholder={E.thesisPlaceholder}
                rows={4}
                disabled={readOnly}
                data-testid="planner-field-thesis"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="planner-field-invalidation">{E.invalidationLabel}</Label>
              <Textarea
                id="planner-field-invalidation"
                value={draft.invalidation}
                onChange={(event) => set("invalidation", event.target.value)}
                placeholder={E.invalidationPlaceholder}
                rows={3}
                disabled={readOnly}
                data-testid="planner-field-invalidation"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="planner-field-notes">{E.notesLabel}</Label>
              <Textarea
                id="planner-field-notes"
                value={draft.notes}
                onChange={(event) => set("notes", event.target.value)}
                placeholder={E.notesPlaceholder}
                rows={2}
                disabled={readOnly}
                data-testid="planner-field-notes"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{E.sectionChecklist}</CardTitle>
            <CardDescription>
              {plan === null ? E.checklistLockedHint : E.checklistComposedHint}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {plan === null ? (
              <div
                className="flex h-40 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground"
                data-testid="planner-checklist-locked"
              >
                {E.checklistLockedHint}
              </div>
            ) : (
              <PlanChecklist
                items={plan.checklist}
                onToggle={onToggleChecklistItem}
                disabled={readOnly || busy}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirmation dialogs */}
      <Dialog open={confirmAction === "EXECUTED"} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent data-testid="planner-confirm-executed">
          <DialogHeader>
            <DialogTitle>{E.confirmExecutedTitle}</DialogTitle>
            <DialogDescription>{E.confirmExecutedBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="planner-link-trade">{E.linkTradeLabel}</Label>
            <Select
              value={linkedTradeId}
              onValueChange={(value) => setLinkedTradeId(value === "none" ? "" : value)}
              disabled={closedTrades.length === 0}
            >
              <SelectTrigger id="planner-link-trade" data-testid="planner-link-trade">
                <SelectValue placeholder={closedTrades.length === 0 ? E.linkTradeEmpty : E.linkTradeNone} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{E.linkTradeNone}</SelectItem>
                {closedTrades.map((trade) => (
                  <SelectItem key={trade.id} value={trade.id} data-testid="planner-link-trade-option">
                    {instruments.find((i) => i.id === trade.instrumentId)?.symbol ?? "—"} · {trade.tradingDate} ·{" "}
                    {formatNumber(trade.rMultiple, 2)}R
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{E.linkTradeHint}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              {dict.common.cancel}
            </Button>
            <Button onClick={onStatusAction} data-testid="planner-confirm-executed-confirm">
              {E.confirmExecutedConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmAction === "CANCELLED"} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent data-testid="planner-confirm-cancel">
          <DialogHeader>
            <DialogTitle>{E.confirmCancelTitle}</DialogTitle>
            <DialogDescription>{E.confirmCancelBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              {dict.common.cancel}
            </Button>
            <Button onClick={onStatusAction} data-testid="planner-confirm-cancel-confirm">
              {E.confirmCancelConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmAction === "EXPIRED" || confirmAction === "DELETE"} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent data-testid={confirmAction === "DELETE" ? "planner-confirm-delete" : "planner-confirm-expired"}>
          <DialogHeader>
            <DialogTitle>{confirmAction === "DELETE" ? E.confirmDeleteTitle : E.confirmCancelTitle}</DialogTitle>
            <DialogDescription>{confirmAction === "DELETE" ? E.confirmDeleteBody : E.confirmCancelBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              {dict.common.cancel}
            </Button>
            <Button
              variant={confirmAction === "DELETE" ? "destructive" : "default"}
              onClick={onStatusAction}
              data-testid={confirmAction === "DELETE" ? "planner-confirm-delete-confirm" : "planner-confirm-expired-confirm"}
            >
              {confirmAction === "DELETE" ? E.confirmDeleteConfirm : E.expirePlan}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DecimalField({ id, label, value, onChange, disabled, testid }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  testid: string;
}) {
  const { dict } = useI18n();
  const { editor } = dict.planner;
  const aria =
    id === "planner-field-entry" ? editor.entryAria : id === "planner-field-stop" ? editor.stopAria : editor.tpAria;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "" || /^\d{0,10}(\.\d{0,8})?$/.test(next)) onChange(next);
        }}
        disabled={disabled}
        className="font-mono tabular-nums"
        aria-label={aria}
        data-testid={testid}
      />
    </div>
  );
}

function PreviewCell({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2" data-testid={testid}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Map a stable MockError code through the dict, falling back to the wire text. */
function actionErrorText(error: unknown, dict: ReturnType<typeof useI18n>["dict"]): string {
  const message = apiErrorMessage(error, "");
  return blockerMessage(dict, message) !== message ? blockerMessage(dict, message) : (message || dict.planner.editor.actionFailedToast);
}

function blockerSummary(plan: TradePlan, dict: ReturnType<typeof useI18n>["dict"]): string {
  if (plan.readiness.status === "READY") return "";
  const first = plan.readiness.blockers[0];
  return first ? blockerMessage(dict, first) : dict.planner.blockers.CHECKLIST_INCOMPLETE;
}
