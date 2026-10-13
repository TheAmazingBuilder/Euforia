"use client";

/**
 * Import & Recognition — shared primitives (badges, warnings, thumbnails,
 * formatting helpers, URL-state hook). Everything here is presentation-only:
 * domain logic lives in lib/recognition, copy in dict.recognition.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Eye,
  ImageOff,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { confidenceLevel, jobNeedsReview } from "@/lib/recognition/constants";
import type { RecognitionServiceErrorCode } from "@/lib/recognition/service";
import type {
  RecognitionJob,
  RecognitionWarning,
} from "@/lib/recognition/types";
import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

type V = RecognitionDict;

// ── URL state (spec §44) — /import?tab=…&view=new&job=<id> ───────────────────

export function useImportParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  return { searchParams, setParams };
}

// ── Formatting helpers (financial precision preserved — spec §47) ────────────

/** "2.4 MB" / "912 KB" — upload metadata display. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${bytes} B`;
}

/** Signed P&L keeps its recognized string precision; color via class. */
export function pnlTone(value: string): "profit" | "loss" | "neutral" {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "neutral";
  return n > 0 ? "profit" : "loss";
}

/** "1 : 1.83" planned risk/reward (2 decimals max). */
export function formatRiskReward(ratio: number): string {
  const rounded = Math.round(ratio * 100) / 100;
  return `1 : ${rounded.toFixed(2)}`;
}

/** Short deterministic timestamp ("Sep 30, 13:24") for the history column. */
export function formatShortTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${month} ${day}, ${time}`;
}

/** "3.2 s" / "1 min 24 s" processing duration. */
export function formatDurationMs(ms: number, dict: V): string {
  if (ms < 60_000) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}${dict.shared.secondsSuffix}`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}${dict.shared.minutesSuffix} ${seconds}${dict.shared.secondsSuffix}`;
}

// ── Badges ───────────────────────────────────────────────────────────────────

export function ConfidenceBadge({
  score,
  dict,
  className,
}: {
  score: number;
  dict: V;
  className?: string;
}) {
  const level = confidenceLevel(score);
  const label =
    level === "HIGH"
      ? dict.confidence.high
      : level === "MEDIUM"
        ? dict.confidence.medium
        : dict.confidence.low;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs tabular-nums",
        level === "HIGH" && "bg-profit/10 text-profit",
        level === "MEDIUM" && "bg-warning/10 text-warning",
        level === "LOW" && "bg-loss/10 text-loss",
        className,
      )}
      data-testid={`import-confidence-${level.toLowerCase()}`}
      title={`${dict.confidence.label} — ${label}`}
    >
      {score}
      {dict.shared.percentSuffix}
    </span>
  );
}

export function JobStatusBadge({
  job,
  dict,
  className,
}: {
  job: RecognitionJob;
  dict: V;
  className?: string;
}) {
  const needsReview = jobNeedsReview(job);
  const label = needsReview
    ? dict.status.NEEDS_REVIEW
    : dict.status[job.status];
  const variant: "default" | "secondary" | "destructive" | "outline" = needsReview
    ? "secondary"
    : job.status === "COMPLETED"
      ? "default"
      : job.status === "FAILED"
        ? "destructive"
        : job.status === "PROCESSING"
          ? "secondary"
          : "outline";
  return (
    <Badge variant={variant} className={cn("font-medium", className)} data-testid="import-status-badge">
      {job.status === "PROCESSING" && (
        <Loader2 className="mr-1 size-3 animate-spin" aria-hidden />
      )}
      {label}
    </Badge>
  );
}

// ── Warnings (spec §26) — codes localized, field chip composed ───────────────

export function WarningsList({
  warnings,
  dict,
  className,
}: {
  warnings: RecognitionWarning[];
  dict: V;
  className?: string;
}) {
  if (warnings.length === 0) return null;
  return (
    <ul
      className={cn("space-y-2", className)}
      data-testid="import-warnings"
      role="list"
      aria-label={dict.result.warningsTitle}
    >
      {warnings.map((warning) => (
        <li
          key={warning.id}
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
          data-testid={`import-warning-${warning.code.toLowerCase()}`}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="leading-snug">{dict.warnings.codes[warning.code]}</p>
            {warning.fieldKey !== undefined && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {dict.fields[warning.fieldKey]}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Screenshot thumbnail (preview or placeholder for seeded history) ─────────

export function ScreenshotThumb({
  job,
  dict,
  className,
}: {
  job: RecognitionJob;
  dict: V;
  className?: string;
}) {
  if (job.previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local object URL, no optimization possible
      <img
        src={job.previewUrl}
        alt={dict.shared.screenshotPlaceholder}
        className={cn("size-full rounded-md object-cover", className)}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={cn(
        "flex size-full items-center justify-center rounded-md bg-muted text-muted-foreground",
        className,
      )}
      aria-label={dict.shared.screenshotPlaceholder}
      role="img"
    >
      <ImageOff className="size-4" aria-hidden />
    </div>
  );
}

// ── Error message mapping (spec §32) ─────────────────────────────────────────

export function recognitionErrorMessage(
  error: unknown,
  dict: V,
): string {
  const code = (error as { code?: RecognitionServiceErrorCode })?.code;
  if (typeof code === "string" && code in dict.errors) {
    return dict.errors[code];
  }
  return dict.errors.UNKNOWN;
}

/** Field-scoped warning icon for inline use. */
export function FieldWarningIcon({ dict }: { dict: V }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-warning"
      title={dict.confidence.reviewRecommended}
    >
      <ShieldAlert className="size-3.5" aria-hidden />
      {dict.confidence.verify}
    </span>
  );
}

/** Screen-reader-only live region announcing async state changes. */
export function LiveAnnouncement({ message }: { message: string }) {
  return (
    <p aria-live="polite" role="status" className="sr-only">
      {message}
    </p>
  );
}

/** Open-details affordance reused by history rows. */
export function OpenDetailsIcon() {
  return <Eye className="size-4" aria-hidden />;
}
