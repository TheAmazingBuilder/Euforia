import { cn } from "@/lib/utils";
import type { Severity } from "@cosmoz/shared";

/**
 * Severity badge - deliberate token mapping (Phase 8 brief):
 * NOTIFY → muted (informational), WARN → warning, ALERT → accent (the
 * app's strong attention color), LOCK → loss (hard stop; the one accepted
 * use of the loss token outside P&L, because a lock IS a stop).
 */
const SEVERITY_STYLES: Record<Severity, string> = {
  NOTIFY: "border-border bg-surface-raised text-muted-foreground",
  WARN: "border-warning/40 bg-warning/10 text-warning",
  ALERT: "border-accent/40 bg-accent/10 text-accent",
  LOCK: "border-loss/40 bg-loss/10 text-loss",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  NOTIFY: "Notify",
  WARN: "Warn",
  ALERT: "Alert",
  LOCK: "Lock",
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        SEVERITY_STYLES[severity],
        className,
      )}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
