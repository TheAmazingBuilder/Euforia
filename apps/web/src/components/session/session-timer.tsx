"use client";

import * as React from "react";
import { AlertTriangle, Pause, Play, Timer } from "lucide-react";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreferences, useUpdatePreferencesDomain } from "@/lib/api/queries";
import { useNowMs } from "@/lib/realtime/use-now";
import { cn } from "@/lib/utils";

/**
 * Session timer (Session Live station bar) — a wall-clock session duration
 * watch with a configurable « max duration » cap stored in the trading
 * preferences document. Crossing the cap raises a one-time warning toast
 * and tints the timer until it is stopped.
 *
 * The running start-timestamp lives in localStorage (per-device, like a
 * stopwatch): SPA remounts resume the count, a full reload restarts the
 * device — never a server write for a personal stopwatch.
 */

/** localStorage-backed stopwatch — external store for useSyncExternalStore. */
const STARTED_AT_KEY = "cosmoz.session.startedAt";
const SESSION_START_EVENT = "cosmoz:session-started-at";

function subscribeSessionStart(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  window.addEventListener(SESSION_START_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(SESSION_START_EVENT, listener);
  };
}

function getSessionStartSnapshot(): string | null {
  return window.localStorage.getItem(STARTED_AT_KEY);
}

function getNullSnapshot(): string | null {
  return null;
}

const MAX_OPTIONS = [
  { value: "off", label: "No cap", minutes: null },
  { value: "30", label: "30 min", minutes: 30 },
  { value: "45", label: "45 min", minutes: 45 },
  { value: "60", label: "60 min", minutes: 60 },
  { value: "90", label: "90 min", minutes: 90 },
  { value: "120", label: "2 h", minutes: 120 },
  { value: "180", label: "3 h", minutes: 180 },
  { value: "240", label: "4 h", minutes: 240 },
] as const;

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function SessionTimer() {
  const { data: prefs } = usePreferences();
  const updateTrading = useUpdatePreferencesDomain("trading");
  const maxMinutes = prefs?.trading.sessionMaxDurationMin ?? null;

  const nowMs = useNowMs();
  // The stopwatch lives in localStorage (per-device) and is read through
  // useSyncExternalStore — no impure render reads, no set-state-in-effect;
  // writes notify via a custom event so every instance re-renders.
  const storedStart = React.useSyncExternalStore(
    subscribeSessionStart,
    getSessionStartSnapshot,
    getNullSnapshot,
  );
  const startedAtMs = Number(storedStart);
  const startedAt = storedStart !== null && Number.isFinite(startedAtMs) && startedAtMs > 0 ? startedAtMs : null;
  // The cap alert fires ONCE per session run — armed when the timer starts.
  const capAlertedRef = React.useRef(false);

  const elapsedSec =
    startedAt !== null && nowMs !== null ? Math.max(0, Math.floor((nowMs - startedAt) / 1000)) : 0;
  const running = startedAt !== null;
  const capped = maxMinutes !== null && elapsedSec >= maxMinutes * 60;

  const toggle = React.useCallback(() => {
    if (running) {
      window.localStorage.removeItem(STARTED_AT_KEY);
      capAlertedRef.current = false;
    } else {
      window.localStorage.setItem(STARTED_AT_KEY, String(Date.now()));
      capAlertedRef.current = false;
    }
    window.dispatchEvent(new Event(SESSION_START_EVENT));
  }, [running]);

  const changeMax = React.useCallback(
    (value: string) => {
      if (!prefs) return;
      const option = MAX_OPTIONS.find((item) => item.value === value);
      updateTrading.mutate({ ...prefs.trading, sessionMaxDurationMin: option?.minutes ?? null });
    },
    [prefs, updateTrading],
  );

  // Cap alert — fires once per run when the elapsed time crosses the cap
  // (also covers a restored stopwatch that already ran past it).
  React.useEffect(() => {
    if (!running || maxMinutes === null || !capped || capAlertedRef.current) return;
    capAlertedRef.current = true;
    toast.warning("Session duration cap reached", {
      description: `You have been at the station for ${maxMinutes} min. Fatigue compounds — consider wrapping up the session.`,
      duration: 10_000,
    });
  }, [running, maxMinutes, capped]);

  return (
    <div className="space-y-1" data-testid="session-timer" data-running={running ? "true" : "false"}>
      <p className="ledger-label">Session timer</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={running ? "Stop session timer" : "Start session timer"}
          data-testid="session-timer-toggle"
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-full border transition-colors",
            running
              ? "border-loss/40 bg-loss/10 text-loss hover:bg-loss/20"
              : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20",
          )}
        >
          {running ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
        </button>
        <span
          data-testid="session-timer-elapsed"
          className={cn(
            "font-mono text-lg font-semibold tabular-nums leading-none",
            capped ? "text-warning" : running ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {nowMs === null ? "--:--:--" : formatElapsed(elapsedSec)}
        </span>
        {capped ? (
          <AlertTriangle className="size-4 text-warning" aria-hidden="true" data-testid="session-timer-capped" />
        ) : (
          <Timer className="size-4 text-muted-foreground/60" aria-hidden="true" />
        )}
      </div>
      <Select value={maxMinutes === null ? "off" : String(maxMinutes)} onValueChange={changeMax}>
        <SelectTrigger
          size="sm"
          aria-label="Max session duration"
          className="h-6 w-[104px] text-[11px]"
          data-testid="session-timer-max"
        >
          <SelectValue placeholder="Cap" />
        </SelectTrigger>
        <SelectContent>
          {MAX_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
