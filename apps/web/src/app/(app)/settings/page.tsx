import { Suspense } from "react";

import type { Metadata } from "next";

import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Preferences center — profile, trading defaults, risk limits, journal rules, notifications, appearance, privacy and localization.",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<> <div className="mx-auto h-40 w-full max-w-6xl animate-pulse rounded-xl bg-muted" /> </>}>
      <SettingsView />
    </Suspense>
  );
}
