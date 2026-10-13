"use client";

import * as React from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import type { Timeframe } from "@cosmoz/shared";

import { toTradingViewInterval } from "@/lib/trade-charts";

/**
 * TradingView free widget (tv.js) — the live-market view of the trade's
 * symbol. The script is injected ONLY when this component mounts (chart tab
 * opened), loaded once per session, and the widget is rebuilt on
 * symbol/interval/theme change. The free widget renders inside its own
 * iframe — annotations live on the Replay chart instead.
 */

interface TradingViewGlobal {
  widget: new (config: Record<string, unknown>) => unknown;
}

declare global {
  interface Window {
    TradingView?: TradingViewGlobal;
  }
}

const TV_SCRIPT_SRC = "https://s3.tradingview.com/tv.js";
const LOAD_TIMEOUT_MS = 15_000;

let tvLoader: Promise<TradingViewGlobal> | null = null;

/** Inject tv.js once per session; resolve the global when it lands. */
function loadTradingView(): Promise<TradingViewGlobal> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.TradingView) return Promise.resolve(window.TradingView);
  if (tvLoader) return tvLoader;

  tvLoader = new Promise<TradingViewGlobal>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TV_SCRIPT_SRC;
    script.async = true;
    let settled = false;
    script.onload = () => {
      if (settled) return;
      settled = true;
      if (window.TradingView) resolve(window.TradingView);
      else {
        tvLoader = null;
        reject(new Error("TradingView failed to initialize"));
      }
    };
    script.onerror = () => {
      if (settled) return;
      settled = true;
      tvLoader = null;
      reject(new Error("Could not reach TradingView"));
    };
    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      tvLoader = null;
      reject(new Error("TradingView load timed out"));
    }, LOAD_TIMEOUT_MS);
    document.head.appendChild(script);
  });
  return tvLoader;
}

export interface TradingViewChartProps {
  tvSymbol: string;
  timeframe: Timeframe;
}

export function TradingViewChart({ tvSymbol, timeframe }: TradingViewChartProps) {
  const containerId = `tv_chart_${React.useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const { resolvedTheme } = useTheme();

  const widgetTheme = resolvedTheme === "light" ? "light" : "dark";
  const interval = toTradingViewInterval(timeframe);
  // Derived status: the key tells whether the CURRENT widget config has
  // loaded — no synchronous setState in the effect (react-hooks rules).
  const configKey = `${tvSymbol}|${interval}|${widgetTheme}`;
  const [readyKey, setReadyKey] = React.useState<string | null>(null);
  const [failedKey, setFailedKey] = React.useState<string | null>(null);
  const state =
    readyKey === configKey ? "ready" : failedKey === configKey ? "error" : "loading";

  React.useEffect(() => {
    let cancelled = false;
    loadTradingView()
      .then((tv) => {
        if (cancelled) return;
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";
        // Free-widget contract (user-provided snippet):
        // new TradingView.widget({ container_id, symbol, interval, theme, ... })
        new tv.widget({
          container_id: containerId,
          symbol: tvSymbol,
          interval,
          theme: widgetTheme,
          style: "1",
          timezone: "Etc/UTC",
          locale: "en",
          autosize: true,
          hide_side_toolbar: true,
          allow_symbol_change: false,
          save_image: false,
          withdateranges: true,
          details: false,
          studies: [],
        });
        setReadyKey(configKey);
      })
      .catch(() => {
        if (!cancelled) setFailedKey(configKey);
      });
    return () => {
      cancelled = true;
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = "";
    };
  }, [containerId, tvSymbol, interval, widgetTheme, configKey]);

  return (
    <div className="relative" data-testid="trade-tv-chart">
      <div id={containerId} className="h-72 w-full overflow-hidden rounded-md border border-border sm:h-80" />
      {state === "loading" ? (
        <div className="absolute inset-0 grid place-items-center rounded-md border border-border bg-surface">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Loading TradingView — {tvSymbol}
          </p>
        </div>
      ) : null}
      {state === "error" ? (
        <div className="absolute inset-0 grid place-items-center rounded-md border border-border bg-surface p-4 text-center">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              TradingView is unreachable from this network.
            </p>
            <a
              href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              Open {tvSymbol} on TradingView
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
