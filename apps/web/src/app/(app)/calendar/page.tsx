import type { Metadata } from "next";

import { EcoCalendarView } from "@/components/calendar/eco-calendar";

export const metadata: Metadata = {
  title: "Calendar",
  description:
    "The economic calendar: macro releases with impact tiers, beat/miss values and the day's high-impact risk windows.",
};

export default function CalendarPage() {
  return <EcoCalendarView />;
}
