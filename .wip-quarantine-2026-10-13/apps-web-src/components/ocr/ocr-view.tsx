"use client";

import * as React from "react";

import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Database,
  FolderOpen,
  GitMerge,
  RefreshCw,
  ScanText,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  useCancelRecognition,
  useConfirmImport,
  useCreateRecognitionJob,
  useDeleteRecognitionJob,
  useRecognitionCollections,
  useRecognitionDrafts,
  useRecognitionGroups,
  useRecognitionJob,
  useRecognitionJobs,
  useRecognitionResult,
  useRecognitionStorage,
  useRecropRecognition,
  useReprocessRecognition,
  useRetryRecognition,
  useUpdateTradeDraftAtIndex,
  useUploadScreenshot,
} from "@/lib/api/queries";
import type {
  CropRegion,
  RecognitionHistoryItem,
  RecognitionJobListQuery,
  RecognitionMode,
  RecognitionPlatform,
  RecognitionQuality,
  RecognitionResult,
  TradeDraftInput,
  UploadDuplicateInfo,
} from "@/lib/recognition/contract";
import {
  MODE_LABELS,
  PLATFORM_LABELS,
  RECOGNITION_MODES,
  RECOGNITION_PLATFORMS,
  SUPPORTED_RECOGNITION_MODE,
  draftInputFromResult,
} from "@/lib/recognition/contract";
import { ScreenshotUploader, type SelectedScreenshot } from "./ocr-uploader";
import { RecognitionProcessing } from "./ocr-processing";
import { RecognitionResultWorkspace, type FieldCorrections } from "./ocr-result";
import {
  ConfirmImport,
  ImportSuccess,
  TradeDraftReview,
} from "./ocr-draft";
import { RecognitionHistory } from "./ocr-history";
import { JobStatusBadge } from "./ocr-badges";
import { CreateGroupDialog, GroupWorkspace } from "./ocr-groups";
import { CollectionDetail, NewCollectionDialog } from "./ocr-collections";
import { nowMs, useNow } from "./ocr-now";
import { formatBytes, formatDuration, formatRelative } from "./ocr-format";

/**
 * Import & Recognition — the OCR module orchestrator (Prompt 3 §9–§33).
 *
 * Two surfaces: the overview (hero, stats band, history) and the job
 * workspace addressed by `?job=<id>` (processing → result → draft review →
 * confirmation → success). The primary context survives a refresh (§44) —
 * the job id is URL state; the future NestJS pipeline replaces the mock
 * adapter behind the same hooks (§41) with no UI redesign.
 */

type Step = "result" | "draft" | "confirm" | "success";

export function OcrView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job") ?? "";
  // V3 — secondary contexts: a fusion group (?group=<id>) or a screenshot
  // collection (?collection=<id>). The job workspace keeps top priority.
  const groupId = searchParams.get("group") ?? "";
  const collectionId = searchParams.get("collection") ?? "";

  const [creating, setCreating] = React.useState(false);

  // Session-local blob previews: job id → object URL kept alive for the
  // thumbnails and the source-screenshot panel (lost on refresh by design —
  // the screenshot bytes never leave the client in the mocked module).
  // A stable Map held in state (never replaced) keeps renders lint-clean.
  const [previewUrls] = React.useState(() => new Map<string, string>());
  const registerPreview = React.useCallback((id: string, url: string) => {
    previewUrls.set(id, url);
  }, [previewUrls]);

  const openJob = React.useCallback(
    (id: string) => {
      router.replace(`/recognition?job=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router],
  );

  const openGroup = React.useCallback(
    (id: string) => {
      router.replace(`/recognition?group=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router],
  );

  const openCollection = React.useCallback(
    (id: string) => {
      router.replace(`/recognition?collection=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router],
  );

  const closeContext = React.useCallback(() => {
    router.replace("/recognition", { scroll: false });
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      {creating ? null : jobId !== "" ? (
        <JobWorkspace
          jobId={jobId}
          previewUrls={previewUrls}
          onBack={closeContext}
          onReplacedJob={openJob}
        />
      ) : groupId !== "" ? (
        <GroupWorkspace
          groupId={groupId}
          previewUrls={previewUrls}
          onBack={closeContext}
          onOpenJob={openJob}
        />
      ) : collectionId !== "" ? (
        <CollectionDetail
          collectionId={collectionId}
          onBack={closeContext}
        />
      ) : (
        <OverviewSurface
          previewUrls={previewUrls}
          onImport={() => setCreating(true)}
          onOpen={openJob}
          onOpenGroup={openGroup}
          onOpenCollection={openCollection}
        />
      )}
      {creating ? (
        <NewImportSurface
          onBack={() => setCreating(false)}
          onOpenJob={(id) => {
            setCreating(false);
            openJob(id);
          }}
          onStarted={(id, url) => {
            // The job took over the surface — hand control to the workspace.
            registerPreview(id, url);
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}

// ── Overview (§9/§10) ───────────────────────────────────────────────────────

function OverviewSurface({
  previewUrls,
  onImport,
  onOpen,
  onOpenGroup,
  onOpenCollection,
}: {
  previewUrls: Map<string, string>;
  onImport: () => void;
  onOpen: (jobId: string) => void;
  onOpenGroup: (groupId: string) => void;
  onOpenCollection: (collectionId: string) => void;
}) {
  const jobsQuery = useRecognitionJobs();
  const allJobs = jobsQuery.data?.jobs ?? [];
  const deleteMutation = useDeleteRecognitionJob();
  const [pendingDelete, setPendingDelete] = React.useState<RecognitionHistoryItem | null>(null);

  // V3 history filters (spec §62) — every facet optional; the stats band
  // always reads the UNFILTERED list so the overview stays truthful.
  const [statusFilter, setStatusFilter] = React.useState<"" | NonNullable<RecognitionJobListQuery["status"]>>("");
  const [correctedOnly, setCorrectedOnly] = React.useState(false);
  const [duplicatesOnly, setDuplicatesOnly] = React.useState(false);
  const filtersActive = statusFilter !== "" || correctedOnly || duplicatesOnly;
  const historyQuery = useRecognitionJobs({
    ...(statusFilter !== "" ? { status: statusFilter } : {}),
    ...(correctedOnly ? { corrected: "true" } : {}),
    ...(duplicatesOnly ? { duplicate: "true" } : {}),
  });
  const jobs = historyQuery.data?.jobs ?? allJobs;
  const historyLoading = historyQuery.isLoading;

  const analyzed = allJobs.filter((j) => j.status === "COMPLETED" || j.status === "FAILED").length;
  const imported = allJobs.filter((j) => j.importedTradeId !== null).length;
  const needsReview = allJobs.filter(
    (j) => j.status === "COMPLETED" && j.hasWarnings && j.importedTradeId === null,
  ).length;
  const failed = allJobs.filter((j) => j.status === "FAILED").length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Import &amp; Recognition</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Automatically extract trade information from your trading screenshots — Cosmoz
            reads the platform, recognizes the fields and hands you a draft to review before
            anything touches your journal.
          </p>
        </div>
        <Button onClick={onImport} data-testid="ocr-import-cta">
          <ScanText className="size-4" aria-hidden />
          Upload Screenshot
        </Button>
      </div>

      {allJobs.length === 0 && !jobsQuery.isLoading ? (
        <EmptyHero onImport={onImport} />
      ) : (
        <div
          className="stat-strip grid grid-cols-2 lg:grid-cols-5"
          data-testid="ocr-stats"
        >
          <StatCell value={String(allJobs.length)} label="Recent imports" />
          <StatCell value={String(analyzed)} label="Screenshots analyzed" />
          <StatCell value={String(imported)} label="Successful imports" testid="ocr-stat-imported" />
          <StatCell
            value={String(needsReview)}
            label="Requiring review"
            tone={needsReview > 0 ? "warning" : "default"}
          />
          <StatCell
            value={String(failed)}
            label="Failures"
            tone={failed > 0 ? "loss" : "default"}
          />
        </div>
      )}

      <StorageRetentionCard />

      <GroupsCollectionsSection
        jobs={allJobs}
        onOpenGroup={onOpenGroup}
        onOpenCollection={onOpenCollection}
      />

      <section className="space-y-3" aria-label="Recognition history">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-[-0.01em]">Recognition history</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
          </p>
        </div>

        <HistoryFilterBar
          statusFilter={statusFilter}
          correctedOnly={correctedOnly}
          duplicatesOnly={duplicatesOnly}
          filtersActive={filtersActive}
          onStatusChange={setStatusFilter}
          onCorrectedToggle={() => setCorrectedOnly((v) => !v)}
          onDuplicatesToggle={() => setDuplicatesOnly((v) => !v)}
          onClear={() => {
            setStatusFilter("");
            setCorrectedOnly(false);
            setDuplicatesOnly(false);
          }}
        />

        <RecognitionHistory
          jobs={jobs}
          loading={historyLoading}
          previewUrls={previewUrls}
          onOpen={onOpen}
          onDelete={(id) => {
            const job = allJobs.find((j) => j.id === id);
            if (job !== undefined) setPendingDelete(job);
          }}
          onImport={onImport}
        />
      </section>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this recognition?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.screenshotName} and its extracted draft will be removed from
              your history. Trades already imported stay in your journal.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              data-testid="ocr-delete-confirm"
              onClick={async () => {
                if (pendingDelete === null) return;
                try {
                  await deleteMutation.mutateAsync(pendingDelete.id);
                  toast.success("Recognition deleted");
                } catch (error) {
                  toast.error(apiErrorMessage(error, "The recognition could not be deleted."));
                } finally {
                  setPendingDelete(null);
                }
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * V2 — storage & retention snapshot (settings-card lane): how much the
 * recognition uploads occupy and how long the workspace keeps them. The
 * values come from the service (repository aggregates); retention policy is
 * server configuration, surfaced honestly ("disabled" when 0).
 */
function StorageRetentionCard() {
  const storageQuery = useRecognitionStorage();
  const now = useNow();
  const storage = storageQuery.data;
  if (storage === undefined) return null;
  return (
    <Card data-testid="ocr-storage-card">
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3.5">
        <p className="flex items-center gap-1.5 ledger-label">
          <Database className="size-3.5 text-muted-foreground" aria-hidden />
          Upload storage
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            Files: <span className="font-mono font-semibold text-foreground">{storage.assetsCount}</span>
          </span>
          <span className="text-muted-foreground">
            Used: <span className="font-mono font-semibold text-foreground">{formatBytes(storage.totalBytes)}</span>
          </span>
          <span className="text-muted-foreground">
            Oldest upload:{" "}
            <span className="font-mono text-foreground">
              {storage.oldestUploadAt !== null ? formatRelative(storage.oldestUploadAt, nowMs(now)) : "—"}
            </span>
          </span>
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[10px]",
              storage.retentionDays > 0
                ? "border-profit/40 bg-profit/10 text-profit"
                : "border-border text-muted-foreground",
            )}
            data-testid="ocr-retention-badge"
          >
            {storage.retentionDays > 0
              ? `Retention: ${storage.retentionDays} days`
              : "Retention: managed by workspace policy"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── V3 — history filter bar (spec §62) ──────────────────────────────────────

const HISTORY_STATUS_CHIPS: Array<{ value: "" | NonNullable<RecognitionJobListQuery["status"]>; label: string }> = [
  { value: "", label: "All" },
  { value: "COMPLETED", label: "Completed" },
  { value: "PROCESSING", label: "Processing" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function HistoryFilterBar({
  statusFilter,
  correctedOnly,
  duplicatesOnly,
  filtersActive,
  onStatusChange,
  onCorrectedToggle,
  onDuplicatesToggle,
  onClear,
}: {
  statusFilter: "" | NonNullable<RecognitionJobListQuery["status"]>;
  correctedOnly: boolean;
  duplicatesOnly: boolean;
  filtersActive: boolean;
  onStatusChange: (status: "" | NonNullable<RecognitionJobListQuery["status"]>) => void;
  onCorrectedToggle: () => void;
  onDuplicatesToggle: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="History filters"
      data-testid="ocr-history-filters"
    >
      {HISTORY_STATUS_CHIPS.map((chip) => {
        const active = statusFilter === chip.value;
        return (
          <button
            key={chip.label}
            type="button"
            aria-pressed={active}
            onClick={() => onStatusChange(chip.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              active
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground",
            )}
          >
            {chip.label}
          </button>
        );
      })}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <button
        type="button"
        aria-pressed={correctedOnly}
        onClick={onCorrectedToggle}
        data-testid="ocr-filter-corrected"
        className={cn(
          "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
          correctedOnly
            ? "border-accent/60 bg-accent/10 text-accent"
            : "border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground",
        )}
      >
        Corrected
      </button>
      <button
        type="button"
        aria-pressed={duplicatesOnly}
        onClick={onDuplicatesToggle}
        data-testid="ocr-filter-duplicates"
        className={cn(
          "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
          duplicatesOnly
            ? "border-warning/60 bg-warning/10 text-warning"
            : "border-border bg-background text-muted-foreground hover:border-warning/40 hover:text-foreground",
        )}
      >
        Duplicates
      </button>
      {filtersActive ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-full px-2 py-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

// ── V3 — fusion groups + screenshot collections section (§14/§41) ───────────

function GroupsCollectionsSection({
  jobs,
  onOpenGroup,
  onOpenCollection,
}: {
  jobs: RecognitionHistoryItem[];
  onOpenGroup: (groupId: string) => void;
  onOpenCollection: (collectionId: string) => void;
}) {
  const groupsQuery = useRecognitionGroups();
  const collectionsQuery = useRecognitionCollections();
  const groups = groupsQuery.data?.groups ?? [];
  const collections = collectionsQuery.data?.collections ?? [];
  const [groupDialogOpen, setGroupDialogOpen] = React.useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = React.useState(false);

  const completedJobs = jobs.filter((job) => job.status === "COMPLETED");
  // Render only once there is something to organize — the section never
  // introduces noise on a fresh workspace.
  if (jobs.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Groups and collections" data-testid="ocr-groups-section">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-[-0.01em]">Groups &amp; collections</h2>
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          {groups.length} {groups.length === 1 ? "group" : "groups"} ·{" "}
          {collections.length} {collections.length === 1 ? "collection" : "collections"}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-2.5 px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 ledger-label">
                <GitMerge className="size-3.5 text-muted-foreground" aria-hidden />
                Screenshot groups
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={completedJobs.length < 2}
                onClick={() => setGroupDialogOpen(true)}
                data-testid="ocr-group-open-dialog"
              >
                Group Screenshots
              </Button>
            </div>
            {groups.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {completedJobs.length < 2
                  ? "Import at least two screenshots of the same trade to fuse them into one entry."
                  : "Several screenshots of the same trade? Fuse them into ONE trade draft with full evidence."}
              </p>
            ) : (
              <ul className="space-y-1.5" data-testid="ocr-group-list">
                {groups.slice(0, 4).map((group) => (
                  <li key={group.id}>
                    <button
                      type="button"
                      onClick={() => onOpenGroup(group.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"
                    >
                      <span className="min-w-0 flex-1 truncate">{group.leadScreenshotName}</span>
                      {group.memberCount > 0 ? (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          ×{group.memberCount}
                        </span>
                      ) : null}
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {Math.round(group.fusionConfidence)}%
                      </span>
                      <Badge variant="outline" className="px-1.5 py-0 font-mono text-[9px]">
                        {group.status}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2.5 px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 ledger-label">
                <FolderOpen className="size-3.5 text-muted-foreground" aria-hidden />
                Collections
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCollectionDialogOpen(true)}
                data-testid="ocr-collection-open-dialog"
              >
                New Collection
              </Button>
            </div>
            {collections.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Organize your uploads — one collection per platform statement, session or strategy.
              </p>
            ) : (
              <ul className="space-y-1.5" data-testid="ocr-collection-list">
                {collections.slice(0, 4).map((collection) => (
                  <li key={collection.id}>
                    <button
                      type="button"
                      onClick={() => onOpenCollection(collection.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"
                    >
                      <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {collection.assetsCount}{" "}
                        {collection.assetsCount === 1 ? "file" : "files"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateGroupDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        jobs={completedJobs}
        onCreated={onOpenGroup}
      />
      <NewCollectionDialog
        open={collectionDialogOpen}
        onOpenChange={setCollectionDialogOpen}
        onCreated={onOpenCollection}
      />
    </section>
  );
}

function StatCell({
  value,
  label,
  tone = "default",
  testid,
}: {
  value: string;
  label: string;
  tone?: "default" | "warning" | "loss";
  testid?: string;
}) {
  return (
    <div className="stat-cell" data-testid={testid} data-tone={tone}>
      <p
        className={cn(
          "font-mono text-xl font-semibold tabular-nums",
          tone === "warning" && "text-warning",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyHero({ onImport }: { onImport: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center"
      data-testid="ocr-empty-hero"
    >
      <span className="flex size-14 items-center justify-center rounded-2xl border border-border bg-background">
        <ScanText className="size-6 text-muted-foreground" aria-hidden />
      </span>
      <div className="max-w-md space-y-1.5">
        <h2 className="text-base font-semibold">Import your trading screenshot</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Cosmoz will automatically detect the platform and read the trade information from
          your screenshot — you review everything before it is imported.
        </p>
      </div>
      <Button onClick={onImport} data-testid="ocr-empty-hero-cta">
        <ScanText className="size-4" aria-hidden />
        Upload Screenshot
      </Button>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
        Supports MetaTrader 5 · TradingView · cTrader · PDF statements
      </p>
    </div>
  );
}

// ── New import (§11–§14) ────────────────────────────────────────────────────

function NewImportSurface({
  onBack,
  onStarted,
  onOpenJob,
}: {
  onBack: () => void;
  onStarted: (jobId: string, previewUrl: string) => void;
  onOpenJob: (jobId: string) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<SelectedScreenshot | null>(null);
  const [platform, setPlatform] = React.useState<RecognitionPlatform>("AUTO");
  const [mode, setMode] = React.useState<RecognitionMode>(SUPPORTED_RECOGNITION_MODE);
  const [starting, setStarting] = React.useState(false);
  const [startError, setStartError] = React.useState<string | null>(null);
  const [duplicate, setDuplicate] = React.useState<UploadDuplicateInfo | null>(null);
  const [forced, setForced] = React.useState(false);

  const uploadMutation = useUploadScreenshot();
  const createJobMutation = useCreateRecognitionJob();
  const now = useNow();

  const start = async () => {
    if (selected === null || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const { screenshot, duplicate: found } = await uploadMutation.mutateAsync({
        file: selected.file,
        name: selected.file.name,
      });
      // V2 — perceptual duplicate verdict: a WARNING, never a block. The
      // user reviews the previous import or continues deliberately.
      if (found != null && !forced) {
        setDuplicate(found);
        setStarting(false);
        return;
      }
      const { job } = await createJobMutation.mutateAsync({
        screenshotId: screenshot.id,
        platform,
        mode,
      });
      onStarted(job.id, selected.previewUrl);
      router.replace(`/recognition?job=${encodeURIComponent(job.id)}`, { scroll: false });
    } catch (error) {
      setStartError(apiErrorMessage(error, "We couldn't upload this file. Check your connection and try again."));
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5" data-testid="ocr-new-import">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.01em]">Import a screenshot</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Attach the capture, check the recognition settings, then start the analysis.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={starting} data-testid="ocr-new-back">
          <ArrowLeft className="size-3.5" aria-hidden />
          Back
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <p className="ledger-label">Screenshot</p>
          <ScreenshotUploader value={selected} onChange={setSelected} disabled={starting} />
        </div>

        <div className="space-y-3 lg:col-span-2">
          <p className="ledger-label">Recognition settings</p>
          <Card>
            <CardContent className="space-y-4 px-4 py-4">
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium">Platform</legend>
                {RECOGNITION_PLATFORMS.map((value) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                  >
                    <input
                      type="radio"
                      name="ocr-platform"
                      value={value}
                      checked={platform === value}
                      onChange={() => setPlatform(value)}
                      disabled={starting}
                      className="size-3.5 accent-[var(--accent)]"
                    />
                    <span className={cn(platform === value && "font-medium")}>
                      {PLATFORM_LABELS[value]}
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="border-t border-border pt-3">
                <fieldset className="space-y-2">
                  <legend className="text-xs font-medium">Recognition mode</legend>
                  {RECOGNITION_MODES.map((value) => {
                    const supported = value === SUPPORTED_RECOGNITION_MODE;
                    return (
                      <label
                        key={value}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                          supported ? "cursor-pointer hover:bg-muted/50" : "opacity-50",
                        )}
                        title={supported ? undefined : "Coming soon"}
                      >
                        <input
                          type="radio"
                          name="ocr-mode"
                          value={value}
                          checked={mode === value}
                          onChange={() => setMode(value)}
                          disabled={!supported || starting}
                          className="size-3.5 accent-[var(--accent)]"
                        />
                        <span className={cn(mode === value && "font-medium")}>
                          {MODE_LABELS[value]}
                        </span>
                        {!supported ? (
                          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground/70">
                            Coming soon
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </fieldset>
              </div>

              <p className="flex items-start gap-1.5 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-profit" aria-hidden />
                Your screenshot is securely processed by Cosmoz — credentials and account
                numbers are never requested or stored.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {duplicate !== null ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3"
          data-testid="ocr-duplicate-banner"
          role="status"
        >
          <div className="flex min-w-0 items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium text-warning">
                This looks like a screenshot you already uploaded
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {duplicate.matchedUploadName} · {formatRelative(duplicate.matchedUploadAt, nowMs(now))}
                {duplicate.importedTradeIds.length > 0
                  ? ` · ${duplicate.importedTradeIds.length} trade${duplicate.importedTradeIds.length > 1 ? "s" : ""} already imported`
                  : ""}
                {duplicate.latestJobId !== null ? " · recognition on record" : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {duplicate.latestJobId !== null ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenJob(duplicate.latestJobId as string)}
                data-testid="ocr-duplicate-view"
              >
                View previous
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setForced(true);
                setDuplicate(null);
              }}
              data-testid="ocr-duplicate-continue"
            >
              Continue anyway
            </Button>
          </div>
        </div>
      ) : null}

      <div aria-live="polite">
        {startError !== null ? (
          <p role="alert" className="text-xs text-loss" data-testid="ocr-start-error">
            {startError}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button
          onClick={start}
          disabled={selected === null || starting}
          data-testid="ocr-start-analysis"
        >
          <ScanText className="size-4" aria-hidden />
          {starting ? "Starting…" : "Start Analysis"}
        </Button>
      </div>
    </div>
  );
}

// ── Job workspace (§15–§32) ────────────────────────────────────────────────

function JobWorkspace({
  jobId,
  previewUrls,
  onBack,
  onReplacedJob,
}: {
  jobId: string;
  previewUrls: Map<string, string>;
  onBack: () => void;
  onReplacedJob: (jobId: string) => void;
}) {
  const router = useRouter();
  const jobQuery = useRecognitionJob(jobId);
  const job = jobQuery.data?.job;
  const resultQuery = useRecognitionResult(
    jobId,
    job?.status === "COMPLETED",
  );
  const [step, setStep] = React.useState<Step>("result");
  const [corrections, setCorrections] = React.useState<FieldCorrections>({ values: {} });
  const [draft, setDraft] = React.useState<TradeDraftInput | null>(null);
  const [importedTradeId, setImportedTradeId] = React.useState<string | null>(null);
  const [importedTradeCount, setImportedTradeCount] = React.useState(1);
  const [tradeIndex, setTradeIndex] = React.useState(1);

  const cancelMutation = useCancelRecognition();
  const retryMutation = useRetryRecognition();
  const deleteMutation = useDeleteRecognitionJob();
  const draftMutation = useUpdateTradeDraftAtIndex();
  const confirmMutation = useConfirmImport();
  const recropMutation = useRecropRecognition();
  const reprocessMutation = useReprocessRecognition();
  const draftsQuery = useRecognitionDrafts(jobId, job?.status === "COMPLETED");

  const now = useNow();

  if (jobQuery.isLoading || (job === undefined && !jobQuery.isError)) {
    return (
      <div className="space-y-4" aria-hidden data-testid="ocr-workspace-loading">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (jobQuery.isError || job === undefined) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center" data-testid="ocr-job-missing">
        <h2 className="text-base font-semibold">Recognition not found</h2>
        <p className="text-sm text-muted-foreground">
          This recognition job doesn&apos;t exist or was deleted. It may have been created in a
          previous browser session.
        </p>
        <Button variant="outline" onClick={onBack}>
          Back to Overview
        </Button>
      </div>
    );
  }

  // ── Failure detail (§31/§32/§56) ────────────────────────────────────────
  if (job.status === "FAILED") {
    return (
      <div className="mx-auto max-w-xl space-y-5" data-testid="ocr-failed">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-[-0.01em]">Recognition failed</h1>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-3.5" aria-hidden />
            History
          </Button>
        </div>
        <Card>
          <CardContent className="space-y-3 px-5 py-4">
            <p className="text-sm leading-relaxed text-loss" role="alert">
              {job.error?.message ?? "We couldn't recognize enough information from this screenshot."}
            </p>
            <dl className="space-y-1.5 border-t border-border pt-3 text-xs">
              <DetailRow label="Screenshot" value={job.screenshot.name} />
              <DetailRow label="Uploaded" value={formatRelative(job.createdAt, nowMs(now))} />
              <DetailRow label="Processing time" value={formatDuration(job.processingMs)} />
              <DetailRow label="Stopped at" value={`Stage ${job.stage.toLowerCase()}`} />
            </dl>
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { job: retry } = await retryMutation.mutateAsync(job.id);
                    toast.success("Recognition restarted");
                    onReplacedJob(retry.id);
                  } catch (error) {
                    toast.error(apiErrorMessage(error, "Retry failed — try again in a moment."));
                  }
                }}
                disabled={retryMutation.isPending}
                data-testid="ocr-retry"
              >
                {retryMutation.isPending ? "Restarting…" : "Try Again"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-loss hover:text-loss"
                onClick={async () => {
                  await deleteMutation.mutateAsync(job.id).catch(() => undefined);
                  onBack();
                }}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Cancelled (§55) ─────────────────────────────────────────────────────
  if (job.status === "CANCELLED") {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center" data-testid="ocr-cancelled">
        <h2 className="text-base font-semibold">Analysis cancelled</h2>
        <p className="text-sm text-muted-foreground">
          The recognition was cancelled. Nothing was imported into your journal.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" onClick={onBack} data-testid="ocr-cancelled-back">
            Back to Overview
          </Button>
          <Button onClick={onBack}>Start a New Import</Button>
        </div>
      </div>
    );
  }

  // ── Processing (§15) ────────────────────────────────────────────────────
  if (job.status === "PENDING" || job.status === "PROCESSING") {
    return (
      <RecognitionProcessing
        job={job}
        cancelling={cancelMutation.isPending}
        onCancel={async () => {
          try {
            await cancelMutation.mutateAsync(job.id);
            toast.success("Analysis cancelled");
          } catch (error) {
            toast.error(apiErrorMessage(error, "Could not cancel the analysis."));
          }
        }}
      />
    );
  }

  // ── COMPLETED → result / draft / confirm / success ──────────────────────
  const result: RecognitionResult | undefined = resultQuery.data?.result;

  if (result === undefined) {
    return (
      <div className="space-y-4" aria-hidden>
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <ImportSuccess
        tradeId={importedTradeId ?? job.importedTradeId ?? "—"}
        tradeCount={importedTradeCount}
        onViewTrade={() => router.push("/trades")}
        onImportAnother={onBack}
      />
    );
  }

  if (step === "confirm" && draft !== null) {
    const draftedCount =
      draftsQuery.data?.drafts.filter((slot) => slot.draft !== null).length ?? 1;
    const detectedCount = result?.trades.length ?? 1;
    return (
      <ConfirmImport
        draft={draft}
        confirming={confirmMutation.isPending}
        tradeIndex={tradeIndex}
        tradeCount={detectedCount}
        draftedCount={draftedCount}
        onBack={() => setStep("draft")}
        onConfirm={async (scope) => {
          try {
            const input = scope.all
              ? { accountId: scope.accountId } // every drafted trade (V2 batch)
              : { tradeIndexes: [tradeIndex], accountId: scope.accountId };
            const confirmed = await confirmMutation.mutateAsync({ jobId: job.id, input });
            const count = confirmed.trades?.length ?? 1;
            setImportedTradeId(confirmed.tradeId);
            setImportedTradeCount(count);
            toast.success(
              count > 1 ? `${count} trades imported successfully` : "Trade imported successfully",
              {
                description: `${draft.symbol} · ${draft.direction} — reference ${confirmed.tradeId}`,
              },
            );
            setStep("success");
          } catch (error) {
            toast.error(apiErrorMessage(error, "The import could not be confirmed."));
          }
        }}
      />
    );
  }

  if (step === "draft" && draft !== null) {
    return (
      <TradeDraftReview
        draft={draft}
        onDraftChange={setDraft}
        warnings={result.warnings}
        goingBack={false}
        saving={draftMutation.isPending}
        onBack={() => setStep("result")}
        onReady={async () => {
          if (draft === null) return;
          try {
            await draftMutation.mutateAsync({
              jobId: job.id,
              tradeIndex,
              draft: {
                symbol: draft.symbol,
                direction: draft.direction,
                platform: draft.platform,
                entryPrice: draft.entryPrice,
                exitPrice: draft.exitPrice,
                volume: draft.volume,
                stopLoss: draft.stopLoss,
                takeProfit: draft.takeProfit,
                profitLoss: draft.profitLoss,
                currency: draft.currency,
                openTime: draft.openTime,
                closeTime: draft.closeTime,
                positionId: draft.positionId,
                orderId: draft.orderId,
              },
            });
            setStep("confirm");
          } catch (error) {
            toast.error(apiErrorMessage(error, "The draft could not be saved."));
          }
        }}
      />
    );
  }

  // Result step — also used when reopening an imported job (read-only banner).
  const imageUrl = previewUrls.get(job.id) ?? null;
  const alreadyImported = job.importedTradeId !== null;
  const isPdf = job.screenshot.mimeType === "application/pdf";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.01em]">
            {alreadyImported ? "Recognition details" : "Recognition result"}
          </h1>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {job.screenshot.name} · {formatBytes(job.screenshot.sizeBytes)} ·{" "}
            {formatRelative(job.createdAt, nowMs(now))}
            {isPdf && job.screenshot.documentPageCount !== undefined
              ? ` · PDF · ${job.screenshot.documentPageCount} page${job.screenshot.documentPageCount > 1 ? "s" : ""}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <JobStatusBadge status={job.status} />
          {job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={reprocessMutation.isPending}
              onClick={async () => {
                try {
                  const { job: reprocessed } = await reprocessMutation.mutateAsync(job.id);
                  toast.success("Recognition re-run started", {
                    description: "A new recognition is running over the same screenshot — the original stays untouched.",
                  });
                  onReplacedJob(reprocessed.id);
                } catch (error) {
                  toast.error(apiErrorMessage(error, "The recognition could not be re-run."));
                }
              }}
              data-testid="ocr-reprocess"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              {reprocessMutation.isPending ? "Re-running…" : "Re-run"}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-3.5" aria-hidden />
            History
          </Button>
        </div>
      </div>

      {alreadyImported ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-profit/30 bg-profit/5 px-4 py-3"
          data-testid="ocr-imported-banner"
        >
          <p className="text-xs text-profit">
            Imported to your journal as{" "}
            <span className="font-mono font-semibold">{job.importedTradeId}</span>
            {(job.importedTradeIds?.length ?? 0) > 1
              ? ` (+${(job.importedTradeIds?.length ?? 1) - 1} more from this upload)`
              : ""}{" "}
            — this recognition is already accounted for.
          </p>
          <Button size="sm" variant="outline" onClick={() => router.push("/trades")}>
            View Trade
          </Button>
        </div>
      ) : null}

      {result.quality !== undefined ? (
        <QualityStrip quality={result.quality} />
      ) : null}

      <RecognitionResultWorkspace
        result={result}
        imageUrl={imageUrl}
        imageName={job.screenshot.name}
        isPdf={isPdf}
        corrections={corrections}
        onCorrectionsChange={setCorrections}
        recropping={recropMutation.isPending}
        onRecrop={async (region: CropRegion, index: number) => {
          try {
            await recropMutation.mutateAsync({ jobId: job.id, region, tradeIndex: index });
            toast.success("Zone re-read", {
              description: "The recognizer re-read the selected area — review the refreshed values.",
            });
          } catch (error) {
            toast.error(apiErrorMessage(error, "The zone could not be re-read."));
          }
        }}
        onContinue={(index: number) => {
          // V2 — per-trade draft; the inline corrections of the viewed trade
          // ride along (they were made against THIS trade's fields).
          setTradeIndex(index);
          setDraft(withCorrections(draftInputFromResult(job.id, result, index), corrections));
          setStep("draft");
        }}
        onSelectedTradeChange={(index: number) => {
          // Switching the reviewed trade resets the correction scope.
          setTradeIndex(index);
          setCorrections({ values: {} });
        }}
        onDiscard={onBack}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono tabular-nums">{value}</dd>
    </div>
  );
}

// ── V3 — deterministic quality score strip (spec §28) ───────────────────────

const QUALITY_COMPONENT_LABELS: Array<{ key: keyof RecognitionQuality["components"]; label: string }> = [
  { key: "textRecognition", label: "Text read" },
  { key: "fieldExtraction", label: "Fields found" },
  { key: "tradingInterpretation", label: "Trade mapping" },
  { key: "crossFieldValidation", label: "Coherence" },
  { key: "consistency", label: "Multi-shot agreement" },
];

/**
 * V3 — the deterministic OCR quality score with its five components. Every
 * value is computed from actual recognition evidence (never invented); the
 * consistency component renders honestly as "—" for single-image jobs.
 */
function QualityStrip({ quality }: { quality: RecognitionQuality }) {
  const scoreTone =
    quality.overall >= 80 ? "text-profit" : quality.overall >= 55 ? "text-warning" : "text-loss";
  return (
    <Card data-testid="ocr-quality">
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <p className="ledger-label">OCR quality</p>
          <span className={cn("font-mono text-lg font-semibold tabular-nums", scoreTone)}>
            {Math.round(quality.overall)}
            <span className="text-[10px] text-muted-foreground">/100</span>
          </span>
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2">
          {QUALITY_COMPONENT_LABELS.map(({ key, label }) => {
            const value = quality.components[key];
            return (
              <div key={key} className="min-w-[120px] flex-1">
                <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span>{label}</span>
                  <span className="font-mono tabular-nums">
                    {value === null ? "—" : Math.round(value)}
                  </span>
                </div>
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div
                    className={cn(
                      "h-full rounded-full",
                      value === null ? "bg-transparent" : value >= 80 ? "bg-profit" : value >= 55 ? "bg-warning" : "bg-loss",
                    )}
                    style={{ width: value === null ? "0%" : `${Math.max(2, Math.round(value))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/** Applies the user's inline corrections onto the projected draft. */
function withCorrections(
  base: TradeDraftInput,
  corrections: FieldCorrections,
): TradeDraftInput {
  const next: TradeDraftInput = { ...base };
  for (const [key, value] of Object.entries(corrections.values)) {
    if (key in next) {
      (next as unknown as Record<string, string | null>)[key] = value;
    }
  }
  return next;
}
