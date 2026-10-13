"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleHelp, LogOut, Settings, UserRound } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** First letters of the first two words, uppercase ("Alex Moreau" → "AM"). */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/**
 * Active-user menu — the far-right topbar affordance. The AVATAR is its own
 * link straight into profile edit mode (/profile?focus=name); the name +
 * chevron opens the identity dropdown (name + email) with the account
 * destinations (Profile, Settings, Help) and the destructive Log out action.
 * The identity comes from the auth provider — the same session the gates enforce.
 */
export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  // The topbar only renders inside the authenticated tree — the null guard
  // is a hydration-safety net for the very first optimistic paint.
  if (user === null) return null;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      toast.success("Signed out", {
        description: "Your session is closed — see you at the next session.",
      });
      router.replace("/login");
    } catch {
      setSigningOut(false);
      toast.error("Could not sign out", { description: "Try again in a moment." });
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      {/* Avatar → profile in direct edit mode (one click, no menu hop). */}
      <Link
        href="/profile?focus=name"
        aria-label={`Edit profile — ${user.name}`}
        title="Edit your profile"
        data-testid="user-avatar-link"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-chart-2 text-[11px] font-semibold text-accent-foreground ring-1 ring-border transition-[box-shadow,transform] hover:ring-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {initialsOf(user.name)}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 px-1.5 pr-1.5"
            aria-label="Open the user menu"
            data-testid="user-menu-trigger"
          >
            <span className="hidden max-w-28 truncate text-sm font-medium md:inline">
              {user.name}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60" data-testid="user-menu-content">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5 py-0.5">
            <span className="truncate text-sm font-semibold" data-testid="user-menu-name">
              {user.name}
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground" data-testid="user-menu-email">
              {user.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild data-testid="user-menu-profile">
            <Link href="/profile">
              <UserRound aria-hidden="true" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild data-testid="user-menu-settings">
            <Link href="/settings">
              <Settings aria-hidden="true" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild data-testid="user-menu-help">
            <Link href="/help">
              <CircleHelp aria-hidden="true" />
              Help &amp; FAQ
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          data-testid="user-menu-sign-out"
        >
          <LogOut aria-hidden="true" />
          {signingOut ? "Signing out…" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
