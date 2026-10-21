import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { AuthGate } from "@/components/auth/auth-gate";
import { FirstRunOnboarding } from "@/components/onboarding/onboarding-overlay";
import { DensitySync } from "@/components/settings/density-sync";

export const metadata: Metadata = {
  title: {
    template: "%s - Euforia",
    default: "Euforia",
  },
  description: "Euforia - the trading journal that coaches you.",
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Centralized protected-route mechanism (spec §34) - one gate for every
    // authenticated module; pages never implement their own auth checks.
    <AuthGate>
      <AppShell>
        {/* Applies the saved density preference app-wide (Settings → Appearance). */}
        <DensitySync />
        {children}
      </AppShell>
      {/* First-run experience - eligibility is decided INSIDE (identity +
          persisted preferences state), so it can never render for existing
          users while state loads, and never blocks the shell when absent. */}
      <FirstRunOnboarding />
    </AuthGate>
  );
}
