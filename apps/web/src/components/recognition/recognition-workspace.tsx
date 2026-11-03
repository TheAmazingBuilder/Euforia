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
  useReprocessOcrRecognition,
  useOcrStorage,
  useDeleteOcrRecognition,
  useOcrRecrop,
  useOcrRecognition,
  useOcrRecognitionEvents,
  useOcrRecognitionsInfinite,
  fetchOcrRecognitionImage,
} from "@/lib/api/queries";
import { useDict } from "@/i18n/i18n-provider";
import { profileMetaKey, profileStampLabel } from "@/components/recognition/recognition-model";
import {
  RecognitionSettings,
} from "@/components/recognition/recognition-settings";
import { RecognitionProgress } from "@/components/recognition/recognition-progress";
import { RecognitionResult } from "@/components/recognition/recognition-result";
import { RecognitionSuccess } from "@/components/recognition/recognition-success";
import { TradeDraftReview } from "@/components/recognition/trade-draft-review";
import { ScreenshotUploader } from "@/components/recognition/screenshot-uploader";
import { RecognitionHistory } from "@/components/recognition/recognition-history";
import { SetWorkspace } from "@/components/recognition/set-workspace";
import {
  formatRelative,
  formatStorageBytes,
  platformLabel,
  recognitionConfidence,
  type RecognitionStep,
} from "@/components/recognition/recognition-model";
import type { CropRegion } from "@/components/recognition/recognition-result";
import { RecognitionStatusBadge } from "@/components/recognition/recognition-status-badge";

/**
 * RecognitionWorkspace - the Import & Recognition orchestrator (PROMPT 3).
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
  // ACCOUNTS attachment (engine quality §3.1) - null = the default account.
  const [accountId, setAccountId] = React.useState<string | null>(null);
  // Grouped confirmation (§2.2): per-draft corrections + include decisions.
  const [activeCandidate, setActiveCandidate] = React.useState(0);
  const [candidateCorrections, setCandidateCorrections] = React.useState<Record<number, Record<string, string | null>>>({});
  const [candidateIncludes, setCandidateIncludes] = React.useState<boolean[]>([]);
  // Region re-scan results (§2.4) + the confirmation outcome facts.
  const [recropResults, setRecropResults] = React.useState<{ fields: OcrRecognition["fields"]; region: CropRegion } | null>(null);
  const [importOutcome, setImportOutcome] = React.useState<{ count: number; tags: string[] }>({ count: 1, tags: [] });

  // ── server state ─────────────────────────────────────────────────────────
  const list = useOcrRecognitionsInfinite();
  // V2 §62 - pages live in the React Query cache (no component-state sync).
  const historyItems: OcrRecognition[] = list.data
    ? list.data.pages.flatMap((page: { items: OcrRecognition[] }) => page.items)
    : [];
  const focusedJob = useOcrRecognition(jobId);
  useOcrRecognitionEvents(jobId, focusedJob.data?.recognition.status === "PROCESSING" || focusedJob.data?.recognition.status === "QUEUED");
  const create = useCreateOcrRecognition();
  const confirm = useConfirmOcrRecognition();
  const reprocess = useReprocessOcrRecognition();
  const deleteJob = useDeleteOcrRecognition();
  // V2 §58 - explicit duplicate acknowledgments. Render-time derivation
  // resets them when the focused job changes (no cascading effect).
  const [acks, setAcks] = React.useState<{ jobId: string | null; screenshot: boolean; trade: boolean }>({
    jobId: null,
    screenshot: false,
    trade: false,
  });
  const currentAcks = acks.jobId === jobId ? acks : { jobId, screenshot: false, trade: false };
  const ackDuplicateScreenshot = currentAcks.screenshot;
  const ackTradeDuplicate = currentAcks.trade;
  const setAckDuplicateScreenshot = (value: boolean) => setAcks({ jobId, screenshot: value, trade: currentAcks.trade });
  const setAckTradeDuplicate = (value: boolean) => setAcks({ jobId, screenshot: currentAcks.screenshot, trade: value });
  const recrop = useOcrRecrop();

  const recognition = focusedJob.data?.recognition ?? null;

  // Resolved preview bytes for the focused job (authenticated fetch, §37).
  // The fetch itself is async (setState in callbacks - never in the effect
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
  // cascading render) - a processing job that settles jumps to the result,
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
    setAccountId(null);
    setActiveCandidate(0);
    setCandidateCorrections({});
    setCandidateIncludes([]);
    setRecropResults(null);
    setImportOutcome({ count: 1, tags: [] });
    setStepRaw("overview");
    if (clearJob) setParams({ job: null });
  }

  async function handleStart() {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      create.mutate(
        { imageDataUrl: dataUrl, requestedProfile: profile, accountId },
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
    const candidates = recognition.candidates ?? null;
    const isMulti = Boolean(candidates && candidates.length > 1);

    if (isMulti && candidates) {
      // Grouped confirmation (engine quality §2.2): one batch per draft.
      const batches = candidates.map((candidate, index) => {
        const draftCorrections = candidateCorrections[index] ?? {};
        const merged: Record<string, string | null> = {};
        for (const field of candidate.fields) {
          merged[field.field] = field.field in draftCorrections ? draftCorrections[field.field] : field.normalizedValue;
        }
        return { corrections: merged, include: candidateIncludes[index] ?? true };
      });
      confirm.mutate(
        {
          id: recognition.id,
          corrections: batches[0]?.corrections ?? {},
          batches,
          accountId,
          acknowledgeDuplicateScreenshot: ackDuplicateScreenshot,
          acknowledgeDuplicateTrade: ackTradeDuplicate,
        },
        {
          onSuccess: (data) => {
            setImportOutcome({ count: data.recognition.tradeIds.length || 1, tags: data.recognition.suggestedTags });
            toast.success(successToastFor(recognition.extractionProfile, dict));
            setStepRaw("success");
          },
          onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
        },
      );
      return;
    }

    const full: Record<string, string | null> = {};
    for (const field of recognition.fields) {
      full[field.field] = field.field in corrections ? corrections[field.field] : field.normalizedValue;
    }
    confirm.mutate(
      {
        id: recognition.id,
        corrections: full,
        accountId,
        acknowledgeDuplicateScreenshot: ackDuplicateScreenshot,
        acknowledgeDuplicateTrade: ackTradeDuplicate,
      },
      {
        onSuccess: (data) => {
          setImportOutcome({ count: Math.max(data.recognition.tradeIds.length, 1), tags: data.recognition.suggestedTags });
          toast.success(successToastFor(recognition.extractionProfile, dict));
          setStepRaw("success");
        },
        onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
      },
    );
  }

  /** Region re-scan (engine quality §2.4) - results are ephemeral guidance. */
  const handleRecrop = (region: CropRegion) => {
    if (!recognition) return;
    recrop.mutate(
      { id: recognition.id, region },
      {
        onSuccess: (data) => setRecropResults({ fields: data.fields, region: data.region }),
        onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
      },
    );
  };

  // ── derived overview data ────────────────────────────────────────────────
  // V2 §62 - the history table reads the ACCUMULATED pages (Load more);
  // single-page consumers (overview recent strip) keep list.data directly.
  const items: OcrRecognition[] =
    historyItems.length > 0 ? historyItems : list.data?.pages[0]?.items ?? [];
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

  // Grouped-confirmation view model: per-draft merged values + includes.
  const candidates = recognition?.candidates ?? null;
  const isMulti = Boolean(candidates && candidates.length > 1);
  const activeCandidateFields = isMulti && candidates ? (candidates[activeCandidate]?.fields ?? candidates[0]!.fields) : recognition?.fields ?? [];
  const activeCandidateCorrections = isMulti ? (candidateCorrections[activeCandidate] ?? {}) : corrections;
  const activeEffectiveValues: Record<string, string | null> = {};
  for (const field of activeCandidateFields) {
    activeEffectiveValues[field.field] = field.field in activeCandidateCorrections
      ? activeCandidateCorrections[field.field]
      : field.normalizedValue;
  }
  const draftStates = isMulti && candidates
    ? candidates.map((candidate, index) => {
        const draftCorrections = candidateCorrections[index] ?? {};
        const draftEffective: Record<string, string | null> = {};
        for (const field of candidate.fields) {
          draftEffective[field.field] = field.field in draftCorrections ? draftCorrections[field.field] : field.normalizedValue;
        }
        return { effectiveValues: draftEffective, include: candidateIncludes[index] ?? true };
      })
    : undefined;

  /** Apply a value (edited or suggested) to the ACTIVE draft (or single). */
  const handleSaveFieldValue = (field: string, value: string | null) => {
    if (isMulti) {
      setCandidateCorrections((current) => ({
        ...current,
        [activeCandidate]: { ...(current[activeCandidate] ?? {}), [field]: value },
      }));
    } else {
      setCorrections((current) => ({ ...current, [field]: value }));
    }
    setEditingField(null);
  };

  // ── tab: HISTORY ─────────────────────────────────────────────────────────
  if (tab === "history" && !jobId) {
    return (
      <RecognitionHistory
        dict={dict}
        items={items}
        loading={list.isLoading}
        hasMore={list.hasNextPage}
        onLoadMore={() => {
          void list.fetchNextPage();
        }}
        onReprocess={(id) =>
          reprocess.mutate(id, {
            onSuccess: (data) => {
              toast.success(dict.reprocess.done);
              setParams({ job: data.recognition.id });
            },
            onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
          })
        }
        onOpen={(id) => {
          // Opening a record must never inherit the wizard's stale step
          // (e.g. "success" from a just-confirmed job) - reset to
          // "overview" so the derivation shows the read-only record.
          setStepRaw("overview");
          setParams({ job: id });
        }}
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
            draftStates={draftStates}
            onToggleInclude={(index, include) =>
              setCandidateIncludes((current) => {
                const next = [...current];
                while (next.length <= index) next.push(true);
                next[index] = include;
                return next;
              })
            }
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
          <RecognitionSuccess
            dict={dict}
            onImportAnother={() => resetToOverview()}
            importedCount={importOutcome.count}
            suggestedTags={importOutcome.tags}
            profile={recognition.extractionProfile}
          />
        </StepShell>
      );
    }
    return (
      <StepShell dict={dict} active="review">
        <RecognitionResult
          recognition={recognition}
          dict={dict}
          imageUrl={jobImageUrl}
          effectiveValues={activeEffectiveValues}
          editingField={editingField}
          onEditStart={setEditingField}
          onEditCancel={() => setEditingField(null)}
          onSaveField={handleSaveFieldValue}
          onReviewDraft={() => setStepRaw("review")}
          onRetry={handleRetry}
          onReprocess={
            recognition.status !== "PROCESSING" && recognition.status !== "QUEUED"
              ? () => {
                  reprocess.mutate(recognition.id, {
                    onSuccess: (data) => {
                      toast.success(dict.reprocess.done);
                      router.replace(`/recognition?job=${data.recognition.id}`);
                      setStepRaw("overview");
                    },
                    onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
                  });
                }
              : undefined
          }
          reprocessing={reprocess.isPending}
          onAcknowledgeTradeDuplicate={
            recognition.possibleTradeDuplicate
              ? () => {
                  setAckTradeDuplicate(true);
                  toast.info(dict.tradeDuplicate.dismissed);
                }
              : undefined
          }
          onAcknowledgeScreenshotDuplicate={
            recognition.duplicateOf
              ? () => {
                  setAckDuplicateScreenshot(true);
                  toast.info(dict.duplicate.dismissed);
                }
              : undefined
          }
          readOnly={recognition.status === "CONFIRMED"}
          recrop={{
            pending: recrop.isPending,
            results: recropResults,
            onScan: handleRecrop,
            onClear: () => setRecropResults(null),
          }}
        />
        {isMulti && candidates ? (
          <div className="flex items-center gap-2 border-t border-border pt-3" data-testid="recognition-draft-selector">
            <span className="ledger-label">{dict.multi.draft}</span>
            {candidates.map((_, index) => (
              <Button
                key={index}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "min-h-8 font-mono text-xs uppercase tracking-[0.06em]",
                  activeCandidate === index ? "bg-surface-raised text-foreground" : "text-muted-foreground",
                )}
                onClick={() => setActiveCandidate(index)}
                data-testid={`recognition-draft-tab-${index}`}
              >
                {index + 1}
              </Button>
            ))}
          </div>
        ) : null}
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
            accountId={accountId}
            onAccountId={setAccountId}
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
      {/* Upload hero - the entry point IS the product (§10), console redesign:
          the dropzone wears viewfinder corners; modes are numbered columns. */}
      {items.length === 0 ? (
        <div className="flex flex-col gap-6">
          <div className="chart-paper flex flex-col gap-8 rounded-xl border border-border bg-surface px-6 py-10">
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
              <p className="ledger-label text-accent">{dict.overview.heroKicker}</p>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">{dict.overview.heroTitle}</h2>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{dict.overview.heroBody}</p>
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
                {dict.overview.heroPlatforms}
              </p>
            </div>
            <div className="mx-auto w-full max-w-2xl">
              <ScreenshotUploader file={null} onFile={(picked) => { setFile(picked); setStepRaw("configure"); }} onClear={() => setFile(null)} dict={dict} disabled={create.isPending} />
            </div>
            <p className="text-center text-xs text-muted-foreground/80">{dict.overview.privacy}</p>
          </div>
          <HeroModes dict={dict} />
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
          <div className="flex flex-col gap-6">
            <RecentImports
              dict={dict}
              items={recent}
              onOpen={(id) => {
          // Opening a record must never inherit the wizard's stale step
          // (e.g. "success" from a just-confirmed job) - reset to
          // "overview" so the derivation shows the read-only record.
          setStepRaw("overview");
          setParams({ job: id });
        }}
              onOpenHistory={() => setParams({ tab: "history" })}
            />
            <HeroModes dict={dict} compact />
          </div>
        </div>
      )}

      {/* Stat band - one ruled strip, never sibling cards (§9). */}
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

      {/* V2 §1/§2/§18 - the multi-screenshot flow (one event, several shots). */}
      <SetWorkspace dict={dict} />

      {/* Storage + retention indicator (engine quality §4.2 - now live). */}
      <StorageIndicator dict={dict} />

    </div>
  );
}

/**
 * HeroModes - the three recognition modes as a ruled capability list
 * (console redesign): mono INDEX, icon in a bordered square, and what the
 * engine reads in each mode. Informational - the real selection happens in
 * the configure step.
 */
function HeroModes({ dict, compact = false }: { dict: ReturnType<typeof useDict>["recognition"]; compact?: boolean }) {
  const modes = [
    { index: "01", label: dict.settings.profileTrade, hint: dict.settings.profileTradeHint, items: dict.settings.profileTradeItems },
    { index: "02", label: dict.settings.profileAccount, hint: dict.settings.profileAccountHint, items: dict.settings.profileAccountItems },
    { index: "03", label: dict.settings.profileChart, hint: dict.settings.profileChartHint, items: dict.settings.profileChartItems },
  ];
  return (
    <section aria-label={dict.overview.heroModesTitle} className="flex flex-col" data-testid="recognition-hero-modes">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <p className="ledger-label">{dict.overview.heroModesTitle}</p>
        {!compact ? <p className="text-[11px] text-muted-foreground">{dict.overview.heroModesHint}</p> : null}
      </div>
      <div className={cn("grid gap-x-8", compact ? "" : "sm:grid-cols-3")}>
        {modes.map((mode) => (
          <div key={mode.index} className="flex flex-col gap-1.5 border-b border-border/60 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[10px] font-medium tracking-[0.08em] text-accent">{mode.index}</span>
              <p className="text-sm font-medium">{mode.label}</p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{mode.hint}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/80">{mode.items}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────────

/** Retention + storage indicator (engine quality §4.2) - the overview footer,
 * console redesign: a ruled strip with a thin usage meter. */
function StorageIndicator({ dict }: { dict: ReturnType<typeof useDict>["recognition"] }) {
  const storage = useOcrStorage();
  if (storage.isLoading || storage.isError || !storage.data || storage.data.assetCount === 0) return null;
  const data = storage.data;
  // The quota the mock contract serves (10 MB) - the meter shows the used
  // share; without a quota the bar stays empty rather than guessing.
  const quotaBytes = 10 * 1024 * 1024;
  const usedPct = Math.min(100, Math.round((data.usedBytes / quotaBytes) * 100));
  return (
    <div
      className="flex flex-col gap-2 border-t border-border pt-3"
      data-testid="recognition-storage"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-muted-foreground">
        <span className="ledger-label !text-[10px]">{dict.storage.label}</span>
        <span>
          {formatStorageBytes(data.usedBytes)} · {data.retainedAssetCount} {dict.storage.retained}
          {data.purgedAssetCount > 0 ? ` · ${data.purgedAssetCount} ${dict.storage.purged}` : null}
        </span>
        <span>
          {data.retentionDays > 0 ? `${dict.storage.retention} ${data.retentionDays} ${dict.storage.days}` : dict.storage.disabled}
        </span>
      </div>
      <div className="meter max-w-xs" role="presentation">
        <span style={{ width: `${usedPct}%` }} />
      </div>
    </div>
  );
}

/** Ruled step indicator - 01 UPLOAD → 02 REVIEW → 03 CONFIRM (§4 workflow),
 * console redesign: mono indices with hairline connectors and honest states. */
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
      <nav aria-label="Progress" className="flex items-center gap-2">
        {steps.map((entry, index) => (
          <React.Fragment key={entry.key}>
            {index > 0 ? <span className="h-px w-6 bg-border" aria-hidden="true" /> : null}
            <span
              className={cn(
                "flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em]",
                index < activeIndex && "text-muted-foreground",
                index === activeIndex && "text-foreground",
                index > activeIndex && "text-muted-foreground/50",
              )}
              aria-current={index === activeIndex ? "step" : undefined}
            >
              <span
                className={cn(
                  "!text-[10px]",
                  index === activeIndex && "text-accent",
                )}
                aria-hidden="true"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
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
                <span className="font-mono text-[10px] tracking-[0.06em] text-accent" aria-hidden="true">
                  {profileStampLabel(item.extractionProfile, dict)}
                </span>
                {" · "}
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
 * Tab navigation - Overview | History (§30). Rendered above every branch;
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

/** Per-profile confirmation toast (Account & Chart V1.1). */
function successToastFor(
  profile: OcrRecognition["extractionProfile"],
  dict: ReturnType<typeof useDict>["recognition"],
): string {
  const metaKey = profileMetaKey(profile);
  if (metaKey === "account") return dict.success.toastAccount;
  if (metaKey === "chart") return dict.success.toastChart;
  return dict.success.toast;
}
