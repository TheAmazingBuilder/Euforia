import type { Metadata } from "next";

import { HelpView } from "@/components/help/help-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/help");

export const metadata: Metadata = {
  title: nav.label,
};

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {nav.label}
        </h1>
        <p className="text-sm text-muted-foreground">{nav.description}</p>
      </header>
      <HelpView />
    </div>
  );
}
