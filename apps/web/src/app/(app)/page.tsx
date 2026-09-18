import type { Metadata } from "next";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/");

export const metadata: Metadata = {
  title: nav.label,
};

export default function DashboardPage() {
  return <DashboardView title={nav.label} description={nav.description} />;
}
