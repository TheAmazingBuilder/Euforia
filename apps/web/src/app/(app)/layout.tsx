import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
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
    <AppShell>
      {/* Applies the saved density preference app-wide (Settings → Appearance). */}
      <DensitySync />
      {children}
    </AppShell>
  );
}
