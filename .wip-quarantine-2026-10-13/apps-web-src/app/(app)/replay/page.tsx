import type { Metadata } from "next";

import { ReplayView } from "@/components/replay/replay-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/replay");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /replay — the Replay module landing (REPLAY MASTER PROMPT §12/§13):
 * hero, real-data simulated metrics and the session list. Replay is a
 * first-class Trading module — SIMULATED by construction, never mixed
 * with the live journal.
 */
export default function ReplayPage() {
  return (
    <section aria-label="Replay" className="flex flex-col">
      <header className="mb-6 space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {nav.label}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{nav.description}</p>
      </header>
      <ReplayView />
    </section>
  );
}
