import type { Metadata } from "next";

import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Preferences center — profile, trading defaults, risk limits, journal rules, notifications, appearance, privacy and localization.",
};

/**
 * Settings — the full preferences module (10 categories). Server Component
 * shell; the interactive center is a client view fed by /me/preferences.
 */
export default function SettingsPage() {
  return <SettingsView />;
}
