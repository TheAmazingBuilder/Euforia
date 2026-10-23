"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  AlarmPlus,
  Bookmark,
  Camera,
  Copy,
  Crosshair,
  ListTree,
  Minus,
  NotebookPen,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import type { MarketInterval, OryonDrawing, OryonPanelAnalysis } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
import { oryonAnalyses } from "@/lib/oryon/journal/analyses";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { OryonChartEngine } from "@/lib/charting/oryon-chart-engine";
import { newDrawingId } from "@/lib/oryon/drawings/store";
import { formatCandleTime } from "@/lib/oryon/crosshair/format";
import type { OryonPanelChartPrefs } from "@/lib/oryon/workspace/chart-prefs";
import { useOryonAlerts } from "@/components/oryon/oryon-alerts-context";
import { useOryonDrawings } from "@/components/oryon/oryon-drawings-context";
import { useOryonIndicators } from "@/components/oryon/oryon-indicators-context";
import {
  useOryonWorkspaceConfig,
  useWorkspaceConfigSnapshot,
} from "@/components/oryon/oryon-workspace-context";
import {
  OryonConfigConfirmDialog,
  OryonConfigNameDialog,
} from "@/components/oryon/oryon-config-dialogs";
import { OryonChartSettingsDialog } from "@/components/oryon/oryon-chart-settings-dialog";
import {
  OryonSaveAnalysisDialog,
  OryonSnapshotDialog,
} from "@/components/oryon/oryon-trade-journal";
import type { OryonConfigOpError } from "@/lib/oryon/workspace/layouts";

/**
 * Oryon chart context menu (right-click on the chart workspace) — the
 * TradingView-inspired menu, wired ONLY to capabilities that already exist:
 *
 *  - Copy price / price & time  → the chart coordinate under the cursor
 *    (engine.conversions — the SAME math the drawing controller uses),
 *    never the latest market price;
 *  - Add alert at price…        → the existing alerts create dialog,
 *    prefilled with the clicked price;
 *  - Add horizontal level       → a REAL hline drawing in the panel's
 *    per-symbol drawing store (identical shape to the rail tool);
 *  - Reset chart view           → engine.goToLatest();
 *  - Object tree                → the existing objects dock (utility rail);
 *  - Chart template ▸           → the existing template store (apply with
 *    the same stack-replacement confirmation, save current as template);
 *  - Settings…                  → the chart settings dialog (Symbol /
 *    Status line / Scales & lines / Canvas — real engine options).
 *
 * Honesty contract: there is NO trading submenu — this application places
 * no orders and no broker integration exists; fabricating order actions
 * would pretend otherwise. Menu items that map to nothing real are not
 * shown at all.
 *
 * Event flow: the trigger wraps ONLY the chart container. Right-clicks on
 * a DRAWING are consumed upstream (the interaction controller's capture
 * listener opens the existing per-object property editor), so this menu
 * only ever opens for the empty chart surface — the two menus never race.
 * The content renders in a Radix portal: never clipped by the chart
 * container, collision-kept inside the viewport, Escape/outside-click
 * close for free, full keyboard navigation.
 */
export function OryonChartContextMenu({
  engineRef,
  dataSymbol,
  interval,
  digits,
  interactive,
  chartType,
  analysis,
  chartPrefs,
  onChartPrefsChange,
  children,
}: {
  engineRef: React.RefObject<OryonChartEngine | null>;
  /** Symbol of the data ACTUALLY displayed (alert + level + copies target). */
  dataSymbol: string;
  interval: MarketInterval;
  digits: number;
  /** True while this panel is the workspace's active chart (level gating —
   *  mirrors the drawing tools' active-chart gate). */
  interactive: boolean;
  /** Panel context for the journal flows (Save Analysis / Snapshot). */
  chartType: "candles" | "line";
  analysis: OryonPanelAnalysis;
  chartPrefs: OryonPanelChartPrefs;
  onChartPrefsChange: (next: OryonPanelChartPrefs) => void;
  /** The chart container — becomes the menu's trigger surface. */
  children: React.ReactNode;
}) {
  const dict = useDict();
  const S = dict.oryon.contextMenu;
  const router = useRouter();

  const { openCreate } = useOryonAlerts();
  const { registry: drawingRegistry } = useOryonDrawings();
  const { store, applyTemplate, saveCurrentTemplate } = useOryonWorkspaceConfig();
  const { session } = useWorkspaceConfigSnapshot();
  const { registry: indicatorRegistry } = useOryonIndicators();

  /** Chart coordinate under the cursor — computed in the contextmenu
   *  handler (refs are read in EVENTS, never during render) and stored as
   *  state the menu content renders from. */
  const [cursor, setCursor] = React.useState<{ price: number | null; timeSec: number | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [applyTarget, setApplyTarget] = React.useState<{ id: string; name: string } | null>(null);
  const [saveAnalysisOpen, setSaveAnalysisOpen] = React.useState(false);
  const [snapshotOpen, setSnapshotOpen] = React.useState(false);
  /** Chart reference time captured when the menu OPENED (event-time read —
   *  the journal dialogs store it with the analysis, distinct from save time). */
  const [referenceTimeSec, setReferenceTimeSec] = React.useState<number | null>(null);

  const templatesList = useWorkspaceConfigSnapshot().templates;

  /** This symbol's analyses that ARE linked to a journal trade — the
   *  "open linked trade" entries (the journal record stays canonical; the
   *  deep link /trades?trade=<id> opens the existing drawer). Subscribed
   *  through the store snapshot so a save made minutes ago is visible
   *  without a panel switch. */
  const analysesSnapshot = React.useSyncExternalStore(
    oryonAnalyses.subscribe,
    oryonAnalyses.getSnapshot,
  );
  const linkedAnalyses = React.useMemo(
    () =>
      analysesSnapshot.analyses.filter(
        (a) => a.symbol === dataSymbol && a.tradeId !== null,
      ),
    [analysesSnapshot, dataSymbol],
  );

  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const engine = engineRef.current;
      const mounted = engine !== null && engine.isMounted;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setCursor({
        price: mounted ? engine.conversions.yToPrice(y) : null,
        timeSec: mounted ? engine.conversions.xToSnappedTimeSec(x) : null,
      });
      setReferenceTimeSec(mounted ? engine.lastCandleTime : null);
      // No preventDefault/stopPropagation — Radix owns opening + the browser
      // default is suppressed by the primitive itself, chart-native behavior
      // everywhere else in the app is untouched.
    },
    [engineRef],
  );

  const price = cursor?.price ?? null;
  const timeSec = cursor?.timeSec ?? null;

  const priceText =
    price !== null
      ? new Intl.NumberFormat("en-US", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(price)
      : null;

  /** Bar time under the cursor — the SAME formatter the legend uses (one
   *  honest readout everywhere; the cursor time is bar-snapped). */
  const timeText =
    timeSec !== null ? formatCandleTime(timeSec * 1000, interval) : null;

  const copyText = React.useCallback(
    (text: string, message: string) => {
      const done = () => toast(message, { testId: "oryon-ctx-copy-toast" });
      if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
        navigator.clipboard.writeText(text).then(done, () => {
          toast.error(S.copyFailed, { testId: "oryon-ctx-copy-fail-toast" });
        });
      } else {
        toast.error(S.copyFailed, { testId: "oryon-ctx-copy-fail-toast" });
      }
    },
    [S.copyFailed],
  );

  /** Adds a REAL horizontal level — the exact object shape the rail's hline
   *  tool produces (same default style), into the displayed symbol's store. */
  const addHorizontalLevel = React.useCallback(
    (levelPrice: number) => {
      const now = Date.now();
      const drawing = {
        id: newDrawingId(),
        type: "hline",
        visible: true,
        locked: false,
        label: null,
        createdAt: now,
        updatedAt: now,
        style: { color: "accent", width: 2, dash: "solid", fill: "accent", fillOpacity: 0.12, fontSize: 13 },
        price: levelPrice,
      } as OryonDrawing;
      drawingRegistry.storeFor(dataSymbol).add(drawing);
    },
    [drawingRegistry, dataSymbol],
  );

  /** Alert creation — the existing dialog, prefilled with the clicked price. */
  const addAlertAtPrice = React.useCallback(
    (alertPrice: number) => {
      openCreate({ symbol: dataSymbol, price: alertPrice, digits });
    },
    [openCreate, dataSymbol, digits],
  );

  // ── Template flows (the SAME semantics as the toolbar menu) ────────────────
  const errorMessages: Record<OryonConfigOpError, string> = React.useMemo(
    () => ({
      name_invalid: dict.oryon.templates.errorNameInvalid,
      name_taken: dict.oryon.templates.errorNameTaken,
      capacity: dict.oryon.templates.errorCapacity,
      not_found: dict.oryon.templates.errorNotFound,
      default_immutable: dict.oryon.templates.errorNameInvalid,
      panel_capacity: dict.oryon.templates.errorCapacity,
    }),
    [dict],
  );

  const runApply = React.useCallback(
    (id: string) => {
      const report = applyTemplate(id);
      if (report === null) {
        toast.error(dict.oryon.templates.errorNotFound);
        return;
      }
      if (report.skipped > 0) {
        toast.warning(dict.oryon.templates.appliedPartialToast, {
          description: `${report.skipped} of ${report.total} ${dict.oryon.templates.skippedDetail}`,
          testId: "oryon-template-apply-partial-toast",
        });
        return;
      }
      toast(dict.oryon.templates.appliedToast, { testId: "oryon-template-apply-toast" });
    },
    [applyTemplate, dict],
  );

  const requestApply = React.useCallback(
    (template: { id: string; name: string }) => {
      const activeStore = indicatorRegistry.find(session.activePanelId);
      if (activeStore !== null && activeStore.indicators.length > 0) {
        setApplyTarget(template);
        return;
      }
      runApply(template.id);
    },
    [indicatorRegistry, session.activePanelId, runApply],
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild onContextMenu={handleContextMenu}>
          {children}
        </ContextMenuTrigger>

        <ContextMenuContent
          data-testid="oryon-ctx-menu"
          className="min-w-56"
        >
          {/* ── Price actions ─────────────────────────────────────────────── */}
          <ContextMenuItem
            data-testid="oryon-ctx-copy-price"
            disabled={priceText === null}
            onSelect={() => {
              if (priceText === null) return;
              copyText(priceText, `${S.priceCopied} ${priceText}`);
            }}
          >
            <Copy aria-hidden />
            {priceText !== null ? `${S.copyPrice} ${priceText}` : S.copyPrice}
          </ContextMenuItem>
          <ContextMenuItem
            data-testid="oryon-ctx-copy-coords"
            disabled={priceText === null || timeText === null}
            onSelect={() => {
              if (priceText === null || timeText === null) return;
              copyText(`${dataSymbol} ${priceText} @ ${timeText}`, S.coordsCopied);
            }}
          >
            <Crosshair aria-hidden />
            {S.copyPriceTime}
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* ── Alert + level ─────────────────────────────────────────────── */}
          <ContextMenuItem
            data-testid="oryon-ctx-add-alert"
            disabled={price === null}
            onSelect={() => {
              if (price === null) return;
              addAlertAtPrice(price);
            }}
          >
            <AlarmPlus aria-hidden />
            {priceText !== null
              ? `${S.addAlertOn} ${dataSymbol} ${S.addAlertAt} ${priceText}…`
              : S.addAlert}
          </ContextMenuItem>
          <ContextMenuItem
            data-testid="oryon-ctx-add-level"
            disabled={price === null || !interactive}
            title={!interactive ? S.levelInactiveHint : undefined}
            onSelect={() => {
              if (price === null) return;
              addHorizontalLevel(price);
            }}
          >
            <Minus aria-hidden />
            {priceText !== null ? `${S.addLevel} ${priceText}` : S.addLevel}
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* ── Display + navigation ──────────────────────────────────────── */}
          <ContextMenuItem
            data-testid="oryon-ctx-reset"
            onSelect={() => {
              // Engine access lives in the EVENT — never during render.
              engineRef.current?.goToLatest();
            }}
          >
            <RotateCcw aria-hidden />
            {S.resetView}
          </ContextMenuItem>
          <ContextMenuItem
            data-testid="oryon-ctx-objects"
            onSelect={() => store.openUtility("objects")}
          >
            <ListTree aria-hidden />
            {S.objectTree}
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* ── Trade journal (Phase 10) ─────────────────────────────────── */}
          <ContextMenuSub>
            <ContextMenuSubTrigger data-testid="oryon-ctx-journal">
              <NotebookPen aria-hidden />
              {S.journal}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-52">
              <ContextMenuItem
                data-testid="oryon-ctx-save-analysis"
                onSelect={() => setSaveAnalysisOpen(true)}
              >
                <NotebookPen aria-hidden />
                {S.saveAnalysis}
              </ContextMenuItem>
              <ContextMenuItem
                data-testid="oryon-ctx-snapshot"
                onSelect={() => setSnapshotOpen(true)}
              >
                <Camera aria-hidden />
                {S.snapshotToTrade}
              </ContextMenuItem>
              {linkedAnalyses.length > 0 ? (
                <>
                  <ContextMenuSeparator />
                  {linkedAnalyses.map((analysis) => (
                    <ContextMenuItem
                      key={analysis.id}
                      data-testid={`oryon-ctx-open-trade-${analysis.id}`}
                      onSelect={() => {
                        if (analysis.tradeId === null) return;
                        router.push(`/trades?trade=${analysis.tradeId}`);
                      }}
                      className="flex-col items-start gap-0.5"
                    >
                      <span className="text-xs font-medium text-foreground">
                        {S.openLinkedTrade}
                      </span>
                      <span className="max-w-48 truncate text-[11px] text-muted-foreground">
                        {analysis.title}
                      </span>
                    </ContextMenuItem>
                  ))}
                </>
              ) : null}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          {/* ── Templates + settings ──────────────────────────────────────── */}
          <ContextMenuSub>
            <ContextMenuSubTrigger data-testid="oryon-ctx-templates">
              <Bookmark aria-hidden />
              {S.templates}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent data-testid="oryon-ctx-template-menu" className="min-w-52">
              {templatesList.length === 0 ? (
                <ContextMenuLabel className="whitespace-normal">
                  {S.templatesEmpty}
                </ContextMenuLabel>
              ) : (
                templatesList.map((template) => (
                  <ContextMenuItem
                    key={template.id}
                    data-testid={`oryon-ctx-template-item-${template.id}`}
                    onSelect={() => requestApply(template)}
                    className="flex-col items-start gap-0.5"
                  >
                    <span className="text-sm font-medium text-foreground">{template.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {template.indicators.length} {dict.oryon.templates.metaIndicators}
                      {" · "}
                      {template.chart.interval ?? dict.oryon.templates.metaNoInterval}
                    </span>
                  </ContextMenuItem>
                ))
              )}
              <ContextMenuSeparator />
              <ContextMenuItem
                data-testid="oryon-ctx-save-template"
                onSelect={() => setSaveOpen(true)}
              >
                <Bookmark aria-hidden />
                {dict.oryon.templates.saveCurrent}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            data-testid="oryon-ctx-settings"
            onSelect={() => setSettingsOpen(true)}
          >
            <Settings2 aria-hidden />
            {S.settings}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Trade journal flows (Phase 10) - mounted per open so the drafts
          seed from the CURRENT panel state. */}
      {saveAnalysisOpen ? (
        <OryonSaveAnalysisDialog
          open
          onOpenChange={(next) => {
            if (!next) setSaveAnalysisOpen(false);
          }}
          symbol={dataSymbol}
          interval={interval}
          chartType={chartType}
          analysis={analysis}
          drawings={drawingRegistry.storeFor(dataSymbol).drawings}
          referenceTimeSec={referenceTimeSec}
        />
      ) : null}
      {snapshotOpen ? (
        <OryonSnapshotDialog
          open
          onOpenChange={(next) => {
            if (!next) setSnapshotOpen(false);
          }}
          engineRef={engineRef}
          symbol={dataSymbol}
          interval={interval}
          chartType={chartType}
          analysis={analysis}
          drawings={drawingRegistry.storeFor(dataSymbol).drawings}
        />
      ) : null}

      {/* Settings - the four-section chart dialog (live-applied). Mounted
          per open so the draft + cancel snapshot start from CURRENT prefs
          (no open-transition effect, no stale state). */}
      {settingsOpen ? (
        <OryonChartSettingsDialog
          open
          onOpenChange={(next) => {
            if (!next) setSettingsOpen(false);
          }}
          prefs={chartPrefs}
          onApply={onChartPrefsChange}
          symbol={dataSymbol}
        />
      ) : null}

      {/* Template save — same dialog + validation as the toolbar flow. */}
      <OryonConfigNameDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title={dict.oryon.templates.saveTitle}
        description={dict.oryon.templates.saveBody}
        initialName=""
        nameLabel={dict.oryon.templates.nameLabel}
        placeholder={dict.oryon.templates.namePlaceholder}
        submitLabel={dict.oryon.templates.nameSubmitCreate}
        errorMessages={errorMessages}
        testidPrefix="oryon-template-name"
        submit={(name) => {
          const result = saveCurrentTemplate(name);
          if (result.ok) toast(dict.oryon.templates.savedToast);
          return result;
        }}
      />

      {/* Template apply confirmation — replaces the active panel's stack. */}
      {applyTarget !== null ? (
        <OryonConfigConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setApplyTarget(null);
          }}
          title={dict.oryon.templates.applyTitle}
          body={dict.oryon.templates.applyBody}
          subjectName={applyTarget.name}
          confirmLabel={dict.oryon.templates.applySubmit}
          testidPrefix="oryon-template-apply"
          onConfirm={() => runApply(applyTarget.id)}
        />
      ) : null}
    </>
  );
}
