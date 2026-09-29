import type { Metadata } from "next";
import { Suspense } from "react";

import { IntegrationsHubView } from "@/components/integrations/integrations-hub-view";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "The Integration Hub: brokers, exchanges, market data, economic feeds, news, charting and delivery channels — provider-agnostic and read-only.",
};

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" />}>
      <IntegrationsHubView />
    </Suspense>
  );
}
