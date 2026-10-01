"use client";

import * as React from "react";
import { Check, History, RotateCcw, Search } from "lucide-react";

import type { NofyRefHit, NofyRefKind, NofyVersionsResponse } from "@cosmoz/shared";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useNofyRefs } from "@/lib/api/queries";
import { NOFY_REF_META, nofyRelativeTime } from "./nofy-shared";

/**
 * Nofy editor dialogs — the trading-entity picker (real relational refs,
 * spec §24/§31), the version-history dialog (spec §18) and the emoji picker
 * (spec §20). All entities are resolved server-side; only in-app hrefs are
 * ever offered.
 */

// ── Entity picker ────────────────────────────────────────────────────────────

const PICKER_KINDS: (NofyRefKind | "ALL")[] = [
  "ALL", "TRADE", "STRATEGY", "SETUP", "RULE", "LESSON", "EVENT", "SYMBOL", "NOTE",
];

export function RefPickerDialog({
  open,
  onOpenChange,
  initialKind,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind: NofyRefKind | null;
  onPick: (hit: NofyRefHit) => void;
}) {
  const [kind, setKind] = React.useState<NofyRefKind | "ALL">(initialKind ?? "ALL");
  const [rawQuery, setRawQuery] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<number>(0);

  React.useEffect(() => {
    const timer = setTimeout(() => setQuery(rawQuery), 250);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const refsQuery = useNofyRefs(open ? query : "", kind === "ALL" ? "" : kind);
  const refs = refsQuery.data?.refs ?? [];
  // Clamp instead of syncing state — the highlight never exceeds the list.
  const activeIndex = Math.min(selected, Math.max(0, refs.length - 1));

  const pickAt = (index: number) => {
    const hit = refs[index];
    if (!hit) return;
    onPick(hit);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="nofy-ref-picker">
        <DialogHeader>
          <DialogTitle>Reference an entity</DialogTitle>
          <DialogDescription>
            Link a real trade, strategy, setup, lesson, event, symbol or note — the card stays fresh.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1">
            {PICKER_KINDS.map((entry) => {
              const meta = entry === "ALL" ? null : NOFY_REF_META[entry];
              return (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setKind(entry)}
                  data-testid={`nofy-ref-kind-${entry}`}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    entry === kind
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground",
                  )}
                >
                  {meta ? meta.label : "All"}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={rawQuery}
              onChange={(event) => setRawQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); setSelected((s) => Math.min(s + 1, refs.length - 1)); }
                if (event.key === "ArrowUp") { event.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
                if (event.key === "Enter") { event.preventDefault(); pickAt(activeIndex); }
              }}
              placeholder="Search entities…"
              className="pl-8"
              aria-label="Search entities"
              autoFocus
            />
          </div>

          <div className="max-h-80 min-h-40 overflow-y-auto rounded-lg border border-border" data-testid="nofy-ref-list">
            {refsQuery.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-9 rounded-md" />)}
              </div>
            ) : refs.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No entity matches this search.</p>
            ) : (
              <ul className="divide-y divide-border">
                {refs.map((hit, index) => {
                  const meta = NOFY_REF_META[hit.kind];
                  const Icon = meta.icon;
                  return (
                    <li key={`${hit.kind}-${hit.id}`}>
                      <button
                        type="button"
                        onClick={() => pickAt(index)}
                        onMouseEnter={() => setSelected(index)}
                        data-testid="nofy-ref-hit"
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          index === activeIndex ? "bg-accent/10" : "hover:bg-muted/50",
                        )}
                      >
                        <Icon className="size-4 shrink-0" style={{ color: meta.hue }} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">{hit.label}</span>
                          {hit.meta ? <span className="block truncate text-xs text-muted-foreground">{hit.meta}</span> : null}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">{meta.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Version history ──────────────────────────────────────────────────────────

export function VersionsDialog({
  open,
  onOpenChange,
  versions,
  isLoading,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: NofyVersionsResponse["versions"] | undefined;
  isLoading: boolean;
  onRestore: (versionId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="nofy-versions-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 text-accent" aria-hidden="true" />
            Version history
          </DialogTitle>
          <DialogDescription>
            Snapshots are taken while you write (roughly every few minutes). Restoring keeps a snapshot of the current state.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 min-h-24 overflow-y-auto" data-testid="nofy-versions-list">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-10 rounded-md" />)}
            </div>
          ) : !versions || versions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No versions yet — keep editing and snapshots will appear here.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {versions.map((version) => (
                <li
                  key={version.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
                  data-testid="nofy-version-row"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{version.title === "" ? "Untitled note" : version.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {nofyRelativeTime(version.savedAt)} · {version.wordCount} words
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1"
                    onClick={() => {
                      onRestore(version.id);
                      onOpenChange(false);
                    }}
                  >
                    <RotateCcw className="size-3" aria-hidden="true" />
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Emoji picker ─────────────────────────────────────────────────────────────

const EMOJIS = [
  "📝", "📈", "📉", "🧠", "💡", "📊", "🔬", "✅", "📚", "🎯", "⚠️", "🧭",
  "🔍", "🛠️", "🧾", "🗓️", "⚡", "🥇", "🌱", "🔥", "💎", "🎓", "🧩", "📦",
  "🪙", "💵", "🏦", "🛡️", "⏱️", "🧊", "🌊", "🌪️", "🚀", "🪤", "🕹️", "🧮",
];

export function IconPicker({
  icon,
  onPick,
  testid,
}: {
  icon: string | null;
  onPick: (emoji: string | null) => void;
  testid?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testid}
          aria-label="Change note icon"
          title="Change icon"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-2xl transition-colors hover:border-border hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {icon ?? "📝"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="grid grid-cols-6 gap-1" data-testid="nofy-icon-grid">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className={cn(
                "flex size-9 items-center justify-center rounded-md text-lg transition-colors hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
                emoji === icon && "bg-accent/15",
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 w-full text-xs text-muted-foreground"
          onClick={() => {
            onPick(null);
            setOpen(false);
          }}
        >
          <Check className="size-3" aria-hidden="true" />
          Remove icon
        </Button>
      </PopoverContent>
    </Popover>
  );
}
