"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { ATLAS_SECTIONS, ATLAS_SPINE, type AtlasSection } from "@/lib/analytics/atlas";

/**
 * The Atlas tree — the hub's unfolding registry. Thirteen numbered rows, one
 * per section, each wearing its register ink on a book-spine block (the
 * Academy's courses grammar). Clicking a row unfolds it in place: the long
 * description, then one link per subsection with its blurb, then the direct
 * door into the section page. `?open=<id>` (or a #<id> hash) opens one
 * section on arrival; Expand/Collapse all tame the whole tree.
 */

const SECTION_INK_TEXT = {
  accent: "text-accent",
  profit: "text-profit",
  warning: "text-warning",
  loss: "text-loss",
} as const;

const SECTION_INK_BORDER = {
  accent: "border-accent",
  profit: "border-profit",
  warning: "border-warning",
  loss: "border-loss",
} as const;

const SECTION_INK_SOFT = {
  accent: "bg-accent/5",
  profit: "bg-profit/5",
  warning: "bg-warning/5",
  loss: "bg-loss/5",
} as const;

function TreeRow({ section, open, onToggle }: { section: AtlasSection; open: boolean; onToggle: () => void }) {
  const regionId = `atlas-panel-${section.id}`;

  return (
    <li
      id={`atlas-${section.id}`}
      data-testid={`atlas-row-${section.id}`}
      className={cn(
        "overflow-hidden rounded-xl border bg-surface transition-colors",
        SECTION_INK_BORDER[section.ink],
        "border-l-2",
        open ? "border-border" : "border-border hover:border-accent/40",
        open && SECTION_INK_BORDER[section.ink],
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-3 text-left sm:gap-4 sm:px-4"
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-bold tracking-wider text-background",
            ATLAS_SPINE[section.ink],
          )}
        >
          {section.num}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-heading text-base font-semibold tracking-tight sm:text-lg">
              {section.title}
            </span>
            <span className={cn("font-mono text-[10px] uppercase tracking-[0.14em]", SECTION_INK_TEXT[section.ink])}>
              {section.subsections.length} views
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground sm:text-sm">
            {section.tagline}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-90")}
        />
      </button>

      <div id={regionId} hidden={!open} className={cn("border-t border-border/60", open && SECTION_INK_SOFT[section.ink])}>
        <div className="space-y-3 px-4 py-4 sm:px-5">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{section.description}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {section.subsections.map((sub, index) => (
              <li key={sub.id}>
                <Link
                  href={`/analytics/${section.id}#${sub.id}`}
                  data-testid={`atlas-link-${section.id}-${sub.id}`}
                  className="group flex items-start gap-2.5 rounded-lg border border-border/70 bg-surface px-3 py-2.5 transition-colors hover:border-accent/50 hover:bg-surface-raised"
                >
                  <span
                    aria-hidden="true"
                    className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", ATLAS_SPINE[section.ink])}
                  />
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {section.num}.{index + 1}
                      </span>
                      <span className="text-sm font-medium group-hover:text-accent">{sub.title}</span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{sub.blurb}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="pt-1">
            <Link
              href={`/analytics/${section.id}`}
              className={cn(
                "inline-flex items-center gap-1 text-sm font-medium transition-colors hover:underline",
                SECTION_INK_TEXT[section.ink],
              )}
            >
              Open {section.title} →
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}

export function AtlasTree() {
  // Deep-link: ?open=<id> or #<id> opens that section on arrival (lazy init
  // keeps setState out of the effect; the effect only scrolls the row in).
  const [openIds, setOpenIds] = React.useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const params = new URLSearchParams(window.location.search);
    const target = params.get("open") ?? window.location.hash.replace(/^#/, "").replace(/^atlas-/, "");
    return target && ATLAS_SECTIONS.some((section) => section.id === target)
      ? new Set([target])
      : new Set();
  });

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("open") ?? window.location.hash.replace(/^#/, "").replace(/^atlas-/, "");
    if (target && ATLAS_SECTIONS.some((section) => section.id === target)) {
      document.getElementById(`atlas-${target}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const toggle = React.useCallback((id: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = React.useCallback(() => {
    setOpenIds(new Set(ATLAS_SECTIONS.map((section) => section.id)));
  }, []);

  const collapseAll = React.useCallback(() => {
    setOpenIds(new Set());
  }, []);

  return (
    <section data-testid="atlas-tree" aria-label="Analytics atlas — thirteen sections" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold tracking-tight sm:text-xl">The atlas</h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={expandAll}
            data-testid="atlas-expand-all"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
          >
            <ChevronsUpDown className="size-3.5" aria-hidden="true" />
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            data-testid="atlas-collapse-all"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
          >
            <ChevronsDownUp className="size-3.5" aria-hidden="true" />
            Collapse all
          </button>
        </div>
      </div>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Thirteen sections, one per lens a serious journal deserves. Unfold a row to see what it measures,
        or walk straight into the section page — every view carries its sample, every color is a sign.
      </p>
      <ul className="space-y-2.5">
        {ATLAS_SECTIONS.map((section) => (
          <TreeRow
            key={section.id}
            section={section}
            open={openIds.has(section.id)}
            onToggle={() => toggle(section.id)}
          />
        ))}
      </ul>
    </section>
  );
}
