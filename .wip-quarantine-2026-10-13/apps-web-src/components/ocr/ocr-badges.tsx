"use client";

import * as React from "react";

import {
  AlertTriangle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  ConfidenceLevel,
  RecognitionFieldKey,
  RecognitionFieldState,
  RecognitionJobStatus,
} from "@/lib/recognition/contract";
import { FIELD_LABELS } from "@/lib/recognition/contract";

/**
 * Status chrome for the recognition module (§18/§26/§30). Semantic ink is
 * used sparingly and never as the only signal — every badge pairs its tint
 * with a label (and where useful an icon), per the design system's
 * "never color-only" rule.
 */

const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  HIGH: "border-profit/40 bg-profit/10 text-profit",
  MEDIUM: "border-warning/40 bg-warning/10 text-warning",
  LOW: "border-loss/40 bg-loss/10 text-loss",
};

export function ConfidenceBadge({
  level,
  value,
  className,
}: {
  level: ConfidenceLevel | null;
  value?: number | null;
  className?: string;
}) {
  if (level === null) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide",
        CONFIDENCE_STYLES[level],
        className,
      )}
      title={`Recognition confidence: ${value ?? "—"}%`}
    >
      {level}
      {value !== undefined && value !== null ? (
        <span className="tabular-nums">{Math.round(value)}%</span>
      ) : null}
    </span>
  );
}

/** Edited fields trade their confidence for an honest "Corrected" mark. */
export function CorrectedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-accent",
        className,
      )}
    >
      CORRECTED
    </span>
  );
}

const STATUS_STYLES: Record<RecognitionJobStatus, { className: string; label: string }> = {
  PENDING: { className: "border-border bg-muted text-muted-foreground", label: "Queued" },
  PROCESSING: {
    className: "border-accent/40 bg-accent/10 text-accent",
    label: "Processing",
  },
  COMPLETED: {
    className: "border-profit/40 bg-profit/10 text-profit",
    label: "Completed",
  },
  FAILED: { className: "border-loss/40 bg-loss/10 text-loss", label: "Failed" },
  CANCELLED: {
    className: "border-border bg-muted text-muted-foreground",
    label: "Cancelled",
  },
};

export function JobStatusBadge({
  status,
  className,
}: {
  status: RecognitionJobStatus;
  className?: string;
}) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
        style.className,
        className,
      )}
    >
      {status === "PROCESSING" ? (
        <LoaderCircle className="size-3 animate-spin" aria-hidden />
      ) : status === "COMPLETED" ? (
        <CircleCheck className="size-3" aria-hidden />
      ) : status === "FAILED" ? (
        <CircleAlert className="size-3" aria-hidden />
      ) : (
        <CircleDashed className="size-3" aria-hidden />
      )}
      {style.label}
    </span>
  );
}

/** "History needs review" marker (§30 — Needs Review state). */
export function NeedsReviewBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-warning",
        className,
      )}
    >
      <AlertTriangle className="size-3" aria-hidden />
      Needs review
    </span>
  );
}

export function FieldStateNote({
  state,
  fieldKey,
}: {
  state: RecognitionFieldState;
  fieldKey: RecognitionFieldKey;
}) {
  if (state === "FOUND") return null;
  if (state === "NOT_APPLICABLE") {
    return (
      <p className="text-[11px] text-muted-foreground/70">Not present on this capture.</p>
    );
  }
  if (state === "NOT_FOUND") {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-warning">
        <CircleAlert className="size-3 shrink-0" aria-hidden />
        {FIELD_LABELS[fieldKey]} was not detected — add it manually if the screenshot shows it.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-warning">
      <ShieldAlert className="size-3 shrink-0" aria-hidden />
      Low-confidence read — please verify.
    </p>
  );
}
