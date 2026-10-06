"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ImageUp } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { OcrExtractionProfile, OcrRecognition } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api/client";
import {
  useConfirmOcrRecognition,
  useCreateOcrRecognition,
  useDeleteOcrRecognition,
  useOcrRecognition,
  useOcrRecognitions,
  fetchOcrRecognitionImage,
} from "@/lib/api/queries";
import { useDict } from "@/i18n/i18n-provider";
import {
  RecognitionSettings,
} from "@/components/recognition/recognition-settings";
import { RecognitionProgress } from "@/components/recognition/recognition-progress";
import { RecognitionResult } from "@/components/recognition/recognition-result";
import { RecognitionSuccess } from "@/components/recognition/recognition-success";
import { TradeDraftReview } from "@/components/recognition/trade-draft-review";
import { ScreenshotUploader } from "@/components/recognition/screenshot-uploader";
import { RecognitionHistory } from "@/components/recognition/recognition-history";
import {
  formatRelative,
  platformLabel,
  recognitionConfidence,
  type RecognitionStep,
} from "@/components/recognition/recognition-model";
import { RecognitionStatusBadge } from "@/components/recognition/recognition-status-badge";

/**
 * RecognitionWorkspace — the Import & Recognition orchestrator (PROMPT 3).
 *
 * Workflow (§4): upload → preview → configure → processing → result →
 * review & correct → trade draft → confirm → success, with the history one
 * tab away. Server state lives in React Query; the wizard step and the
 * in-progress corrections are local UI state. URL state (§44) carries the
 * primary context: ?tab=history opens the history, ?job=<id> focuses a
 * recognition job and survives a full refresh.
 *
 * The views never know whether the data comes from the MSW
 * MockRecognitionService or the NestJS ApiRecognitionService (§41).
 */
function WorkspaceInner() {
  const dict = useDict().recognition;
  const router = useRouter();
  const searchParams = useSearchParams();

  const jobId = searchParams.get("job");
  const tab = searchParams.get("tab") === "history" ? "history" : "overview";

  // ── wizard state (UI-local, §43) ─────────────────────────────────────────
  const [stepRaw, setStepRaw] = React.useState<RecognitionStep>("overview");
  const [file, setFile] = React.useState<File | null>(null);
  const [profile, setProfile] = React.useState<OcrExtractionProfile>("TRADE_SUMMARY");
  const [editingField, setEditingField] = React.useState<string | null>(null);
  const [corrections, setCorrections] = React.useState<Record<string, string | null>>({});

  // ── server state ─────────────────────────────────────────────────────────
  const list = useOcrRecognitions();
  const focusedJob = useOcrRecognition(jobId);
  const create = useCreateOcrRecognition();
  const confirm = useConfirmOcrRecognition();
  const deleteJob = useDeleteOcrRecognition();

  const recognition = focusedJob.data?.recognition ?? null;

  // Resolved preview bytes for the focused job (authenticated fetch, §37).
  // The fetch itself is async (setState in callbacks — never in the effect
  // body); a missing jobId simply yields null via render-level derivation.
  const [jobImageUrl, setJobImageUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!jobId) return;
    let revoked = false;
    let url: string | null = null;
    fetchOcrRecognitionImage(jobId)
      .then((result) => {
        if (revoked) {
          URL.revokeObjectURL(result.url);
          return;
        }
        url = result.url;
        setJobImageUrl(result.url);
      })
      .catch(() => {
        if (!revoked) setJobImageUrl(null);
      });
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [jobId]);

  // ── URL-state helpers ────────────────────────────────────────────────────
  const setParams = React.useCallback(
    (next: { job?: string | null; tab?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      router.replace(query ? `/recognition?${query}` : "/recognition", { scroll: false });
    },
    [router, searchParams],
  );

  // Step resolution is DERIVED during render from the job (no effect, no
  // cascading render) — a processing job that settles jumps to the result,
  // a confirmed job reopened from history shows its read-only record, and
  // a fresh confirmation shows success. Survives refresh on ?job=.
  const step: RecognitionStep = (() => {
    if (stepRaw === "processing" && recognition && recognition.status !== "PROCESSING" && recognition.status !== "QUEUED") {
      return "result";
    }
    if (stepRaw === "overview" && recognition && recognition.status === "CONFIRMED") {
      return "result";
    }
    return stepRaw;
  })();

  // ── flow actions ─────────────────────────────────────────────────────────
  function resetToOverview(clearJob = true) {
    setFile(null);
    setEditingField(null);
    setCorrections({});
    setStepRaw("overview");
    if (clearJob) setParams({ job: null });
  }

  async function handleStart() {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      create.mutate(
        { imageDataUrl: dataUrl, requestedProfile: profile },
        {
          onSuccess: (data) => {
            setCorrections({});
            setEditingField(null);
            setParams({ job: data.recognition.id });
            setStepRaw("processing");
          },
          onError: (error) => toast.error(dict.errors.upload, { description: apiErrorMessage(error, "") }),
        },
      );
    } catch {
      toast.error(dict.uploader.errRead);
    }
  }

  function handleCancel() {
    if (!jobId) return;
    deleteJob.mutate(jobId, {
      onSuccess: () => {
        toast.info(dict.progress.cancelled);
        resetToOverview();
      },
      onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
    });
  }

  function handleRetry() {
    if (file) {
      setStepRaw("configure");
      return;
    }
    resetToOverview();
  }

  function handleConfirm() {
    if (!recognition) return;
    const full: Record<string, string | null> = {};
    for (const field of recognition.fields) {
      full[field.field] = field.field in corrections ? corrections[field.field] : field.normalizedValue;
    }
    confirm.mutate(
      { id: recognition.id, corrections: full },
      {
        onSuccess: () => {
          toast.success(dict.success.toast);
          setStepRaw("success");
        },
        onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
      },
    );
  }

  // ── derived overview data ────────────────────────────────────────────────
  const items = list.data?.items ?? [];
  const stats = {
    analyzed: items.length,
    confirmed: items.filter((item) => item.status === "CONFIRMED").length,
    review: items.filter((item) => item.status === "REVIEW_REQUIRED").length,
    failed: items.filter((item) => item.status === "FAILED").length,
  };
  const recent = items.slice(0, 4);

  // Effective merged values (engine + user corrections) for the focused job.
  const effectiveValues: Record<string, string | null> = {};
  if (recognition) {
    for (const field of recognition.fields) {
      effectiveValues[field.field] = field.field in corrections ? corrections[field.field] : field.normalizedValue;
    }
  }

  // ── tab: HISTORY ─────────────────────────────────────────────────────────
  if (tab === "history" && !jobId) {
    return (
      <RecognitionHistory
        dict={dict}
        items={items}
        loading={list.isLoading}
        onOpen={(id) => setParams({ job: id })}
        onDelete={(id) =>
          deleteJob.mutate(id, {
            onSuccess: () => toast.success(dict.history.deleted),
            onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
          })
        }
      />
    );
  }

  // ── focused job (?job=) ──────────────────────────────────────────────────
  if (jobId) {
    if (focusedJob.isLoading) {
      return <JobSkeleton dict={dict} />;
    }
    if (focusedJob.isError || !recognition) {
      return (
        <EmptyPanel message={dict.errors.notFound} action={{ label: dict.history.details.back, onClick: () => resetToOverview() }} />
      );
    }
    if (step === "processing") {
      return (
        <StepShell dict={dict} active="configure">
          <RecognitionProgress
            dict={dict}
            status={recognition.status}
            createdAt={recognition.createdAt}
            onCancel={handleCancel}
            cancelling={deleteJob.isPending}
          />
        </StepShell>
      );
    }
    if (step === "review") {
      return (
        <StepShell dict={dict} active="confirm">
          <TradeDraftReview
            recognition={recognition}
            dict={dict}
            effectiveValues={effectiveValues}
            onBack={() => setStepRaw("result")}
            onConfirm={handleConfirm}
            pending={confirm.isPending}
          />
        </StepShell>
      );
    }
    if (step === "success") {
      return (
        <StepShell dict={dict} active="confirm">
          <RecognitionSuccess dict={dict} onImportAnother={() => resetToOverview()} />
        </StepShell>
      );
    }
    return (
      <StepShell dict={dict} active="review">
        <RecognitionResult
          recognition={recognition}
          dict={dict}
          imageUrl={jobImageUrl}
          effectiveValues={effectiveValues}
          editingField={editingField}
          onEditStart={setEditingField}
          onEditCancel={() => setEditingField(null)}
          onSaveField={(field, value) => {
            setCorrections((current) => ({ ...current, [field]: value }));
            setEditingField(null);
          }}
          onReviewDraft={() => setStepRaw("review")}
          onRetry={handleRetry}
          readOnly={recognition.status === "CONFIRMED"}
        />
      </StepShell>
    );
  }

  // ── tab: OVERVIEW ────────────────────────────────────────────────────────
  if (step === "configure" && file) {
    return (
      <StepShell dict={dict} active="configure">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <ScreenshotUploader file={file} onFile={setFile} onClear={() => resetToOverview(false)} dict={dict} disabled={create.isPending} />
          <RecognitionSettings
            dict={dict}
            profile={profile}
            onProfile={setProfile}
            detectedPlatform={dict.settings.platformMt5}
            onStart={handleStart}
            onBack={() => {
              setFile(null);
              setStepRaw("overview");
            }}
            pending={create.isPending}
          />
        </div>
      </StepShell>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="recognition-overview">
      {/* Upload hero — the empty state IS the entry point (§10). */}
      {items.length === 0 ? (
        <div className="flex flex-col gap-5 rounded-xl border border-dashed border-border bg-surface px-6 py-10">
          <div className="mx-auto flex max-w-lg flex-col items-center gap-2 text-center">
            <h2 className="font-heading text-xl font-semibold">{dict.overview.heroTitle}</h2>
            <p className="text-sm text-muted-foreground">{dict.overview.heroBody}</p>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
              {dict.overview.heroPlatforms}
            </p>
          </div>
          <ScreenshotUploader file={null} onFile={(picked) => { setFile(picked); setStepRaw("configure"); }} onClear={() => setFile(null)} dict={dict} disabled={create.isPending} />
          <p className="text-center text-xs text-muted-foreground/80">{dict.overview.privacy}</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold">{dict.overview.heroTitle}</h2>
            </div>
            <ScreenshotUploader file={null} onFile={(picked) => { setFile(picked); setStepRaw("configure"); }} onClear={() => setFile(null)} dict={dict} disabled={create.isPending} />
            <p className="text-xs text-muted-foreground/80">{dict.overview.privacy}</p>
          </div>
          <RecentImports
            dict={dict}
            items={recent}
            onOpen={(id) => setParams({ job: id })}
            onOpenHistory={() => setParams({ tab: "history" })}
          />
        </div>
      )}

      {/* Stat band — one ruled strip, never sibling cards (§9). */}
      {items.length > 0 ? (
        <section aria-label={dict.overview.stats.analyzed} className="stat-strip">
          <div className="stat-cell">
            <p className="ledger-label">{dict.overview.stats.analyzed}</p>
            <p className="mt-1 font-mono text-2xl tabular-nums">{stats.analyzed}</p>
          </div>
          <div className="stat-cell">
            <p className="ledger-label">{dict.overview.stats.confirmed}</p>
            <p className="mt-1 font-mono text-2xl tabular-nums">{stats.confirmed}</p>
          </div>
          <div className="stat-cell">
            <p className="ledger-label">{dict.overview.stats.review}</p>
            <p className="mt-1 font-mono text-2xl tabular-nums text-warning">{stats.review}</p>
          </div>
          <div className="stat-cell">
            <p className="ledger-label">{dict.overview.stats.failed}</p>
            <p className="mt-1 font-mono text-2xl tabular-nums">{stats.failed}</p>
          </div>
        </section>
      ) : null}

      {items.length > 0 ? (
        <RecentImports
          dict={dict}
          items={recent}
          onOpen={(id) => setParams({ job: id })}
          onOpenHistory={() => setParams({ tab: "history" })}
        />
      ) : null}
    </div>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────────

/** Ruled step indicator — UPLOAD → REVIEW → CONFIRM (§4 workflow). */
function StepShell({
  dict,
  active,
  children,
}: {
  dict: ReturnType<typeof useDict>["recognition"];
  active: "configure" | "review" | "confirm";
  children: React.ReactNode;
}) {
  const steps = [
    { key: "configure", label: dict.overview.uploadCta },
    { key: "review", label: dict.result.title },
    { key: "confirm", label: dict.draft.confirmAndImport },
  ];
  const activeIndex = steps.findIndex((entry) => entry.key === active);
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Progress" className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em]">
        {steps.map((entry, index) => (
          <React.Fragment key={entry.key}>
            {index > 0 ? <span className="h-px w-6 bg-border" aria-hidden="true" /> : null}
            <span
              className={cn(
                "font-mono",
                index < activeIndex && "text-muted-foreground",
                index === activeIndex && "text-foreground",
                index > activeIndex && "text-muted-foreground/50",
              )}
              aria-current={index === activeIndex ? "step" : undefined}
            >
              {entry.label}
            </span>
          </React.Fragment>
        ))}
      </nav>
      {children}
    </div>
  );
}

function RecentImports({
  dict,
  items,
  onOpen,
  onOpenHistory,
}: {
  dict: ReturnType<typeof useDict>["recognition"];
  items: OcrRecognition[];
  onOpen: (id: string) => void;
  onOpenHistory: () => void;
}) {
  return (
    <section aria-label={dict.overview.recentTitle} className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <p className="ledger-label">{dict.overview.recentTitle}</p>
        <Button type="button" variant="ghost" size="sm" className="min-h-8" onClick={onOpenHistory} data-testid="recognition-open-history">
          {dict.overview.openHistory}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{dict.overview.recentEmpty}</p>
      ) : (
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item.id)}
            className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 text-left transition-colors hover:bg-surface-raised/60"
            data-testid="recognition-recent-item"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm">
                {platformLabel(dict, item.classification)}
                <span className="text-muted-foreground"> · {formatRelative(item.createdAt)}</span>
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {item.status === "FAILED" ? dict.history.noTrade : dict.history.oneTrade}
                {item.status !== "FAILED" && recognitionConfidence(item.fields) !== null
                  ? ` · ${recognitionConfidence(item.fields)}%`
                  : ""}
              </span>
            </span>
            <RecognitionStatusBadge status={item.status} dict={dict} />
          </button>
        ))
      )}
    </section>
  );
}

function JobSkeleton({ dict }: { dict: ReturnType<typeof useDict>["recognition"] }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center" aria-busy="true">
      <ImageUp className="size-6 animate-pulse text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{dict.progress.title}…</p>
    </div>
  );
}

function EmptyPanel({
  message,
  action,
}: {
  message: string;
  action: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={action.onClick} data-testid="recognition-empty-back">
        {action.label}
      </Button>
    </div>
  );
}

/**
 * Tab navigation — Overview | History (§30). Rendered above every branch;
 * switching tabs clears any focused job (the URL stays the single source).
 */
export function RecognitionWorkspace() {
  const dict = useDict().recognition;
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "history" ? "history" : "overview";
  const router = useRouter();

  function switchTab(next: "overview" | "history") {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("job");
    if (next === "history") params.set("tab", "history");
    else params.delete("tab");
    const query = params.toString();
    router.replace(query ? `/recognition?${query}` : "/recognition", { scroll: false });
  }

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label={dict.nav.title} className="flex items-center gap-1 border-b border-border pb-2">
        {(["overview", "history"] as const).map((key) => (
          <Button
            key={key}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "min-h-8 font-mono text-xs uppercase tracking-[0.06em]",
              tab === key ? "bg-surface-raised text-foreground" : "text-muted-foreground",
            )}
            onClick={() => switchTab(key)}
            aria-current={tab === key ? "page" : undefined}
            data-testid={`recognition-tab-${key}`}
          >
            {key === "overview" ? dict.tabs.overview : dict.tabs.history}
          </Button>
        ))}
      </nav>
      <WorkspaceInner />
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}
