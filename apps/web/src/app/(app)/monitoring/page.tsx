import { Suspense } from "react";

import type { Metadata } from "next";

import { MonitoringView } from "@/components/monitoring/monitoring-view";

export const metadata: Metadata = {
  title: "Monitoring",
  description:
    "Professional observability center: system health, market data freshness, broker connections, WebSockets, API, jobs and audit events.",
};

export default function MonitoringPage() {
  return (
    <Suspense fallback={<> <div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" /> </>}>
      <MonitoringView />
    </Suspense>
  );
}
