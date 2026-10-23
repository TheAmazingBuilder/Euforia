"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ChevronRight,
  ClipboardList,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  PLAN_PROCESS_TAGS,
  type AnalysisPlan,
  type AnalysisPlanDetailResponse,
  type PlanProcessTag,
  type PlanScenario,
  type PlanStatus,
  type Trade,
} from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiErrorMessage } from "@/lib/api/client";
import {
  useActivatePlan,
  useArchivePlan,
  useCompletePlan,
  useCreatePlan,
  useDeletePlan,
  useDetachPlanTrade,
  useInvalidatePlan,
  useLinkPlanTrade,
  usePlanDetail,
  usePlans,
  useUpdateAnalysisPlan,
} from "@/lib/api/queries/plans";
import { useInstruments } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const inputClasses =
  "h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";
const textClasses =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Phase 11 honesty contract, applied to every plan surface in the drawer:
 *  a plan is written reasoning — it never creates or mutates a trade, its
 *  levels are hypothetical (explicitly labeled), its probabilities are
 *  subjective (labeled as entered), and the planned-vs-actual comparison
 *  shows "-" for anything the canonical record does not provide. */

// ── Small shared pieces ──────────────────────────────────────────────────────

function statusBadgeClass(status: PlanStatus): string {
  switch (status) {
    case "ACTIVE":
      return "border-accent/40 bg-accent/10 text-accent";
    case "COMPLETED":
      return "border-profit/40 bg-profit/10 text-profit";
    case "INVALIDATED":
      return "border-loss/40 bg-loss/10 text-loss";
    case "DRAFT":
      return "border-warning/40 bg-warning/10 text-warning";
    case "ARCHIVED":
      return "border-border bg-surface text-muted-foreground";
  }
}

function roleBadgeClass(role: PlanScenario["role"]): string {
  switch (role) {
    case "PRIMARY":
      return "border-accent/40 bg-accent/10 text-accent";
    case "INVALIDATION":
      return "border-warning/40 bg-warning/10 text-warning";
    case "ALTERNATIVE":
      return "border-border bg-surface text-muted-foreground";
  }
}

function formatStamp(iso: string | null): string {
  if (iso === null) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function decimalOrDash(value: string | null): string {
  return value ?? "-";
}

interface ComparisonLegProps {
  label: string;
  planned: string | null;
  actual: string | null;
  available: boolean;
  plannedLabel: string;
  actualLabel: string;
  unavailableLabel: string;
}

/** One planned-vs-actual leg — honest "—" for anything missing; an explicit
 *  "unavailable" tag when the comparison cannot even be formed. */
function ComparisonLegRow({
  label,
  planned,
  actual,
  available,
  plannedLabel,
  actualLabel,
  unavailableLabel,
}: ComparisonLegProps) {
  return (
    <div className="grid grid-cols-[5rem_1fr_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-xs tabular-nums">
        {decimalOrDash(planned)}
        {planned !== null ? (
          <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {plannedLabel}
          </span>
        ) : null}
      </span>
      <span className="text-right font-mono text-xs tabular-nums">
        {decimalOrDash(actual)}
        {actual !== null ? (
          <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {actualLabel}
          </span>
        ) : null}
      </span>
      {!available ? (
        <span className="col-start-2 col-end-4 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
          {unavailableLabel}
        </span>
      ) : null}
    </div>
  );
}

// ── Section (drawer mount point) ─────────────────────────────────────────────

interface TradePlanSectionProps {
  trade: Trade;
}

export function TradePlanSection({ trade }: TradePlanSectionProps) {
  const { dict } = useI18n();
  const T = dict.trades.detail.plans;

  // `session` is a freshness nonce: EVERY open (create or edit) rehydrates
  // the editor from scratch — without it, two consecutive create sessions
  // share the "create" hydrate key and the second silently inherits the
  // first plan's fields (found by the Phase 11 probe).
  const [editorState, setEditorState] = React.useState<
    | { mode: "create"; session: number }
    | { mode: "edit"; plan: AnalysisPlan; session: number }
    | null
  >(null);
  const openCreateEditor = () => setEditorState({ mode: "create", session: Date.now() });
  const openEditEditor = (plan: AnalysisPlan) =>
    setEditorState({ mode: "edit", plan, session: Date.now() });
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [invalidateFor, setInvalidateFor] = React.useState<AnalysisPlan | null>(null);
  const [completeFor, setCompleteFor] = React.useState<AnalysisPlan | null>(null);
  const [mismatchFor, setMismatchFor] = React.useState<AnalysisPlan | null>(null);

  const { data: instrumentsData } = useInstruments();
  const tradeSymbol =
    instrumentsData?.instruments.find((item) => item.id === trade.instrumentId)?.symbol ?? "?";

  const linkedQuery = usePlans({ tradeId: trade.id });
  const symbolQuery = usePlans({ symbol: tradeSymbol });

  const link = useLinkPlanTrade();
  const unlink = useDetachPlanTrade();
  const deletePlan = useDeletePlan();

  const linked = linkedQuery.data?.plans ?? [];
  const unlinked = (symbolQuery.data?.plans ?? []).filter((plan) => plan.tradeId === null);

  const onLink = (plan: AnalysisPlan) => {
    if (plan.symbol !== tradeSymbol) {
      setMismatchFor(plan);
      return;
    }
    link.mutate(
      { planId: plan.id, input: { tradeId: trade.id } },
      {
        onSuccess: () => toast.success(T.linkedToast),
        onError: (error) => toast.error(apiErrorMessage(error, T.errors.link)),
      },
    );
  };

  const onConfirmMismatch = () => {
    if (mismatchFor === null) return;
    const plan = mismatchFor;
    setMismatchFor(null);
    link.mutate(
      {
        planId: plan.id,
        input: { tradeId: trade.id, confirmSymbolMismatch: true },
      },
      {
        onSuccess: () => toast.success(T.linkedToast),
        onError: (error) => toast.error(apiErrorMessage(error, T.errors.link)),
      },
    );
  };

  const onUnlink = (planId: string) => {
    unlink.mutate(planId, {
      onSuccess: () => toast.success(T.unlinkedToast),
      onError: (error) => toast.error(apiErrorMessage(error, T.errors.unlink)),
    });
  };

  const onDelete = (plan: AnalysisPlan) => {
    deletePlan.mutate(plan.id, {
      onSuccess: () => {
        toast.success(T.deletedToast);
        if (detailId === plan.id) setDetailId(null);
      },
      onError: (error) => toast.error(apiErrorMessage(error, T.errors.delete)),
    });
  };

  return (
    <section
      className="rounded-lg border border-border bg-surface p-3"
      data-testid="trade-plan-section"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ClipboardList className="size-3.5" aria-hidden="true" />
          {T.heading}
          <span className="font-mono tabular-nums text-[10px]">
            {linked.length > 0 ? `(${linked.length})` : ""}
          </span>
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={openCreateEditor}
          data-testid="trade-plan-create"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {T.create}
        </Button>
      </header>

      {linked.length === 0 && unlinked.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{T.empty}</p>
      ) : null}

      <div className="mt-2 space-y-2">
        {linked.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            linked
            T={T}
            onOpen={() => setDetailId(plan.id)}
            onUnlink={() => onUnlink(plan.id)}
            onDelete={() => onDelete(plan)}
          />
        ))}

        {unlinked.length > 0 ? (
          <div className="rounded-md border border-dashed border-border p-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {T.unlinkedHeading}
            </p>
            <div className="mt-1.5 space-y-1.5">
              {unlinked.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  linked={false}
                  T={T}
                  onOpen={() => setDetailId(plan.id)}
                  onLink={() => onLink(plan)}
                  onDelete={() => onDelete(plan)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <PlanEditorDialog
        defaultSymbol={tradeSymbol}
        state={editorState}
        onOpenChange={(next) => {
          if (!next) setEditorState(null);
        }}
      />
      <PlanDetailDialog
        planId={detailId}
        open={detailId !== null}
        onOpenChange={(next) => {
          if (!next) setDetailId(null);
        }}
        onEdit={(plan) => {
          setDetailId(null);
          openEditEditor(plan);
        }}
        onInvalidate={(plan) => {
          setDetailId(null);
          setInvalidateFor(plan);
        }}
        onComplete={(plan) => {
          setDetailId(null);
          setCompleteFor(plan);
        }}
        onDeleted={() => setDetailId(null)}
      />
      <InvalidateDialog
        plan={invalidateFor}
        onOpenChange={(next) => {
          if (!next) setInvalidateFor(null);
        }}
      />
      <CompleteDialog
        plan={completeFor}
        onOpenChange={(next) => {
          if (!next) setCompleteFor(null);
        }}
      />
      <Dialog
        open={mismatchFor !== null}
        onOpenChange={(next) => {
          if (!next) setMismatchFor(null);
        }}
      >
        <DialogContent className="sm:max-w-sm" data-testid="trade-plan-mismatch-dialog">
          <DialogHeader>
            <DialogTitle>{T.linkMismatchTitle}</DialogTitle>
            <DialogDescription>
              {T.linkMismatchBody.replace("{planSymbol}", mismatchFor?.symbol ?? "-").replace(
                "{tradeSymbol}",
                tradeSymbol,
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMismatchFor(null)}>
              {dict.common.cancel}
            </Button>
            <Button onClick={onConfirmMismatch} data-testid="trade-plan-mismatch-confirm">
              {T.confirmMismatch}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ── Plan card (list row) ─────────────────────────────────────────────────────

type PlansT = ReturnType<typeof useI18n>["dict"]["trades"]["detail"]["plans"];

interface PlanCardProps {
  plan: AnalysisPlan;
  linked: boolean;
  T: PlansT;
  onOpen: () => void;
  onLink?: () => void;
  onUnlink?: () => void;
  onDelete?: () => void;
}

function PlanCard({ plan, linked, T, onOpen, onLink, onUnlink, onDelete }: PlanCardProps) {
  return (
    <div
      className="group rounded-md border border-border bg-background p-2.5 transition-colors hover:border-accent/40"
      data-testid={`trade-plan-card-${plan.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onOpen}
          data-testid={`trade-plan-open-${plan.id}`}
        >
          <span className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn("h-5 shrink-0 px-1.5 text-[10px] uppercase", statusBadgeClass(plan.status))}
              data-testid={`trade-plan-status-${plan.id}`}
            >
              {T.statuses[plan.status]}
            </Badge>
            <span className="truncate text-sm font-medium">{plan.title}</span>
          </span>
          <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
            {plan.thesis}
          </span>
        </button>
        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tabular-nums text-muted-foreground">
          {plan.symbol}
          {plan.timeframe !== null ? ` · ${plan.timeframe}` : ""}
          {" · "}
          {T.updated} {formatStamp(plan.updatedAt)}
        </span>
        <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {!linked && onLink !== undefined ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={onLink}
              data-testid={`trade-plan-link-${plan.id}`}
            >
              {T.link}
            </Button>
          ) : null}
          {linked && onUnlink !== undefined ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={onUnlink}
              data-testid={`trade-plan-unlink-${plan.id}`}
            >
              {T.unlink}
            </Button>
          ) : null}
          {onDelete !== undefined && plan.status !== "ARCHIVED" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-loss"
              onClick={onDelete}
              data-testid={`trade-plan-delete-${plan.id}`}
            >
              <Trash2 className="size-3" aria-hidden="true" />
            </Button>
          ) : null}
        </span>
      </div>
    </div>
  );
}

// ── Plan detail dialog ───────────────────────────────────────────────────────

interface PlanDetailDialogProps {
  planId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (plan: AnalysisPlan) => void;
  onInvalidate: (plan: AnalysisPlan) => void;
  onComplete: (plan: AnalysisPlan) => void;
  onDeleted: () => void;
}

function PlanDetailDialog({
  planId,
  open,
  onOpenChange,
  onEdit,
  onInvalidate,
  onComplete,
  onDeleted,
}: PlanDetailDialogProps) {
  const { dict } = useI18n();
  const T = dict.trades.detail.plans;
  const { data, isLoading } = usePlanDetail(open && planId !== null ? planId : null);
  const activate = useActivatePlan();
  const archive = useArchivePlan();
  const deletePlan = useDeletePlan();

  const plan = data?.plan ?? null;
  const comparison: AnalysisPlanDetailResponse["comparison"] | null = data?.comparison ?? null;

  const [confirmDelete, setConfirmDelete] = React.useState(false);
  // Reset the two-step delete whenever a different plan opens (render-time).
  const [deleteFor, setDeleteFor] = React.useState<string | null>(null);
  if (deleteFor !== planId) {
    setDeleteFor(planId);
    setConfirmDelete(false);
  }

  if (plan === null) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" data-testid="trade-plan-detail-dialog">
          <DialogHeader>
            <DialogTitle>{T.heading}</DialogTitle>
            <DialogDescription>{isLoading ? dict.common.loading : "-"}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const status = plan.status;
  const isEditable = status === "DRAFT" || status === "ACTIVE";
  const canArchive = status !== "ARCHIVED";
  const criteriaDocumented =
    plan.invalidationCriteria !== null && plan.invalidationCriteria.trim() !== "";

  const onActivate = () => {
    activate.mutate(plan.id, {
      onSuccess: () => toast.success(T.activatedToast),
      onError: (error) => toast.error(apiErrorMessage(error, T.errors.activate)),
    });
  };
  const onArchive = () => {
    archive.mutate(plan.id, {
      onSuccess: () => toast.success(T.archivedToast),
      onError: (error) => toast.error(apiErrorMessage(error, T.errors.archive)),
    });
  };
  const onDeleteConfirmed = () => {
    deletePlan.mutate(plan.id, {
      onSuccess: () => {
        toast.success(T.deletedToast);
        onDeleted();
        onOpenChange(false);
      },
      onError: (error) => toast.error(apiErrorMessage(error, T.errors.delete)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto p-0 sm:max-w-xl"
        data-testid="trade-plan-detail-dialog"
      >
        <DialogHeader className="gap-1.5 border-b border-border p-4 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("h-5 px-1.5 text-[10px] uppercase", statusBadgeClass(status))}
              data-testid="trade-plan-detail-status"
            >
              {T.statuses[status]}
            </Badge>
            <DialogTitle className="font-heading text-base font-semibold">
              {plan.title}
            </DialogTitle>
          </div>
          <DialogDescription className="font-mono text-[11px] uppercase tabular-nums">
            {plan.symbol}
            {plan.timeframe !== null ? ` · ${plan.timeframe}` : ""} · {T.created}{" "}
            {formatStamp(plan.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {/* Thesis */}
          <section className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {T.thesisHeading}
            </h4>
            <p className="whitespace-pre-wrap text-sm" data-testid="trade-plan-detail-thesis">
              {plan.thesis}
            </p>
          </section>

          {/* Invalidation criteria */}
          <section className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {T.invalidationLabel}
            </h4>
            {criteriaDocumented ? (
              <p className="whitespace-pre-wrap text-sm" data-testid="trade-plan-detail-criteria">
                {plan.invalidationCriteria}
              </p>
            ) : (
              <p className="text-sm text-warning" data-testid="trade-plan-detail-criteria-missing">
                {T.criteriaMissing}
              </p>
            )}
            {plan.invalidationReason !== null ? (
              <p className="rounded-md border border-loss/30 bg-loss/10 p-2 text-xs text-loss">
                <span className="font-semibold uppercase">{T.invalidationReasonLabel}: </span>
                {plan.invalidationReason}
                {plan.invalidatedAt !== null ? ` · ${formatStamp(plan.invalidatedAt)}` : ""}
              </p>
            ) : null}
          </section>

          {/* Planned levels — hypothetical by contract */}
          {plan.plannedEntry !== null ||
          plan.plannedStop !== null ||
          (plan.plannedTargets !== null && plan.plannedTargets.length > 0) ? (
            <section className="space-y-1.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {T.levelsHeading}
                <Badge
                  variant="outline"
                  className="h-4 border-warning/40 bg-warning/10 px-1 text-[9px] uppercase text-warning"
                >
                  {T.hypotheticalBadge}
                </Badge>
              </h4>
              <p className="text-[11px] text-muted-foreground">{T.levelsNote}</p>
              <div className="grid grid-cols-3 gap-2 font-mono text-sm tabular-nums">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">{T.plannedEntry}</p>
                  <p data-testid="trade-plan-detail-entry">{decimalOrDash(plan.plannedEntry)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">{T.plannedStop}</p>
                  <p data-testid="trade-plan-detail-stop">{decimalOrDash(plan.plannedStop)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">{T.plannedTargets}</p>
                  <p data-testid="trade-plan-detail-targets">
                    {plan.plannedTargets !== null && plan.plannedTargets.length > 0
                      ? plan.plannedTargets.join(", ")
                      : "-"}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {/* Scenarios */}
          {plan.scenarios.length > 0 ? (
            <section className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {T.scenariosHeading}
              </h4>
              <ul className="space-y-1.5" data-testid="trade-plan-detail-scenarios">
                {plan.scenarios.map((scenario) => (
                  <li
                    key={scenario.id}
                    className="rounded-md border border-border bg-background p-2"
                    data-testid={`trade-plan-scenario-${scenario.id}`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn("h-4 px-1 text-[9px] uppercase", roleBadgeClass(scenario.role))}
                      >
                        {T.roles[scenario.role]}
                      </Badge>
                      <span className="text-xs font-medium">{scenario.title}</span>
                      {scenario.probabilityPct !== null && scenario.probabilityPct !== undefined ? (
                        <Badge
                          variant="outline"
                          className="ml-auto h-4 border-border bg-surface px-1 font-mono text-[9px] tabular-nums"
                        >
                          {T.probabilityPrefix} {scenario.probabilityPct}% · {T.subjectiveBadge}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                      {scenario.description}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Lifecycle trail — every timestamp the contract actually keeps */}
          <section className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {T.lifecycleHeading}
            </h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" data-testid="trade-plan-detail-lifecycle">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{T.created}</dt>
                <dd className="font-mono tabular-nums">{formatStamp(plan.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{T.updated}</dt>
                <dd className="font-mono tabular-nums">{formatStamp(plan.updatedAt)}</dd>
              </div>
              {plan.invalidatedAt !== null ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{T.invalidated}</dt>
                  <dd className="font-mono tabular-nums">{formatStamp(plan.invalidatedAt)}</dd>
                </div>
              ) : null}
              {plan.reviewedAt !== null ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{T.reviewed}</dt>
                  <dd className="font-mono tabular-nums">{formatStamp(plan.reviewedAt)}</dd>
                </div>
              ) : null}
              {plan.completedAt !== null ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{T.completed}</dt>
                  <dd className="font-mono tabular-nums">{formatStamp(plan.completedAt)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {/* Post-trade review (COMPLETED) */}
          {status === "COMPLETED" &&
          (plan.reviewNotes !== null || (plan.processTags !== null && plan.processTags.length > 0)) ? (
            <section className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {T.reviewHeading}
              </h4>
              {plan.reviewNotes !== null ? (
                <p className="whitespace-pre-wrap text-sm" data-testid="trade-plan-detail-review-notes">
                  {plan.reviewNotes}
                </p>
              ) : null}
              {plan.processTags !== null && plan.processTags.length > 0 ? (
                <div className="flex flex-wrap gap-1" data-testid="trade-plan-detail-process-tags">
                  {plan.processTags.map((tag) => (
                    <Badge key={tag} variant="outline" className="h-5 px-1.5 text-[10px]">
                      {T.processTags[tag]}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <Separator />

          {/* Planned vs actual — facts only, honest nulls */}
          <section className="space-y-1.5" data-testid="trade-plan-detail-comparison">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {T.comparisonHeading}
            </h4>
            <p className="text-[11px] text-muted-foreground">{T.comparisonNote}</p>
            {comparison === null ? null : comparison.trade === null ? (
              <p className="text-xs text-muted-foreground" data-testid="trade-plan-comparison-empty">
                {T.noTradeLink}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-[5rem_1fr_1fr] gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span />
                  <span className="text-right">{T.legPlanned}</span>
                  <span className="text-right">{T.legActual}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[5rem_1fr_1fr] items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{T.legDirection}</span>
                    <span className="text-right text-xs">{T.legDirectionPlanned}</span>
                    <span
                      className="text-right font-mono text-xs tabular-nums"
                      data-testid="trade-plan-comparison-direction"
                    >
                      {comparison.direction.actual ?? "-"}
                    </span>
                  </div>
                  <ComparisonLegRow
                    label={T.legEntry}
                    planned={comparison.entry.planned}
                    actual={comparison.entry.actual}
                    available={comparison.entry.available}
                    plannedLabel="plan"
                    actualLabel="real"
                    unavailableLabel={T.noTradeLink}
                  />
                  <ComparisonLegRow
                    label={T.legStop}
                    planned={comparison.stop.planned}
                    actual={comparison.stop.actual}
                    available={comparison.stop.available}
                    plannedLabel="plan"
                    actualLabel="real"
                    unavailableLabel={T.noTradeLink}
                  />
                  <ComparisonLegRow
                    label={T.legTarget}
                    planned={comparison.target.planned}
                    actual={comparison.target.actual}
                    available={comparison.target.available}
                    plannedLabel="plan"
                    actualLabel="real"
                    unavailableLabel={T.noTradeLink}
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{T.planCreatedAt}</dt>
                    <dd className="font-mono tabular-nums">{formatStamp(comparison.timing.planCreatedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{T.tradeEntryAt}</dt>
                    <dd className="font-mono tabular-nums" data-testid="trade-plan-comparison-entry-at">
                      {formatStamp(comparison.timing.tradeEntryAt)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{T.tradeStatus}</dt>
                    <dd className="font-mono uppercase tabular-nums">{comparison.trade.status}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{T.tradePnl}</dt>
                    <dd className="font-mono tabular-nums">{decimalOrDash(comparison.trade.pnlNet)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{T.tradeR}</dt>
                    <dd className="font-mono tabular-nums">{decimalOrDash(comparison.trade.rMultiple)}</dd>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        {/* Actions — offered strictly per lifecycle state */}
        <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-surface p-3">
          {status === "DRAFT" ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={onActivate}
              disabled={activate.isPending}
              title={criteriaDocumented ? undefined : T.activateHint}
              data-testid="trade-plan-activate"
            >
              {activate.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              {T.activate}
            </Button>
          ) : null}
          {isEditable ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onEdit(plan)}
              data-testid="trade-plan-edit"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              {dict.trades.shared.edit}
            </Button>
          ) : null}
          {status === "ACTIVE" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onInvalidate(plan)}
                data-testid="trade-plan-invalidate"
              >
                {T.invalidate}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onComplete(plan)}
                data-testid="trade-plan-complete"
              >
                {T.complete}
              </Button>
            </>
          ) : null}
          {canArchive ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={onArchive}
              disabled={archive.isPending}
              data-testid="trade-plan-archive"
            >
              {T.archive}
            </Button>
          ) : null}
          {status !== "ARCHIVED" ? (
            confirmDelete ? (
              <span className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{T.deleteConfirm}</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onDeleteConfirmed}
                  disabled={deletePlan.isPending}
                  data-testid="trade-plan-delete-confirm"
                >
                  {T.deletePlan}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  data-testid="trade-plan-delete-cancel"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-loss"
                onClick={() => setConfirmDelete(true)}
                data-testid="trade-plan-delete"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {T.deletePlan}
              </Button>
            )
          ) : null}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ── Editor dialog (create + edit) ────────────────────────────────────────────

interface PlanEditorDialogProps {
  defaultSymbol: string;
  state:
    | { mode: "create"; session: number }
    | { mode: "edit"; plan: AnalysisPlan; session: number }
    | null;
  onOpenChange: (open: boolean) => void;
}

interface ScenarioDraft {
  id: string;
  role: PlanScenario["role"];
  title: string;
  description: string;
  probability: string;
}

function scenarioId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Plans start unlinked by design (the create contract carries no tradeId);
 *  linking back to THIS trade is the section's explicit "Link" action. */
function PlanEditorDialog({
  defaultSymbol,
  state,
  onOpenChange,
}: PlanEditorDialogProps) {
  const { dict } = useI18n();
  const T = dict.trades.detail.plans;
  const create = useCreatePlan();
  const update = useUpdateAnalysisPlan();

  const open = state !== null;
  const editing = state !== null && state.mode === "edit" ? state.plan : null;

  const [title, setTitle] = React.useState("");
  const [symbol, setSymbol] = React.useState("");
  const [timeframe, setTimeframe] = React.useState("");
  const [thesis, setThesis] = React.useState("");
  const [invalidationCriteria, setInvalidationCriteria] = React.useState("");
  const [plannedEntry, setPlannedEntry] = React.useState("");
  const [plannedStop, setPlannedStop] = React.useState("");
  const [targets, setTargets] = React.useState("");
  const [scenarios, setScenarios] = React.useState<ScenarioDraft[]>([]);

  // Re-hydrate whenever the dialog opens for a different target (render-time
  // adjustment — no setState inside effects).
  const [hydratedKey, setHydratedKey] = React.useState<string | null>(null);
  const key = open ? `${state!.session}:${editing?.id ?? "create"}` : null;
  if (key !== null && hydratedKey !== key) {
    setHydratedKey(key);
    if (editing !== null) {
      setTitle(editing.title);
      setSymbol(editing.symbol);
      setTimeframe(editing.timeframe ?? "");
      setThesis(editing.thesis);
      setInvalidationCriteria(editing.invalidationCriteria ?? "");
      setPlannedEntry(editing.plannedEntry ?? "");
      setPlannedStop(editing.plannedStop ?? "");
      setTargets(editing.plannedTargets?.join(", ") ?? "");
      setScenarios(
        editing.scenarios.map((scenario) => ({
          id: scenario.id,
          role: scenario.role,
          title: scenario.title,
          description: scenario.description,
          probability:
            scenario.probabilityPct === null || scenario.probabilityPct === undefined
              ? ""
              : String(scenario.probabilityPct),
        })),
      );
    } else {
      setTitle("");
      setSymbol(defaultSymbol);
      setTimeframe("");
      setThesis("");
      setInvalidationCriteria("");
      setPlannedEntry("");
      setPlannedStop("");
      setTargets("");
      setScenarios([]);
    }
  }

  if (state === null) return null;

  const addScenario = () => {
    setScenarios((current) => [
      ...current,
      { id: scenarioId(), role: "ALTERNATIVE", title: "", description: "", probability: "" },
    ]);
  };

  const patchScenario = (id: string, patch: Partial<ScenarioDraft>) => {
    setScenarios((current) =>
      current.map((scenario) => (scenario.id === id ? { ...scenario, ...patch } : scenario)),
    );
  };

  const targetsValid =
    targets.trim() === "" ||
    targets
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .every((part) => DECIMAL_RE.test(part));
  const levelsValid =
    (plannedEntry === "" || DECIMAL_RE.test(plannedEntry)) &&
    (plannedStop === "" || DECIMAL_RE.test(plannedStop)) &&
    targetsValid;
  const canSubmit =
    title.trim() !== "" && symbol.trim() !== "" && thesis.trim() !== "" && levelsValid;

  const buildScenarios = (): PlanScenario[] =>
    scenarios
      .filter((scenario) => scenario.title.trim() !== "" || scenario.description.trim() !== "")
      .map((scenario) => ({
        id: scenario.id,
        role: scenario.role,
        title: scenario.title.trim() === "" ? scenario.description.slice(0, 60) : scenario.title.trim(),
        description:
          scenario.description.trim() === "" ? scenario.title.trim() : scenario.description.trim(),
        supports: null,
        falsifiedBy: null,
        probabilityPct:
          scenario.probability.trim() === "" || !/^\d{1,3}$/.test(scenario.probability.trim())
            ? null
            : Number(scenario.probability.trim()),
        outcomeNotes: null,
      }));

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (editing !== null) {
      update.mutate(
        {
          planId: editing.id,
          input: {
            title: title.trim(),
            symbol: symbol.trim(),
            timeframe: timeframe.trim() === "" ? null : timeframe.trim(),
            thesis: thesis.trim(),
            invalidationCriteria: invalidationCriteria.trim() === "" ? null : invalidationCriteria.trim(),
            plannedEntry: plannedEntry.trim() === "" ? null : plannedEntry.trim(),
            plannedStop: plannedStop.trim() === "" ? null : plannedStop.trim(),
            plannedTargets:
              targets.trim() === ""
                ? null
                : targets
                    .split(",")
                    .map((part) => part.trim())
                    .filter((part) => part !== ""),
            scenarios: buildScenarios(),
          },
        },
        {
          onSuccess: () => {
            toast.success(T.savedToast);
            onOpenChange(false);
          },
          onError: (error) => toast.error(apiErrorMessage(error, T.errors.update)),
        },
      );
    } else {
      create.mutate(
        {
          title: title.trim(),
          symbol: symbol.trim(),
          timeframe: timeframe.trim() === "" ? null : timeframe.trim(),
          thesis: thesis.trim(),
          invalidationCriteria: invalidationCriteria.trim() === "" ? null : invalidationCriteria.trim(),
          plannedEntry: plannedEntry.trim() === "" ? null : plannedEntry.trim(),
          plannedStop: plannedStop.trim() === "" ? null : plannedStop.trim(),
          plannedTargets:
            targets.trim() === ""
              ? null
              : targets
                  .split(",")
                  .map((part) => part.trim())
                  .filter((part) => part !== ""),
          scenarios: buildScenarios(),
          clientRequestId: scenarioId(),
        },
        {
          onSuccess: () => {
            toast.success(T.createdToast);
            onOpenChange(false);
          },
          onError: (error) => toast.error(apiErrorMessage(error, T.errors.create)),
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto p-0 sm:max-w-xl"
        data-testid="trade-plan-editor-dialog"
      >
        <DialogHeader className="gap-1 border-b border-border p-4 pb-3">
          <DialogTitle className="font-heading text-lg font-semibold">
            {editing !== null ? T.editTitle : T.createTitle}
          </DialogTitle>
          <DialogDescription>{T.createDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-3 p-4" data-testid="trade-plan-form">
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem_6rem]">
            <div className="space-y-1.5">
              <Label htmlFor="plan-title">{T.titleLabel}</Label>
              <input
                id="plan-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={T.titlePlaceholder}
                className={inputClasses}
                data-testid="trade-plan-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-symbol">{T.symbolLabel}</Label>
              <input
                id="plan-symbol"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                className={inputClasses}
                data-testid="trade-plan-symbol"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-timeframe">{T.timeframeLabel}</Label>
              <input
                id="plan-timeframe"
                value={timeframe}
                onChange={(event) => setTimeframe(event.target.value)}
                placeholder={T.timeframePlaceholder}
                className={inputClasses}
                data-testid="trade-plan-timeframe"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-thesis">{T.thesisLabel}</Label>
            <textarea
              id="plan-thesis"
              value={thesis}
              onChange={(event) => setThesis(event.target.value)}
              placeholder={T.thesisPlaceholder}
              rows={3}
              className={textClasses}
              data-testid="trade-plan-thesis"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-invalidation">{T.invalidationLabel}</Label>
            <textarea
              id="plan-invalidation"
              value={invalidationCriteria}
              onChange={(event) => setInvalidationCriteria(event.target.value)}
              placeholder={T.invalidationPlaceholder}
              rows={2}
              className={textClasses}
              data-testid="trade-plan-invalidation"
            />
            <p className="text-[11px] text-muted-foreground">{T.invalidationHint}</p>
          </div>

          <section className="space-y-1.5 rounded-lg border border-border bg-surface p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {T.levelsHeading}
              <Badge
                variant="outline"
                className="h-4 border-warning/40 bg-warning/10 px-1 text-[9px] uppercase text-warning"
              >
                {T.hypotheticalBadge}
              </Badge>
            </h4>
            <p className="text-[11px] text-muted-foreground">{T.levelsNote}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="plan-entry">{T.plannedEntry}</Label>
                <input
                  id="plan-entry"
                  value={plannedEntry}
                  onChange={(event) => setPlannedEntry(event.target.value)}
                  placeholder="-"
                  inputMode="decimal"
                  className={inputClasses}
                  data-testid="trade-plan-entry"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="plan-stop">{T.plannedStop}</Label>
                <input
                  id="plan-stop"
                  value={plannedStop}
                  onChange={(event) => setPlannedStop(event.target.value)}
                  placeholder="-"
                  inputMode="decimal"
                  className={inputClasses}
                  data-testid="trade-plan-stop"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-targets">{T.plannedTargets}</Label>
              <input
                id="plan-targets"
                value={targets}
                onChange={(event) => setTargets(event.target.value)}
                placeholder={T.targetsPlaceholder}
                inputMode="decimal"
                className={inputClasses}
                data-testid="trade-plan-targets"
              />
            </div>
            {!levelsValid ? (
              <p className="text-[11px] text-loss">Invalid decimal format</p>
            ) : null}
          </section>

          <section className="space-y-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {T.scenariosHeading}
              </h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={addScenario}
                disabled={scenarios.length >= 6}
                data-testid="trade-plan-add-scenario"
              >
                <Plus className="size-3" aria-hidden="true" />
                {T.addScenario}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{T.scenariosNote}</p>
            {scenarios.map((scenario, index) => (
              <div
                key={scenario.id}
                className="space-y-2 rounded-md border border-border bg-background p-2"
                data-testid={`trade-plan-scenario-draft-${index}`}
              >
                <div className="grid gap-2 sm:grid-cols-[9rem_1fr_6rem]">
                  <select
                    value={scenario.role}
                    onChange={(event) =>
                      patchScenario(scenario.id, {
                        role: event.target.value as PlanScenario["role"],
                      })
                    }
                    className={cn(inputClasses, "font-sans")}
                    aria-label={T.scenarioTitleLabel}
                    data-testid={`trade-plan-scenario-role-${index}`}
                  >
                    <option value="PRIMARY">{T.roles.PRIMARY}</option>
                    <option value="ALTERNATIVE">{T.roles.ALTERNATIVE}</option>
                    <option value="INVALIDATION">{T.roles.INVALIDATION}</option>
                  </select>
                  <input
                    value={scenario.title}
                    onChange={(event) => patchScenario(scenario.id, { title: event.target.value })}
                    placeholder={T.scenarioTitlePlaceholder}
                    className={inputClasses}
                    data-testid={`trade-plan-scenario-title-${index}`}
                  />
                  <input
                    value={scenario.probability}
                    onChange={(event) =>
                      patchScenario(scenario.id, { probability: event.target.value })
                    }
                    placeholder={T.scenarioProbability}
                    inputMode="numeric"
                    className={inputClasses}
                    data-testid={`trade-plan-scenario-probability-${index}`}
                  />
                </div>
                <textarea
                  value={scenario.description}
                  onChange={(event) =>
                    patchScenario(scenario.id, { description: event.target.value })
                  }
                  placeholder={T.scenarioDescriptionPlaceholder}
                  rows={2}
                  className={textClasses}
                  data-testid={`trade-plan-scenario-description-${index}`}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{T.probabilityHint}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-loss"
                    onClick={() =>
                      setScenarios((current) => current.filter((item) => item.id !== scenario.id))
                    }
                    data-testid={`trade-plan-scenario-remove-${index}`}
                  >
                    <Trash2 className="size-3" aria-hidden="true" />
                    {T.removeScenario}
                  </Button>
                </div>
              </div>
            ))}
          </section>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {dict.common.cancel}
            </Button>
            <Button type="submit" disabled={!canSubmit || create.isPending || update.isPending} data-testid="trade-plan-save">
              {create.isPending || update.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {editing !== null ? T.saveChanges : T.saveDraft}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Invalidate dialog (manual, reason REQUIRED) ─────────────────────────────

const QUICK_REASON_KEYS = ["thesis", "setup", "risk", "news", "manual"] as const;

interface InvalidateDialogProps {
  plan: AnalysisPlan | null;
  onOpenChange: (open: boolean) => void;
}

function InvalidateDialog({ plan, onOpenChange }: InvalidateDialogProps) {
  const { dict } = useI18n();
  const T = dict.trades.detail.plans;
  const invalidate = useInvalidatePlan();
  const [reason, setReason] = React.useState("");

  // Fresh reason per plan — render-time adjustment, no effect setState.
  const [reasonFor, setReasonFor] = React.useState<string | null>(null);
  if (plan !== null && reasonFor !== plan.id) {
    setReasonFor(plan.id);
    setReason("");
  }

  if (plan === null) return null;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed === "") return;
    invalidate.mutate(
      { planId: plan.id, input: { reason: trimmed } },
      {
        onSuccess: () => {
          toast.success(T.invalidatedToast);
          onOpenChange(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, T.errors.invalidate)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="trade-plan-invalidate-dialog">
        <DialogHeader>
          <DialogTitle>{T.invalidateTitle}</DialogTitle>
          <DialogDescription>{T.invalidateDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {QUICK_REASON_KEYS.map((key) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => setReason(T.reasons[key])}
                data-testid={`trade-plan-reason-${key}`}
              >
                {T.reasons[key]}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-invalidate-reason">{T.reasonLabel}</Label>
            <textarea
              id="plan-invalidate-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={T.reasonPlaceholder}
              rows={3}
              className={textClasses}
              data-testid="trade-plan-reason-input"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {dict.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={reason.trim() === "" || invalidate.isPending}
              data-testid="trade-plan-invalidate-confirm"
            >
              {invalidate.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {T.invalidate}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Complete dialog (the post-trade review, process over outcome) ───────────

interface CompleteDialogProps {
  plan: AnalysisPlan | null;
  onOpenChange: (open: boolean) => void;
}

function CompleteDialog({ plan, onOpenChange }: CompleteDialogProps) {
  const { dict } = useI18n();
  const T = dict.trades.detail.plans;
  const complete = useCompletePlan();
  const [notes, setNotes] = React.useState("");
  const [tags, setTags] = React.useState<PlanProcessTag[]>([]);

  const [hydratedFor, setHydratedFor] = React.useState<string | null>(null);
  if (plan !== null && hydratedFor !== plan.id) {
    setHydratedFor(plan.id);
    setNotes("");
    setTags([]);
  }

  if (plan === null) return null;

  const toggleTag = (tag: PlanProcessTag) => {
    setTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    complete.mutate(
      {
        planId: plan.id,
        input: {
          reviewNotes: notes.trim() === "" ? null : notes.trim(),
          processTags: tags.length === 0 ? null : tags,
        },
      },
      {
        onSuccess: () => {
          toast.success(T.completedToast);
          onOpenChange(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, T.errors.complete)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="trade-plan-complete-dialog">
        <DialogHeader>
          <DialogTitle>{T.completeTitle}</DialogTitle>
          <DialogDescription>{T.completeDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="plan-review-notes">{T.reviewNotesLabel}</Label>
            <textarea
              id="plan-review-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={T.reviewNotesPlaceholder}
              rows={4}
              className={textClasses}
              data-testid="trade-plan-review-notes"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{T.processTagsLabel}</Label>
            <div className="flex flex-wrap gap-1.5" data-testid="trade-plan-process-tags">
              {PLAN_PROCESS_TAGS.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                      active
                        ? "border-accent/50 bg-accent/15 text-accent"
                        : "border-border bg-background text-muted-foreground hover:border-accent/30",
                    )}
                    data-testid={`trade-plan-tag-${tag}`}
                  >
                    {T.processTags[tag]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {dict.common.cancel}
            </Button>
            <Button type="submit" disabled={complete.isPending} data-testid="trade-plan-complete-confirm">
              {complete.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {T.completeConfirm}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
