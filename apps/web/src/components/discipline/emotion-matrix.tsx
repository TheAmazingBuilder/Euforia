"use client";

import { Thermometer } from "lucide-react";
import type { DisciplineEmotionMatrixResponse } from "@cosmoz/shared";
import { EMOTION_LABELS } from "@cosmoz/shared";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Emotion → outcome heatmap - how the trades entered under each logged
 * emotion turned out over the window. Correlational reading ONLY (the card
 * says so): cell color encodes the win rate from loss-rose to win-emerald,
 * Avg R sits next to it. Excluded (no emotion logged) reported honestly.
 */
export function EmotionMatrix({ matrix }: { matrix: DisciplineEmotionMatrixResponse }) {
  return (
    <Card className="bg-surface" data-testid="emotion-matrix">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <Thermometer className="size-4 text-rose-400" aria-hidden="true" />
          Emotion → outcome heatmap
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {matrix.rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No emotion logged in the window yet - tap a feeling at capture and the pattern appears.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">Emotion</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Trades</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Wins</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Losses</th>
                  <th scope="col" className="px-2 py-2 text-center font-medium">Win rate</th>
                  <th scope="col" className="pl-2 py-2 text-right font-medium">Avg R</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr
                    key={row.emotion}
                    className="border-b border-border/60 last:border-0"
                    data-testid={`emotion-row-${row.emotion.toLowerCase()}`}
                  >
                    <td className="py-2 pr-3 font-medium text-foreground">
                      {EMOTION_LABELS[row.emotion] ?? row.emotion}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{row.trades}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-profit">{row.wins}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-loss">{row.losses}</td>
                    <td className="px-2 py-2">
                      <span
                        className={cn(
                          "block rounded-md px-2 py-1 text-center font-mono text-[11px] font-semibold tabular-nums",
                          cellTone(row.winRatePct),
                        )}
                      >
                        {row.winRatePct === null ? "-" : `${row.winRatePct.toFixed(0)}%`}
                      </span>
                    </td>
                    <td className="pl-2 py-2 text-right">
                      <span
                        className={cn(
                          "block rounded-md px-2 py-1 text-center font-mono text-[11px] font-semibold tabular-nums",
                          rTone(row.avgR),
                        )}
                      >
                        {row.avgR === null ? "-" : `${row.avgR > 0 ? "+" : ""}${row.avgR.toFixed(2)}R`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
          Window starting {matrix.windowStart} · correlational, not causal - the grid shows
          patterns, it doesn&apos;t explain them.
          {matrix.excluded > 0 ? ` ${matrix.excluded} trade${matrix.excluded === 1 ? "" : "s"} without an emotion logged are not judged.` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

/** Cell tone from the win rate - emerald ≥ 60, amber middle, rose < 40. */
function cellTone(winRatePct: number | null): string {
  if (winRatePct === null) return "bg-muted text-muted-foreground";
  if (winRatePct >= 60) return "bg-profit/15 text-profit";
  if (winRatePct >= 40) return "bg-warning/15 text-warning";
  return "bg-loss/15 text-loss";
}

function rTone(avgR: number | null): string {
  if (avgR === null) return "bg-muted text-muted-foreground";
  if (avgR > 0) return "bg-profit/15 text-profit";
  if (avgR < 0) return "bg-loss/15 text-loss";
  return "bg-muted text-muted-foreground";
}
