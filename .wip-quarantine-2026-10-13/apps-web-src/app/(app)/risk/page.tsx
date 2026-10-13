import type { Metadata } from "next";

import { RiskCenterView } from "@/components/risk/risk-center-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/risk");

export const metadata: Metadata = {
  title: nav.label,
};

export default function RiskCenterPage() {
  return <RiskCenterView title={nav.label} description={nav.description} />;
}
