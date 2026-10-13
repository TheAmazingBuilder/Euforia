import type { Metadata } from "next";

import { LotSizeView } from "@/components/tools/lot-size-view";

export const metadata: Metadata = {
  title: "Lot Size",
  description:
    "Size any position from your risk: balance, risk %, entry and stop — with the full calculation shown.",
};

export default function LotSizePage() {
  return <LotSizeView />;
}
