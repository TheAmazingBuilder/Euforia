"use client";

import * as React from "react";

import { toast } from "sonner";

import { ChevronDown, Globe } from "lucide-react";

import type { MarketInterval } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

import { useUpdateProfile } from "@/lib/api/queries/profile";
import { ORYON_INTERVALS } from "@/lib/charting/oryon-intervals";
import {
  isValidIanaZone,
  zoneAbbreviation,
} from "@/lib/oryon/temporal/display";
import { useDisplayTimezone } from "@/lib/oryon/temporal/use-display-timezone";
import { TIMEZONE_OPTIONS } from "@/components/settings/settings-primitives";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Oryon bottom bar — the TradingView-style chart footer (desktop md+):
 * LEFT: the timeframe strip of the ACTIVE panel (exactly the shared
 * MarketInterval enum — a selectable timeframe is always a servable one,
 * 1m → 1D); RIGHT: the live clock in the display timezone + the timezone
 * selector.
 *
 * Timezone semantics (repo convention, kept): Profile.timezone is the
 * SINGLE source of truth — the selector PATCHes /me through the same
 * mutation the settings screen uses, so no second Oryon preference ever
 * forks the trading-day conventions. Display-only by construction: it
 * formats the clock, it never moves a candle, a session or an event.
 *
 * Active-panel binding: the strip targets the ACTIVE panel exactly like
 * the top toolbar's other per-chart controls (multi-chart consistent).
 * The panel headers keep their own per-panel strips (needed in multi-chart
 * grids); this bar is the workspace-level control.
 */
export function OryonBottomBar({
  interval,
  onIntervalChange,
}: {
  interval: MarketInterval;
  onIntervalChange: (interval: MarketInterval) => void;
}) {
  const dict = useDict();
  const S = dict.oryon.toolbar;
  const displayTz = useDisplayTimezone();
  const updateProfile = useUpdateProfile();

  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clock = React.useMemo(() => {
    if (!isValidIanaZone(displayTz)) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: displayTz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now);
  }, [now, displayTz]);
  const abbrev = React.useMemo(
    () => (isValidIanaZone(displayTz) ? zoneAbbreviation(now, displayTz) : ""),
    [now, displayTz],
  );

  const onTimezoneSelect = React.useCallback(
    (zone: string) => {
      if (zone === displayTz) return;
      updateProfile.mutate(
        { timezone: zone },
        {
          onSuccess: () => toast.success(S.bottomTimezoneSaved, { testId: "oryon-tz-saved-toast" }),
          onError: () => toast.error(S.bottomTimezoneError, { testId: "oryon-tz-error-toast" }),
        },
      );
    },
    [displayTz, updateProfile, S.bottomTimezoneSaved, S.bottomTimezoneError],
  );

  return (
    <footer
      data-testid="oryon-bottom-bar"
      aria-label={S.bottomBar}
      className="hidden h-9 shrink-0 items-center gap-1 border-t border-border bg-surface px-2 md:flex"
    >
      <div
        role="group"
        aria-label={S.timeframes}
        data-testid="oryon-timeframes"
        className="flex items-center gap-0.5"
      >
        {ORYON_INTERVALS.map((tf) => {
          const active = tf === interval;
          return (
            <button
              key={tf}
              type="button"
              aria-pressed={active}
              aria-label={`${S.timeframes} ${tf}`}
              data-testid={`oryon-tf-${tf}`}
              onClick={() => onIntervalChange(tf)}
              className={cn(
                "min-w-8 rounded-md px-1.5 py-1 font-mono text-[11px] font-semibold leading-none transition-colors",
                active
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
              )}
            >
              {tf}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`${S.bottomTimezone}: ${displayTz}`}
            data-testid="oryon-timezone-trigger"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Globe className="size-3.5" aria-hidden />
            <span className="max-w-44 truncate font-mono">{displayTz}</span>
            <ChevronDown className="size-3" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-oryon-ui="" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {S.bottomTimezone}
            </DropdownMenuLabel>
              {[...TIMEZONE_OPTIONS]
              .filter((zone) => isValidIanaZone(zone))
              .map((zone) => (
                <DropdownMenuItem
                  key={zone}
                  data-testid={`oryon-tz-${zone}`}
                  className={cn(
                    "justify-between font-mono text-xs",
                    zone === displayTz && "bg-primary/10",
                  )}
                  onSelect={() => onTimezoneSelect(zone)}
                >
                  <span>{zone}</span>
                  {zone === displayTz ? (
                    <span className="text-[10px] font-semibold text-primary" aria-hidden>
                      ●
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div
          data-testid="oryon-clock"
          className="flex items-baseline gap-1.5 rounded-md border border-border bg-background px-2 py-1"
          title={S.bottomTimezoneHint}
        >
          <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">{clock}</span>
          {abbrev !== "" ? (
            <span className="font-mono text-[10px] font-medium text-muted-foreground">{abbrev}</span>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
