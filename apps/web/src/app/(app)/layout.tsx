import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";

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
  return <AppShell>{children}</AppShell>;
}
