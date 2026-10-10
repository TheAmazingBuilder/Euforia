"use client";

import * as React from "react";

import { Loader2, RefreshCcw, TriangleAlert } from "lucide-react";

import type { Instrument, MarketInterval } from "@cosmoz/shared";

import { useCandles } from "@/lib/realtime/market";
import { useDict } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OryonPriceChart } from "@/components/oryon/oryon-price-chart";
import type { OryonChartType } from "@/lib/charting/oryon-chart-engine";

/**
 * Oryon chart panel — owns the HISTORY query state and renders the honest
 * state machine around the chart: waiting for an instrument, loading
 * history, load failure with retry, empty history, then the live chart.
 * Every state preserves the surrounding workspace (the shell stays put).
 */
export function OryonChartPanel({
  instrument,
  interval,
  chartType,
  magnet,
  onEngineReady,
}: {
  instrument: Instrument | null;
  interval: MarketInterval;
  chartType: OryonChartType;
  magnet: boolean;
  onEngineReady?: (goToLatest: () => void) => void;
}) {
  const dict = useDict();
  const S = dict.oryon.states;

  const symbol = instrument?.symbol ?? "";
  const history = useCandles(symbol, interval);

  // Waiting for the instrument catalog / default selection.
  if (instrument === null) {
    return (
      <CenterState
        testid="oryon-state-waiting"
        spinner
        message={history.isFetched ? S.pickInstrument : S.loadingInstruments}
      />
    );
  }

  // History loading (first fetch for this symbol+interval). During the
  // keepPreviousData window (instrument/timeframe switch) the chart STAYS
  // mounted showing the previous window: the legend keeps labeling the data
  // ACTUALLY displayed (dataSymbol), live ticks are paused, and an explicit
  // chip announces the incoming load — nothing is ever mislabeled.
  if (history.isPending) {
    return (
      <CenterState testid="oryon-state-loading" spinner message={S.loadingHistory}>
        <div className="absolute inset-0 p-4">
          <Skeleton className="h-full w-full rounded-xl" />
        </div>
      </CenterState>
    );
  }

  // History failed — honest error + retry, workspace stays intact.
  if (history.isError) {
    return (
      <CenterState
        testid="oryon-state-error"
        icon={<TriangleAlert className="size-5 text-warning" aria-hidden />}
        message={S.historyError}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="oryon-history-retry"
          onClick={() => void history.refetch()}
        >
          <RefreshCcw className="size-3.5" aria-hidden />
          {S.retry}
        </Button>
      </CenterState>
    );
  }

  const candles = history.data?.candles ?? [];
  /** The symbol the DISPLAYED data actually belongs to (honest legend). */
  const dataSymbol = history.data?.symbol ?? symbol;

  // Service answered with no history for this instrument + timeframe.
  if (candles.length === 0) {
    return (
      <CenterState testid="oryon-state-empty" message={S.emptyHistory} />
    );
  }

  const source = history.data?.source ?? "sim";

  return (
    <div className="relative h-full w-full">
      {history.isPlaceholderData ? (
        <div
          data-testid="oryon-state-updating"
          className="absolute inset-x-0 top-0 z-20 flex justify-center pt-2"
        >
          <span className="rounded-md border border-border bg-background/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
            {S.loadingHistory}
          </span>
        </div>
      ) : null}
      <OryonPriceChart
        dataSymbol={dataSymbol}
        liveSymbol={history.isPlaceholderData ? null : symbol}
        interval={interval}
        chartType={chartType}
        magnet={magnet}
        candles={candles}
        digits={instrument.digits}
        pipSize={instrument.pipSize}
        source={source}
        fitKey={`${symbol}:${interval}`}
        onEngineReady={onEngineReady}
      />
    </div>
  );
}

/** Full-area honest state (loading / error / empty) — never a blank canvas. */
function CenterState({
  testid,
  message,
  spinner = false,
  icon = null,
  children = null,
}: {
  testid: string;
  message: string;
  spinner?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-surface">
      {children}
      <div className="relative z-10 flex max-w-sm flex-col items-center gap-3 px-6 text-center">
        {spinner ? <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden /> : null}
        {icon}
        <p data-testid={testid} className="text-sm text-muted-foreground">
          {message}
        </p>
      </div>
    </div>
  );
}
