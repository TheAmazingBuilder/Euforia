"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, FileImage, ScanText, Trash2, UploadCloud } from "lucide-react";
import type { OcrRecognition, OcrRecognitionStatus } from "@cosmoz/shared";

import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useConfirmOcrRecognition,
  useCreateOcrRecognition,
  useDeleteOcrRecognition,
  useOcrRecognitions,
  fetchOcrRecognitionImage,
} from "@/lib/api/queries";

/**
 * /recognition — the trade-screenshot review UI (Phase 19 contract consumer).
 * Upload → engine extraction → HUMAN REVIEW → confirmation. Machine output is
 * never trusted: every uncertain value carries its confidence band and
 * validation status, and only the user's confirmed corrections are
 * authoritative. The screen never creates a Trade — the journal stays the
 * single source of truth.
 */

const UPLOAD_MAX_BYTES = 6 * 1024 * 1024; // client-side guard, server re-checks
const ACCEPTED_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "REVIEW_REQUIRED", label: "Review required" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "FAILED", label: "Failed" },
] as const;

const FIELD_LABELS: Record<string, string> = {
  symbol: "Symbol",
  direction: "Direction",
  volume: "Volume",
  entryPrice: "Entry price",
  exitPrice: "Exit price",
  stopLoss: "Stop loss",
  takeProfit: "Take profit",
  profit: "Profit",
  openTime: "Open time",
  closeTime: "Close time",
};

function StatusBadge({ status }: { status: OcrRecognitionStatus }) {
  const map: Record<OcrRecognitionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    QUEUED: { label: "Queued", variant: "outline" },
    PROCESSING: { label: "Processing", variant: "secondary" },
    REVIEW_REQUIRED: { label: "Review required", variant: "default" },
    CONFIRMED: { label: "Confirmed", variant: "secondary" },
    FAILED: { label: "Failed", variant: "destructive" },
  };
  const entry = map[status];
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

function ConfidenceBadge({ band }: { band: string }) {
  const variant = band === "HIGH" ? "secondary" : band === "MEDIUM" ? "outline" : "destructive";
  return (
    <Badge variant={variant} className="font-mono text-[10px]">
      {band}
    </Badge>
  );
}

function validationLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace("_", " ");
}

export function RecognitionView() {
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const { data, isLoading, isError, error } = useOcrRecognitions(
    statusFilter === "all" ? undefined : (statusFilter as OcrRecognitionStatus),
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Recognition
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Upload a trade screenshot and the OCR engine extracts the summary
          fields for your review. Nothing is trusted until you confirm it —
          machine output is a draft, your corrections are the record.
        </p>
      </header>

      <UploadCard />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Recognitions</h2>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Could not load recognitions: {apiErrorMessage(error, "unexpected error")}.
          </CardContent>
        </Card>
      ) : (data?.items.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ScanText className="size-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm font-medium">No recognitions yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Upload an MT5 trade summary screenshot above — the extracted
              fields will appear here for review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="recognition-list">
          {data!.items.map((recognition) => (
            <RecognitionCard key={recognition.id} recognition={recognition} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Upload ──────────────────────────────────────────────────────────────────

function UploadCard() {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const create = useCreateOcrRecognition();

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const accept = React.useCallback((candidate: File | undefined) => {
    if (!candidate) return;
    if (!ACCEPTED_MIMES.includes(candidate.type as (typeof ACCEPTED_MIMES)[number])) {
      toast.error("Unsupported file type — use PNG, JPEG or WebP.");
      return;
    }
    if (candidate.size > UPLOAD_MAX_BYTES) {
      toast.error("The image is too large — the limit is 6 MB.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(candidate);
    setPreviewUrl(URL.createObjectURL(candidate));
  }, [previewUrl]);

  const analyze = React.useCallback(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      try {
        const { recognition } = await create.mutateAsync({
          imageDataUrl: dataUrl,
          requestedProfile: "TRADE_SUMMARY",
        });
        toast.success(`Extraction finished — ${recognition.fields.length} fields ready for review.`);
        setFile(null);
        setPreviewUrl(null);
        if (inputRef.current) inputRef.current.value = "";
        window.dispatchEvent(new CustomEvent("cosmoz:recognition-updated", { detail: recognition.id }));
      } catch (error) {
        toast.error(apiErrorMessage(error, "The recognition failed — try another screenshot."));
      }
    };
    reader.readAsDataURL(file);
  }, [create, file]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="size-4" aria-hidden="true" />
          Upload a screenshot
        </CardTitle>
        <CardDescription>
          PNG, JPEG or WebP up to 6 MB — an MT5-style trade summary works best.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose or drop a screenshot"
          data-testid="recognition-dropzone"
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50",
          )}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            accept(event.dataTransfer.files[0]);
          }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Screenshot preview"
              className="max-h-48 rounded-lg border object-contain"
              data-testid="recognition-preview"
            />
          ) : (
            <>
              <FileImage className="size-8 text-muted-foreground/60" aria-hidden="true" />
              <p className="text-sm font-medium">
                Drop the screenshot here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                The image leaves your device only when you press Analyze.
              </p>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIMES.join(",")}
          className="hidden"
          onChange={(event) => accept(event.target.files?.[0])}
        />
        {file ? (
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs text-muted-foreground">
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFile(null);
                  setPreviewUrl(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                disabled={create.isPending}
              >
                Clear
              </Button>
              <Button size="sm" onClick={analyze} disabled={create.isPending} data-testid="recognition-analyze">
                {create.isPending ? "Analyzing…" : "Analyze screenshot"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── List card ───────────────────────────────────────────────────────────────

function RecognitionCard({ recognition }: { recognition: OcrRecognition }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = (event: Event) => {
      if ((event as CustomEvent<string>).detail === recognition.id) setOpen(true);
    };
    window.addEventListener("cosmoz:recognition-updated", handler);
    return () => window.removeEventListener("cosmoz:recognition-updated", handler);
  }, [recognition.id]);

  const validFields = recognition.fields.filter((field) => field.normalizedValue !== null).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border bg-card text-left transition-colors hover:bg-accent/40"
        data-testid="recognition-card"
      >
        <CardContent className="flex items-center gap-4 py-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FileImage className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">
                {recognition.classification?.type === "MT5_TRADE"
                  ? "MT5 trade summary"
                  : recognition.classification?.type === "TRADINGVIEW_CHART"
                    ? "TradingView chart"
                    : "Unknown screenshot"}
              </p>
              <StatusBadge status={recognition.status} />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {recognition.asset.width}×{recognition.asset.height} ·{" "}
              {(recognition.asset.sizeBytes / 1024).toFixed(0)} KB ·{" "}
              {validFields}/{recognition.fields.length} fields read ·{" "}
              {new Date(recognition.createdAt).toLocaleString("en-US")}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
            {recognition.engine?.name ?? "engine n/a"}
          </Badge>
        </CardContent>
      </button>
      <ReviewDialog recognition={recognition} open={open} onOpenChange={setOpen} />
    </>
  );
}

// ── Review dialog ───────────────────────────────────────────────────────────

function ReviewDialog({
  recognition,
  open,
  onOpenChange,
}: {
  recognition: OcrRecognition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const confirm = useConfirmOcrRecognition();
  const remove = useDeleteOcrRecognition();
  const editable = recognition.status === "REVIEW_REQUIRED";
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [corrections, setCorrections] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setCorrections(
      Object.fromEntries(
        recognition.fields
          .filter((field) => field.normalizedValue !== null)
          .map((field) => [field.field, field.normalizedValue ?? ""]),
      ),
    );
  }, [recognition]);

  React.useEffect(() => {
    if (!open) return;
    let revoked: string | null = null;
    fetchOcrRecognitionImage(recognition.id)
      .then((result) => {
        revoked = result.url;
        setImageUrl(result.url);
      })
      .catch(() => setImageUrl(null));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
      setImageUrl(null);
    };
  }, [open, recognition.id]);

  const dirtyFields = recognition.fields.filter(
    (field) => corrections[field.field] !== undefined && corrections[field.field] !== (field.normalizedValue ?? ""),
  );

  const onConfirm = async () => {
    try {
      await confirm.mutateAsync({ id: recognition.id, corrections });
      toast.success("Recognition confirmed — your corrections are now the record.");
      onOpenChange(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, "The confirmation failed."));
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(recognition.id);
      toast.success("Recognition deleted.");
      onOpenChange(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, "The deletion failed."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" data-testid="recognition-review-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Review extraction
            <StatusBadge status={recognition.status} />
          </DialogTitle>
          <DialogDescription>
            {editable
              ? "Correct any value before confirming — corrections become the authoritative record."
              : recognition.status === "CONFIRMED"
                ? `Confirmed ${recognition.confirmedAt ? new Date(recognition.confirmedAt).toLocaleString("en-US") : ""} — the record below is authoritative.`
                : "This recognition could not be completed."}
          </DialogDescription>
        </DialogHeader>

        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Uploaded screenshot"
            className="max-h-56 w-full rounded-lg border object-contain"
          />
        ) : (
          <Skeleton className="h-40 w-full rounded-lg" />
        )}

        {recognition.failure ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {recognition.failure.category}: {recognition.failure.message}
          </p>
        ) : null}

        {recognition.warnings.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {recognition.warnings.map((warning, index) => (
              <li key={index}>· {warning}</li>
            ))}
          </ul>
        ) : null}

        <Separator />

        <div className="space-y-3">
          {recognition.fields.map((field) => {
            const correction = corrections[field.field];
            const isDirty = correction !== undefined && correction !== (field.normalizedValue ?? "");
            return (
              <div key={field.field} className="grid grid-cols-[112px_1fr] items-start gap-2 sm:grid-cols-[132px_1fr]">
                <div className="pt-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {FIELD_LABELS[field.field] ?? field.field}
                  </Label>
                  <div className="mt-1 flex items-center gap-1">
                    <ConfidenceBadge band={field.confidenceBand} />
                    {field.validationStatus !== "VALID" ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {validationLabel(field.validationStatus)}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-1">
                  {editable ? (
                    <Input
                      value={correction ?? ""}
                      onChange={(event) =>
                        setCorrections((previous) => ({ ...previous, [field.field]: event.target.value }))
                      }
                      placeholder={field.rawValue ?? "—"}
                      className="h-8 font-mono text-xs"
                      aria-label={`Correct ${FIELD_LABELS[field.field] ?? field.field}`}
                      data-testid={`recognition-field-${field.field}`}
                    />
                  ) : (
                    <p className="pt-1 font-mono text-xs" data-testid={`recognition-field-${field.field}`}>
                      {correction ?? field.normalizedValue ?? "—"}
                    </p>
                  )}
                  {field.rawValue !== null && field.rawValue !== field.normalizedValue ? (
                    <p className="text-[11px] text-muted-foreground">
                      raw: <span className="font-mono">{field.rawValue}</span>
                    </p>
                  ) : null}
                  {field.warnings.length > 0 ? (
                    <p className="text-[11px] text-destructive/80">{field.warnings[0]}</p>
                  ) : null}
                  {isDirty ? (
                    <p className="text-[11px] font-medium text-primary">corrected — will be saved on confirm</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={remove.isPending}
            data-testid="recognition-delete"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </Button>
          {editable ? (
            <Button onClick={onConfirm} disabled={confirm.isPending} data-testid="recognition-confirm">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              {confirm.isPending ? "Confirming…" : dirtyFields.length > 0 ? `Confirm (${dirtyFields.length} corrected)` : "Confirm as read"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
