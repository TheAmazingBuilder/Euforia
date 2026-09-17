"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { BOTTOM_NAV_ITEMS } from "@/lib/navigation";
import { openTradeModal } from "@/lib/hooks/use-trade-modal";
import { cn } from "@/lib/utils";

function NewTradeFab() {
  return (
    <button
      type="button"
      onClick={() => openTradeModal()}
      aria-label="New Trade"
      title="New Trade"
      className="grid size-12 -translate-y-4 place-items-center rounded-full border border-border bg-accent text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Plus className="size-5" aria-hidden="true" />
    </button>
  );
}

/**
 * Bottom navigation — mobile only (hidden from lg up).
 * Home | Trades | [+ FAB] | Playbook | Stats, with active states mirroring the sidebar.
 */
export function BottomNav() {
  const pathname = usePathname();
  const left = BOTTOM_NAV_ITEMS.slice(0, 2);
  const right = BOTTOM_NAV_ITEMS.slice(2);

  const renderItem = (item: (typeof BOTTOM_NAV_ITEMS)[number]) => {
    const Icon = item.icon;
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full flex-col items-center gap-0.5 rounded-md py-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "text-accent" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
        <div className="flex flex-1 items-stretch gap-1">{left.map(renderItem)}</div>
        <div className="flex w-16 items-start justify-center">
          <NewTradeFab />
        </div>
        <div className="flex flex-1 items-stretch gap-1">{right.map(renderItem)}</div>
      </div>
    </nav>
  );
}
