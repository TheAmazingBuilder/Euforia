import type { Metadata } from "next";

import { EventsView } from "@/components/events/events-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/events");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /events - Events (Academy section, independent module). The trading
 * calendar: inner left panel (account, mini month, calendar groups acting
 * as filters), month grid with colored pills, sort menu, new-event and
 * new-calendar dialogs, and touch-first drag of events between days.
 */
export default function EventsPage() {
  return (
    <section aria-label={nav.label} className="flex flex-col">
      <header className="mb-4 sm:mb-5">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">{nav.label}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Sessions, economic events and personal deadlines - across the calendars you define.
        </p>
      </header>
      <EventsView />
    </section>
  );
}
