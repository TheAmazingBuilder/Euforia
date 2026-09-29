"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EyeOff, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { CosmozLogo } from "@/components/layout/cosmoz-logo";
import { openGhostModal } from "@/lib/hooks/use-ghost-modal";
import {
  SIDEBAR_FIRST_ITEM,
  NAV_SECTIONS,
  getNavItem,
  type NavItem,
} from "@/lib/navigation";

type SidebarNavProps = {
  collapsed: boolean;
  /** Called after a navigation link is activated (used to close the mobile sheet). */
  onNavigate?: () => void;
};

/**
 * Shared navigation list used by the desktop sidebar AND the mobile sheet.
 * Capture entry points: the Trades module header (desktop), the mobile FAB
 * and the N hotkey — the sidebar itself stays pure navigation.
 * Active item: accent text on a subtle accent-tinted background.
 */
export function SidebarNav({
  collapsed,
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname();

  const linkBase =
    "flex h-8 items-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const linkExpanded = "px-2.5";
  const linkIdle = "text-muted-foreground hover:bg-muted hover:text-foreground";
  // Active = inverted ink block (the record's "selected row"); the cobalt
  // accent stays reserved for the primary action and interactive marks.
  const linkActive = "bg-foreground text-background";

  const renderItem = (item: NavItem) => {
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

      {/* Ghost capture (spec §3, entry point #3) — deliberately discreet */}
      <button
        type="button"
        onClick={openGhostModal}
        title="Setup seen, not taken (G)"
        aria-label="Setup seen, not taken"
        className={cn(
          linkBase,
          "text-muted-foreground/80 hover:bg-muted hover:text-foreground",
          collapsed ? "size-8 justify-center px-0" : "w-full px-2.5",
        )}
      >
        <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate text-xs">Setup seen, not taken</span>}
      </button>

      {/* Sectioned navigation — grouped, with the SYSTEM section last. */}
      {NAV_SECTIONS.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          {collapsed ? (
            <div
              aria-hidden="true"
              className="my-2 h-px w-6 self-center bg-border"
            />
          ) : (
            <div className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {section.title}
            </div>
          )}
          {section.hrefs.map(getNavItem).map(renderItem)}
        </div>
      ))}

      {/* Sign-out — discreet, inside the nav below the SYSTEM section.
          Destructive on hover (the only red affordance of the rail). */}
      {collapsed ? (
        <div aria-hidden="true" className="my-2 h-px w-6 self-center bg-border" />
      ) : (
        <div className="mt-2 h-px bg-border" aria-hidden="true" />
      )}
      <Link
        href="/login"
        onClick={onNavigate}
        data-testid="sidebar-logout"
        aria-label="Log out"
        title="Log out"
        className={cn(
          linkBase,
          "text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive",
          collapsed ? "justify-center px-0" : linkExpanded,
        )}
      >
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate">Log out</span>}
      </Link>
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
      <CosmozLogo className="size-7" />
      {!collapsed && (
        <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
          Cosmoz
        </span>
      )}
    </Link>
  );
}
