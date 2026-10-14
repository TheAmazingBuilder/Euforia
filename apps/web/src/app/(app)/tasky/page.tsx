import type { Metadata } from "next";

import { TaskyView } from "@/components/tasky/tasky-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/tasky");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /tasky — Tasky (Academy section, independent module). The trading kanban:
 * columns flow horizontally (left → right) inside a scrollable board, cards
 * move with the cursor or a finger, and the board persists locally. The
 * header states the board's role in one short line, per product spec.
 */
export default function TaskyPage() {
  return (
    <section aria-label={nav.label} className="flex flex-col">
      <header className="mb-4 sm:mb-5">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">Tasky Board</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Plan, track and close the work around your trading edge.
        </p>
      </header>
      <TaskyView />
    </section>
  );
}
