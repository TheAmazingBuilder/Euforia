"use client";

import { Bell, GraduationCap, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { useAlerts, useTrades } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
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

  // Live data (mocked in dev): "to grade" queue + unread alerts.
  const { data: toGradeData } = useTrades({ graded: "false" });
  const { data: alertsData } = useAlerts();
  const toGradeCount = toGradeData?.total ?? 0;
  const unreadCount = alertsData?.unreadCount ?? 0;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1.5 border-b border-border bg-background/90 px-3 backdrop-blur-sm sm:px-4 lg:px-6">
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
        {/* "To grade" queue badge — hidden when the queue is empty */}
        {toGradeCount > 0 ? (
          <button
            type="button"
            onClick={() => toast.info("The grade queue arrives in a later phase.")}
            aria-label={`${toGradeCount} trades to grade`}
            title={`${toGradeCount} trade${toGradeCount === 1 ? "" : "s"} to grade`}
            className="mr-1 flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <GraduationCap className="size-3.5" aria-hidden="true" />
            <span className="font-mono tabular-nums">{toGradeCount}</span>
            <span className="hidden sm:inline">to grade</span>
          </button>
        ) : null}

        <AccountSwitcher />

        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications: ${unreadCount} unread`}
          title="Notifications"
          onClick={() => toast.info("Notifications arrive in a later phase.")}
        >
          <Bell className="size-4" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-primary font-mono text-[10px] font-semibold leading-none text-primary-foreground"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>

        <ThemeToggle />
      </div>
    </header>
  );
}
