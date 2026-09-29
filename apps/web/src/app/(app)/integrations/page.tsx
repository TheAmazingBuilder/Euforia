import type { Metadata } from "next";

import { IntegrationsView } from "@/components/system/integrations-view";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Broker and data-provider hub — Deriv, MT5, cTrader, Binance — scoped and read-only.",
};

export default function IntegrationsPage() {
  return <IntegrationsView />;
}
