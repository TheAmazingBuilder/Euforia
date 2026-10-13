import type { Metadata } from "next";

import { ReplayNewForm } from "@/components/replay/replay-new-form";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/replay");

export const metadata: Metadata = {
  title: `New Replay — ${nav.label}`,
  description: nav.description,
};

/**
 * /replay/new — the New Replay configuration flow (REPLAY MASTER PROMPT
 * §14): market, timeframe, historical window and start point, plus the
 * optional context attachments (§35 — ownership enforced server-side).
 */
export default function ReplayNewPage() {
  return (
    <section aria-label="New Replay" className="flex flex-col">
      <header className="mb-6 space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {nav.label} — New Replay
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{nav.description}</p>
      </header>
      <ReplayNewForm />
    </section>
  );
}
