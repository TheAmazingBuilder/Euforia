"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, GraduationCap, NotebookText, SquareKanban } from "lucide-react";

import { AcademyView } from "@/components/academy/academy-view";
import { NofyView } from "@/components/nofy/nofy-view";
import { EventsView } from "@/components/events/events-view";
import { TaskyView } from "@/components/tasky/tasky-view";
import { cn } from "@/lib/utils";

/**
 * ACADEMY section shell — four sibling modules share one route, switched by
 * the `?section=` param: Academy (courses · practice · progress…), Nofy
 * (knowledge workspace), Events (calendar) and Tasky (sprint board). The
 * sidebar keeps a single "Academy" entry; the modules are apparentés —
 * tabs of the section, never nested inside one another.
 */

const SECTIONS = [
  { id: "academy", label: "Academy", icon: GraduationCap },
  { id: "nofy", label: "Nofy", icon: NotebookText },
  { id: "events", label: "Events", icon: CalendarDays },
  { id: "tasky", label: "Tasky", icon: SquareKanban },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function AcademySection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get("section") ?? "academy";
  const active: SectionId = (SECTIONS.some((section) => section.id === raw)
    ? raw
    : "academy") as SectionId;

  const setSection = React.useCallback(
    (section: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (section === "academy") params.delete("section");
      else params.set("section", section);
      const query = params.toString();
      router.replace(`${pathname}${query === "" ? "" : `?${query}`}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5" data-testid="academy-section">
      {/* Module switcher — segmented control, one tab per sibling module */}
      <div
        role="tablist"
        aria-label="Academy modules"
        className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1 sm:inline-grid sm:w-auto sm:grid-cols-4"
        data-testid="academy-section-tabs"
      >
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const selected = id === active;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`academy-section-tab-${id}`}
              onClick={() => setSection(id)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-border bg-muted/60 text-foreground shadow-sm"
                  : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Active module — one at a time; each owns its internal ?params */}
      {active === "academy" ? <AcademyView /> : null}
      {active === "nofy" ? <NofyView /> : null}
      {active === "events" ? <EventsView /> : null}
      {active === "tasky" ? <TaskyView /> : null}
    </div>
  );
}
