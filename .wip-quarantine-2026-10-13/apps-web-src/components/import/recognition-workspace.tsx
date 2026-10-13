"use client";

/**
 * RecognitionWorkspace — orchestrates everything that happens to ONE job
 * (spec §4 steps 5-9 + §44): live processing → result review → trade draft
 * → confirmation → success, plus the cancelled/failed/missing states and
 * the read-only imported summary. The URL carries ?job=<id> so the context
 * survives a refresh (edits are session-local — see Known Limitations).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileWarning, Loader2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isoToLocalInput } from "@/lib/utils/datetime";
import { queryKeys } from "@/lib/api/keys";
import { plannedRiskReward } from "@/lib/recognition/constants";
import { validateTradeDraft } from "@/lib/recognition/schemas";
import {
  recognitionService,
  useRecognitionJob,
} from "@/lib/recognition/use-recognition";
import type {
  RecognitionFieldKey,
  RecognizedTrade,
  TradeDraft,
} from "@/lib/recognition/types";
import { useI18n } from "@/i18n/i18n-provider";
import { RecognitionProgress } from "./recognition-progress";
import { RecognitionResult } from "./recognition-result";
import { TradeDraftReview } from "./trade-draft-review";
import { ImportConfirmation, ImportSuccess } from "./import-confirmation";
import { recognitionErrorMessage } from "./import-shared";

type ReviewStep = "result" | "draft" | "confirm" | "success";

/** Assembles the reviewed draft from the recognized fields + user edits. */
function buildDraft(
  trade: RecognizedTrade,
  edits: Partial<Record<RecognitionFieldKey, string>>,
  detectedPlatform: string,
): TradeDraft {
  const read = (key: RecognitionFieldKey): string | null => {
    if (edits[key] !== undefined) return edits[key]!;
    const field = trade.fields.find((candidate) => candidate.key === key);
    if (!field || field.status === "NOT_FOUND" || field.status === "NOT_APPLICABLE") {
      return null;
    }
    return field.value;
  };

  /** Recognized datetimes are ISO; the draft carries datetime-local strings. */
  const readTime = (key: RecognitionFieldKey): string | null => {
    const raw = read(key);
    if (raw === null) return null;
    return isoToLocalInput(raw) ?? raw;
  };

  const symbol = read("symbol");
  const direction = read("direction");
  const volume = read("volume");
  const entryPrice = read("entryPrice");

  return {
    // Draft assembly happens only when these are valid (guarded by caller).
    symbol: symbol ?? "",
    direction: direction === "SELL" ? "SELL" : "BUY",
    platform: detectedPlatform,
    volume: volume ?? "",
    entryPrice: entryPrice ?? "",
    exitPrice: read("exitPrice"),
    stopLoss: read("stopLoss"),
    takeProfit: read("takeProfit"),
    pnl: read("pnl"),
    currency: read("currency"),
    openTime: readTime("openTime"),
    closeTime: readTime("closeTime"),
    notes: null,
  };
}

export function RecognitionWorkspace({
  jobId,
  onBack,
  onImportAnother,
}: {
  jobId: string;
  onBack: () => void;
  onImportAnother: () => void;
}) {
  const { dict } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const job = useRecognitionJob(jobId);

  const [step, setStep] = React.useState<ReviewStep>("result");
  const [edits, setEdits] = React.useState<Partial<Record<RecognitionFieldKey, string>>>({});
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [importedTradeId, setImportedTradeId] = React.useState<string | null>(null);

  const onEditField = (key: RecognitionFieldKey, value: string) => {
    setEdits((current) => ({ ...current, [key]: value }));
  };

  const onCancelJob = async () => {
    setCancelling(true);
    try {
      await recognitionService.cancelRecognition(jobId);
    } catch (error) {
      toast.error(recognitionErrorMessage(error, dict.recognition));
    } finally {
      setCancelling(false);
    }
  };

  const onRetryJob = async () => {
    setRetrying(true);
    try {
      await recognitionService.retryRecognition(jobId);
      setStep("result");
      setEdits({});
      setImportedTradeId(null);
    } catch (error) {
      toast.error(recognitionErrorMessage(error, dict.recognition));
    } finally {
      setRetrying(false);
    }
  };

  const onDiscardJob = async () => {
    try {
      await recognitionService.discardRecognition(jobId);
      setDiscardOpen(false);
      onBack();
    } catch (error) {
      toast.error(recognitionErrorMessage(error, dict.recognition));
      setDiscardOpen(false);
    }
  };

  // ── Missing job ────────────────────────────────────────────────────────────
  if (!job) {
    return (
      <Card data-testid="import-job-missing">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <FileWarning className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {dict.recognition.details.missingJob}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft aria-hidden />
            {dict.recognition.view.backToOverview}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Processing / cancelling (spec §15/§55) ─────────────────────────────────
  if (job.status === "PROCESSING" || job.status === "PENDING") {
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="import-workspace-processing">
        <RecognitionProgress job={job} onCancel={onCancelJob} cancelling={cancelling} />
      </div>
    );
  }

  // ── Cancelled (spec §55) ───────────────────────────────────────────────────
  if (job.status === "CANCELLED") {
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="import-workspace-cancelled">
        <RecognitionProgress job={job} onCancel={onCancelJob} cancelling={cancelling} />
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={onBack} disabled={retrying}>
            <ArrowLeft aria-hidden />
            {dict.recognition.view.backToHistory}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onRetryJob}
            disabled={retrying}
            data-testid="import-retry"
          >
            {retrying ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
            {dict.recognition.progress.retry}
          </Button>
        </div>
      </div>
    );
  }

  // ── Failed (spec §32/§56) ──────────────────────────────────────────────────
  if (job.status === "FAILED") {
    const message =
      job.error !== null ? dict.recognition.errors[job.error] : dict.recognition.errors.UNKNOWN;
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="import-workspace-failed">
        <Card data-testid="import-error">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <XCircle className="size-8 text-loss" aria-hidden />
            <p className="max-w-sm text-sm" role="alert">
              {message}
            </p>
          </CardContent>
        </Card>
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={onBack} disabled={retrying}>
            <ArrowLeft aria-hidden />
            {dict.recognition.view.backToHistory}
          </Button>
          <Button
            type="button"
            onClick={onRetryJob}
            disabled={retrying}
            data-testid="import-retry"
          >
            {retrying ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
            {dict.recognition.progress.retry}
          </Button>
        </div>
      </div>
    );
  }

  // ── Completed — no result payload guard (defensive) ────────────────────────
  const trade = job.result?.trades[0] ?? null;
  if (!job.result || !trade) {
    return (
      <Card data-testid="import-workspace-empty-result">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <FileWarning className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {dict.recognition.warnings.codes.NO_TRADE_DETECTED}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft aria-hidden />
            {dict.recognition.view.backToHistory}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const detectedPlatformLabel = job.result.detectedPlatform
    ? dict.recognition.settings.platformOptions[job.result.detectedPlatform]
    : dict.recognition.result.detectedNone;

  // Imported (this session or a previous one) → read-only summary.
  const effectiveTradeId = importedTradeId ?? job.importedTradeId;
  if (effectiveTradeId !== null && step !== "success") {
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="import-workspace-imported">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-medium">{dict.recognition.success.title}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {dict.recognition.success.body}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => router.push(`/trades?trade=${effectiveTradeId}`)}
                data-testid="import-imported-view-trade"
                aria-label={dict.recognition.success.viewTradeAria}
              >
                {dict.recognition.success.viewTrade}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onImportAnother}
                data-testid="import-imported-again"
                aria-label={dict.recognition.success.importAnotherAria}
              >
                {dict.recognition.success.importAnother}
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-start">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft aria-hidden />
            {dict.recognition.view.backToHistory}
          </Button>
        </div>
      </div>
    );
  }

  const draft = buildDraft(trade, edits, detectedPlatformLabel);
  const entry = Number(draft.entryPrice);
  const riskReward = plannedRiskReward(
    entry,
    draft.stopLoss === null ? null : Number(draft.stopLoss),
    draft.takeProfit === null ? null : Number(draft.takeProfit),
  );
  const validation = validateTradeDraft({
    symbol: draft.symbol,
    direction: draft.direction,
    volume: draft.volume,
    entryPrice: draft.entryPrice,
    exitPrice: draft.exitPrice,
    stopLoss: draft.stopLoss,
    takeProfit: draft.takeProfit,
    pnl: draft.pnl,
    openTime: draft.openTime,
    closeTime: draft.closeTime,
  });

  const onConfirmImport = async () => {
    setConfirming(true);
    try {
      const response = await recognitionService.confirmImport(jobId, draft);
      setImportedTradeId(response.tradeId);
      setStep("success");
      // The journal now owns a new trade — every trades surface must refetch
      // (same contract as a NestJS-backed import: mutate, then invalidate).
      queryClient.invalidateQueries({ queryKey: queryKeys.tradesRoot });
      toast.success(dict.recognition.success.toastTitle, {
        description: dict.recognition.success.toastBody,
      });
    } catch (error) {
      toast.error(recognitionErrorMessage(error, dict.recognition));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="import-workspace">
      {step === "result" && (
        <RecognitionResult
          job={job}
          trade={trade}
          edits={edits}
          onEditField={onEditField}
          onCreateDraft={() => setStep("draft")}
          onDiscard={onDiscardJob}
          discardOpen={discardOpen}
          onDiscardOpenChange={setDiscardOpen}
        />
      )}

      {step === "draft" && (
        <TradeDraftReview
          draft={draft}
          riskReward={riskReward}
          validation={validation}
          onBack={() => setStep("result")}
          onContinue={() => setStep("confirm")}
          submitting={confirming}
        />
      )}

      {step === "confirm" && (
        <ImportConfirmation
          draft={draft}
          onConfirm={onConfirmImport}
          onBack={() => setStep("draft")}
          processing={confirming}
        />
      )}

      {step === "success" && importedTradeId !== null && (
        <ImportSuccess
          tradeId={importedTradeId}
          onViewTrade={() => router.push(`/trades?trade=${importedTradeId}`)}
          onImportAnother={onImportAnother}
        />
      )}
    </div>
  );
}
