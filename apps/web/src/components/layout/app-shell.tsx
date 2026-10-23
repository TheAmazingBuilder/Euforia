"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarBrand, SidebarNav } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { TradeModalHost } from "@/components/trades/trade-modal-host";
import { JudgmentFlowModal } from "@/components/trades/judgment-flow-modal";
import {
  collapseSidebarForRoute,
  isSidebarCollapsed,
  restoreSidebarAfterRoute,
  subscribeSidebar,
} from "@/lib/utils/sidebar";

/**
 * Application shell: fixed desktop sidebar (240px <-> 72px, persisted —
 * toggled from the header icon, not from inside the rail), sticky topbar,
 * mobile sheet navigation and the mobile bottom nav + FAB. Server pages are
 * rendered through `children`, so they stay Server Components.
 *
 * The Oryon workspace (/oryon) is full-bleed: entering the route collapses
 * the desktop sidebar to icon mode automatically (route-driven, so sidebar
 * clicks, ⌘K palette and deep links all behave the same). Leaving the route
 * restores the previous width unless the user toggled it manually.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = React.useSyncExternalStore(
    subscribeSidebar,
    isSidebarCollapsed,
    // Server + hydration snapshot: expanded.
    () => false,
  );
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    if (pathname === "/oryon") {
      collapseSidebarForRoute();
    } else {
      restoreSidebarAfterRoute();
    }
  }, [pathname]);

  const closeSheet = React.useCallback(() => setSheetOpen(false), []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar — the collapse affordance lives in the Topbar. */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-surface transition-[width] duration-200 ease-in-out lg:flex ${
          collapsed ? "w-[72px]" : "w-[240px]"
        }`}
      >
        <SidebarBrand collapsed={collapsed} />

        <div className="flex-1 overflow-y-auto">
          <SidebarNav collapsed={collapsed} />
        </div>
      </aside>

      {/* Main column */}
      <div
        className={`flex min-h-screen flex-col transition-[padding] duration-200 ease-in-out ${
          collapsed ? "lg:pl-[72px]" : "lg:pl-[240px]"
        }`}
      >
        <Topbar onMenuClick={() => setSheetOpen(true)} />
        <main className="flex-1 px-4 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation + FAB */}
      <BottomNav />

      {/* Command palette — ⌘K / Ctrl+K, topbar search button */}
      <CommandPalette />

      {/* Global capture modal + "?" shortcuts overlay (N / ? hotkeys) */}
      <TradeModalHost />

      {/* Acts 2 & 3 - the Gate → Reveal → Reflect flow (opens after a save
          or from the to-grade queue) */}
      <JudgmentFlowModal />

      {/* Mobile navigation sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[264px] gap-0 bg-surface p-0 sm:max-w-[264px]"
        >
          <SheetHeader className="p-0">
            <SheetTitle asChild>
              <div>
                <SidebarBrand collapsed={false} />
              </div>
            </SheetTitle>
            <SheetDescription className="sr-only">
              Euforia main navigation
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <SidebarNav collapsed={false} onNavigate={closeSheet} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
