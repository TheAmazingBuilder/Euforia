import type { Metadata } from "next";

import { CalendarModuleView } from "@/components/calendar/calendar-module-view";

export const metadata: Metadata = {
  title: "Calendar",
  description:
    "The trading calendar: P&L + discipline overlay on every day, planned days off excluded from the stats, eco-calendar blockers and semester targets — plus the economic calendar.",
};

export default function CalendarPage() {
  return <CalendarModuleView />;
}
