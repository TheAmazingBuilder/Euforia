"use client";

import * as React from "react";
import { GraduationCap, Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";

import { useTrades } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationCenter } from "@/components/layout/notification-center";
import { openCommandPalette } from "@/lib/hooks/use-command-palette";
import { ToGradeQueue } from "@/components/trades/to-grade-queue";
import { getPageTitle } from "@/lib/navigation";

type TopbarProps = {
  onMenuClick: () => void;
};

/**
 * Topbar: hamburger (mobile) + page title | to-grade badge,
 * account switcher, alerts bell (live unread count) + theme toggle.
 */
export function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const [queueOpen, setQueueOpen] = React.useState(false);

  // Live data (mocked in dev): "to grade" queue.
  const { data: toGradeData } = useTrades({ graded: "false" });
  const toGradeCount = toGradeData?.total ?? 0;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1.5 border-b border-border bg-background px-3 sm:px-4 lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" aria-hidden="true" />
      </Button>

      <span className="truncate font-heading text-lg font-semibold tracking-tight text-foreground">
        {title}
      </span>

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

        {/* "To grade" queue badge — hidden when the queue is empty */}
        {toGradeCount > 0 ? (
          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            aria-label={`${toGradeCount} trades to grade`}
            title={`${toGradeCount} trade${toGradeCount === 1 ? "" : "s"} to grade`}
            data-testid="to-grade-badge"
            className="mr-1 flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <GraduationCap className="size-3.5" aria-hidden="true" />
            <span className="font-mono tabular-nums">{toGradeCount}</span>
            <span className="hidden sm:inline">to grade</span>
          </button>
        ) : null}

        <AccountSwitcher />

        {/* Notification center — bell inbox with unread badge + mark-as-read */}
        <NotificationCenter />

        <ThemeToggle />
      </div>

      {/* Ungraded trades — grading opens the same Gate → Reveal flow */}
      <ToGradeQueue open={queueOpen} onOpenChange={setQueueOpen} />
    </header>
  );
}
