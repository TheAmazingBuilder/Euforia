"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/components/auth/auth-provider";
import { openTradeModal } from "@/lib/hooks/use-trade-modal";
import { SIDEBAR_ITEMS, type NavItem } from "@/lib/navigation";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const PRIMARY_HREFS = ["/accounts", "/", "/trades", "/oryon", "/analytics", "/calendar"] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function useDesktopNavigationItems() {
  const { hasRole } = usePermissions();
  const visible = SIDEBAR_ITEMS.filter((item) => item.href !== "/monitoring" || hasRole("ADMIN"));
  const primary = PRIMARY_HREFS.map((href) => visible.find((item) => item.href === href)).filter(
    (item): item is NavItem => item !== undefined,
  );
  const secondary = visible.filter((item) => !PRIMARY_HREFS.includes(item.href as (typeof PRIMARY_HREFS)[number]));
  return { primary, secondary };
}

function MoreMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const { dict } = useI18n();
  const active = items.some((item) => isActive(pathname, item.href));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More navigation pages"
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          More <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-60 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href} className="flex items-center gap-2">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{dict.nav.items[item.href] ?? item.label}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DesktopTopNavigation() {
  const pathname = usePathname();
  const { dict } = useI18n();
  const { primary, secondary } = useDesktopNavigationItems();

  return (
    <nav aria-label="Desktop page navigation" data-testid="desktop-top-navigation"
      className="sticky top-14 z-20 hidden h-12 shrink-0 items-center border-b border-border bg-surface px-4 lg:flex">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-1">
        {primary.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}>
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>{dict.nav.items[item.href] ?? item.label}</span>
            </Link>
          );
        })}
        <div className="ml-auto"><MoreMenu items={secondary} pathname={pathname} /></div>
      </div>
    </nav>
  );
}

export function DesktopBottomDock() {
  const pathname = usePathname();
  const { dict } = useI18n();
  const { primary, secondary } = useDesktopNavigationItems();
  const left = primary.slice(0, 3);
  const right = primary.slice(3);

  const renderLink = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(pathname, item.href);
    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-w-20 flex-col items-center justify-center gap-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}>
        <Icon className="size-4" aria-hidden="true" />
        <span>{dict.nav.items[item.href] ?? item.label}</span>
      </Link>
    );
  };

  return (
    <nav aria-label="Desktop bottom dock" data-testid="desktop-bottom-dock"
      className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-border bg-surface/95 pb-2 pt-1 shadow-[0_-8px_24px_-18px_rgba(0,0,0,0.45)] backdrop-blur lg:block">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-center gap-2 px-4">
        <div className="flex items-center gap-2">{left.map(renderLink)}</div>
        <Button type="button" size="icon" aria-label="New Trade" title="New Trade"
          className="mx-3 size-11 shrink-0 rounded-full bg-action-success text-action-success-foreground hover:bg-action-success-hover"
          onClick={() => openTradeModal()} data-testid="desktop-dock-new-trade">
          <Plus className="size-5" aria-hidden="true" />
        </Button>
        <div className="flex items-center gap-2">{right.map(renderLink)}</div>
        <MoreMenu items={secondary} pathname={pathname} />
      </div>
    </nav>
  );
}
