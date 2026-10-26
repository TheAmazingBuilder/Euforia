"use client";

import { ShieldCheck } from "lucide-react";
import { formatR } from "@cosmoz/shared";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface DisciplineSavedCardProps {
  /** Σ|R| preserved by settled would-have-lost ghost trades (server-computed). */
  rSaved: string;
  /** How many such ghosts were settled. */
  settledCount: number;
}

/**
 * "Discipline saved" widget - the behavioral ROI of NOT trading: R kept out
 * of harm's way by setups the plan rejected (Registre des Regrets).
 */
export function DisciplineSavedCard({ rSaved, settledCount }: DisciplineSavedCardProps) {
  return (
    <Card className="bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
          Discipline saved
        </CardTitle>
        <CardDescription>
          Capital preserved by settled ghost trades - setups you saw and did not take.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-4xl font-semibold tabular-nums text-profit">
          {formatR(rSaved)}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          <span className="font-mono font-medium tabular-nums text-foreground">
            {settledCount}
          </span>{" "}
          settled {settledCount === 1 ? "ghost trade" : "ghost trades"} would have lost.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Every avoided loser is R kept in your account. Settling your ghost trades turns
          restraint into a measurable edge - the coach tracks it here after each session.
        </p>
      </CardContent>
    </Card>
  );
}
