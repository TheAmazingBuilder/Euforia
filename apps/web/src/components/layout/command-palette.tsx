"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowRight,
  CircleHelp,
  Droplet,
  Ghost,
  Moon,
  Plus,
  Search,
  Sun,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SIDEBAR_ITEMS } from "@/lib/navigation";
import { openGhostModal } from "@/lib/hooks/use-ghost-modal";
import { openTradeModal } from "@/lib/hooks/use-trade-modal";
import { openShortcutsOverlay } from "@/lib/hooks/use-shortcuts-overlay";
import {
  closeCommandPalette,
  openCommandPalette,
  useCommandPaletteState,
} from "@/lib/hooks/use-command-palette";

/**
 * Command palette (⌘K / Ctrl+K) — search across navigation, quick actions
 * and themes. Custom filtering + listbox (no cmdk dependency): the same
 * no-library approach as the capture hotkeys, with full a11y semantics.
 */

type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  keywords: string;
  icon: LucideIcon;
  group: "Actions" | "Navigate" | "Theme";
  run: () => void;
};

const GROUP_ORDER: PaletteItem["group"][] = ["Actions", "Navigate", "Theme"];

/** Lowercase substring match across label + keywords (AND over tokens). */
function matchItem(item: PaletteItem, query: string): boolean {
  if (query === "") return true;
  const haystack = `${item.label} ${item.keywords}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((token) => haystack.includes(token));
}

export function CommandPalette() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { open } = useCommandPaletteState();
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // ── Item registry ────────────────────────────────────────────────────────
  const items = React.useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      {
        id: "action-new-trade",
        label: "New trade",
        hint: "N",
        keywords: "capture entry log buy sell record position",
        icon: Plus,
        group: "Actions",
        run: () => openTradeModal(),
      },
      {
        id: "action-ghost",
        label: "Log ghost trade",
        hint: "G",
        keywords: "setup seen not taken skipped observation",
        icon: Ghost,
        group: "Actions",
        run: () => openGhostModal(),
      },
      {
        id: "action-shortcuts",
        label: "Keyboard shortcuts",
        hint: "?",
        keywords: "hotkeys help overlay keys",
        icon: CircleHelp,
        group: "Actions",
        run: () => openShortcutsOverlay(),
      },
    ];

    const navItems: PaletteItem[] = SIDEBAR_ITEMS.map((nav) => ({
      id: `nav-${nav.href}`,
      label: nav.label,
      keywords: nav.description,
      icon: nav.icon,
      group: "Navigate",
      run: () => router.push(nav.href),
    }));

    const themes: PaletteItem[] = [
      {
        id: "theme-dark-blue",
        label: "Theme: Dark blue",
        keywords: "dark blue default night ocean",
        icon: Droplet,
        group: "Theme",
        run: () => setTheme("dark-blue"),
      },
      {
        id: "theme-dark",
        label: "Theme: Dark",
        keywords: "dark night pure black",
        icon: Moon,
        group: "Theme",
        run: () => setTheme("dark"),
      },
      {
        id: "theme-light",
        label: "Theme: Light",
        keywords: "light day white bright",
        icon: Sun,
        group: "Theme",
        run: () => setTheme("light"),
      },
    ];

    return [...actions, ...navItems, ...themes];
  }, [router, setTheme]);

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = React.useMemo(
    () => items.filter((item) => matchItem(item, query.trim())),
    [items, query],
  );

  // Group preserving canonical order.
  const grouped = React.useMemo(() => {
    const map = new Map<PaletteItem["group"], PaletteItem[]>();
    for (const item of filtered) {
      const bucket = map.get(item.group);
      if (bucket) bucket.push(item);
      else map.set(item.group, [item]);
    }
    return GROUP_ORDER.filter((group) => map.has(group)).map(
      (group) => ({ group, items: map.get(group) ?? [] }),
    );
  }, [filtered]);

  // Flat list mirrors the rendered order (groups → items) for keyboard nav.
  const flat = React.useMemo(
    () => grouped.flatMap((section) => section.items),
    [grouped],
  );

  // Derived clamp — keeps the selection in bounds when the list shrinks,
  // without a setState-in-effect pass.
  const activeClamped = Math.min(activeIndex, Math.max(flat.length - 1, 0));

  // Reset query + selection whenever the palette opens. Deferred to a
  // timeout so the reset runs after the dialog mounts (no cascading render,
  // and radix autofocus has already settled).
  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setQuery("");
      setActiveIndex(0);
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Scroll the active item into view.
  React.useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [activeClamped]);

  // ── Global hotkey: ⌘K / Ctrl+K (works while typing — convention) ────────
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) closeCommandPalette();
        else openCommandPalette();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const runItem = React.useCallback((item: PaletteItem) => {
    closeCommandPalette();
    // Let the dialog unmount before navigation / modal opens.
    window.setTimeout(() => item.run(), 0);
  }, []);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(flat.length === 0 ? 0 : (activeClamped + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        flat.length === 0 ? 0 : (activeClamped - 1 + flat.length) % flat.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flat[activeClamped];
      if (item) runItem(item);
    }
  };

  let renderIndex = -1;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeCommandPalette();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search actions, pages and themes. Use arrow keys and Enter to run.
        </DialogDescription>

        {/* Search row */}
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search actions, pages, themes…"
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          className="max-h-[min(22rem,50dvh)] overflow-y-auto overscroll-contain p-2"
        >
          {flat.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No results for “{query.trim()}”
            </p>
          ) : (
            grouped.map((section) => (
              <div key={section.group} className="mb-1 last:mb-0">
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {section.group}
                </p>
                <ul>
                  {section.items.map((item) => {
                    renderIndex += 1;
                    const index = renderIndex;
                    const active = index === activeClamped;
                    return (
                      <li key={item.id} role="option" aria-selected={active}>
                        <button
                          type="button"
                          data-active={active}
                          onMouseMove={() => setActiveIndex(index)}
                          onClick={() => runItem(item)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-colors",
                            active
                              ? "bg-accent/10 text-accent"
                              : "text-foreground hover:bg-surface",
                          )}
                        >
                          <item.icon
                            className={cn(
                              "size-4 shrink-0",
                              active ? "text-accent" : "text-muted-foreground",
                            )}
                            aria-hidden="true"
                          />
                          <span className="flex-1 truncate font-medium">{item.label}</span>
                          {item.hint ? (
                            <kbd className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                              {item.hint}
                            </kbd>
                          ) : null}
                          {active ? (
                            <ArrowRight
                              className="size-3.5 shrink-0 text-accent"
                              aria-hidden="true"
                            />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-border bg-surface/50 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
              ↑↓
            </kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
              ↵
            </kbd>
            run
          </span>
          <span className="ml-auto hidden sm:inline">Cosmoz command palette</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
