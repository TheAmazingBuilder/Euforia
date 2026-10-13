import type { Metadata } from "next";

import { PeriodReportView } from "@/components/reports/report-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/reports");

export const metadata: Metadata = {
  title: nav.label,
};

export default function ReportsPage() {
  return <PeriodReportView />;
}
