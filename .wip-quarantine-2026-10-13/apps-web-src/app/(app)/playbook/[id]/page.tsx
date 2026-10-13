import type { Metadata } from "next";

import { StrategyDetailView } from "@/components/playbook/strategy-detail-view";

export const metadata: Metadata = {
  title: "Strategy detail",
  description:
    "The full record of one playbook setup: stat band, cumulative-R equity, R distribution, written rules and latest executions.",
};

export default async function StrategyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StrategyDetailView id={id} />;
}
