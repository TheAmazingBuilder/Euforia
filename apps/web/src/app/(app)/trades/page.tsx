import type { Metadata } from "next";

import { TradesTable } from "@/components/trades/trades-table";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/trades");

export const metadata: Metadata = {
  title: nav.label,
};

export default function TradesPage() {
  return <TradesTable />;
}
