import { OryonWorkspace } from "@/components/oryon/oryon-workspace";

/**
 * /oryon — the Oryon full-screen charting workspace (Phase 1: workspace +
 * chart-engine foundation). Server component; all interactivity lives in
 * the client workspace below it.
 */
export default function OryonPage() {
  return <OryonWorkspace />;
}
