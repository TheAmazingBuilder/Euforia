import type { Metadata } from "next";

import { DisciplineView } from "@/components/discipline/discipline-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/discipline");

export const metadata: Metadata = {
  title: nav.label,
  description:
    "The Cosmoz Discipline Score, your rule engine with violation history and the Mistake Ledger.",
};

export default function DisciplinePage() {
  return <DisciplineView />;
}
