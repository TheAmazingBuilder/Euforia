"use client";

import * as React from "react";
import Link from "next/link";
import type { AnalyticsExtendedResponse, BehaviorPattern } from "@cosmoz/shared";
import { formatNumber } from "@cosmoz/shared";
import {
  ArrowUpRight,
  BookOpen,
  NotebookText,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MethodNote } from "@/components/analytics/metric-card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnalyticsDict } from "@/i18n/dictionaries/en/analytics";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Behavioral Analytics tab (MASTER PROMPT §12–§25, §47–§49) — the engine's
 * MEASURED patterns rendered as evidence-first cards. Every visible string
 * that describes a pattern (label, headline, evidence, comparison, timeline
 * messages, score details) is ENGINE-SERVED copy (API data); this component
 * renders it verbatim and never composes a verdict of its own (§35: data-
 * derived behavioral patterns, not psychological diagnoses).
 */

type Extended = AnalyticsExtendedResponse;
type Pattern = BehaviorPattern;

const severityChip: Record<string, string> = {
  HIGH: "bg-loss/10 text-loss border-loss/30",
  MEDIUM: "bg-warning/10 text-warning border-warning/30",
  LOW: "bg-muted text-muted-foreground border-border",
  INFO: "bg-accent/10 text-accent border-accent/30",
};

const severityDot: Record<string, string> = {
  HIGH: "bg-loss",
  MEDIUM: "bg-warning",
  LOW: "bg-muted-foreground",
  INFO: "bg-accent",
};

function SeverityChip({ pattern }: { pattern: Pattern }) {
  const { dict } = useI18n();
  const B: AnalyticsDict["behavioral"] = dict.analytics.behavioral;
  return (
    <span
      data-testid="behavior-pattern-severity"
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        severityChip[pattern.severity],
      )}
    >
      {B.severity[pattern.severity]}
    </span>
  );
}

function ConfidenceChip({ pattern }: { pattern: Pattern }) {
  const { dict } = useI18n();
  const B: AnalyticsDict["behavioral"] = dict.analytics.behavioral;
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {B.confidence[pattern.confidence]}
    </span>
  );
}

/** Reusable evidence rows (§30 — value next to baseline). */
function EvidenceRows({
  rows,
  testid,
}: {
  rows: { label: string; value: string; baseline: string | null }[];
  testid?: string;
}) {
  return (
    <div className="space-y-1.5" data-testid={testid}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3 text-xs">
          <span className="min-w-0 text-muted-foreground">{row.label}</span>
          <span className="flex shrink-0 items-baseline gap-1.5 font-mono tabular-nums">
            {row.baseline !== null && <span className="text-[10px] text-muted-foreground/70">({row.baseline})</span>}
            <span className="font-medium">{row.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** The pattern details drawer (§47) — evidence, comparison, affected trades. */
function PatternDetailsDrawer({
  pattern,
  onClose,
}: {
  pattern: Pattern | null;
  onClose: () => void;
}) {
  const { dict } = useI18n();
  const B: AnalyticsDict["behavioral"] = dict.analytics.behavioral;
  return (
    <Sheet open={pattern !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-4 overflow-y-auto p-5 sm:max-w-md"
        data-testid="behavior-pattern-drawer"
      >
        {pattern !== null && (
          <>
            <SheetHeader className="space-y-2 p-0 text-left">
              <div className="flex flex-wrap items-center gap-1.5">
                <SeverityChip pattern={pattern} />
                <ConfidenceChip pattern={pattern} />
              </div>
              <SheetTitle className="font-heading text-lg font-semibold">{pattern.label}</SheetTitle>
              <SheetDescription className="text-xs leading-relaxed">{pattern.headline}</SheetDescription>
            </SheetHeader>

            <div className="space-y-1.5 text-xs leading-relaxed text-foreground/90">
              <p>{pattern.explanation}</p>
            </div>

            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {B.evidenceTitle}
              </h3>
              <div className="rounded-lg border border-border bg-surface-raised p-3">
                <EvidenceRows rows={pattern.evidence} testid="behavior-drawer-evidence" />
              </div>
            </section>

            {pattern.comparison !== null && (
              <section className="space-y-2" data-testid="behavior-drawer-comparison">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {B.beforeAfterTitle}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[pattern.comparison.before, pattern.comparison.after].map((side) => (
                    <div key={side.label} className="rounded-lg border border-border bg-surface-raised p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {side.label}
                      </p>
                      <EvidenceRows rows={side.rows} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {pattern.impact !== null && (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {B.impactTitle}
                </h3>
                <p className="text-xs leading-relaxed">{pattern.impact}</p>
              </section>
            )}

            {pattern.recommendation !== null && (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {B.recommendationTitle}
                </h3>
                <p className="text-xs leading-relaxed">{pattern.recommendation}</p>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {B.affectedTitle} · {pattern.affectedTrades}
              </h3>
              {pattern.affectedTradeRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">{B.affectedEmpty}</p>
              ) : (
                <div className="space-y-1.5" data-testid="behavior-drawer-trades">
                  {pattern.affectedTradeRows.map((trade) => (
                    <Link
                      key={trade.id}
                      href={`/trades?trade=${trade.id}`}
                      aria-label={`${B.viewTradeAria} ${trade.symbol} ${trade.date}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs transition-colors hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="font-mono font-medium">{trade.symbol}</span>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {trade.date}
                        </span>
                        <span className="truncate text-[10px] text-muted-foreground">{trade.flag}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {trade.r !== null && (
                          <span
                            className={cn(
                              "font-mono tabular-nums",
                              Number(trade.r) >= 0 ? "text-profit" : "text-loss",
                            )}
                          >
                            {Number(trade.r) >= 0 ? "+" : ""}
                            {Number(trade.r).toFixed(2)}R
                          </span>
                        )}
                        <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Coming-soon actions (§ drawer enrichment) — declared, never fake-wired. */}
            <section className="space-y-2" data-testid="behavior-drawer-actions">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {B.actionsTitle}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled
                  data-testid="behavior-drawer-action-playbook"
                  title={B.actionPlaybookHint}
                  aria-disabled="true"
                  className="flex flex-col items-start gap-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-left outline-none disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <BookOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{B.viewPlaybookRule}</span>
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    {B.comingSoon}
                  </span>
                </button>
                <button
                  type="button"
                  disabled
                  data-testid="behavior-drawer-action-nofy"
                  title={B.actionNofyHint}
                  aria-disabled="true"
                  className="flex flex-col items-start gap-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-left outline-none disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <NotebookText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{B.saveToNofy}</span>
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    {B.comingSoon}
                  </span>
                </button>
              </div>
            </section>

            <MethodNote>{dict.analytics.behavioral.contextNote}</MethodNote>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** One detected pattern card (§15/§36 — severity, evidence, View details). */
function PatternCard({ pattern, onOpen }: { pattern: Pattern; onOpen: () => void }) {
  const { dict } = useI18n();
  const B: AnalyticsDict["behavioral"] = dict.analytics.behavioral;
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-accent/40"
      data-testid="behavior-pattern-card"
      data-pattern-type={pattern.type}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityChip pattern={pattern} />
          <ConfidenceChip pattern={pattern} />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {pattern.occurrences} {B.occurrencesSuffix}
        </span>
      </div>

      <div className="space-y-1">
        <h3 className="font-heading text-sm font-semibold leading-snug">{pattern.label}</h3>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{pattern.headline}</p>
      </div>

      {pattern.evidence.length > 0 && (
        <EvidenceRows rows={pattern.evidence.slice(0, 2)} />
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-muted-foreground">
          {B.detectedIn} {pattern.affectedTrades} {B.tradesSuffix}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2.5 py-1 text-[11px] font-medium outline-none transition-colors hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {B.viewDetails}
        </button>
      </div>
    </div>
  );
}

/**
 * Detection-threshold adjustments (engine-owned, request-scoped). The selects
 * only REQUEST values — the engine clamps, applies and declares back what it
 * applied (`data.thresholds`), which is what the "Applied" readout shows.
 */
const RR_FLOOR_OPTIONS = ["1.5", "2", "2.5", "3"] as const;
const OT_FACTOR_OPTIONS = ["1.5", "2", "2.5", "3"] as const;

function DetectionThresholdBar({
  applied,
  thresholds,
  onChange,
}: {
  applied: Extended["thresholds"];
  thresholds: { rrFloor?: number; otFactor?: number };
  onChange: (patch: { rrFloor?: number; otFactor?: number }) => void;
}) {
  const { dict } = useI18n();
  const B: AnalyticsDict["behavioral"] = dict.analytics.behavioral;
  const rrValue = thresholds.rrFloor !== undefined ? String(thresholds.rrFloor) : "2";
  const otValue = thresholds.otFactor !== undefined ? String(thresholds.otFactor) : "2";
  const dirty = thresholds.rrFloor !== undefined || thresholds.otFactor !== undefined;

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-raised px-3.5 py-2.5"
      data-testid="behavior-thresholds"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
        {B.thresholdsLabel}
      </span>

      <span className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{B.rrFloorLabel}</span>
        <Select
          value={rrValue}
          onValueChange={(value) => onChange({ ...thresholds, rrFloor: value === "2" ? undefined : Number(value) })}
        >
          <SelectTrigger
            className="h-7 w-[76px] text-xs"
            aria-label={`${B.rrFloorLabel} — ${B.thresholdsAria}`}
            data-testid="behavior-threshold-rr"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RR_FLOOR_OPTIONS.map((option) => (
              <SelectItem key={option} value={option} className="text-xs">
                {Number(option).toFixed(2).replace(/\.?0+$/, "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>

      <span className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{B.otFactorLabel}</span>
        <Select
          value={otValue}
          onValueChange={(value) => onChange({ ...thresholds, otFactor: value === "2" ? undefined : Number(value) })}
        >
          <SelectTrigger
            className="h-7 w-[104px] text-xs"
            aria-label={`${B.otFactorLabel} — ${B.thresholdsAria}`}
            data-testid="behavior-threshold-ot"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OT_FACTOR_OPTIONS.map((option) => (
              <SelectItem key={option} value={option} className="text-xs">
                ≥{Number(option)}× median
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>

      <span className="font-mono text-[10px] tabular-nums text-muted-foreground/80" data-testid="behavior-thresholds-applied">
        {B.thresholdsAppliedLabel} · RR {applied.rrFloor} · ≥{applied.overtradingFactor}× median ({B.thresholdsMinPerDay} {applied.overtradingMinPerDay})
      </span>

      {dirty && (
        <button
          type="button"
          onClick={() => onChange({ rrFloor: undefined, otFactor: undefined })}
          data-testid="behavior-threshold-reset"
          className="ml-auto rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium outline-none transition-colors hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {B.thresholdsReset}
        </button>
      )}
    </div>
  );
}

export function BehaviorTab({
  data,
  thresholds = {},
  onThresholdsChange,
}: {
  data: Extended;
  thresholds?: { rrFloor?: number; otFactor?: number };
  onThresholdsChange?: (patch: { rrFloor?: number; otFactor?: number }) => void;
}) {
  const { dict } = useI18n();
  const B: AnalyticsDict["behavioral"] = dict.analytics.behavioral;
  const behavioral = data.behavioral;
  const [drawerPattern, setDrawerPattern] = React.useState<Pattern | null>(null);

  return (
    <div className="space-y-4" data-testid="analytics-tab-behavior">
      {/* Contextual messaging (§12 — concise, not a large disclaimer). */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised px-3.5 py-2.5">
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{B.contextNote}</p>
        <p className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {B.periodLabel} · {behavioral.period.from} → {behavioral.period.to}
        </p>
      </div>

      {/* Detection thresholds — adjustable, engine-owned (recompute via URL). */}
      {onThresholdsChange !== undefined && (
        <DetectionThresholdBar applied={data.thresholds} thresholds={thresholds} onChange={onThresholdsChange} />
      )}

      {/* Trading Behavior score (§14/§25/§56 — transparent, server-built). */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3" data-testid="behavior-score">
        <Card className="bg-surface">
          <CardContent className="flex flex-col justify-center gap-1 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {B.scoreTitle}
            </p>
            <p className="font-mono text-4xl font-semibold tabular-nums tracking-tight">
              {behavioral.score.overall}
              <span className="ml-1 text-base font-medium text-muted-foreground">{B.scoreOutOf}</span>
            </p>
          </CardContent>
        </Card>
        <Card className="bg-surface lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">{B.scoreDimensions}</CardTitle>
            <CardDescription className="text-xs">{B.scoreHowDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {behavioral.score.dimensions.map((dimension) => (
              <div key={dimension.key} className="flex items-center gap-3">
                <span className="w-36 shrink-0 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {dimension.key.replaceAll("_", " ")}
                </span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      dimension.score >= 70 ? "bg-profit" : dimension.score >= 40 ? "bg-warning" : "bg-loss",
                    )}
                    style={{ width: `${dimension.score}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-xs font-semibold tabular-nums">
                  {dimension.score}
                </span>
              </div>
            ))}
            <details className="group">
              <summary className="cursor-pointer text-[11px] font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {B.scoreHowTitle}
              </summary>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {behavioral.score.methodology}
              </p>
            </details>
          </CardContent>
        </Card>
      </div>

      {/* Insufficient data (§38) — honest, no fabricated conclusions. */}
      {behavioral.insufficientData !== null ? (
        <Card className="bg-surface" data-testid="behavior-insufficient">
          <CardContent className="space-y-1.5 py-8 text-center">
            <p className="font-heading text-sm font-semibold">{B.insufficientTitle}</p>
            <p className="text-xs text-muted-foreground">
              {B.insufficientDescA}
              {behavioral.insufficientData.available}
              {B.insufficientDescB}
              {behavioral.insufficientData.required}
              {B.insufficientDescC}
            </p>
            <p className="text-xs italic text-muted-foreground/80">{B.insufficientContinue}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Detected patterns (§15) — severity-ordered by the engine. */}
          <section className="space-y-3">
            <div>
              <h2 className="font-heading text-base font-semibold">{B.patternsTitle}</h2>
              <p className="text-xs text-muted-foreground">{B.patternsDesc}</p>
            </div>
            {behavioral.patterns.length === 0 ? (
              <Card className="bg-surface" data-testid="behavior-patterns-empty">
                <CardContent className="space-y-1.5 py-8 text-center">
                  <ShieldCheck className="mx-auto size-6 text-profit" aria-hidden="true" />
                  <p className="font-heading text-sm font-semibold">{B.patternsEmptyTitle}</p>
                  <p className="text-xs text-muted-foreground">{B.patternsEmptyDesc}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
                {behavioral.patterns.map((pattern) => (
                  <PatternCard key={pattern.type} pattern={pattern} onOpen={() => setDrawerPattern(pattern)} />
                ))}
              </div>
            )}
          </section>

          {/* Compliance + Timeline — two-column (§53 layout). */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <Card className="bg-surface" data-testid="behavior-compliance">
              <CardHeader>
                <CardTitle className="font-heading text-base font-semibold">{B.complianceTitle}</CardTitle>
                <CardDescription className="text-xs">{B.complianceDesc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {behavioral.compliance.rows.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">{B.complianceEmpty}</p>
                ) : (
                  <>
                    {behavioral.compliance.rows.map((row) => (
                      <div
                        key={row.ruleId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-xs">
                          {row.violations === 0 ? (
                            <ShieldCheck className="size-3.5 shrink-0 text-profit" aria-hidden="true" />
                          ) : (
                            <ShieldAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
                          )}
                          <span className="truncate font-medium">{row.title}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                          <span className={row.violations === 0 ? "text-profit" : "text-warning"}>
                            {row.violations === 0
                              ? B.complianceClean
                              : `${row.violations} ${B.complianceViolations.toLowerCase()}`}
                          </span>
                          <span className="text-muted-foreground">
                            {row.adherencePct === null ? "—" : `${formatNumber(row.adherencePct, 0)}%`}
                          </span>
                        </span>
                      </div>
                    ))}
                    {behavioral.compliance.overallAdherencePct !== null && (
                      <div className="flex items-center justify-between gap-3 border-t border-border pt-2 text-xs">
                        <span className="font-medium text-muted-foreground">{B.complianceOverall}</span>
                        <span className="font-mono text-sm font-semibold tabular-nums">
                          {formatNumber(behavioral.compliance.overallAdherencePct, 0)}%
                        </span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-surface" data-testid="behavior-timeline">
              <CardHeader>
                <CardTitle className="font-heading text-base font-semibold">{B.timelineTitle}</CardTitle>
                <CardDescription className="text-xs">{B.timelineDesc}</CardDescription>
              </CardHeader>
              <CardContent>
                {behavioral.timeline.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">{B.timelineEmpty}</p>
                ) : (
                  <ol className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
                    {behavioral.timeline.map((event, index) => (
                      <li key={`${event.at}-${event.kind}-${index}`} className="flex items-start gap-2.5 text-xs">
                        <span
                          className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", severityDot[event.severity])}
                          aria-hidden="true"
                        />
                        <span className="w-10 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {event.at.slice(11, 16)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                            {event.kind.replaceAll("_", " ")}
                            {event.symbol !== null ? ` · ${event.symbol}` : ""}
                          </span>
                          <span className="block leading-snug">{event.message}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <PatternDetailsDrawer pattern={drawerPattern} onClose={() => setDrawerPattern(null)} />
    </div>
  );
}
