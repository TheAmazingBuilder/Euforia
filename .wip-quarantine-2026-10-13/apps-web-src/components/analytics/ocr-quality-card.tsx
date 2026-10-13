"use client";

import * as React from "react";

import Link from "next/link";
import { ScanText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useRecognitionAnalytics } from "@/lib/api/queries";
import { FIELD_LABELS, type RecognitionFieldKey } from "@/lib/recognition/contract";

/**
 * OCR Quality (recognition V2 analytics) — the import-funnel and engine
 * accuracy card for the Analytics quality tab. Aggregates the recognition
 * event ledger (§53 names): uploads → analyzed → imported, the per-field
 * correction rate (how often the engine misreads a field for THIS user),
 * duplicate warnings and processing performance. Renders only when the
 * user actually used the recognition module — an empty funnel is noise.
 */
export function OcrQualityCard() {
  const analyticsQuery = useRecognitionAnalytics(30);
  const data = analyticsQuery.data;

  if (analyticsQuery.isLoading) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  if (data === undefined || (data.funnel.jobs === 0 && data.funnel.uploads === 0)) {
    return null;
  }

  const completedRate =
    data.funnel.jobs > 0 ? Math.round((data.funnel.completed / data.funnel.jobs) * 100) : 0;
  const confirmRate =
    data.funnel.completed > 0 ? Math.round((data.funnel.confirmed / data.funnel.completed) * 100) : 0;
  const overallCorrectionRate =
    data.corrections.confirmedFields > 0
      ? Math.round((data.corrections.correctedFields / data.corrections.confirmedFields) * 100)
      : 0;
  const topCorrected = [...data.corrections.byField]
    .filter((entry) => entry.corrected > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 4);

  return (
    <Card className="border-accent/20" data-testid="analytics-ocr-quality">
      <CardContent className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 ledger-label">
            <ScanText className="size-3.5 text-accent" aria-hidden />
            OCR import quality — last 30 days
          </p>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
            <Link href="/recognition">Open Import &amp; Recognition</Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-testid="ocr-quality-funnel">
          <FunnelCell value={data.funnel.uploads} label="Uploads" />
          <FunnelCell value={data.funnel.completed} label="Analyzed" suffix={`${completedRate}% of jobs`} />
          <FunnelCell
            value={data.funnel.confirmedTrades}
            label="Trades imported"
            suffix={data.funnel.completed > 0 ? `${confirmRate}% confirmed` : undefined}
          />
          <FunnelCell
            value={data.duplicates.warnings}
            label="Duplicate warnings"
            tone={data.duplicates.warnings > 0 ? "warning" : "default"}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Fields the engine misreads most</p>
            {topCorrected.length === 0 ? (
              <p className="text-xs text-muted-foreground" data-testid="ocr-quality-no-corrections">
                No corrections recorded — every recognized value was imported as read.
              </p>
            ) : (
              <ul className="space-y-1" data-testid="ocr-quality-corrections">
                {topCorrected.map((entry) => (
                  <li key={entry.field} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{FIELD_LABELS[entry.field as RecognitionFieldKey] ?? entry.field}</span>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-warning"
                          style={{ width: `${Math.max(4, Math.round(entry.rate * 100))}%` }}
                        />
                      </span>
                      <span className="w-9 text-right font-mono tabular-nums">
                        {Math.round(entry.rate * 100)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Pipeline performance</p>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Avg processing time</span>
                <span className="font-mono tabular-nums">
                  {data.performance.avgProcessingMs !== null
                    ? `${(data.performance.avgProcessingMs / 1000).toFixed(1)} s`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Avg recognition confidence</span>
                <span className="font-mono tabular-nums">
                  {data.performance.avgOverallConfidence !== null
                    ? `${data.performance.avgOverallConfidence}%`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Field correction rate</span>
                <span className="font-mono tabular-nums">{overallCorrectionRate}%</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Failed recognitions</span>
                <span className="font-mono tabular-nums">{data.funnel.failed}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelCell({
  value,
  label,
  suffix,
  tone = "default",
}: {
  value: number;
  label: string;
  suffix?: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <p
        className={cn(
          "font-mono text-lg font-semibold tabular-nums",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      {suffix !== undefined ? (
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">{suffix}</p>
      ) : null}
    </div>
  );
}
