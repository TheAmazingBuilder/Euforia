"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";

/**
 * Active-session card (profile page) — who is signed in, since when, with
 * a real sign-out action (mirrors the sidebar one).
 */
export function SessionCard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  if (user === null) return null;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      toast.success("Signed out", { description: "Your session is closed — see you at the next session." });
      router.replace("/login");
    } catch {
      setSigningOut(false);
      toast.error("Could not sign out", { description: "Try again in a moment." });
    }
  };

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised/60 px-3.5 py-3"
      data-testid="session-card"
    >
      <div className="flex min-w-0 items-center gap-3">
        <ShieldCheck className="size-4 shrink-0 text-profit" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground" data-testid="session-email">
            {user.email}
          </p>
          <p className="text-xs text-muted-foreground">
            Signed in · member since{" "}
            {new Date(user.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleSignOut()}
        disabled={signingOut}
        data-testid="session-sign-out"
      >
        {signingOut ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <LogOut className="size-4" aria-hidden="true" />
        )}
        Sign out
      </Button>
    </div>
  );
}
