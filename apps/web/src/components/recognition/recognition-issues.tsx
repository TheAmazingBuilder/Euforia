"use client";

import * as React from "react";
import { ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OcrIssue, OcrQualityScore, OcrTimelineEntry } from "@cosmoz/shared";

import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * V2 §16 — the structured issues panel. Every code renders its documented
 * explanation (static dict strings — no free-text from the engine); a field
 * scoping is shown when the issue carries one. Clicking an issue calls back
 * so the review UI can highlight the offending field / region (V2 §55).
 */
export function RecognitionIssues({
  issues,
  dict,
  onSelectField,
  className,
}: {
  issues: OcrIssue[];
  dict: RecognitionDict;
  onSelectField?: (field: string) => void;
  className?: string;
}) {
  if (issues.length === 0) {
    return (
      <p
        className={cn(
          "flex items-center gap-2 border-b border-border/60 pb-2 text-xs text-muted-foreground",
          className,
        )}
        data-testid="recognition-issues-empty"
      >
        <ListChecks className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        {dict.issues.empty}
      </p>
    );
  }
  return (
    <div className={cn("flex flex-col", className)} data-testid="recognition-issues">
      <p className="ledger-label border-b border-border pb-1.5">{dict.issues.title}</p>
      <ul className="flex flex-col">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.field ?? "any"}-${index}`} className="border-b border-border/40 py-1.5 last:border-b-0">
            <button
              type="button"
              className={cn(
                "flex w-full items-start gap-2 text-left text-xs",
                issue.field && onSelectField && "cursor-pointer hover:text-foreground",
              )}
              onClick={() => issue.field && onSelectField?.(issue.field)}
              data-testid={`recognition-issue-${issue.code}`}
            >
              <span className="stamp stamp-warn shrink-0 !text-[9px]">{issue.code.replace(/_/g, " ")}</span>
              <span className="flex flex-col gap-0.5">
                <span>{dict.issues[issue.code]}</span>
                {issue.detail ? (
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {issue.detail.length <= 40 ? issue.detail : `${issue.detail.slice(0, 40)}…`}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * V2 §15 — the deterministic quality score with its EXPLAINABLE components.
 * The score is a stat, the components the ledger under it.
 */
export function QualityScore({
  qualityScore,
  dict,
}: {
  qualityScore: OcrQualityScore | null;
  dict: RecognitionDict;
}) {
  if (!qualityScore) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="recognition-quality-empty">
        {dict.quality.none}
      </p>
    );
  }
  const components: Array<[keyof OcrQualityScore["components"], string]> = [
    ["fieldConfidence", dict.quality.fieldConfidence],
    ["completeness", dict.quality.completeness],
    ["validation", dict.quality.validation],
    ["consistency", dict.quality.consistency],
  ];
  return (
    <div className="flex flex-col gap-2" data-testid="recognition-quality">
      <div className="flex items-baseline justify-between gap-3">
        <p className="ledger-label">{dict.quality.label}</p>
        <p className="font-mono text-2xl font-semibold tabular-nums">
          {Math.round(qualityScore.score * 100)}
          <span className="text-sm text-muted-foreground">%</span>
        </p>
      </div>
      <dl className="flex flex-col">
        {components.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-3 border-b border-border/40 py-1 last:border-b-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-mono text-xs tabular-nums">
              {Math.round(qualityScore.components[key] * 100)}%
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * V2 §23 — the derived chronology. Recognized wall-clock entries keep their
 * canonical form (no invented timezone, §16); lifecycle entries are instants.
 */
export function RecognitionTimeline({
  timeline,
  dict,
}: {
  timeline: OcrTimelineEntry[];
  dict: RecognitionDict;
}) {
  if (timeline.length === 0) {
    return <p className="text-xs text-muted-foreground">{dict.timeline.empty}</p>;
  }
  return (
    <div className="flex flex-col" data-testid="recognition-timeline">
      <p className="ledger-label border-b border-border pb-1.5">{dict.timeline.title}</p>
      <ol className="flex flex-col">
        {timeline.map((entry, index) => (
          <li key={`${entry.kind}-${index}`} className="flex items-baseline gap-3 border-b border-border/40 py-1.5 last:border-b-0">
            <span
              className={cn(
                "stamp shrink-0 !text-[9px]",
                entry.kind === "CONFIRMED" ? "stamp-win" : entry.kind === "CLOSE_TIME" ? "stamp-ink" : "stamp-accent",
              )}
            >
              {dict.timeline[entry.kind]}
            </span>
            <span className="font-mono text-xs tabular-nums">{entry.at}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
