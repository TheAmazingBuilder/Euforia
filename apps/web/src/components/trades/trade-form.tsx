"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import {
  computeRR,
  formatPercent,
  pnlForExit,
  type CreateTradeInput,
  type Currency,
  type Direction,
  type ExitReason,
  type Instrument,
  type Strategy,
} from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DisciplineBanner } from "@/components/trades/discipline-banner";
import { DirectionSegmented } from "@/components/trades/direction-segmented";
import { ConfidencePicker } from "@/components/trades/confidence-picker";
import { EmotionPicker } from "@/components/trades/emotion-picker";
import { InstrumentCombobox } from "@/components/trades/instrument-combobox";
import {
  deriveSizer,
  PositionSizer,
} from "@/components/trades/position-sizer";
import { LiveCalcBar } from "@/components/trades/live-calc-bar";
import {
  ScreenshotPicker,
  type DraftScreenshot,
} from "@/components/trades/screenshot-picker";
import { StrategyPicker } from "@/components/trades/strategy-picker";
import {
  useAccounts,
  useAddScreenshot,
  useCreateTrade,
  useCurrentBalance,
  useInstruments,
  usePreferences,
  useRulesStatus,
  useStrategies,
  useTags,
  useTrades,
} from "@/lib/api/queries";
import { uploadDraftsSequentially } from "@/lib/utils/screenshot-upload";
import { isoToLocalInput, localInputToISO, nowLocalInput } from "@/lib/utils/datetime";
import { sizeUnitLabel } from "@/lib/utils/instrument";
import { cn } from "@/lib/utils";
import {
  clearTradeDraft,
  loadTradeDraft,
  saveTradeDraft,
  type TradeDraftValues,
} from "@/lib/utils/trade-draft";
import type { TradeContextSeed } from "@/lib/hooks/use-trade-modal";
import { closeTradeModal } from "@/lib/hooks/use-trade-modal";
import { openGate } from "@/lib/hooks/use-judgment-flow";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * ACT 1 — Capture (trade-entry-ux.md §4). One adaptive form, numbers first:
 * instrument → direction → prices/times → plan → sizer → strategy → emotion.
 * Draft autosave on every change (§11); amber non-blocking validations.
 * A closed submit hands over to ACT 2 — the Judgment Gate opens immediately
 * (the create response carries { id, awaitingDecision: true }, never P&L).
 */

const DRAFT_DEBOUNCE_MS = 400;

const EXIT_REASONS: readonly ExitReason[] = ["TP", "SL", "MANUAL", "TRAILING", "PARTIAL", "MARGIN"];

/** Rotating entry-reason placeholder (hourly slot — pure pick, no state). */
function rotatePlaceholder(placeholders: readonly string[]): string {
  const slot = Math.floor(Date.now() / 3_600_000);
  return placeholders[slot % placeholders.length] ?? placeholders[0]!;
}

/** User typing may include commas ("1,5") — normalize to the wire format. */
function normalizeDecimalInput(raw: string): string {
  return raw.replace(",", ".").replace(/\s/g, "");
}

function freshValues(): TradeDraftValues {
  return {
    variant: "closed",
    instrumentId: null,
    direction: "BUY",
    entryPrice: "",
    exitPrice: "",
    entryAtLocal: nowLocalInput(),
    exitAtLocal: nowLocalInput(),
    exitReason: "MANUAL",
    sizeMode: "risk_percent",
    riskPercent: "1",
    quantity: "",
    strategyId: null,
    outOfPlaybook: false,
    initialStop: "",
    initialTP: "",
    reason: "",
    fees: "0",
    emotionBefore: null,
    confidence: null,
    tagIds: [],
    notes: "",
  };
}

function valuesFromSeed(seed: TradeContextSeed): TradeDraftValues {
  const base = freshValues();
  return {
    ...base,
    instrumentId: seed.instrumentId,
    direction: seed.direction,
    strategyId: seed.strategyId,
    outOfPlaybook: seed.outOfPlaybook,
    emotionBefore: seed.emotionBefore,
    // Fast loop (§7): default entry time = previous trade's exit time.
    entryAtLocal: isoToLocalInput(seed.entryAtISO) || base.entryAtLocal,
  };
}

interface Warning {
  id: string;
  message: string;
}

export interface TradeFormProps {
  /** Fast-loop context from the modal store (null = restore draft / fresh). */
  seed: TradeContextSeed | null;
}

export function TradeForm({ seed }: TradeFormProps) {
  const { dict } = useI18n();
  const T = dict.trades.form;
  // ── Data ────────────────────────────────────────────────────────────────
  const { data: instrumentsData } = useInstruments();
  const { data: strategiesData } = useStrategies();
  const { data: tagsData } = useTags();
  const { data: accountsData } = useAccounts();
  const { data: tradesData } = useTrades();
  const rulesStatus = useRulesStatus(null);
  const balanceInfo = useCurrentBalance();
  const createTrade = useCreateTrade();
  const addScreenshot = useAddScreenshot();
  const { data: prefsData } = usePreferences();

  const instruments: Instrument[] = instrumentsData?.instruments ?? [];
  const strategies: Strategy[] = strategiesData?.strategies ?? [];
  const tags = tagsData?.tags ?? [];
  const accountId =
    accountsData?.accounts.find((account) => account.isDefault)?.id ??
    accountsData?.accounts[0]?.id ??
    null;
  const currency: Currency = balanceInfo?.currency ?? "USD";

  // ── Form state ──────────────────────────────────────────────────────────
  // Hydration (client-only mount): seed (fast loop) > draft > fresh, decided
  // once in the lazy initializer — no setState-in-effect cascades.
  const [hydration] = React.useState(() => {
    if (seed !== null) {
      return { values: valuesFromSeed(seed), fromDraft: false, seeded: true };
    }
    const draft = loadTradeDraft();
    if (draft !== null) {
      // `confidence` was added after the first draft version — old drafts
      // restore without it.
      return {
        values: { ...freshValues(), ...draft.values, confidence: draft.values.confidence ?? null },
        fromDraft: true,
        seeded: true,
      };
    }
    return { values: freshValues(), fromDraft: false, seeded: false };
  });
  const [values, setValues] = React.useState<TradeDraftValues>(hydration.values);
  const [screenshots, setScreenshots] = React.useState<DraftScreenshot[]>([]);
  const [draftBadge, setDraftBadge] = React.useState<"hidden" | "restored" | "saved">(
    hydration.fromDraft ? "restored" : "hidden",
  );
  const [planOpen, setPlanOpen] = React.useState(true);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [directionTouched, setDirectionTouched] = React.useState(hydration.seeded);
  const dirtyRef = React.useRef(false);

  const patch = React.useCallback((changes: Partial<TradeDraftValues>) => {
    dirtyRef.current = true;
    setValues((previous) => ({ ...previous, ...changes }));
  }, []);

  // ── Direction preselect (until touched) — derived ──────────────────────
  // Preference default (Settings → Trading) leads, then the last trade, then
  // BUY. A stated default is an explicit user act — it outranks continuity.
  const lastTrade = tradesData?.trades[0] ?? null;
  const defaultDirection = prefsData?.trading.defaultDirection ?? null;
  const direction: Direction = directionTouched
    ? values.direction
    : (defaultDirection ?? lastTrade?.direction ?? values.direction);

  // ── Instrument preselect (§16 Settings → Trades) — fresh opens only ────
  // One-shot render-time adjustment (no setState-in-effect): seeds the saved
  // default symbol, else the first instrument of the default market. Never
  // overrides a seed, a restored draft, or a user choice.
  const [instrumentSeeded, setInstrumentSeeded] = React.useState(hydration.seeded);
  const defaultInstrumentId = prefsData?.trading.defaultInstrumentId ?? null;
  const defaultAssetClass = prefsData?.trading.defaultAssetClass ?? null;
  if (!instrumentSeeded && prefsData !== undefined) {
    const wanted =
      instruments.find((item) => item.id === defaultInstrumentId) ??
      (defaultAssetClass
        ? instruments.find((item) => item.assetClass === defaultAssetClass)
        : undefined);
    if (wanted) {
      setInstrumentSeeded(true);
      setValues((previous) =>
        previous.instrumentId === null ? { ...previous, instrumentId: wanted.id } : previous,
      );
    }
  }

  const patchDirection = React.useCallback(
    (next: Direction) => {
      setDirectionTouched(true);
      patch({ direction: next });
    },
    [patch],
  );

  // ── Draft autosave (§11): every user change, debounced; badge on save ──
  // The EFFECTIVE direction is persisted — the last-trade preselect is
  // derived until the user touches the control, but must survive reloads.
  React.useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      saveTradeDraft({ ...values, direction });
      setDraftBadge("saved");
    }, DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [values, direction]);

  // ── Derived: instrument specs, sizer, calculations ──────────────────────
  const instrument =
    values.instrumentId !== null
      ? (instruments.find((item) => item.id === values.instrumentId) ?? null)
      : null;
  const specs =
    instrument !== null
      ? { pipSize: instrument.pipSize, contractSize: instrument.contractSize }
      : null;
  const unitLabel = instrument !== null ? sizeUnitLabel(instrument.assetClass) : T.unitsFallback;

  const closed = values.variant === "closed";
  const entry = normalizeDecimalInput(values.entryPrice);
  const stop = normalizeDecimalInput(values.initialStop);
  const target = normalizeDecimalInput(values.initialTP);
  const exit = normalizeDecimalInput(values.exitPrice);

  const sizer = deriveSizer({
    mode: values.sizeMode,
    riskPercent: normalizeDecimalInput(values.riskPercent),
    quantity: normalizeDecimalInput(values.quantity),
    entry,
    stop,
    direction,
    balance: balanceInfo?.balance ?? null,
    specs,
  });
  const effectiveQuantity = values.sizeMode === "quantity"
    ? normalizeDecimalInput(values.quantity)
    : (sizer.suggestedQuantity ?? "");

  const rr = computeRR(entry, stop, target, direction);
  const estimatedPnl =
    closed && exit !== ""
      ? pnlForExit({
          entry,
          exit,
          direction,
          quantity: effectiveQuantity,
          contractSize: specs?.contractSize,
          fees: normalizeDecimalInput(values.fees),
        })
      : null;

  // ── Amber validations (§11) — non-blocking, auto-dismiss on fix ─────────
  const warnings = React.useMemo<Warning[]>(() => {
    const list: Warning[] = [];
    if (closed && stop !== "" && exit !== "") {
      const beyondStop =
        direction === "BUY" ? Number(exit) < Number(stop) : Number(exit) > Number(stop);
      if (Number.isFinite(Number(exit)) && Number.isFinite(Number(stop)) && beyondStop) {
        list.push({ id: "exit-beyond-sl", message: T.warn.exitBeyondSl });
      }
    }
    if (rr !== null && rr < 0.5) {
      list.push({ id: "rr-low", message: `${T.warn.rrPrefix} 1:${rr.toFixed(1)} ${T.warn.rrSuffix}` });
    }
    const riskLimitRule = rulesStatus.data?.limits.find(
      (limit) => limit.type === "MAX_RISK_PCT_PER_TRADE",
    );
    if (
      sizer.riskPct !== null &&
      riskLimitRule !== undefined &&
      sizer.riskPct > Number(riskLimitRule.limit)
    ) {
      list.push({
        id: "risk-over-limit",
        message: `${T.warn.riskPrefix} ${formatPercent(sizer.riskPct / 100, 1)} ${T.warn.riskMid} ${Number(riskLimitRule.limit)}${T.warn.riskTail}`,
      });
    }
    const closedTrades = (tradesData?.trades ?? []).filter((trade) => trade.status === "CLOSED");
    if (instrument !== null && closedTrades.length >= 20 && effectiveQuantity !== "") {
      const sameInstrument = closedTrades.filter((trade) => trade.instrumentId === instrument.id);
      if (sameInstrument.length > 0) {
        const average =
          sameInstrument.reduce((sum, trade) => sum + (Number(trade.quantity) || 0), 0) /
          sameInstrument.length;
        const current = Number(effectiveQuantity);
        if (average > 0 && Number.isFinite(current) && current >= 10 * average) {
          list.push({ id: "size-10x", message: T.warn.size10x });
        }
      }
    }
    return list;
  }, [closed, stop, exit, direction, rr, sizer.riskPct, rulesStatus.data, instrument, effectiveQuantity, tradesData, T]);

  const riskRuleSeverity =
    rulesStatus.data?.limits.find((limit) => limit.type === "MAX_RISK_PCT_PER_TRADE")?.severity ?? null;
  const lockViolated =
    riskRuleSeverity === "LOCK" && warnings.some((warning) => warning.id === "risk-over-limit");

  // ── Guardrail (preference): soft-lock after N violations today ──────────
  // A deliberate two-step acknowledgment — the trader CAN capture anyway,
  // but never by accident. The lock re-arms whenever the form remounts.
  const guardrailLimit = prefsData?.trading.softLockAfterViolations ?? null;
  const violationsToday = rulesStatus.data?.violationsToday ?? 0;
  const guardrailActive = guardrailLimit !== null && violationsToday >= guardrailLimit;
  const [guardrailAcked, setGuardrailAcked] = React.useState(false);
  const guardrailLocked = guardrailActive && !guardrailAcked;

  // ── Submit gating (minimal required set — everything else optional) ─────
  const entryAtISO = localInputToISO(values.entryAtLocal);
  const exitAtISO = localInputToISO(values.exitAtLocal);
  const missing: string[] = [];
  if (instrument === null) missing.push(T.missing.instrument);
  if (!(Number(entry) > 0)) missing.push(T.missing.entryPrice);
  if (!(entryAtISO !== null)) missing.push(T.missing.entryTime);
  if (closed && !(Number(exit) > 0)) missing.push(T.missing.exitPrice);
  if (closed && exitAtISO === null) missing.push(T.missing.exitTime);
  if (closed && entryAtISO !== null && exitAtISO !== null && exitAtISO <= entryAtISO) {
    missing.push(T.missing.exitAfterEntry);
  }
  if (values.sizeMode === "risk_percent" && sizer.suggestedQuantity === null) {
    missing.push(T.missing.riskStop);
  }
  if (values.sizeMode === "quantity" && !(Number(effectiveQuantity) > 0)) {
    missing.push(T.missing.size);
  }
  if (!values.outOfPlaybook && values.strategyId === null) missing.push(T.missing.strategy);
  const canSubmit =
    missing.length === 0 && !createTrade.isPending && !guardrailLocked;

  // ── Payload (§13: the client NEVER sends P&L — server computes) ─────────
  const buildPayload = (): CreateTradeInput | null => {
    if (accountId === null || instrument === null) return null;
    const entryTimestamp = entryAtISO;
    if (entryTimestamp === null) return null;
    const size: CreateTradeInput["size"] =
      values.sizeMode === "risk_percent"
        ? { mode: "risk_percent", riskPercent: normalizeDecimalInput(values.riskPercent) }
        : { mode: "quantity", quantity: normalizeDecimalInput(values.quantity) };
    const base = {
      accountId,
      instrumentId: instrument.id,
      direction,
      entryPrice: entry,
      entryAt: entryTimestamp,
      size,
      ...(stop !== "" && Number(stop) > 0 ? { initialStop: stop } : {}),
      ...(target !== "" && Number(target) > 0 ? { initialTP: target } : {}),
      ...(rr !== null && rr > 0 ? { plannedRR: rr.toFixed(2) } : {}),
      ...(values.reason.trim() !== "" ? { reason: values.reason.trim() } : {}),
      ...(normalizeDecimalInput(values.fees) !== "" && Number(normalizeDecimalInput(values.fees)) >= 0
        ? { fees: normalizeDecimalInput(values.fees) }
        : {}),
      ...(values.emotionBefore !== null ? { emotionBefore: values.emotionBefore } : {}),
      ...(values.confidence !== null ? { confidence: values.confidence } : {}),
      ...(values.outOfPlaybook ? { outOfPlaybook: true as const } : { strategyId: values.strategyId! }),
    };
    if (!closed) {
      return { variant: "open", ...base };
    }
    const exitTimestamp = exitAtISO;
    if (exitTimestamp === null || !(Number(exit) > 0)) return null;
    return {
      variant: "closed",
      ...base,
      exitPrice: exit,
      exitAt: exitTimestamp,
      exitReason: values.exitReason,
    };
  };

  // ── Submit flows ────────────────────────────────────────────────────────
  /**
   * Evidence ride-along (Livrable 4): picked screenshots are uploaded AFTER
   * the trade exists — sequentially, each failure toasted, NEVER blocking
   * the hand-off (the modal/gate continue regardless of upload outcomes).
   * Runs post-unmount-safe: react-query mutations outlive the component.
   */
  const uploadEvidence = (tradeId: string, shots: DraftScreenshot[]) => {
    if (shots.length === 0) return;
    void uploadDraftsSequentially(tradeId, shots, addScreenshot.mutateAsync).then(
      ({ failed }) => {
        if (failed.length > 0) {
          toast.error(dict.trades.errors.screenshotUpload, {
            description: `${failed.length} / ${shots.length}`,
          });
        }
      },
    );
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    const payload = buildPayload();
    if (payload === null) return;
    const pickedShots = [...screenshots];
    createTrade.mutate(payload, {
      onSuccess: (response) => {
        clearTradeDraft();
        // Picker cleared immediately — the modal is going away either way.
        for (const shot of pickedShots) URL.revokeObjectURL(shot.url);
        setScreenshots([]);
        const tradeId = response.id;
        if ("awaitingDecision" in response) {
          // Hard contract (§13): closed → { id, awaitingDecision: true }, NO P&L.
          // ACT 2 starts immediately: the Judgment Gate opens over the app.
          closeTradeModal();
          openGate(tradeId);
        } else {
          toast.success(T.savedOpenTitle, {
            description: `${instrument?.symbol ?? ""} ${direction} @ ${entry}`,
          });
          closeTradeModal();
        }
        uploadEvidence(tradeId, pickedShots);
      },
      onError: (error) => {
        toast.error(dict.trades.errors.tradeSave, {
          description: error instanceof Error ? error.message : String(error),
        });
      },
    });
  };

  // ── B/S direction hotkeys while capturing (not while typing) ────────────
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing) return;
      if (event.key === "b" || event.key === "B") {
        patchDirection("BUY");
      } else if (event.key === "s" || event.key === "S") {
        patchDirection("SELL");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [patchDirection]);

  const inputClasses =
    "h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

  // Rotating entry-reason placeholders — labels resolve through the active dictionary.
  const reasonPlaceholders = [T.reasonPh1, T.reasonPh2, T.reasonPh3, T.reasonPh4];

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <DisciplineBanner />

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Instrument */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="trade-instrument">{T.instrument}</Label>
            <span className="text-[11px] text-muted-foreground">{T.instrumentHint}</span>
          </div>
          <InstrumentCombobox
            value={values.instrumentId}
            onChange={(selected) => patch({ instrumentId: selected.id })}
          />
        </div>

        {/* Direction */}
        <div className="space-y-1.5">
          <Label htmlFor="trade-direction">{T.direction}</Label>
          <DirectionSegmented
            id="trade-direction"
            value={direction}
            onChange={patchDirection}
          />
        </div>
      </div>

      {/* Prices & times — numbers first */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="trade-entry-price">{T.entryPrice}</Label>
          <input
            id="trade-entry-price"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={values.entryPrice}
            onChange={(event) => patch({ entryPrice: event.target.value })}
            placeholder={instrument !== null ? instrument.digits > 2 ? "1.08420" : "9820.00" : "-"}
            className={inputClasses}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trade-entry-at">{T.entryTime}</Label>
          <input
            id="trade-entry-at"
            type="datetime-local"
            value={values.entryAtLocal}
            onChange={(event) => patch({ entryAtLocal: event.target.value })}
            className={cn(inputClasses, "px-2")}
          />
        </div>
        {closed ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="trade-exit-price">{T.exitPrice}</Label>
              <input
                id="trade-exit-price"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={values.exitPrice}
                onChange={(event) => patch({ exitPrice: event.target.value })}
                placeholder={instrument !== null && instrument.digits > 2 ? "1.08660" : "9880.00"}
                className={inputClasses}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trade-exit-at">{T.exitTime}</Label>
              <input
                id="trade-exit-at"
                type="datetime-local"
                value={values.exitAtLocal}
                onChange={(event) => patch({ exitAtLocal: event.target.value })}
                className={cn(inputClasses, "px-2")}
              />
            </div>
          </>
        ) : (
          <div className="col-span-2 flex items-end pb-1 text-xs text-muted-foreground lg:col-span-2">
            {T.stillRunning}
          </div>
        )}
      </div>

      {closed ? (
        <div className="max-w-56 space-y-1.5">
          <Label htmlFor="trade-exit-reason">{T.exitReason}</Label>
          <Select
            value={values.exitReason}
            onValueChange={(reason) => patch({ exitReason: reason as ExitReason })}
          >
            <SelectTrigger id="trade-exit-reason" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXIT_REASONS.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* The Plan — collapsible, numbers-first block (mockup: THE PLAN & RISK LIMITS) */}
      <section className="rounded-lg border border-border bg-surface">
        <button
          type="button"
          onClick={() => setPlanOpen((open) => !open)}
          aria-expanded={planOpen}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {planOpen ? (
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="text-sm font-semibold text-foreground">{T.plan}</span>
          {rr !== null ? (
            <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
              {T.plannedRR}{" "}
              <span className="text-foreground">1:{rr >= 10 ? rr.toFixed(0) : rr.toFixed(1)}</span>
            </span>
          ) : (
            <span className="ml-auto text-[11px] text-muted-foreground">{T.autoRR}</span>
          )}
        </button>
        {planOpen ? (
          <div className="space-y-3 border-t border-border p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="trade-stop">{T.plannedStop}</Label>
                <input
                  id="trade-stop"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={values.initialStop}
                  onChange={(event) => patch({ initialStop: event.target.value })}
                  placeholder={T.stopPlaceholder}
                  className={inputClasses}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trade-tp">{T.plannedTP}</Label>
                <input
                  id="trade-tp"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={values.initialTP}
                  onChange={(event) => patch({ initialTP: event.target.value })}
                  placeholder={T.targetPlaceholder}
                  className={inputClasses}
                />
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="trade-reason">{T.entryReason}</Label>
                <input
                  id="trade-reason"
                  type="text"
                  value={values.reason}
                  onChange={(event) => patch({ reason: event.target.value })}
                  placeholder={rotatePlaceholder(reasonPlaceholders)}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trade-fees">{T.fees}</Label>
                <input
                  id="trade-fees"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={values.fees}
                  onChange={(event) => patch({ fees: event.target.value })}
                  placeholder="0"
                  className={inputClasses}
                />
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* Position sizer — the signature detail */}
      <PositionSizer
        mode={values.sizeMode}
        onModeChange={(mode) => patch({ sizeMode: mode })}
        riskPercent={values.riskPercent}
        onRiskPercentChange={(riskPercent) => patch({ riskPercent })}
        quantity={values.quantity}
        onQuantityChange={(quantity) => patch({ quantity })}
        entry={entry}
        stop={stop}
        direction={direction}
        balance={balanceInfo?.balance ?? null}
        specs={specs}
        unitLabel={unitLabel}
        id="trade-sizer"
      />

      {/* Strategy — recommended, one tap */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label>{T.strategy}</Label>
          <span className="text-[11px] text-muted-foreground">{T.strategyHint}</span>
        </div>
        <StrategyPicker
          strategies={strategies}
          value={values.strategyId}
          outOfPlaybook={values.outOfPlaybook}
          onStrategyChange={(strategyId) => patch({ strategyId })}
          onOutOfPlaybookChange={(outOfPlaybook) => patch({ outOfPlaybook })}
        />
      </div>

      {/* Emotion before — optional, single tap */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label>{T.emotionBefore}</Label>
          <span className="text-[11px] text-muted-foreground">{dict.trades.shared.optionalSingleTap}</span>
        </div>
        <EmotionPicker value={values.emotionBefore} onChange={(emotionBefore) => patch({ emotionBefore })} />
      </div>

      {/* Confidence — optional 1–5 pre-trade conviction (psychology column) */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label>{T.confidence}</Label>
          <span className="text-[11px] text-muted-foreground">{T.confidenceHint}</span>
        </div>
        <ConfidencePicker
          value={values.confidence}
          onChange={(confidence) => patch({ confidence })}
        />
      </div>

      {/* Live calculation bar — mono, updated live */}
      <LiveCalcBar
        rr={rr}
        riskAmount={sizer.riskAmount}
        riskPct={sizer.riskPct}
        estimatedPnl={estimatedPnl}
        currency={currency}
      />

      {/* Add details — collapsible, never imposed */}
      <section className="rounded-lg border border-border bg-surface">
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {detailsOpen ? (
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="text-sm font-semibold text-foreground">{T.addDetails}</span>
          <span className="ml-auto text-[11px] text-muted-foreground">{T.detailsHint}</span>
        </button>
        {detailsOpen ? (
          <div className="space-y-4 border-t border-border p-3">
            <div className="space-y-1.5">
              <Label>{T.tags}</Label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const selected = values.tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        patch({
                          tagIds: selected
                            ? values.tagIds.filter((id) => id !== tag.id)
                            : [...values.tagIds, tag.id],
                        })
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground",
                      )}
                    >
                      {tag.name}
                    </button>
                  );
                })}
                {tags.length === 0 ? (
                  <span className="text-xs text-muted-foreground">{T.noTags}</span>
                ) : null}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trade-notes">{T.notes}</Label>
              <Textarea
                id="trade-notes"
                value={values.notes}
                onChange={(event) => patch({ notes: event.target.value })}
                placeholder={T.notesPlaceholder}
                className="min-h-20"
              />
            </div>
            <ScreenshotPicker screenshots={screenshots} onChange={setScreenshots} />
          </div>
        ) : null}
      </section>

      {/* Guardrail banner — soft-lock after N violations today (preference) */}
      {guardrailActive ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss"
          data-testid="trade-form-guardrail"
        >
          <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {T.guardrailLead} {violationsToday}{" "}
            {violationsToday === 1 ? T.violationOne : T.violationsMany} {guardrailLimit}
            {T.guardrailTail}
          </span>
          {guardrailLocked ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto h-6 gap-1 border-loss/50 px-2 text-[11px] text-loss hover:bg-loss/10"
              onClick={() => setGuardrailAcked(true)}
              data-testid="trade-form-guardrail-confirm"
            >
              {T.captureAnyway}
            </Button>
          ) : (
            <span className="ml-auto font-mono text-[10px]">{T.acknowledged}</span>
          )}
        </div>
      ) : null}

      {/* Amber warnings — non-blocking, auto-dismiss on fix */}
      {warnings.length > 0 ? (
        <ul className="space-y-1" aria-label={T.warningsAria}>
          {warnings.map((warning) => (
            <li
              key={warning.id}
              data-testid={`warning-${warning.id}`}
              className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning"
            >
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Submit bar — the two-state capture toggle */}
      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
        <Button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "flex-1 sm:flex-none",
            (lockViolated || guardrailLocked) &&
              "border border-warning/60 bg-warning/10 text-warning hover:bg-warning/20 hover:text-warning",
          )}
        >
          {closed ? T.submitClosed : T.submitOpen}
          <kbd className="ml-2 hidden rounded-sm bg-accent-foreground/10 px-1 font-mono text-[10px] sm:inline">
            ↵
          </kbd>
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => patch({ variant: closed ? "open" : "closed" })}
          title={closed ? T.switchToOpenTitle : T.switchToClosedTitle}
        >
          {closed ? T.switchToOpen : T.switchToClosed}
        </Button>
        {missing.length > 0 ? (
          <p className="text-[11px] text-muted-foreground sm:ml-auto sm:text-right">
            {T.addMissing} <span className="font-medium text-foreground">{missing.join(", ")}</span>
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground sm:ml-auto sm:text-right">
            {T.draftHint}
          </p>
        )}
      </div>

      {draftBadge !== "hidden" ? (
        <p
          data-testid="draft-badge"
          aria-live="polite"
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
          {draftBadge === "restored" ? T.draftRestored : T.draftSaved}
        </p>
      ) : null}
    </form>
  );
}
