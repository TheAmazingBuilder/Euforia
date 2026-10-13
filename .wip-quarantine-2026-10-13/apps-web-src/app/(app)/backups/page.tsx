import type { Metadata } from "next";

import { BackupsView } from "@/components/security/backups-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/backups");

export const metadata: Metadata = {
  title: nav.label,
};

export default function BackupsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {nav.label}
        </h1>
        <p className="text-sm text-muted-foreground">{nav.description}</p>
      </header>
      <BackupsView />
    </div>
  );
}
