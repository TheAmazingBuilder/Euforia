"use client";

import * as React from "react";
import { Globe } from "lucide-react";
import type { MonitoringOverviewResponse } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge, ageFromIso, ageLabel } from "./monitoring-primitives";

/**
 * Public status page — a CLIENT DEMO view of the same observed telemetry the
 * Monitoring center renders, laid out the way a customer-facing
 * status.cosmoz.com page would read. It shows only high-level component
 * statuses and incidents: no latencies, no provider internals, no client
 * plane (a visitor has no browser telemetry to share).
 */

export function PublicStatusDialog({
  open,
  onOpenChange,
  data,
  nowMs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: MonitoringOverviewResponse;
  /** Ticking clock from the view (useNowMs) — keeps render pure. */
  nowMs: number | null;
}) {
  const active = data.incidents.filter((incident) => incident.status === "OPEN");
  const resolved = data.incidents.filter((incident) => incident.status === "RESOLVED");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl" data-testid="public-status-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Globe className="size-5 text-accent" aria-hidden="true" />
            status.cosmoz.com — public view
          </DialogTitle>
          <DialogDescription>
            Simulated public status page in client demo mode — the high-level subset a visitor
            would see. Latencies, providers and internals stay private to the Monitoring center.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-background p-5" data-testid="public-status-sheet">
          {/* Banner */}
          <div
            className={
              data.overview.overall === "OPERATIONAL"
                ? "rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3"
                : data.overview.overall === "DOWN"
                  ? "rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3"
                  : "rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3"
            }
          >
            <p className="font-heading text-sm font-semibold">
              {data.overview.overall === "OPERATIONAL"
                ? "All systems operational"
                : data.overview.overall === "DOWN"
                  ? "Service disruption — engineers engaged"
                  : "Partial degradation — some services affected"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Updated {new Date(data.overview.generatedAt).toUTCString()} · {data.overview.counts.operational}/
              {data.overview.components.length} components operational
            </p>
          </div>

          {/* Components */}
          <div className="mt-4 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Services</p>
            {data.overview.components.map((component) => (
              <div key={component.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
                <span className="min-w-0 flex-1 truncate text-sm">{component.label}</span>
                <StatusBadge status={component.status} />
              </div>
            ))}
          </div>

          {/* Incidents — active first, then the resolved history */}
          <div className="mt-4 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Incidents</p>
            {active.length === 0 && resolved.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No incident recorded in the last 90 days.</p>
            ) : (
              <>
                {active.map((incident) => (
                  <div key={incident.id} className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium">{incident.service}</span>
                      <Badge variant="destructive" className="text-[10px]">ONGOING</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {incident.symptoms[0] ?? "Investigating"} — started{" "}
                      {ageLabel(ageFromIso(incident.startedAt, nowMs))} ago.
                    </p>
                  </div>
                ))}
                {resolved.slice(0, 3).map((incident) => (
                  <div key={incident.id} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">{incident.service}</span>
                      <Badge variant="outline" className="text-[10px]">
                        RESOLVED · {incident.durationMs === null ? "—" : `${Math.round(incident.durationMs / 60_000)} min`}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{incident.resolution ?? "Resolved."}</p>
                  </div>
                ))}
              </>
            )}
          </div>

          <p className="mt-4 border-t border-border pt-3 text-center text-[10px] text-muted-foreground">
            Demo mode — this page mirrors the demo instance only. Subscribe to updates from the real
            status page in production.
          </p>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="public-status-close">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
