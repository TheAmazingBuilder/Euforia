import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { AuthGate } from "@/components/auth/auth-gate";
import { DensitySync } from "@/components/settings/density-sync";

export const metadata: Metadata = {
  title: {
    template: "%s — Cosmoz",
    default: "Cosmoz",
  },
  description: "Cosmoz — the trading journal that coaches you.",
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Centralized protected-route mechanism (spec §34) — one gate for every
    // authenticated module; pages never implement their own auth checks.
    <AuthGate>
      <AppShell>
        {/* Applies the saved density preference app-wide (Settings → Appearance). */}
        <DensitySync />
        {children}
      </AppShell>
    </AuthGate>
  );
}
