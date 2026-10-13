"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Camera,
  CircleDot,
  Crosshair,
  Flag,
  Pause,
  Play,
  Plus,
  Rewind,
  Square,
  X,
} from "lucide-react";
import type {
  ChartZone,
  Instrument,
  SymbolHistoryResponse,
  Timeframe,
  Trade,
} from "@cosmoz/shared";
import { TIMEFRAME_LABELS, TIMEFRAME_MS } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  useAddScreenshot,
  useCandles,
  useScreenshots,
  useSymbolHistory,
  useUpdateTradeChart,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { toTradingViewSymbol } from "@/lib/trade-charts";
import { cn } from "@/lib/utils";
import { CandleChart } from "./candle-chart";
import { TradingViewChart } from "./tv-chart";
import { SymbolHistoryChart } from "./symbol-history-chart";

/** Lookback shown before the entry when the replay starts (in bars). */
const REPLAY_LOOKBACK_BARS = 48;
const REPLAY_TICK_MS = 320;
const REPLAY_SPEEDS = [1, 2, 4] as const;

export interface TradeChartPanelProps {
  trade: Trade;
  instrument: Instrument | null;
}

/**
 * Market context for ONE trade — the Charts feature surface inside the
 * Trade Details drawer:
 *  - Replay chart (ECharts candlestick): the trade's symbol + timeframe with
 *    the trade's own levels marked, drawable support/resistance zones, an
 *    auto/manual snapshot that lands in the screenshot gallery, and a Trade
 *    Replay mode that re-runs the market from before the entry;
 *  - TradingView tab: the free tv.js widget auto-loaded on the trade's
 *    symbol/timeframe, theme-synced, lazily injected (performance);
 *  - Symbol history (ApexCharts): last closed trades on this symbol.
 */
export function TradeChartPanel({ trade, instrument }: TradeChartPanelProps) {
  const { data: screenshotsData } = useScreenshots(trade.id);
  const addScreenshot = useAddScreenshot();
  const updateChart = useUpdateTradeChart();
  const captureRef = React.useRef<(() => string | null) | null>(null);

  // ── Per-trade state (reset via the render-time adjustment pattern) ──
  const [stateFor, setStateFor] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"replay" | "tradingview">("replay");
  const [timeframe, setTimeframe] = React.useState<Timeframe>("M15");
  const [pickMode, setPickMode] = React.useState<"SUPPORT" | "RESISTANCE" | null>(null);
  const [replayOn, setReplayOn] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState<(typeof REPLAY_SPEEDS)[number]>(1);
  const [replayTs, setReplayTs] = React.useState<number | null>(null);
  const [painted, setPainted] = React.useState(false);

  if (stateFor !== trade.id) {
    setStateFor(trade.id);
    setTab("replay");
    setTimeframe(trade.timeframe ?? "M15");
    setPickMode(null);
    setReplayOn(false);
    setPlaying(false);
    setReplayTs(null);
    setPainted(false);
  }

  const symbol = instrument?.symbol ?? null;
  // Stable identity — `?? []` would rebuild the option memo every render.
  const zones = React.useMemo(() => trade.chartZones ?? [], [trade.chartZones]);
  const tvMapping = React.useMemo(
    () => (symbol ? toTradingViewSymbol(symbol) : null),
    [symbol],
  );

  // Lazy data: candles only load on the replay tab, history when panel mounts.
  const candlesQuery = useCandles(tab === "replay" ? symbol : null, timeframe);
  const historyQuery = useSymbolHistory(tab === "replay" ? instrument?.id ?? null : null);
  const candles = candlesQuery.data?.candles ?? [];

  const stepMs = TIMEFRAME_MS[timeframe];
  const entryMs = Date.parse(trade.entryAt);
  const firstTs = candles.length > 0 ? Date.parse(candles[0]!.t) : null;
  const lastTs = candles.length > 0 ? Date.parse(candles[candles.length - 1]!.t) : null;
  // Clamp the entry anchor INSIDE the candle window — fixtures (or manually
  // dated trades) can carry an entry beyond "now", where no candles exist.
  const entryAnchorMs =
    firstTs !== null && lastTs !== null ? Math.min(entryMs, lastTs) : entryMs;
  const replayStartTs =
    firstTs !== null && lastTs !== null
      ? Math.max(firstTs, entryAnchorMs - REPLAY_LOOKBACK_BARS * stepMs)
      : null;

  // ── Replay playback loop ──
  React.useEffect(() => {
    if (!playing || !replayOn || lastTs === null) return;
    const timer = window.setInterval(() => {
      setReplayTs((previous) => {
        const base = previous ?? replayStartTs ?? entryAnchorMs - REPLAY_LOOKBACK_BARS * stepMs;
        const next = base + stepMs * speed;
        if (next >= lastTs) {
          setPlaying(false);
          return lastTs;
        }
        return next;
      });
    }, REPLAY_TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, replayOn, lastTs, replayStartTs, entryAnchorMs, stepMs, speed]);

  const onEnterReplay = () => {
    if (replayStartTs === null) return;
    setReplayTs(replayStartTs);
    setReplayOn(true);
    setPlaying(false);
  };

  const onExitReplay = () => {
    setReplayOn(false);
    setPlaying(false);
    setReplayTs(null);
  };

  // ── Zones (persisted per trade) ──
  const onPickLevel = (level: number) => {
    if (!pickMode || !instrument) return;
    const digits = instrument.digits;
    const band = Math.max(level * 0.0008, Number(instrument.pipSize) * 12);
    const factor = 10 ** digits;
    const zone: ChartZone = {
      id: crypto.randomUUID(),
      kind: pickMode,
      lo: Math.round((level - band) * factor) / factor,
      hi: Math.round((level + band) * factor) / factor,
      label: null,
      createdAt: new Date().toISOString(),
    };
    updateChart.mutate(
      { tradeId: trade.id, input: { chartZones: [...zones, zone] } },
      {
        onSuccess: () => toast.success(`${pickMode === "SUPPORT" ? "Support" : "Resistance"} zone added`),
        onError: (error) => toast.error(apiErrorMessage(error, "Could not save the zone")),
      },
    );
    setPickMode(null);
  };

  const onRemoveZone = (zoneId: string) => {
    updateChart.mutate(
      { tradeId: trade.id, input: { chartZones: zones.filter((zone) => zone.id !== zoneId) } },
      {
        onError: (error) => toast.error(apiErrorMessage(error, "Could not remove the zone")),
      },
    );
  };

  const onTimeframeChange = (next: Timeframe) => {
    setTimeframe(next);
    onExitReplay();
    updateChart.mutate(
      { tradeId: trade.id, input: { timeframe: next } },
      {
        onError: (error) => toast.error(apiErrorMessage(error, "Could not save the timeframe")),
      },
    );
  };

  // ── Snapshot: manual button + AUTO capture at entry (no evidence yet) ──
  const captureSnapshot = React.useCallback(
    (caption: string) => {
      const dataUrl = captureRef.current?.();
      if (!dataUrl) return;
      addScreenshot.mutate(
        { tradeId: trade.id, input: { kind: "CHART", dataUrl, caption } },
        {
          onSuccess: () => toast.success("Chart snapshot stored in screenshots"),
          onError: (error) => toast.error(apiErrorMessage(error, "Snapshot failed")),
        },
      );
    },
    [addScreenshot, trade.id],
  );

  const autoTriedRef = React.useRef<string | null>(null);
  const autoTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!painted || !instrument) return;
    if ((screenshotsData?.screenshots.length ?? 0) > 0) return;
    if (autoTriedRef.current === trade.id) return;
    autoTriedRef.current = trade.id;
    // NO per-run cleanup: identity churn (mutation objects) would cancel a
    // scheduled capture; the timer is tracked in a ref instead.
    autoTimerRef.current = window.setTimeout(() => {
      captureSnapshot(`Auto snapshot at entry — ${instrument.symbol} ${timeframe}`);
    }, 900);
  }, [painted, instrument, screenshotsData, trade.id, timeframe, captureSnapshot]);

  // Cancel the pending auto-capture when the trade changes or unmounts.
  React.useEffect(() => {
    return () => {
      if (autoTimerRef.current !== null) {
        window.clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [trade.id]);

  const onPainted = React.useCallback(() => setPainted(true), []);

  const history: SymbolHistoryResponse | null = historyQuery.data ?? null;
  const tvSymbol = tvMapping?.tvSymbol ?? symbol;

  return (
    <section className="space-y-2" data-testid="trade-chart-panel">
      {/* Header: caption + tabs + timeframe */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          Market context
        </p>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-pressed={tab === "replay"}
            data-testid="trade-tab-replay"
            onClick={() => setTab("replay")}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              tab === "replay"
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground",
            )}
          >
            Replay
          </button>
          <button
            type="button"
            aria-pressed={tab === "tradingview"}
            data-testid="trade-tab-tradingview"
            onClick={() => setTab("tradingview")}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              tab === "tradingview"
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground",
            )}
          >
            TradingView
          </button>
          <select
            aria-label="Chart timeframe"
            data-testid="trade-chart-timeframe"
            value={timeframe}
            onChange={(event) => onTimeframeChange(event.target.value as Timeframe)}
            className="h-7 rounded-md border border-border bg-background px-1.5 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {TIMEFRAME_LABELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {symbol === null || tvSymbol === null ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Chart unavailable — the instrument catalog did not load.
        </p>
      ) : tab === "replay" ? (
        <div className="space-y-2">
          {/* Toolbar: zones + snapshot + replay controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className={cn("h-7 gap-1 px-2 text-xs", pickMode === "SUPPORT" && "border-profit text-profit")}
              aria-pressed={pickMode === "SUPPORT"}
              onClick={() => setPickMode(pickMode === "SUPPORT" ? null : "SUPPORT")}
              data-testid="trade-zone-add-support"
            >
              <Plus className="size-3" aria-hidden="true" />
              Support
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-7 gap-1 px-2 text-xs", pickMode === "RESISTANCE" && "border-loss text-loss")}
              aria-pressed={pickMode === "RESISTANCE"}
              onClick={() => setPickMode(pickMode === "RESISTANCE" ? null : "RESISTANCE")}
              data-testid="trade-zone-add-resistance"
            >
              <Plus className="size-3" aria-hidden="true" />
              Resistance
            </Button>
            {pickMode ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-accent">
                <Crosshair className="size-3" aria-hidden="true" />
                Click the chart to place the level
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-7 gap-1 px-2 text-xs"
              onClick={() => captureSnapshot(`Manual snapshot — ${symbol} ${timeframe}`)}
              disabled={addScreenshot.isPending}
              data-testid="trade-chart-snapshot"
            >
              {addScreenshot.isPending ? (
                <Square className="size-3" aria-hidden="true" />
              ) : (
                <Camera className="size-3" aria-hidden="true" />
              )}
              Snapshot
            </Button>
          </div>

          {/* Chart */}
          {candlesQuery.isLoading ? (
            <div className="grid h-64 place-items-center rounded-md border border-border bg-background/40 sm:h-72">
              <p className="text-xs text-muted-foreground">Loading {symbol} candles…</p>
            </div>
          ) : candlesQuery.isError ? (
            <div className="grid h-64 place-items-center rounded-md border border-border bg-background/40 sm:h-72">
              <div className="space-y-2 text-center">
                <p className="text-xs text-muted-foreground">Candles failed to load.</p>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void candlesQuery.refetch()}>
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            <CandleChart
              trade={trade}
              instrument={instrument!}
              timeframe={timeframe}
              candles={candles}
              zones={zones}
              pickMode={pickMode}
              onPickLevel={onPickLevel}
              replayTs={replayOn ? replayTs : null}
              onPainted={onPainted}
              captureRef={captureRef}
            />
          )}

          {/* Zone chips */}
          {zones.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5" data-testid="trade-zone-list">
              {zones.map((zone) => (
                <span
                  key={zone.id}
                  data-testid="trade-zone-item"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px]",
                    zone.kind === "SUPPORT"
                      ? "border-profit/50 text-profit"
                      : "border-loss/50 text-loss",
                  )}
                >
                  <CircleDot className="size-2.5" aria-hidden="true" />
                  {zone.kind === "SUPPORT" ? "S" : "R"} {zone.lo}–{zone.hi}
                  <button
                    type="button"
                    aria-label={`Remove ${zone.kind.toLowerCase()} zone`}
                    data-testid="trade-zone-remove"
                    onClick={() => onRemoveZone(zone.id)}
                    className="ml-0.5 text-muted-foreground transition-colors hover:text-loss"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {/* Replay controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            {!replayOn ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={onEnterReplay}
                disabled={candles.length === 0}
                data-testid="trade-replay-enter"
              >
                <Rewind className="size-3" aria-hidden="true" />
                Trade replay
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setPlaying((value) => !value)}
                  data-testid="trade-replay-play"
                >
                  {playing ? (
                    <>
                      <Pause className="size-3" aria-hidden="true" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="size-3" aria-hidden="true" />
                      Play
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={onEnterReplay}
                  data-testid="trade-replay-reset"
                >
                  <Rewind className="size-3" aria-hidden="true" />
                  Restart
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={onExitReplay}
                  data-testid="trade-replay-exit"
                >
                  Exit replay
                </Button>
                <div className="ml-auto flex items-center gap-1" role="group" aria-label="Replay speed">
                  {REPLAY_SPEEDS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={speed === value}
                      data-testid={`trade-replay-speed-${value}x`}
                      onClick={() => setSpeed(value)}
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                        speed === value
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {value}×
                    </button>
                  ))}
                </div>
              </>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Flag className="size-2.5" aria-hidden="true" />
              {replayOn
                ? "Replaying the market — trade levels appear when reached"
                : "Full history — replay to see the market as it was"}
            </span>
          </div>

          {/* Replay cursor */}
          {replayOn && firstTs !== null && lastTs !== null ? (
            <input
              type="range"
              aria-label="Replay cursor"
              data-testid="trade-replay-slider"
              min={firstTs}
              max={lastTs}
              step={stepMs}
              value={replayTs ?? firstTs}
              onChange={(event) => {
                setPlaying(false);
                setReplayTs(Number(event.target.value));
              }}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
            />
          ) : null}

          {/* Symbol history (ApexCharts) */}
          {history !== null && history.trades.length > 0 ? (
            <div className="rounded-md border border-border p-2">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
                  Last closed {history.symbol} trades
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {history.trades.filter((item) => item.pnlNet >= 0).length}/{history.trades.length} W
                </p>
              </div>
              <SymbolHistoryChart data={history} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <TradingViewChart tvSymbol={tvSymbol} timeframe={timeframe} />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Live market data by TradingView — {tvSymbol} · {timeframe} (theme-synced). Draw
            your support/resistance zones on the Replay tab; they are stored with the trade.
          </p>
        </div>
      )}
    </section>
  );
}
