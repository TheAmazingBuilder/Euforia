"use client";

import * as React from "react";
import { GitCompareArrows, History } from "lucide-react";
import type { Strategy } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStrategyVersions } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

const CURRENT_KEY = "__current";

/** The definition fields worth diffing (§17 — the frozen definition). */
const DIFF_FIELDS: Array<{ key: string; label: string }> = [
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
  { key: "marketProfile", label: "Market profile" },
  { key: "marketConditions", label: "Market conditions" },
  { key: "entryConditions", label: "Entry conditions" },
  { key: "entryRules", label: "Entry rules" },
  { key: "exitRules", label: "Exit rules" },
  { key: "riskRules", label: "Risk rules" },
  { key: "invalidations", label: "Invalidations" },
  { key: "risk", label: "Risk" },
  { key: "grade", label: "Grade" },
  { key: "tags", label: "Tags" },
];

const truncate = (value: string, max = 140): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

const render = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.trim() === "" ? "—" : value;
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(" · ");
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${String(v)}`);
    return parts.length === 0 ? "—" : parts.join(" · ");
  }
  return String(value);
};

/**
 * Strategy version diff — pick any two snapshots (historical or current) and
 * read the definition changes field by field. The server freezes a snapshot
 * BEFORE every definition edit (§17), so a trade executed under v1 stays
 * explainable as v1 forever.
 */
export function StrategyVersionsDialog({
  strategy,
  open,
  onOpenChange,
}: {
  strategy: Strategy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isPending } = useStrategyVersions(open && strategy ? strategy.id : null);
  const versions = React.useMemo(() => data?.versions ?? [], [data]);

  // Option list: historical snapshots (oldest first) + the current definition.
  const options = React.useMemo(() => {
    const historical = [...versions].sort((a, b) => a.version - b.version);
    return [
      ...historical.map((snapshot) => ({
        key: String(snapshot.version),
        label: `v${snapshot.version}`,
        sub: snapshot.reason ?? "Snapshot",
        snapshot: snapshot.snapshot as Record<string, unknown> | null,
      })),
      {
        key: CURRENT_KEY,
        label: `v${data?.currentVersion ?? 1} — current`,
        sub: "Live definition",
        snapshot: (strategy ?? null) as unknown as Record<string, unknown> | null,
      },
    ];
  }, [versions, data?.currentVersion, strategy]);

  const [aKey, setAKey] = React.useState<string | null>(null);
  const [bKey, setBKey] = React.useState<string | null>(null);
  // Default A = oldest snapshot, B = current — resolved once options load.
  const [resolvedFor, setResolvedFor] = React.useState<string | null>(null);
  const optionsKey = `${strategy?.id ?? "none"}|${options.length}`;
  if (open && options.length > 0 && resolvedFor !== optionsKey) {
    setResolvedFor(optionsKey);
    setAKey(options[0]!.key);
    setBKey(options[options.length - 1]!.key);
  }

  const diff = React.useMemo(() => {
    const a = options.find((option) => option.key === aKey);
    const b = options.find((option) => option.key === bKey);
    if (!a || !b || !a.snapshot || !b.snapshot) return [];
    return DIFF_FIELDS.map((field) => {
      const before = render(a.snapshot![field.key]);
      const after = render(b.snapshot![field.key]);
      const same = before === after;
      const kind =
        same ? "SAME" : before === "—" ? "ADDED" : after === "—" ? "REMOVED" : "CHANGED";
      return { label: field.label, before, after, kind };
    }).filter((entry) => entry.kind !== "SAME");
  }, [options, aKey, bKey]);

  if (!strategy) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-testid="strategy-versions-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <History className="size-5 text-violet-400" aria-hidden="true" />
            Version history — {strategy.name}
          </DialogTitle>
          <DialogDescription>
            Every definition edit freezes the prior version before the change lands. Compare any
            two snapshots field by field.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading versions…</p>
        ) : versions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No prior version yet — edit a definition field (rules, conditions, risk…) and the
            current definition is frozen as v1 automatically.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Compare</p>
                <Select value={aKey ?? undefined} onValueChange={setAKey}>
                  <SelectTrigger className="h-9 text-sm" data-testid="versions-select-a">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">With</p>
                <Select value={bKey ?? undefined} onValueChange={setBKey}>
                  <SelectTrigger className="h-9 text-sm" data-testid="versions-select-b">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {aKey === bKey ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Pick two different versions to see the diff.
              </p>
            ) : diff.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground" data-testid="version-diff-empty">
                These two versions are identical on the tracked fields.
              </p>
            ) : (
              <ul className="space-y-2" data-testid="version-diff">
                {diff.map((entry) => (
                  <li
                    key={entry.label}
                    className="rounded-lg border border-border px-3 py-2"
                    data-testid="version-diff-row"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {entry.label}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "px-1.5 py-0 font-mono text-[10px]",
                          entry.kind === "CHANGED" && "border-amber-500/40 text-amber-500",
                          entry.kind === "ADDED" && "border-profit/40 text-profit",
                          entry.kind === "REMOVED" && "border-loss/40 text-loss",
                        )}
                      >
                        {entry.kind}
                      </Badge>
                      <GitCompareArrows className="ml-auto size-3.5 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <p className="mt-1 font-mono text-xs leading-relaxed text-loss line-clamp-2">
                      − {truncate(entry.before)}
                    </p>
                    <p className="font-mono text-xs leading-relaxed text-profit line-clamp-2">
                      + {truncate(entry.after)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
