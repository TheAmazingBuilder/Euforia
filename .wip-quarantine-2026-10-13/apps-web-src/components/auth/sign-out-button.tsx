"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clearSession } from "@/lib/auth/session";

/**
 * Clears the mock session and lands on the split sign-in screen.
 * replace() — and NO router.refresh(): in Next 16 it resolves against the
 * CURRENT route and cancels the pending soft navigation (the sign-out used
 * to silently stay on the same page).
 */
export function SignOutButton() {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      onClick={() => {
        clearSession();
        toast.success("Signed out", { description: "See you next session." });
        router.replace("/login");
      }}
      data-testid="settings-signout"
    >
      <LogOut className="size-4" aria-hidden="true" />
      Sign out
    </Button>
  );
}
