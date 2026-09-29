import type { Metadata } from "next";

import { MonitoringView } from "@/components/system/monitoring-view";

export const metadata: Metadata = {
  title: "Monitoring",
  description:
    "System health: market feed, API layer, offline shell and session store status.",
};

export default function MonitoringPage() {
  return <MonitoringView />;
}
