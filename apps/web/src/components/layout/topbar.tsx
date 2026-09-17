"use client";

import { Bell, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getPageTitle } from "@/lib/navigation";

type TopbarProps = {
  onMenuClick: () => void;
};

/** Topbar: hamburger (mobile) + current page title | account switcher + bell + theme toggle. */
export function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

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
        <AccountSwitcher />

        {/* Static notification placeholder — wired in a later phase */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications: 3 unread"
          title="Notifications"
          onClick={() => toast.info("Notifications arrive in a later phase.")}
        >
          <Bell className="size-4" aria-hidden="true" />
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-primary font-mono text-[10px] font-semibold leading-none text-primary-foreground"
          >
            3
          </span>
        </Button>

        <ThemeToggle />
      </div>
    </header>
  );
}
