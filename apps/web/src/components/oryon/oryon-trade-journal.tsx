"use client";

import * as React from "react";
import { toast } from "sonner";
import { Link2, Loader2, Save, Search, Camera } from "lucide-react";

import type {
  MarketInterval,
  OryonDrawing,
  OryonPanelAnalysis,
  Trade,
} from "@cosmoz/shared";
import { formatSignedMoney } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAddScreenshot, useInstruments, useTrades } from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import type { OryonChartEngine } from "@/lib/charting/oryon-chart-engine";
import { oryonAnalyses } from "@/lib/oryon/journal/analyses";
import { cn } from "@/lib/utils";

/**
 * Oryon ↔ Trade Journal dialogs (Phase 10 - Trade Journal bridge).
 *
 * TWO flows, both sharing ONE trade selector:
 *  - Save Analysis    → a browser-local analysis record (title, notes,
 *    optional trade link, the SAME canonical drawing schema, the panel's
 *    analysis config, the chart's reference time);
 *  - Attach Snapshot  → the chart image captured through the engine's
 *    documented export, attached to a trade via the journal's EXISTING
 *    screenshot mechanism (POST /trades/:id/screenshots), optionally also
 *    saved as a linked analysis.
 *
 * Association discipline (Phase 10 spec §4.2/§4.3/§5.3):
 *  - the trade is selected from the journal's OWN list (GET /trades) - the
 *    journal record stays canonical, nothing is copied;
 *  - a chart/trade instrument MISMATCH is surfaced explicitly and requires
 *    an affirmative confirmation - never a silent cross-instrument link
 *    (the confirmation state lives in the CALLER: it gates the submit);
 *  - success toasts fire only AFTER the persistence layer confirmed.
 *
 * Honesty: analyses persist in THIS BROWSER (the app's documented Oryon
 * persistence scope); the dialogs say so in plain copy. No trade is ever
 * created, edited, or executed by these flows.
 */

const TRADE_ROW_CAP = 50;

/** One selectable journal trade row - the identifying details the backend
 *  actually provides (symbol, direction, date, status, net P&L when closed). */
function TradeRow({
  trade,
  symbol,
  selected,
  onSelect,
}: {
  trade: Trade;
  symbol: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const closed = trade.status === "CLOSED";
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`oryon-trade-option-${trade.id}`}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors",
        selected
          ? "border-accent bg-accent/10"
          : "border-border bg-surface-raised/40 hover:border-accent/50",
      )}
    >
      <span className="font-mono text-xs font-semibold text-foreground">
        {symbol ?? "?"}
      </span>
      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase",
          trade.direction === "BUY" ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss",
        )}
      >
        {trade.direction}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">{trade.tradingDate}</span>
      <span className="text-[11px] text-muted-foreground">{trade.status}</span>
      <span
        className={cn(
          "ml-auto font-mono text-xs tabular-nums",
          !closed ? "text-muted-foreground" : Number(trade.pnlNet) >= 0 ? "text-profit" : "text-loss",
        )}
      >
        {closed ? formatSignedMoney(trade.pnlNet, "USD", { digits: 2 }) : "-"}
      </span>
    </button>
  );
}

/**
 * The shared trade picker: search + status filter + capped list + the
 * explicit mismatch confirmation. The mismatch CONFIRMATION state lives in
 * the caller (it gates the submit) - this component only renders it.
 */
function TradeSelector({
  chartSymbol,
  selected,
  onSelect,
  mismatchConfirmed,
  onMismatchConfirmedChange,
  testPrefix,
}: {
  chartSymbol: string;
  selected: Trade | null;
  onSelect: (trade: Trade | null) => void;
  mismatchConfirmed: boolean;
  onMismatchConfirmedChange: (confirmed: boolean) => void;
  testPrefix: string;
}) {
  const dict = useDict();
  const J = dict.oryon.journal;
  const { data: tradesData } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"ALL" | "OPEN" | "CLOSED">("ALL");

  const symbolOf = React.useCallback(
    (instrumentId: string): string | null =>
      instrumentsData?.instruments.find((instrument) => instrument.id === instrumentId)?.symbol ??
      null,
    [instrumentsData],
  );

  const trades = React.useMemo(() => tradesData?.trades ?? [], [tradesData]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toUpperCase();
    return trades.filter((trade) => {
      if (statusFilter !== "ALL" && trade.status !== statusFilter) return false;
      if (q === "") return true;
      const symbol = symbolOf(trade.instrumentId) ?? "";
      return symbol.includes(q) || trade.id.includes(query.trim());
    });
  }, [trades, query, statusFilter, symbolOf]);

  const selectedSymbol = selected !== null ? symbolOf(selected.instrumentId) : null;
  const mismatch = selected !== null && selectedSymbol !== chartSymbol;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={J.tradeSearchPlaceholder}
            className="h-8 pl-8 text-xs"
            data-testid={`${testPrefix}-search`}
          />
        </div>
        <div className="flex gap-1" role="group" aria-label={J.statusFilter}>
          {(["ALL", "OPEN", "CLOSED"] as const).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(status)}
              data-testid={`${testPrefix}-status-${status.toLowerCase()}`}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] transition-colors",
                statusFilter === status
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto rounded-md border border-border" data-testid={`${testPrefix}-list`}>
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">{J.tradeEmpty}</p>
        ) : (
          <>
            {filtered.slice(0, TRADE_ROW_CAP).map((trade) => (
              <TradeRow
                key={trade.id}
                trade={trade}
                symbol={symbolOf(trade.instrumentId)}
                selected={selected?.id === trade.id}
                onSelect={() => {
                  onMismatchConfirmedChange(false);
                  onSelect(selected?.id === trade.id ? null : trade);
                }}
              />
            ))}
            {filtered.length > TRADE_ROW_CAP ? (
              <p className="border-t border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
                {J.tradeRefine}
              </p>
            ) : null}
          </>
        )}
      </div>

      {selected !== null ? (
        <div className="rounded-md border border-border bg-surface-raised/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{selectedSymbol ?? "?"}</span>{" "}
          <span className={selected.direction === "BUY" ? "text-profit" : "text-loss"}>
            {selected.direction}
          </span>{" "}
          · {selected.tradingDate} · {selected.status}
          {mismatch ? (
            <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-warning" data-testid={`${testPrefix}-mismatch`}>
              <p className="font-medium">{J.mismatchTitle}</p>
              <p className="mt-0.5 text-[11px] leading-snug">
                {J.mismatchBody} <span className="font-mono">{chartSymbol}</span> ↔{" "}
                <span className="font-mono">{selectedSymbol ?? "?"}</span>
              </p>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-foreground">
                <Checkbox
                  checked={mismatchConfirmed}
                  onCheckedChange={(checked) => onMismatchConfirmedChange(checked === true)}
                  data-testid={`${testPrefix}-mismatch-confirm`}
                />
                {J.mismatchConfirm}
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Whether the currently selected trade may be linked - a mismatch needs
 *  the explicit confirmation (enforced HERE, not just in the UI). */
function tradeLinkAllowed(
  chartSymbol: string,
  trade: Trade | null,
  symbolOf: (instrumentId: string) => string | null,
  mismatchConfirmed: boolean,
): boolean {
  if (trade === null) return true;
  if (symbolOf(trade.instrumentId) === chartSymbol) return true;
  return mismatchConfirmed;
}

// ── Save Analysis ─────────────────────────────────────────────────────────────

export function OryonSaveAnalysisDialog({
  open,
  onOpenChange,
  symbol,
  interval,
  chartType,
  analysis,
  drawings,
  referenceTimeSec,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string;
  interval: MarketInterval;
  chartType: "candles" | "line";
  analysis: OryonPanelAnalysis;
  /** The panel's CURRENT annotations for the displayed symbol. */
  drawings: readonly OryonDrawing[];
  /** Open time of the last candle (unix sec) - the chart reference time. */
  referenceTimeSec: number | null;
}) {
  const dict = useDict();
  const J = dict.oryon.journal;
  const { data: instrumentsData } = useInstruments();

  const symbolOf = React.useCallback(
    (instrumentId: string): string | null =>
      instrumentsData?.instruments.find((instrument) => instrument.id === instrumentId)?.symbol ??
      null,
    [instrumentsData],
  );

  const defaultTitle = React.useMemo(() => {
    const date = new Date().toISOString().slice(0, 10);
    return `${symbol} ${interval} - ${date}`;
  }, [symbol, interval]);

  const [title, setTitle] = React.useState(defaultTitle);
  const [notes, setNotes] = React.useState("");
  const [trade, setTrade] = React.useState<Trade | null>(null);
  const [mismatchConfirmed, setMismatchConfirmed] = React.useState(false);
  /** Render-time adjustment: each OPEN re-seeds the draft from the panel. */
  const [seededFor, setSeededFor] = React.useState<string | null>(null);
  if (open && seededFor !== `${symbol}:${interval}`) {
    setSeededFor(`${symbol}:${interval}`);
    setTitle(defaultTitle);
    setNotes("");
    setTrade(null);
    setMismatchConfirmed(false);
  }

  const submit = (): void => {
    if (!tradeLinkAllowed(symbol, trade, symbolOf, mismatchConfirmed)) return;
    const saved = oryonAnalyses.add({
      symbol,
      interval,
      chartType,
      title: title.trim() === "" ? defaultTitle : title.trim(),
      notes: notes.trim() === "" ? null : notes.trim(),
      tradeId: trade?.id ?? null,
      snapshot: null,
      analysis: structuredClone(analysis),
      drawings: drawings.slice(0, 500),
      referenceTimeSec,
    });
    if (saved === null) {
      toast.error(J.saveFailed, { testId: "oryon-analysis-save-fail-toast" });
      return;
    }
    toast.success(J.savedToast, {
      description: trade !== null ? `${J.linkedTo} ${symbolOf(trade.instrumentId) ?? trade.id}` : undefined,
      testId: "oryon-analysis-save-toast",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="oryon-save-analysis-dialog"
        className="max-h-[85dvh] max-w-lg gap-4 overflow-y-auto"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{J.saveTitle}</DialogTitle>
          <DialogDescription>{J.saveBody}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="oryon-analysis-title" className="text-xs text-muted-foreground">
              {J.titleLabel}
            </Label>
            <Input
              id="oryon-analysis-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              data-testid="oryon-analysis-title"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="oryon-analysis-notes" className="text-xs text-muted-foreground">
              {J.notesLabel}
            </Label>
            <Textarea
              id="oryon-analysis-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={J.notesPlaceholder}
              className="min-h-20"
              maxLength={4000}
              data-testid="oryon-analysis-notes"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link2 className="size-3.5" aria-hidden />
              {J.tradeLinkLabel}
            </Label>
            <TradeSelector
              chartSymbol={symbol}
              selected={trade}
              onSelect={setTrade}
              mismatchConfirmed={mismatchConfirmed}
              onMismatchConfirmedChange={setMismatchConfirmed}
              testPrefix="oryon-analysis-trade"
            />
          </div>

          <p className="text-[11px] text-muted-foreground">{J.localNote}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {dict.common.cancel}
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={!tradeLinkAllowed(symbol, trade, symbolOf, mismatchConfirmed)}
            data-testid="oryon-analysis-save"
          >
            <Save className="size-3.5" aria-hidden />
            {J.saveSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Attach Snapshot ───────────────────────────────────────────────────────────

export function OryonSnapshotDialog({
  open,
  onOpenChange,
  engineRef,
  symbol,
  interval,
  chartType,
  analysis,
  drawings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engineRef: React.RefObject<OryonChartEngine | null>;
  symbol: string;
  interval: MarketInterval;
  chartType: "candles" | "line";
  /** The panel's analysis config - stored with the optional linked analysis. */
  analysis: OryonPanelAnalysis;
  /** The panel's CURRENT annotations for the displayed symbol. */
  drawings: readonly OryonDrawing[];
}) {
  const dict = useDict();
  const J = dict.oryon.journal;
  const { data: instrumentsData } = useInstruments();
  const addScreenshot = useAddScreenshot();

  const symbolOf = React.useCallback(
    (instrumentId: string): string | null =>
      instrumentsData?.instruments.find((instrument) => instrument.id === instrumentId)?.symbol ??
      null,
    [instrumentsData],
  );

  /** The capture happens ONCE per mount (the parent mounts this dialog per
   *  open) - in an EFFECT: engine refs are never read during render, and
   *  the preview is exactly what gets attached, never re-grabbed. */
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [trade, setTrade] = React.useState<Trade | null>(null);
  const [mismatchConfirmed, setMismatchConfirmed] = React.useState(false);
  const [alsoAnalysis, setAlsoAnalysis] = React.useState(true);

  React.useEffect(() => {
    setDataUrl(engineRef.current?.captureSnapshot() ?? null);
    setTrade(null);
    setMismatchConfirmed(false);
    setAlsoAnalysis(true);
    // Mount-only: the dialog instance exists for ONE open - the capture
    // must not re-run while the user edits the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSymbol = trade !== null ? symbolOf(trade.instrumentId) : null;
  const canAttach =
    dataUrl !== null &&
    trade !== null &&
    tradeLinkAllowed(symbol, trade, symbolOf, mismatchConfirmed) &&
    !addScreenshot.isPending;

  const attach = (): void => {
    if (!canAttach || dataUrl === null || trade === null) return;
    const capturedAt = Date.now();
    const caption = `Oryon ${symbol} ${interval} · ${new Date(capturedAt)
      .toISOString()
      .slice(0, 16)
      .replace("T", " ")} UTC`;
    addScreenshot.mutate(
      { tradeId: trade.id, input: { kind: "CHART", dataUrl, caption } },
      {
        onSuccess: (screenshot) => {
          // The image is CONFIRMED stored (journal response) - only now may
          // a linked analysis reference it. The analysis also embeds the
          // chart reference time (lastCandleTime), distinct from capture.
          if (alsoAnalysis) {
            oryonAnalyses.add({
              symbol,
              interval,
              chartType,
              title: `${symbol} ${interval} - ${new Date(capturedAt).toISOString().slice(0, 10)}`,
              notes: null,
              tradeId: trade.id,
              snapshot: { tradeId: trade.id, screenshotId: screenshot.id, capturedAt },
              analysis: structuredClone(analysis),
              drawings: drawings.slice(0, 500),
              referenceTimeSec: engineRef.current?.lastCandleTime ?? null,
            });
          }
          toast.success(J.snapshotAttachedToast, {
            description: `${symbol} → ${selectedSymbol ?? ""}`,
            testId: "oryon-snapshot-attach-toast",
          });
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error, J.snapshotAttachFailed), {
            testId: "oryon-snapshot-attach-fail-toast",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="oryon-snapshot-dialog"
        className="max-h-[85dvh] max-w-lg gap-4 overflow-y-auto"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{J.snapshotTitle}</DialogTitle>
          <DialogDescription>{J.snapshotBody}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-md border border-border bg-background">
            {dataUrl !== null ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dataUrl}
                alt={J.snapshotAlt}
                className="max-h-56 w-full object-contain"
                data-testid="oryon-snapshot-preview"
              />
            ) : (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground" data-testid="oryon-snapshot-unavailable">
                {J.snapshotUnavailable}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link2 className="size-3.5" aria-hidden />
              {J.snapshotTradeLabel}
            </Label>
            <TradeSelector
              chartSymbol={symbol}
              selected={trade}
              onSelect={setTrade}
              mismatchConfirmed={mismatchConfirmed}
              onMismatchConfirmedChange={setMismatchConfirmed}
              testPrefix="oryon-snapshot-trade"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <Checkbox
              checked={alsoAnalysis}
              onCheckedChange={(checked) => setAlsoAnalysis(checked === true)}
              data-testid="oryon-snapshot-also-analysis"
            />
            {J.alsoAnalysis}
          </label>

          <p className="text-[11px] text-muted-foreground">{J.snapshotNote}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {dict.common.cancel}
          </Button>
          <Button size="sm" onClick={attach} disabled={!canAttach} data-testid="oryon-snapshot-attach">
            {addScreenshot.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Camera className="size-3.5" aria-hidden />
            )}
            {J.snapshotAttach}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
