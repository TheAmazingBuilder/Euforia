"use client";

import * as React from "react";
import { Camera, GitCompareArrows, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  comparePerformanceSnapshots,
  formatNumber,
  formatPercent,
  formatR,
  formatSignedMoney,
  type AnalyticsFilters,
  type AnalyticsSuiteResponse,
  type PerformanceSnapshot,
} from "@cosmoz/shared";

import {
  useCreatePerformanceSnapshot,
  useDeletePerformanceSnapshot,
  usePerformanceSnapshots,
  useUpdatePerformanceSnapshot,
} from "@/lib/api/queries/snapshots";
import { downloadTextFile, snapshotCsv } from "@/lib/export/builders";
import { apiErrorMessage } from "@/lib/api/client";
import { useI18n } from "@/i18n/i18n-provider";
import { ConfirmDialog } from "@/components/dashboard/customization/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Performance snapshots panel (Dashboard Customization Phase 08 §6–§9) -
 * capture the CURRENT filtered scope as a frozen point-in-time record,
 * inspect it, rename it (metadata only - metrics are immutable by
 * contract), export it, delete it, and compare two snapshots with the pure
 * shared engine (direction-aware deltas, currency-honest warnings).
 *
 * Truthfulness rules: the create dialog echoes the effective scope BEFORE
 * capture (server descriptor + resolved window + currency); a capture
 * succeeds only after the server confirms (mutateAsync awaited); failures
 * never fake success. A capture with an empty dataset is refused
 * server-side semantics preserved here: the capture button is disabled
 * while the suite has no closed trades (nothing honest to freeze).
 */

type Suite = AnalyticsSuiteResponse;

function MetricValue({ snapshot, metric }: { snapshot: PerformanceSnapshot; metric: keyof PerformanceSnapshot["metrics"] }) {
  const value = snapshot.metrics[metric];
  if (value === null) return <span className="text-muted-foreground">-</span>;
  if (metric === "winRate") return <>{formatPercent(value, 1)}</>;
  if (metric === "trades") return <>{value}</>;
  if (metric === "netPnl") {
    return (
      <>{snapshot.currency !== null ? formatSignedMoney(value, snapshot.currency) : formatNumber(value, 2)}</>
    );
  }
  if (metric === "maxDrawdownPct") return <>{`${formatNumber(value, 1)} %`}</>;
  return <>{formatR(value)}</>;
}

export function SnapshotsPanel({ suite, filters }: { suite: Suite; filters: AnalyticsFilters }) {
  const { dict } = useI18n();
  const T = dict.analytics.snapshots;

  const snapshotsQuery = usePerformanceSnapshots();
  const createSnapshot = useCreatePerformanceSnapshot();
  const updateSnapshot = useUpdatePerformanceSnapshot();
  const deleteSnapshot = useDeletePerformanceSnapshot();

  const snapshots = snapshotsQuery.data?.snapshots ?? [];

  // ── Capture dialog state ────────────────────────────────────────────────
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // ── Detail dialog ───────────────────────────────────────────────────────
  const [detail, setDetail] = React.useState<PerformanceSnapshot | null>(null);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameName, setRenameName] = React.useState("");
  const [renameNotes, setRenameNotes] = React.useState("");

  // ── Delete confirm ──────────────────────────────────────────────────────
  const [pendingDelete, setPendingDelete] = React.useState<PerformanceSnapshot | null>(null);

  // ── Compare selection (exactly two snapshots) ───────────────────────────
  const [compareA, setCompareA] = React.useState<string>("");
  const [compareB, setCompareB] = React.useState<string>("");

  const canCapture = suite.meta.closedTrades > 0;

  const onCapture = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    try {
      // The EXACT current filter bag (period + scope) - the server resolves
      // the window and freezes it; the snapshot never shifts later.
      await createSnapshot.mutateAsync({
        name: trimmed,
        notes: notes.trim(),
        filters,
      });
      toast.success(T.createdToast);
      setCaptureOpen(false);
      setName("");
      setNotes("");
    } catch (error) {
      toast.error(apiErrorMessage(error, T.createFailed));
    }
  };

  const onDelete = async () => {
    if (pendingDelete === null) return;
    try {
      await deleteSnapshot.mutateAsync(pendingDelete.id);
      toast.success(T.deletedToast);
      if (detail?.id === pendingDelete.id) setDetail(null);
      if (compareA === pendingDelete.id) setCompareA("");
      if (compareB === pendingDelete.id) setCompareB("");
    } catch (error) {
      toast.error(apiErrorMessage(error, T.deleteFailed));
    } finally {
      setPendingDelete(null);
    }
  };

  const onSaveRename = async () => {
    if (detail === null) return;
    const trimmed = renameName.trim();
    if (trimmed.length === 0) return;
    try {
      const updated = await updateSnapshot.mutateAsync({
        snapshotId: detail.id,
        input: {
          name: trimmed,
          notes: renameNotes.trim(),
        },
      });
      toast.success(T.renamedToast);
      setDetail(updated);
      setRenameOpen(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, T.renameFailed));
    }
  };

  const a = snapshots.find((snapshot) => snapshot.id === compareA) ?? null;
  const b = snapshots.find((snapshot) => snapshot.id === compareB) ?? null;
  const comparison = a !== null && b !== null ? comparePerformanceSnapshots(a, b) : null;

  return (
    <section
      className="rounded-xl border border-border bg-surface p-4"
      data-testid="snapshots-panel"
      aria-label={T.title}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-heading text-sm font-semibold">{T.title}</h3>
          <p className="max-w-2xl text-xs text-muted-foreground">{T.description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent-hover"
          disabled={!canCapture || createSnapshot.isPending}
          onClick={() => setCaptureOpen(true)}
          data-testid="snapshot-create"
        >
          {createSnapshot.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="size-3.5" aria-hidden="true" />
          )}
          {createSnapshot.isPending ? T.creating : T.createBtn}
        </Button>
      </div>

      {/* ── List ─────────────────────────────────────────────────────────── */}
      <div className="mt-4">
        {snapshotsQuery.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground" aria-busy="true">
            <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
            …
          </p>
        ) : snapshotsQuery.isError ? (
          <p className="py-6 text-center text-sm text-loss" role="alert" data-testid="snapshots-error">
            {T.loadFailed}
          </p>
        ) : snapshots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="snapshots-empty">
            {T.empty}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="snapshots-list">
            {snapshots.map((snapshot) => (
              <li
                key={snapshot.id}
                className="rounded-lg border border-border p-3"
                data-testid="snapshot-row"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="truncate text-left text-sm font-semibold hover:underline"
                      onClick={() => {
                        setDetail(snapshot);
                        setRenameName(snapshot.name);
                        setRenameNotes(snapshot.notes);
                      }}
                      data-testid={`snapshot-name-${snapshot.id}`}
                    >
                      {snapshot.name}
                    </button>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {T.capturedAt} {new Date(snapshot.capturedAt).toLocaleString()} · {T.period}{" "}
                      {snapshot.periodFrom} → {snapshot.periodTo} ·{" "}
                      {snapshot.currency ?? T.multiCurrency} · v{snapshot.schemaVersion}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={snapshot.descriptor}>
                      {snapshot.descriptor}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="font-mono text-xs tabular-nums">
                      <MetricValue snapshot={snapshot} metric="netPnl" />
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      <MetricValue snapshot={snapshot} metric="avgR" />
                    </span>
                    <button
                      type="button"
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => setPendingDelete(snapshot)}
                      aria-label={`${T.deleteConfirm}: ${snapshot.name}`}
                      data-testid={`snapshot-delete-${snapshot.id}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Compare ──────────────────────────────────────────────────────── */}
      {snapshots.length >= 2 && (
        <div className="mt-4 rounded-lg border border-border p-3" data-testid="snapshots-compare">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <GitCompareArrows className="size-4 text-accent" aria-hidden="true" />
            {T.compareTitle}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{T.compareHint}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={compareA}
              onChange={(event) => setCompareA(event.target.value)}
              aria-label={`${T.compare} A`}
              data-testid="compare-select-a"
            >
              <option value="">A - {T.compareSelect}</option>
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.name} ({snapshot.capturedAt.slice(0, 10)})
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={compareB}
              onChange={(event) => setCompareB(event.target.value)}
              aria-label={`${T.compare} B`}
              data-testid="compare-select-b"
            >
              <option value="">B - {T.compareSelect}</option>
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.name} ({snapshot.capturedAt.slice(0, 10)})
                </option>
              ))}
            </select>
          </div>

          {comparison !== null && (
            <div className="mt-3" data-testid="compare-result">
              {comparison.warnings.length > 0 && (
                <ul className="mb-2 space-y-1" role="alert">
                  {comparison.warnings.map((warning) => (
                    <li key={warning} className="rounded-md bg-warning/10 px-2 py-1 text-[11px] text-warning">
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1.5 pr-3 font-medium">{T.colMetric}</th>
                      <th className="py-1.5 pr-3 text-right font-medium">{T.colA}</th>
                      <th className="py-1.5 pr-3 text-right font-medium">{T.colB}</th>
                      <th className="py-1.5 pr-3 text-right font-medium">{T.colDelta}</th>
                      <th className="py-1.5 text-right font-medium">{T.colDeltaPct}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.rows.map((row) => {
                      const deltaNum = row.absoluteDiff === null ? null : Number(row.absoluteDiff);
                      const good =
                        deltaNum === null || deltaNum === 0
                          ? null
                          : (deltaNum > 0) === row.higherIsBetter;
                      return (
                        <tr key={row.metric} className="border-b border-border/50 last:border-0">
                          <td className="py-1.5 pr-3">
                            {T.metricNames[row.metric] ?? row.metric}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                            {row.a ?? T.notComparable}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                            {row.b ?? T.notComparable}
                          </td>
                          <td
                            className={cn(
                              "py-1.5 pr-3 text-right font-mono tabular-nums",
                              good === null
                                ? ""
                                : good
                                  ? "text-profit"
                                  : "text-loss",
                            )}
                          >
                            {row.comparable && row.absoluteDiff !== null
                              ? `${deltaNum !== null && deltaNum > 0 ? "+" : ""}${row.absoluteDiff}`
                              : T.notComparable}
                          </td>
                          <td className="py-1.5 text-right font-mono tabular-nums">
                            {row.comparable && row.relativeDiffPct !== null
                              ? `${Number(row.relativeDiffPct) > 0 ? "+" : ""}${row.relativeDiffPct}%`
                              : T.notComparable}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Capture dialog (scope echo BEFORE capture) ───────────────────── */}
      <Dialog open={captureOpen} onOpenChange={setCaptureOpen}>
        <DialogContent className="max-w-md" data-testid="snapshot-capture-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{T.createBtn}</DialogTitle>
            <DialogDescription>{T.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/40 p-2.5 text-[11px]" data-testid="snapshot-scope-echo">
              <p className="font-semibold text-muted-foreground">{T.scopeBeingCaptured}</p>
              <p className="mt-1">{suite.meta.descriptor}</p>
              <p className="mt-0.5 text-muted-foreground">
                {T.period} {suite.meta.resolvedFrom} → {suite.meta.resolvedTo} ·{" "}
                {suite.meta.singleCurrency ? suite.currency : T.multiCurrency}
              </p>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium">{T.name}</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={T.namePlaceholder}
                maxLength={80}
                data-testid="snapshot-name-input"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">{T.notes}</span>
              <Input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={T.notesPlaceholder}
                maxLength={500}
                data-testid="snapshot-notes-input"
              />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCaptureOpen(false)}>
              {T.cancel}
            </Button>
            <Button
              size="sm"
              disabled={name.trim().length === 0 || createSnapshot.isPending}
              onClick={onCapture}
              data-testid="snapshot-capture-confirm"
            >
              {createSnapshot.isPending ? T.creating : T.createBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail dialog (frozen values + metadata edit) ────────────────── */}
      <Dialog open={detail !== null} onOpenChange={(open) => (open ? undefined : setDetail(null))}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-testid="snapshot-detail-dialog">
          {detail !== null && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">{detail.name}</DialogTitle>
                <DialogDescription>
                  {T.capturedAt} {new Date(detail.capturedAt).toLocaleString()} · {T.schemaVersion} v
                  {detail.schemaVersion}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-xs">
                <div className="rounded-lg border border-border bg-muted/40 p-2.5">
                  <p>
                    <span className="text-muted-foreground">{T.period}: </span>
                    {detail.periodFrom} → {detail.periodTo}
                  </p>
                  <p className="mt-0.5">
                    <span className="text-muted-foreground">{T.scope}: </span>
                    {detail.descriptor}
                  </p>
                  <p className="mt-0.5">
                    <span className="text-muted-foreground">{T.currency}: </span>
                    {detail.currency ?? T.multiCurrency}
                  </p>
                  {detail.notes && (
                    <p className="mt-1 italic text-muted-foreground">{detail.notes}</p>
                  )}
                </div>
                <table className="w-full" data-testid="snapshot-metrics-table">
                  <caption className="sr-only">{T.metrics}</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1 font-medium" scope="col">{T.colMetric}</th>
                      <th className="py-1 text-right font-medium" scope="col">{T.metrics}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["netPnl", detail.metrics.netPnl],
                        ["winRate", detail.metrics.winRate],
                        ["profitFactor", detail.metrics.profitFactor],
                        ["trades", detail.metrics.trades],
                        ["avgR", detail.metrics.avgR],
                        ["expectancyR", detail.metrics.expectancyR],
                        ["maxDrawdownR", detail.metrics.maxDrawdownR],
                        ["maxDrawdownPct", detail.metrics.maxDrawdownPct],
                      ] as const
                    ).map(([metric, value]) => (
                      <tr key={metric} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5">{T.metricNames[metric] ?? metric}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {value === null
                            ? "-"
                            : metric === "trades"
                              ? String(value)
                              : metric === "netPnl" && detail.currency !== null
                                ? formatSignedMoney(value, detail.currency)
                                : metric === "winRate"
                                  ? formatPercent(value, 1)
                                  : metric === "maxDrawdownPct"
                                    ? `${formatNumber(value, 1)} %`
                                    : formatR(value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    downloadTextFile(
                      `euforia-snapshot-${detail.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.csv`,
                      snapshotCsv(detail),
                    );
                  }}
                  data-testid="snapshot-export-csv"
                >
                  {T.export}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRenameOpen(true)}
                  data-testid="snapshot-rename-open"
                >
                  {T.rename}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Rename dialog (metadata only) ────────────────────────────────── */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md" data-testid="snapshot-rename-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{T.rename}</DialogTitle>
            <DialogDescription>{T.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium">{T.name}</span>
              <Input
                value={renameName}
                onChange={(event) => setRenameName(event.target.value)}
                maxLength={80}
                data-testid="snapshot-rename-name"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">{T.notes}</span>
              <Input
                value={renameNotes}
                onChange={(event) => setRenameNotes(event.target.value)}
                maxLength={500}
                data-testid="snapshot-rename-notes"
              />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setRenameOpen(false)}>
              {T.cancel}
            </Button>
            <Button
              size="sm"
              disabled={renameName.trim().length === 0 || updateSnapshot.isPending}
              onClick={onSaveRename}
              data-testid="snapshot-rename-save"
            >
              {T.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm (destructive convention) ──────────────────────── */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={T.deleteTitle}
        description={T.deleteDescription}
        confirmLabel={T.deleteConfirm}
        cancelLabel={T.keep}
        destructive
        onConfirm={onDelete}
        onOpenChange={(open) => (open ? undefined : setPendingDelete(null))}
      />
    </section>
  );
}
