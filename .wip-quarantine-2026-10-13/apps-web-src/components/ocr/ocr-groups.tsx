"use client";

import * as React from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  GitMerge,
  Layers,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api/client";
import {
  useConfirmRecognitionGroup,
  useCreateRecognitionGroup,
  useDiscardRecognitionGroup,
  useRecognitionGroup,
  useUpdateRecognitionGroupDraft,
} from "@/lib/api/queries";
import type {
  RecognitionGroupMember,
  RecognitionGroupStatus,
  RecognitionHistoryItem,
  TradeDraftInput,
} from "@/lib/recognition/contract";
import { ConfirmImport, TradeDraftReview } from "./ocr-draft";
import { JobStatusBadge } from "./ocr-badges";
import { formatRelative } from "./ocr-format";
import { nowMs, useNow } from "./ocr-now";

/**
 * V3 — multi-screenshot fusion groups (spec §14/§15): N completed
 * recognitions of the SAME trade fuse into ONE editable draft. Every member
 * keeps its own recognition; the fused draft is a separate view. Conflicting
 * values are PRESERVED with their origin (§31) — the user decides, Cosmoz
 * never silently merges.
 */

const GROUP_STATUS_META: Record<RecognitionGroupStatus, { label: string; className: string }> = {
  PROPOSED: { label: "Possible group", className: "border-warning/40 bg-warning/10 text-warning" },
  ACTIVE: { label: "Active", className: "border-accent/40 bg-accent/10 text-accent" },
  CONFIRMED: { label: "Confirmed", className: "border-profit/40 bg-profit/10 text-profit" },
  DISCARDED: { label: "Discarded", className: "border-border text-muted-foreground" },
};

const EVIDENCE_LABELS: Record<string, string> = {
  SYMBOL: "Symbol",
  DIRECTION: "Direction",
  PLATFORM: "Platform",
  ACCOUNT: "Account",
  POSITION_ID: "Position ID",
  ORDER_ID: "Order ID",
  TIMESTAMP_PROXIMITY: "Time proximity",
  SCREENSHOT_TYPE: "Screenshot type",
  VOLUME: "Volume",
};

// ── Create-group dialog (multi-select over completed recognitions) ──────────

export function CreateGroupDialog({
  open,
  onOpenChange,
  jobs,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Completed recognitions only — the fusion input (spec §14). */
  jobs: RecognitionHistoryItem[];
  onCreated: (groupId: string) => void;
}) {
  const createMutation = useCreateRecognitionGroup();
  const [selected, setSelected] = React.useState<string[]>([]);

  const toggle = (jobId: string) => {
    setSelected((current) =>
      current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId],
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelected([]);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg" data-testid="ocr-group-dialog">
        <DialogHeader>
          <DialogTitle>Group screenshots into one trade</DialogTitle>
          <DialogDescription>
            Select 2–8 recognitions that show the same trade — Cosmoz correlates the evidence,
            fuses the strongest values and keeps any conflicting field visible for you to decide.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1" data-testid="ocr-group-options">
          {jobs.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              No completed recognitions yet — import a screenshot first.
            </p>
          ) : (
            jobs.map((job) => (
              <label
                key={job.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/40"
              >
                <Checkbox
                  checked={selected.includes(job.id)}
                  onCheckedChange={() => toggle(job.id)}
                  aria-label={`Select ${job.screenshotName}`}
                />
                <span className="min-w-0 flex-1 truncate text-xs">{job.screenshotName}</span>
                {job.overallConfidence !== null ? (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {Math.round(job.overallConfidence)}%
                  </span>
                ) : null}
                <JobStatusBadge status={job.status} />
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={selected.length < 2 || selected.length > 8 || createMutation.isPending}
            data-testid="ocr-group-create"
            onClick={async () => {
              try {
                const { group } = await createMutation.mutateAsync({ jobIds: selected });
                toast.success("Group created", {
                  description:
                    group.autoConfirmed && group.fusedDraft !== null
                      ? `${group.members.length} screenshots matched with ${Math.round(group.fusionConfidence)}% confidence — review the fused draft.`
                      : `Correlation confidence ${Math.round(group.fusionConfidence)}% — review the evidence before importing.`,
                });
                setSelected([]);
                onOpenChange(false);
                onCreated(group.id);
              } catch (error) {
                toast.error(apiErrorMessage(error, "The group could not be created."));
              }
            }}
          >
            {createMutation.isPending ? "Creating…" : `Create Group (${selected.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Group workspace (?group=<id>) ────────────────────────────────────────────

type GroupStep = "view" | "draft" | "confirm" | "success";

export function GroupWorkspace({
  groupId,
  previewUrls,
  onBack,
  onOpenJob,
}: {
  groupId: string;
  previewUrls: Map<string, string>;
  onBack: () => void;
  onOpenJob: (jobId: string) => void;
}) {
  const router = useRouter();
  const groupQuery = useRecognitionGroup(groupId, groupId.length > 0);
  const group = groupQuery.data?.group;
  const [step, setStep] = React.useState<GroupStep>("view");
  const [draft, setDraft] = React.useState<TradeDraftInput | null>(null);
  const [tradeId, setTradeId] = React.useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const now = useNow();

  const draftMutation = useUpdateRecognitionGroupDraft();
  const confirmMutation = useConfirmRecognitionGroup();
  const discardMutation = useDiscardRecognitionGroup();

  if (groupQuery.isLoading || (group === undefined && !groupQuery.isError)) {
    return (
      <div className="space-y-4" aria-hidden data-testid="ocr-group-loading">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (groupQuery.isError || group === undefined) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center" data-testid="ocr-group-missing">
        <h2 className="text-base font-semibold">Recognition group not found</h2>
        <p className="text-sm text-muted-foreground">
          This group doesn&apos;t exist or was created in a previous browser session. Member
          recognitions are unaffected and stay in your history.
        </p>
        <Button variant="outline" onClick={onBack}>
          Back to Overview
        </Button>
      </div>
    );
  }

  // ── Draft step (reuses the SAME review surface as a single-job draft) ────
  if (step === "draft" && draft !== null) {
    return (
      <TradeDraftReview
        draft={draft}
        onDraftChange={setDraft}
        warnings={[]}
        goingBack={false}
        saving={draftMutation.isPending}
        onBack={() => setStep("view")}
        onReady={async () => {
          try {
            await draftMutation.mutateAsync({ groupId: group.id, draft });
            toast.success("Fused draft saved");
            setStep("confirm");
          } catch (error) {
            toast.error(apiErrorMessage(error, "The fused draft could not be saved."));
          }
        }}
      />
    );
  }

  // ── Confirm step ──────────────────────────────────────────────────────────
  if (step === "confirm" && draft !== null) {
    return (
      <ConfirmImport
        draft={draft}
        confirming={confirmMutation.isPending}
        tradeCount={1}
        draftedCount={1}
        onBack={() => setStep("draft")}
        onConfirm={async (scope) => {
          try {
            const confirmed = await confirmMutation.mutateAsync({
              groupId: group.id,
              input: scope.accountId !== undefined ? { accountId: scope.accountId } : undefined,
            });
            setTradeId(confirmed.tradeId);
            toast.success("Trade imported successfully", {
              description: `${group.members.length} screenshots fused into one trade — reference ${confirmed.tradeId}`,
            });
            setStep("success");
          } catch (error) {
            toast.error(apiErrorMessage(error, "The group import could not be confirmed."));
          }
        }}
      />
    );
  }

  // ── Success step ──────────────────────────────────────────────────────────
  if (step === "success" && tradeId !== null) {
    return (
      <div className="mx-auto max-w-md space-y-5 py-6 text-center" data-testid="ocr-group-success">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full border border-profit/40 bg-profit/10">
          <CheckCircle2 className="size-7 text-profit" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">Trade imported successfully</h2>
          <p className="font-mono text-xs text-muted-foreground">{tradeId}</p>
          <p className="text-sm text-muted-foreground">
            {group.members.length} screenshots were fused into one canonical trade.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" onClick={() => router.push("/trades")}>
            View Trade
          </Button>
          <Button onClick={onBack}>Back to Overview</Button>
        </div>
      </div>
    );
  }

  // ── Group view ────────────────────────────────────────────────────────────
  const meta = GROUP_STATUS_META[group.status];
  const editable = group.status === "PROPOSED" || group.status === "ACTIVE";

  return (
    <div className="space-y-4" data-testid="ocr-group-workspace">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.01em]">Screenshot group</h1>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {group.members.length} screenshots · created {formatRelative(group.createdAt, nowMs(now))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px]", meta.className)}
            data-testid="ocr-group-status"
          >
            {meta.label}
          </span>
          <Badge variant="outline" className="font-mono text-[10px]">
            {Math.round(group.fusionConfidence)}% match
          </Badge>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-3.5" aria-hidden />
            History
          </Button>
        </div>
      </div>

      {group.status === "PROPOSED" ? (
        <div
          className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-warning"
          data-testid="ocr-group-proposed-banner"
        >
          Possible group — the correlation evidence is below the automatic threshold. Review the
          members and the conflicting fields below; edit the fused draft to continue.
        </div>
      ) : null}
      {group.status === "CONFIRMED" && group.importedTradeId !== null ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-profit/30 bg-profit/5 px-4 py-3"
          data-testid="ocr-group-confirmed-banner"
        >
          <p className="text-xs text-profit">
            Imported to your journal as{" "}
            <span className="font-mono font-semibold">{group.importedTradeId}</span> — this group is
            already accounted for.
          </p>
          <Button size="sm" variant="outline" onClick={() => router.push("/trades")}>
            View Trade
          </Button>
        </div>
      ) : null}
      {group.status === "DISCARDED" ? (
        <div
          className="rounded-lg border border-border px-4 py-3 text-xs text-muted-foreground"
          data-testid="ocr-group-discarded-banner"
        >
          This group was discarded — every member recognition stays in your history untouched.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Members + evidence */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 px-5 py-4">
              <p className="flex items-center gap-1.5 ledger-label">
                <Layers className="size-3.5 text-muted-foreground" aria-hidden />
                Members ({group.members.length})
              </p>
              <ul className="space-y-1.5">
                {group.members.map((member) => (
                  <MemberRow
                    key={member.jobId}
                    member={member}
                    previewUrls={previewUrls}
                    onOpen={onOpenJob}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2.5 px-5 py-4">
              <p className="flex items-center gap-1.5 ledger-label">
                <GitMerge className="size-3.5 text-muted-foreground" aria-hidden />
                Correlation evidence
              </p>
              <ul className="space-y-1.5" data-testid="ocr-group-evidence">
                {group.evidence.map((item, index) => (
                  <li key={`${item.kind}-${index}`} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 text-muted-foreground">
                      {EVIDENCE_LABELS[item.kind] ?? item.kind}
                    </span>
                    <span
                      className={cn(
                        "h-1.5 flex-1 overflow-hidden rounded-full bg-muted",
                      )}
                      aria-hidden
                    >
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          item.score >= 0.8 ? "bg-profit" : item.score > 0 ? "bg-warning" : "bg-loss",
                        )}
                        style={{ width: `${Math.max(2, Math.round(item.score * 100))}%` }}
                      />
                    </span>
                    <span className="max-w-[45%] truncate text-[11px] text-muted-foreground" title={item.detail}>
                      {item.detail}
                    </span>
                  </li>
                ))}
                {group.evidence.length === 0 ? (
                  <li className="text-xs text-muted-foreground">
                    No overlapping evidence was found between these recognitions.
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2.5 px-5 py-4">
              <p className="flex items-center gap-1.5 ledger-label">
                <Clock className="size-3.5 text-muted-foreground" aria-hidden />
                Timeline
              </p>
              <ol className="space-y-1.5" data-testid="ocr-group-timeline">
                {group.timeline.map((entry, index) => (
                  <li key={`${entry.jobId}-${index}`} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
                      {entry.role}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{entry.screenshotName}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {entry.at !== null ? entry.at.replace("T", " ").slice(0, 16) : "no time read"}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-muted-foreground">
                Built only from recognized timestamps — screenshots without a readable time keep
                their member order.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Fused draft + conflicts */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 px-5 py-4" data-testid="ocr-group-fused">
              <p className="flex items-center gap-1.5 ledger-label">
                <GitMerge className="size-3.5 text-muted-foreground" aria-hidden />
                Fused draft
              </p>
              {group.fusedDraft === null ? (
                <p className="text-xs text-muted-foreground">
                  No fused draft — the members did not agree on a symbol and a direction.
                </p>
              ) : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <FusedRow label="Symbol" value={group.fusedDraft.symbol} />
                  <FusedRow label="Direction" value={group.fusedDraft.direction} />
                  <FusedRow label="Volume" value={group.fusedDraft.volume} />
                  <FusedRow label="Entry" value={group.fusedDraft.entryPrice} />
                  <FusedRow label="Exit" value={group.fusedDraft.exitPrice} />
                  <FusedRow label="Stop loss" value={group.fusedDraft.stopLoss} />
                  <FusedRow label="Take profit" value={group.fusedDraft.takeProfit} />
                  <FusedRow label="P&L" value={group.fusedDraft.profitLoss} />
                  <FusedRow label="Open time" value={group.fusedDraft.openTime} />
                  <FusedRow label="Close time" value={group.fusedDraft.closeTime} />
                </dl>
              )}
              {editable && group.fusedDraft !== null ? (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <Button
                    size="sm"
                    onClick={() => {
                      const fused = group.fusedDraft;
                      if (fused === null) return;
                      setDraft({
                        symbol: fused.symbol,
                        direction: fused.direction,
                        platform: fused.platform,
                        entryPrice: fused.entryPrice,
                        exitPrice: fused.exitPrice,
                        volume: fused.volume,
                        stopLoss: fused.stopLoss,
                        takeProfit: fused.takeProfit,
                        profitLoss: fused.profitLoss,
                        currency: fused.currency,
                        openTime: fused.openTime,
                        closeTime: fused.closeTime,
                        positionId: fused.positionId,
                        orderId: fused.orderId,
                      });
                      setStep("draft");
                    }}
                    data-testid="ocr-group-edit-draft"
                  >
                    Review Fused Draft
                  </Button>
                  {group.status === "ACTIVE" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={confirmMutation.isPending}
                      onClick={async () => {
                        try {
                          const confirmed = await confirmMutation.mutateAsync({
                            groupId: group.id,
                            input: undefined,
                          });
                          setTradeId(confirmed.tradeId);
                          toast.success("Trade imported successfully", {
                            description: `Reference ${confirmed.tradeId}`,
                          });
                          setStep("success");
                        } catch (error) {
                          toast.error(apiErrorMessage(error, "The group import could not be confirmed."));
                        }
                      }}
                      data-testid="ocr-group-confirm-quick"
                    >
                      {confirmMutation.isPending ? "Importing…" : "Import This Trade"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2.5 px-5 py-4" data-testid="ocr-group-conflicts">
              <p className="flex items-center gap-1.5 ledger-label">
                <GitMerge className="size-3.5 text-muted-foreground" aria-hidden />
                Conflicting fields ({group.conflicts.length})
              </p>
              {group.conflicts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Every member agrees on the fused values — nothing to decide.
                </p>
              ) : (
                <ul className="space-y-3">
                  {group.conflicts.map((conflict) => (
                    <li key={conflict.field} className="space-y-1">
                      <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                        {conflict.field}
                      </p>
                      <ul className="space-y-1">
                        {conflict.values.map((value) => {
                          const selected = value.jobId === conflict.selectedJobId;
                          return (
                            <li
                              key={`${conflict.field}-${value.jobId}`}
                              className={cn(
                                "flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs",
                                selected
                                  ? "border-accent/40 bg-accent/5"
                                  : "border-border",
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={value.screenshotName}>
                                {value.screenshotName}
                              </span>
                              <span className="font-mono font-semibold">{value.value}</span>
                              {value.confidence !== null ? (
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {Math.round(value.confidence)}%
                                </span>
                              ) : null}
                              {selected ? (
                                <Badge variant="outline" className="px-1 py-0 font-mono text-[9px]">
                                  fused
                                </Badge>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">
                Every value is preserved with its origin — the fused value is a suggestion, the
                decision happens in the draft review.
              </p>
            </CardContent>
          </Card>

          {editable ? (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-loss hover:text-loss"
                disabled={discardMutation.isPending}
                onClick={() => setDiscardOpen(true)}
                data-testid="ocr-group-discard"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Discard Group
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard this group?</DialogTitle>
            <DialogDescription>
              The group dissolves and its fused draft is removed. Every member recognition stays in
              your history — nothing imported is affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDiscardOpen(false)}>
              Keep Group
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={discardMutation.isPending}
              data-testid="ocr-group-discard-confirm"
              onClick={async () => {
                try {
                  await discardMutation.mutateAsync(group.id);
                  toast.success("Group discarded");
                  setDiscardOpen(false);
                  onBack();
                } catch (error) {
                  toast.error(apiErrorMessage(error, "The group could not be discarded."));
                }
              }}
            >
              {discardMutation.isPending ? "Discarding…" : "Discard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MemberRow({
  member,
  previewUrls,
  onOpen,
}: {
  member: RecognitionGroupMember;
  previewUrls: Map<string, string>;
  onOpen: (jobId: string) => void;
}) {
  const imageUrl = previewUrls.get(member.jobId) ?? null;
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      {imageUrl !== null ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="size-9 shrink-0 rounded object-cover" />
      ) : (
        <span className="size-9 shrink-0 rounded bg-muted" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate text-xs">{member.screenshotName}</span>
      {member.overallConfidence !== null ? (
        <span className="font-mono text-[10px] text-muted-foreground">
          {Math.round(member.overallConfidence)}%
        </span>
      ) : null}
      <JobStatusBadge status={member.status} />
      <Button variant="ghost" size="sm" onClick={() => onOpen(member.jobId)}>
        Open
      </Button>
    </li>
  );
}

function FusedRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono tabular-nums">{value ?? "—"}</dd>
    </div>
  );
}
