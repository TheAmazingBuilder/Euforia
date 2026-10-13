"use client";

import * as React from "react";
import { toast } from "sonner";
import type { Outcome, SkippedTrade } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/i18n-provider";
import { useInstruments, useSettleSkippedTrade } from "@/lib/api/queries";

/**
 * Ghost settlement queue (spec §8): pending ghost trades older than 1 day ask
 * "how did it play out?" — two taps (would have won / lost) or "don't know",
 * plus an optional estimated R. Settlements feed Discipline Saved and
 * Hesitation Cost.
 */

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
}

export function GhostSettlements({ ghosts }: { ghosts: SkippedTrade[] }) {
  const { dict } = useI18n();
  const S = dict.session;
  const { data: instrumentsData } = useInstruments();
  const settle = useSettleSkippedTrade();
  const [draftR, setDraftR] = React.useState<Record<string, string>>({});

  const symbolOf = (instrumentId: string): string =>
    instrumentsData?.instruments.find((instrument) => instrument.id === instrumentId)?.symbol ?? S.ghost.fallbackSymbol;

  const settleGhost = async (ghost: SkippedTrade, outcome: Extract<Outcome, "WOULD_HAVE_WON" | "WOULD_HAVE_LOST" | "UNKNOWN">) => {
    const raw = (draftR[ghost.id] ?? "").trim();
    const rValue = raw !== "" && Number.isFinite(Number(raw)) && outcome !== "UNKNOWN" ? raw : undefined;
    try {
      await settle.mutateAsync({
        skippedId: ghost.id,
        input: {
          outcomeGuess: outcome,
          ...(rValue !== undefined ? { hypotheticalR: rValue } : {}),
        },
      });
      toast.success(
        outcome === "WOULD_HAVE_WON"
          ? S.ghost.settledWon
          : outcome === "WOULD_HAVE_LOST"
            ? S.ghost.settledLost
            : S.ghost.settledUnknown,
        { description: S.ghost.settledDesc },
      );
    } catch {
      toast.error(S.ghost.toastFailed);
    }
  };

  return (
    <ul className="space-y-3">
      {ghosts.map((ghost) => (
        <li key={ghost.id} className="space-y-2 rounded-lg border border-border bg-surface-raised p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="font-heading text-sm font-semibold text-foreground">
              {symbolOf(ghost.instrumentId)}
              {ghost.direction !== null ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {ghost.direction === "BUY" ? S.ghost.longTag : S.ghost.shortTag}
                </span>
              ) : null}
            </span>
            <span className="text-xs capitalize text-muted-foreground">{dayLabel(ghost.seenAt)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {`${S.ghost.skipped} ${S.ghost.reasons[ghost.reason]} — ${S.ghost.howPlayed}`}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="border-profit/50 text-profit hover:bg-profit/10 hover:text-profit"
              disabled={settle.isPending}
              onClick={() => void settleGhost(ghost, "WOULD_HAVE_WON")}
            >
              {S.ghost.won}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={settle.isPending}
              onClick={() => void settleGhost(ghost, "WOULD_HAVE_LOST")}
            >
              {S.ghost.lost}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={settle.isPending}
              onClick={() => void settleGhost(ghost, "UNKNOWN")}
            >
              {S.ghost.notSure}
            </Button>
            <Input
              inputMode="decimal"
              placeholder={S.ghost.estRPlaceholder}
              aria-label={`${S.ghost.estRAria} ${symbolOf(ghost.instrumentId)} ${S.ghost.estRAriaTail}`.replace(/\s+/g, " ").trim()}
              value={draftR[ghost.id] ?? ""}
              onChange={(event) => setDraftR((previous) => ({ ...previous, [ghost.id]: event.target.value }))}
              className="h-8 w-20 font-mono text-xs"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
