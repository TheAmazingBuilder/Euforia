"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, GraduationCap, Menu, Search } from "lucide-react";

import { useTrades } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationCenter } from "@/components/layout/notification-center";
import { SessionLiveBadge } from "@/components/layout/session-live-badge";
import { UserAvatar } from "@/components/layout/user-avatar";
import { openCommandPalette } from "@/lib/hooks/use-command-palette";
import { ToGradeQueue } from "@/components/trades/to-grade-queue";
import { getBreadcrumb } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type TopbarProps = {
  onMenuClick: () => void;
};

/**
 * Topbar: hamburger (mobile) + breadcrumb | session-live badge, to-grade
 * queue, account switcher, alerts bell, one-click theme toggle, avatar.
 * Sticky with an elevation shadow once the page scrolls.
 */
export function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const crumbs = getBreadcrumb(pathname);
  const [queueOpen, setQueueOpen] = React.useState(false);

  // Elevation shadow — flips on only after real scroll (threshold 6px).
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Live data (mocked in dev): "to grade" queue.
  const { data: toGradeData } = useTrades({ graded: "false" });
  const toGradeCount = toGradeData?.total ?? 0;

  return (
    <header
      data-testid="topbar"
      data-scrolled={scrolled ? "true" : "false"}
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1.5 border-b border-border bg-background px-3 transition-shadow duration-300 sm:px-4 lg:px-6",
        scrolled
          ? "shadow-[0_4px_16px_-6px_rgba(0,0,0,0.35)]"
          : "shadow-none",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" aria-hidden="true" />
      </Button>

      {/* Breadcrumb — app root first, then the active page */}
      <nav aria-label="Breadcrumb" data-testid="breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-0.5 text-sm">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <li key={crumb.href} className="flex min-w-0 items-center gap-0.5">
                {index > 0 ? (
                  <ChevronRight
                    className="size-3.5 shrink-0 text-muted-foreground/60"
                    aria-hidden="true"
                  />
                ) : null}
                {isLast ? (
                  <span
                    aria-current="page"
                    className="truncate font-heading text-base font-semibold tracking-tight text-foreground sm:text-lg"
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="truncate text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="ml-auto flex items-center gap-1">
        {/* Command palette trigger — search affordance with ⌘K hint */}
        <button
          type="button"
          onClick={openCommandPalette}
          data-testid="command-palette-trigger"
          aria-label="Open command palette (Command K)"
          title="Search everything (⌘K)"
          className="mr-1 flex h-8 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-muted-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Search className="size-3.5" aria-hidden="true" />
          <span className="hidden text-xs md:inline">Search…</span>
          <kbd className="hidden rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px] font-semibold md:inline">
            ⌘K
          </kbd>
        </button>

        {/* Pulsing badge while positions are open */}
        <SessionLiveBadge />

        {/* "To grade" queue badge — hidden when the queue is empty */}
        {toGradeCount > 0 ? (
          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            aria-label={`${toGradeCount} trades to grade`}
            title={`${toGradeCount} trade${toGradeCount === 1 ? "" : "s"} to grade`}
            data-testid="to-grade-badge"
            className="mr-1 hidden items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:flex"
          >
            <GraduationCap className="size-3.5" aria-hidden="true" />
            <span className="font-mono tabular-nums">{toGradeCount}</span>
            <span className="hidden md:inline">to grade</span>
          </button>
        ) : null}

        <div className="hidden sm:block">
          <AccountSwitcher />
        </div>

        {/* Notification center — bell inbox with unread badge + mark-as-read */}
        <NotificationCenter />

        <ThemeToggle />

        {/* Avatar → /profile (direct edit) */}
        <UserAvatar className="ml-0.5" />
      </div>

      {/* Ungraded trades — grading opens the same Gate → Reveal flow */}
      <ToGradeQueue open={queueOpen} onOpenChange={setQueueOpen} />
    </header>
  );
}
