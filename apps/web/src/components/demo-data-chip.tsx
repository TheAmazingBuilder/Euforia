"use client";

import { FlaskConical } from "lucide-react";

import { API_MOCKED } from "@/lib/api/mode";
import { cn } from "@/lib/utils";

/**
 * Demo-data marker (Phase 02 hygiene — audit HIGH-risk chains A and B).
 *
 * Renders NOTHING in live mode: when the real API serves the surface, its
 * data is real and a "demo" stamp would be dishonest in the other direction.
 * In mock mode (the default), any fixture-driven financial value — the
 * position-sizer balance chain, the monitoring broker telemetry, the
 * account switcher catalog — carries this chip so simulated numbers can
 * never read as real money (Phase 02 acceptance: no fixture balance or
 * telemetry renders without a visible demo marker).
 */
export function DemoDataChip({ className, testId }: { className?: string; testId?: string }) {
  if (!API_MOCKED) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-sm border border-warning/40 bg-warning/10 px-1 py-0.5 font-mono text-[10px] uppercase leading-none tracking-wide text-warning",
        className,
      )}
      data-testid={testId ?? "demo-data-chip"}
      title="Mock-mode fixture data — not real account values"
    >
      <FlaskConical className="size-2.5" aria-hidden />
      Demo data
    </span>
  );
}
