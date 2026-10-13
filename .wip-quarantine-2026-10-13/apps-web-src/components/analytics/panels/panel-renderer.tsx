"use client";

import type { AnalyticsPanel } from "@cosmoz/shared";

import { PanelBars } from "./panel-bars";
import { PanelDonut } from "./panel-donut";
import { PanelHeatmap } from "./panel-heatmap";
import { PanelLine } from "./panel-line";
import { PanelScatter } from "./panel-scatter";
import { PanelTable } from "./panel-table";
import { BucketBars } from "@/components/analytics/bucket-bars";

/**
 * The Atlas panel switch: one AnalyticsPanel payload in, the right chart
 * out. Buckets delegate to the trusted BucketBars (n under every bar, low
 * samples in warning ochre); everything else renders from its own payload.
 */

export function PanelRenderer({ panel, currency }: { panel: AnalyticsPanel; currency: string }) {
  switch (panel.kind) {
    case "bars":
      return <PanelBars panel={panel} currency={currency} />;
    case "line":
      return <PanelLine panel={panel} currency={currency} />;
    case "donut":
      return <PanelDonut panel={panel} />;
    case "scatter":
      return <PanelScatter panel={panel} currency={currency} />;
    case "heatmap":
      return (
        <div className="overflow-x-auto">
          <PanelHeatmap panel={panel} />
        </div>
      );
    case "table":
      return <PanelTable panel={panel} />;
    case "buckets":
      return <BucketBars buckets={panel.buckets} ariaLabel={panel.ariaLabel} height={280} />;
    default:
      return null;
  }
}
