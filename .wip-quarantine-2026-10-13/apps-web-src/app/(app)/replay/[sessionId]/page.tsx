import type { Metadata } from "next";

import { ReplayWorkspace } from "@/components/replay/replay-workspace";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/replay");

export const metadata: Metadata = {
  title: `Replay — ${nav.label}`,
  description: nav.description,
};

/**
 * /replay/[sessionId] — the replay workspace (REPLAY MASTER PROMPT §44):
 * chart center, context panel, transport + timeline and the simulated
 * activity ledger. Resumes from the persisted checkpoint when the session
 * is IN_PROGRESS (§33).
 */
export default async function ReplayWorkspacePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <section aria-label="Replay workspace" className="flex flex-col">
      <ReplayWorkspace sessionId={sessionId} />
    </section>
  );
}
