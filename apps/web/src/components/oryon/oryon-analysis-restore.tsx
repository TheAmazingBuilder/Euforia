"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";

import type { Instrument, OryonChartAnalysis } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
import {
  OryonConfigConfirmDialog,
} from "@/components/oryon/oryon-config-dialogs";
import { Button } from "@/components/ui/button";
import {
  useOryonDrawings,
} from "@/components/oryon/oryon-drawings-context";
import {
  useOryonWorkspaceConfig,
  useWorkspaceConfigSnapshot,
} from "@/components/oryon/oryon-workspace-context";
import { oryonAnalyses } from "@/lib/oryon/journal/analyses";

/**
 * Oryon analysis deep-link restore (Phase 10) - `/oryon?analysis=<id>`.
 *
 * The journal's trade-detail section links here; this bridge applies the
 * saved analysis to the ACTIVE panel: symbol, timeframe, chart type and
 * the analysis configuration, then the saved ANNOTATIONS into the per-
 * symbol drawing store (the canonical store - isolated by instrument, so
 * other symbols' working drawings are never touched).
 *
 * Isolation + honesty rules (Phase 10 spec §9.2/§10.3):
 *  - restoring drawings that would REPLACE the symbol's current working
 *    collection asks for an explicit confirmation first;
 *  - the restored view is labeled a RECONSTRUCTED analysis: candles come
 *    from the live feed, NOT a historical replay - the banner says so;
 *  - an unknown id / unknown symbol degrades to an honest toast, the
 *    workspace stays exactly as it was;
 *  - the query parameter is consumed once (URL stripped after apply).
 */
export function OryonAnalysisRestoreBridge({ instruments }: { instruments: Instrument[] }) {
  const dict = useDict();
  const R = dict.oryon.restore;
  const searchParams = useSearchParams();
  const analysisId = searchParams.get("analysis");
  const { store } = useOryonWorkspaceConfig();
  const { session } = useWorkspaceConfigSnapshot();
  const { registry } = useOryonDrawings();

  const [appliedId, setAppliedId] = React.useState<string | null>(null);
  const [banner, setBanner] = React.useState<OryonChartAnalysis | null>(null);
  const [confirmReplace, setConfirmReplace] = React.useState<OryonChartAnalysis | null>(null);

  /** Consumes the query parameter (external-system write - an effect). */
  const stripUrl = React.useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("analysis")) return;
    params.delete("analysis");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, []);

  const applyDrawings = React.useCallback(
    (analysis: OryonChartAnalysis) => {
      registry.storeFor(analysis.symbol).loadAll(analysis.drawings);
    },
    [registry],
  );

  // Render-time adjustment (the trades deep-link pattern): each fresh id is
  // applied EXACTLY once, only after the instrument catalog is available to
  // validate the symbol honestly.
  if (analysisId !== null && appliedId !== analysisId && instruments.length > 0) {
    setAppliedId(analysisId);
    const analysis = oryonAnalyses.byId(analysisId);
    if (analysis === null) {
      toast.error(R.notFoundToast, { testId: "oryon-restore-notfound-toast" });
      stripUrl();
    } else if (!instruments.some((instrument) => instrument.symbol === analysis.symbol)) {
      toast.warning(R.unknownSymbolToast, {
        description: analysis.symbol,
        testId: "oryon-restore-unknown-symbol-toast",
      });
      stripUrl();
    } else {
      const target =
        session.panels.find((panel) => panel.id === session.activePanelId) ?? session.panels[0];
      if (target !== undefined) {
        store.setActivePanel(target.id);
        store.setPanelSymbol(target.id, analysis.symbol);
        store.setPanelInterval(target.id, analysis.interval);
        store.setPanelChartType(target.id, analysis.chartType);
        store.setPanelAnalysis(target.id, structuredClone(analysis.analysis));
        const drawingStore = registry.storeFor(analysis.symbol);
        if (analysis.drawings.length > 0 && drawingStore.drawings.length > 0) {
          // Would replace working annotations - an explicit user decision.
          setConfirmReplace(analysis);
        } else {
          applyDrawings(analysis);
        }
        setBanner(analysis);
      } else {
        toast.warning(R.noPanelToast, { testId: "oryon-restore-no-panel-toast" });
      }
      stripUrl();
    }
  }

  // URL strip AFTER the router transition commits: a client-side push
  // (journal → Oryon) may re-write the address bar after the render-time
  // replaceState - the effect re-runs it once the new route is settled.
  // Idempotent (no param → no-op).
  React.useEffect(() => {
    if (appliedId === null) return;
    stripUrl();
  }, [appliedId, stripUrl]);

  if (banner === null) return null;

  return (
    <>
      <div
        data-testid="oryon-analysis-banner"
        className="fixed bottom-3 left-3 z-40 flex max-w-sm items-start gap-2 rounded-lg border border-accent/40 bg-background/95 px-3 py-2 shadow-lg backdrop-blur"
      >
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{banner.title}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            <span className="font-mono">
              {banner.symbol} · {banner.interval}
            </span>{" "}
            · <span className="uppercase tracking-wide text-accent">{R.reconstructedBadge}</span>{" "}
            · {R.reconstructedNote}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 px-0 text-muted-foreground hover:text-foreground"
          aria-label={R.dismiss}
          data-testid="oryon-analysis-banner-close"
          onClick={() => setBanner(null)}
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>

      {confirmReplace !== null ? (
        <OryonConfigConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) setConfirmReplace(null);
          }}
          title={R.replaceTitle}
          body={R.replaceBody}
          subjectName={confirmReplace.symbol}
          confirmLabel={R.replaceConfirm}
          testidPrefix="oryon-restore-replace"
          onConfirm={() => {
            applyDrawings(confirmReplace);
            setConfirmReplace(null);
          }}
        />
      ) : null}
    </>
  );
}
