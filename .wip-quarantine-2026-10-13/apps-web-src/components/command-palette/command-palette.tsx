"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowUpRight,
  FileUp,
  Plus,
  type LucideIcon,
} from "lucide-react";

import { formatR } from "@cosmoz/shared";
import type { Trade } from "@cosmoz/shared";

import { useInstruments, useTrades } from "@/lib/api/queries";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  closeCommandPalette,
  toggleCommandPalette,
  useCommandPaletteState,
} from "@/lib/hooks/use-command-palette";
import { openImportDialog } from "@/lib/hooks/use-import-dialog";
import { openTradeModal } from "@/lib/hooks/use-trade-modal";
import { SIDEBAR_ITEMS } from "@/lib/navigation";
import { setThemeWithFade, THEME_OPTIONS } from "@/lib/utils/theme";
import { cn } from "@/lib/utils";

/** The palette mirrors the sidebar taxonomy — icons come from the nav def. */

interface ActionCommand {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  run: () => void;
}

interface TradeCommand {
  id: string;
  symbol: string;
  rLabel: string;
  rValue: number;
}

/**
 * ⌘K / Ctrl+K command palette (feature proposal #8). One global hotkey,
 * four command groups: actions (capture, import), navigation (mirrors the
 * sidebar), recent closed trades and the three palettes. Selection always
 * closes the palette; navigation uses the Next router.
 */
export function CommandPalette() {
  const { open } = useCommandPaletteState();
  const router = useRouter();
  const { setTheme } = useTheme();

  // Recent closed trades for the "Recent trades" group (symbol resolved
  // through the instrument catalog, same as the trades table).
  const { data: tradesData } = useTrades();
  const { data: instrumentsData } = useInstruments();
  const recentTrades: TradeCommand[] = React.useMemo(() => {
    const trades: Trade[] = tradesData?.trades ?? [];
    const symbolById = new Map(
      (instrumentsData?.instruments ?? []).map((instrument) => [instrument.id, instrument.symbol]),
    );
    return trades
      .filter((trade) => trade.status === "CLOSED" && trade.rMultiple !== null)
      .slice(0, 5)
      .map((trade) => ({
        id: trade.id,
        symbol: symbolById.get(trade.instrumentId) ?? "—",
        rLabel: formatR(Number(trade.rMultiple)),
        rValue: Number(trade.rMultiple),
      }));
  }, [tradesData, instrumentsData]);

  // Global ⌘K / Ctrl+K hotkey.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const runAndClose = (run: () => void) => () => {
    closeCommandPalette();
    run();
  };

  const navigate = (href: string) => runAndClose(() => router.push(href));

  const actions: ActionCommand[] = [
    {
      id: "new-trade",
      label: "Log a new trade",
      icon: Plus,
      shortcut: "N",
      run: () => openTradeModal(),
    },
    {
      id: "import-csv",
      label: "Import broker CSV",
      icon: FileUp,
      run: () => openImportDialog(),
    },
  ];

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeCommandPalette();
      }}
    >
      <CommandInput placeholder="Search pages, actions and trades…" />

      <CommandList data-testid="command-palette-list">
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          {actions.map((action) => (
            <CommandItem
              key={action.id}
              value={`action ${action.label}`}
              onSelect={runAndClose(action.run)}
              data-testid={`command-${action.id}`}
            >
              <action.icon aria-hidden="true" />
              <span>{action.label}</span>
              {action.shortcut ? (
                <CommandShortcut>{action.shortcut}</CommandShortcut>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          {SIDEBAR_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              value={`go to ${item.label}`}
              onSelect={navigate(item.href)}
              data-testid={`command-nav${item.href === "/" ? "-dashboard" : item.href.replaceAll("/", "-")}`}
            >
              <item.icon aria-hidden="true" />
              <span>{item.label}</span>
              <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground/60" />
            </CommandItem>
          ))}
        </CommandGroup>

        {recentTrades.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent closed trades">
              {recentTrades.map((trade) => (
                <CommandItem
                  key={trade.id}
                  value={`trade ${trade.symbol} ${trade.rLabel}`}
                  onSelect={navigate("/trades")}
                >
                  <span className="font-mono text-[13px] font-medium text-foreground">
                    {trade.symbol}
                  </span>
                  <span
                    className={cn(
                      "ml-auto font-mono text-xs tabular-nums",
                      trade.rValue >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {trade.rLabel}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        <CommandSeparator />

        <CommandGroup heading="Theme">
          {THEME_OPTIONS.map((option) => (
            <CommandItem
              key={option.value}
              value={`theme ${option.label}`}
              onSelect={runAndClose(() => setThemeWithFade(setTheme, option.value))}
            >
              <span
                aria-hidden="true"
                className={`size-3 shrink-0 rounded-full ${option.dotClass}`}
              />
              <span>
                Switch to <span className="text-foreground">{option.label}</span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>

      {/* Keyboard hints footer — quiet, mono */}
      <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        <span className="font-mono tracking-wider">↑↓ navigate</span>
        <span className="font-mono tracking-wider">↵ select</span>
        <span className="font-mono tracking-wider">esc close</span>
        <span className="ml-auto font-mono tracking-wider">⌘K</span>
      </div>
    </CommandDialog>
  );
}
