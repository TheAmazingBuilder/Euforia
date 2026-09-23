import type { Metadata } from "next";

import { CoachView } from "@/components/coach/coach-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/coach");

export const metadata: Metadata = {
  title: nav.label,
  description:
    "Your AI trading coach, grounded in your journal: ask about patterns, leaks, discipline and strategy edges with your real numbers.",
};

export default function CoachPage() {
  return <CoachView />;
}
