"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  SIDEBAR_FIRST_ITEM,
  SIDEBAR_REST_ITEMS,
} from "@/lib/navigation";

type SidebarNavProps = {
  collapsed: boolean;
  /** Called after a navigation link is activated (used to close the mobile sheet). */
  onNavigate?: () => void;
  /** Extra callback for the placeholder New Trade action. */
  onNewTrade?: () => void;
};

/**
 * Shared navigation list used by the desktop sidebar AND the mobile sheet.
 * Desktop order: Dashboard, [New Trade accent button], then the other pages.
 * Active item: accent text on a subtle accent-tinted background.
 */
export function SidebarNav({
  collapsed,
  onNavigate,
  onNewTrade,
}: SidebarNavProps) {
  const pathname = usePathname();

  const linkBase =
    "flex h-8 items-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const linkExpanded = "px-2.5";
  const linkIdle = "text-muted-foreground hover:bg-muted hover:text-foreground";
  const linkActive = "bg-accent/10 text-accent";

  const renderItem = (
    item: (typeof SIDEBAR_REST_ITEMS)[number],
  ) => {
    const Icon = item.icon;
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        title={item.label}
        className={cn(
          linkBase,
          collapsed ? "justify-center px-0" : linkExpanded,
          active ? linkActive : linkIdle,
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  const first = SIDEBAR_FIRST_ITEM;

  return (
    <nav
      aria-label="Main navigation"
      className={cn("flex flex-col gap-1 p-2", collapsed && "items-center")}
    >
      {first ? renderItem(first) : null}

      {/* New Trade — distinct accent action (trade entry arrives in a later phase) */}
      <button
        type="button"
        onClick={onNewTrade}
        title="New Trade"
        aria-label="New Trade"
        className={cn(
          linkBase,
          "bg-accent text-accent-foreground hover:bg-accent-hover",
          collapsed ? "size-8 justify-center p-0" : "w-full px-2.5",
        )}
      >
        <Plus className="size-4 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate">New Trade</span>}
      </button>

      {SIDEBAR_REST_ITEMS.map(renderItem)}
    </nav>
  );
}

/** Brand mark shared by the desktop sidebar and the mobile sheet. */
export function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex h-14 shrink-0 items-center border-b border-border bg-surface",
        collapsed ? "justify-center px-0" : "gap-2.5 px-4",
      )}
      aria-label="Cosmoz — Dashboard"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent font-heading text-sm font-bold text-accent-foreground">
        C
      </span>
      {!collapsed && (
        <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
          Cosmoz
        </span>
      )}
    </Link>
  );
}
