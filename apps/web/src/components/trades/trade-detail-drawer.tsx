"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Camera,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import type { Currency, Instrument, Strategy, Tag, Trade } from "@cosmoz/shared";
import { formatNumber, formatR, formatSignedMoney } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { TradeSessionChart } from "@/components/trades/trade-session-chart";
import { TradeChartAnalysisSection } from "@/components/trades/trade-chart-analysis";
import { TradePlanSection } from "@/components/trades/trade-plan";
import {
  useAddScreenshot,
  useCloseTrade,
  useDeleteScreenshot,
  useDeleteTrade,
  useInstruments,
  useReview,
  useScreenshots,
  useStrategies,
  useTags,
  useUpdateNotes,
  useUpdateReview,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { isoToLocalInput, localInputToISO } from "@/lib/utils/datetime";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

const EXIT_REASONS = ["TP", "SL", "MANUAL", "TRAILING", "PARTIAL", "MARGIN"] as const;

const inputClasses =
  "h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

/** Small labelled read-out used in the plan/reality grids. */
function Readout({
  label,
  value,
  tone,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "profit" | "loss" | "muted";
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-2.5 py-2">
      <p className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm tabular-nums",
          mono && "font-mono",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
          (!tone || tone === "muted") && "text-foreground",
        )}
      >
        {value ?? "-"}
      </p>
    </div>
  );
}

interface TradeDetailDrawerProps {
  trade: Trade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (trade: Trade) => void;
  onDeleted: () => void;
}

/**
 * Trade detail surface — the record's full page: plan vs reality, editable
 * notes, tag chips, screenshot gallery with upload, and the module actions
 * (edit / close / delete).
 *
 * Width contract: on desktop the details open as a FULL-WIDTH centered
 * dialog — the numbers get room, the plan/reality grid becomes a single
 * row and notes/screenshots sit side by side. Below the `lg` breakpoint the
 * same content opens as a full-width right sheet (mobile keeps one column).
 */
export function TradeDetailDrawer({
  trade,
  open,
  onOpenChange,
  onEdit,
  onDeleted,
}: TradeDetailDrawerProps) {
  const { dict } = useI18n();
  const T = dict.trades.detail;
  const isDesktop = useIsDesktop();
  const { data: instrumentsData } = useInstruments();
  const { data: strategiesData } = useStrategies();
  const { data: tagsData } = useTags();
  const { data: reviewData } = useReview(open && trade ? trade.id : null);
  const { data: screenshotsData } = useScreenshots(open && trade ? trade.id : null);

  const updateNotes = useUpdateNotes();
  const updateReview = useUpdateReview();
  const deleteTrade = useDeleteTrade();
  const closeTrade = useCloseTrade();
  const addScreenshot = useAddScreenshot();
  const deleteScreenshot = useDeleteScreenshot();

  const [notesDraft, setNotesDraft] = React.useState("");
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [exitPrice, setExitPrice] = React.useState("");
  const [exitAtLocal, setExitAtLocal] = React.useState("");
  const [exitReason, setExitReason] = React.useState<string>("MANUAL");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Hydrate editable fields via the render-time adjustment pattern (no
  // setState inside effects): notes from the trade, tags from the review.
  const [notesFor, setNotesFor] = React.useState<string | null>(null);
  if (trade !== null && notesFor !== trade.id) {
    setNotesFor(trade.id);
    setNotesDraft(trade.notes ?? "");
  }
  const [tagsFor, setTagsFor] = React.useState<string | null>(null);
  const reviewTagIds = reviewData?.tagIds;
  if (reviewTagIds !== undefined && tagsFor !== reviewTagIds.join(",")) {
    setTagsFor(reviewTagIds.join(","));
    setSelectedTagIds(reviewTagIds);
  }

  if (!trade) return null;

  const instruments: Instrument[] = instrumentsData?.instruments ?? [];
  const instrument = instruments.find((item) => item.id === trade.instrumentId);
  const strategies: Strategy[] = strategiesData?.strategies ?? [];
  const strategy = strategies.find((item) => item.id === trade.strategyId);
  const tags: Tag[] = tagsData?.tags ?? [];
  const screenshots = screenshotsData?.screenshots ?? [];
  const currency: Currency = "USD";
  const isClosed = trade.status === "CLOSED";
  const priceDigits = instrument?.digits ?? 2;


  const notesDirty = notesDraft !== (trade.notes ?? "");
  const tagsDirty =
    JSON.stringify([...selectedTagIds].sort()) !== JSON.stringify([...(reviewData?.tagIds ?? [])].sort());

  const onSaveNotes = () => {
    updateNotes.mutate(
      { tradeId: trade.id, input: { notes: notesDraft } },
      {
        onSuccess: () => toast.success(T.notesSaved),
        onError: (error) => toast.error(apiErrorMessage(error, dict.trades.errors.notesSave)),
      },
    );
  };

  const onSaveTags = (next: string[]) => {
    setSelectedTagIds(next);
    updateReview.mutate(
      { tradeId: trade.id, input: { tagIds: next } },
      {
        onSuccess: () => toast.success(T.tagsUpdated),
        onError: (error) => toast.error(apiErrorMessage(error, dict.trades.errors.tagsUpdate)),
      },
    );
  };

  const onDelete = () => {
    deleteTrade.mutate(trade.id, {
      onSuccess: () => {
        toast.success(T.tradeDeleted);
        setConfirmDelete(false);
        onOpenChange(false);
        onDeleted();
      },
      onError: (error) => toast.error(apiErrorMessage(error, dict.trades.errors.tradeDelete)),
    });
  };

  const onUploadScreenshot = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      addScreenshot.mutate(
        { tradeId: trade.id, input: { kind: "CHART", dataUrl } },
        {
          onSuccess: () => toast.success(T.screenshotAttached),
          onError: (error) => toast.error(apiErrorMessage(error, dict.trades.errors.screenshotUpload)),
        },
      );
    };
    reader.readAsDataURL(file);
  };

  const onClosePosition = (event: React.FormEvent) => {
    event.preventDefault();
    const exitAt = localInputToISO(exitAtLocal) ?? new Date().toISOString();
    closeTrade.mutate(
      {
        tradeId: trade.id,
        input: { mode: "single", exitPrice, exitAt, exitReason: exitReason as never },
      },
      {
        onSuccess: () => {
          toast.success(T.positionClosed);
          setCloseOpen(false);
          onOpenChange(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, dict.trades.errors.positionClose)),
      },
    );
  };

  // ── Shared content — identical sections in both surfaces ─────────────────

  const verdictSection = (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      <Readout
        label={T.netPnl}
        value={trade.pnlNet === null ? "-" : formatSignedMoney(trade.pnlNet, currency, { digits: 2 })}
        tone={trade.pnlNet === null ? "muted" : Number(trade.pnlNet) >= 0 ? "profit" : "loss"}
      />
      <Readout
        label={T.rMultiple}
        value={trade.rMultiple === null ? "-" : formatR(trade.rMultiple)}
        tone={trade.rMultiple === null ? "muted" : Number(trade.rMultiple) >= 0 ? "profit" : "loss"}
      />
      <Readout label={T.entry} value={formatNumber(trade.entryPrice, priceDigits)} />
      <Readout label={T.exit} value={trade.exitPrice === null ? "-" : formatNumber(trade.exitPrice, priceDigits)} />
      <Readout
        label={T.initialStop}
        value={trade.initialStop === null ? "-" : formatNumber(trade.initialStop, priceDigits)}
      />
      <Readout
        label={T.takeProfit}
        value={trade.initialTP === null ? "-" : formatNumber(trade.initialTP, priceDigits)}
      />
      <Readout
        label={T.risked}
        value={trade.riskAmount === null ? "-" : formatNumber(trade.riskAmount, 2)}
      />
      <Readout label={T.fees} value={formatNumber(trade.fees, 2)} />
    </section>
  );

  const strategySection = (
    <section>
      <p className="mb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
        {T.strategyHeading}
      </p>
      <p className="text-sm text-foreground">
        {strategy?.name ?? dict.trades.shared.outOfPlaybook}
        {strategy?.grade ? (
          <span className="ml-2 font-mono text-xs text-muted-foreground">{strategy.grade}</span>
        ) : null}
      </p>
    </section>
  );

  // Psychology — honest read-out of the trade's own columns (emotions,
  // confidence, plan adherence). Hidden entirely when nothing was logged.
  const hasPsychology =
    trade.emotionBefore !== null ||
    trade.emotionAfter !== null ||
    trade.confidence !== null ||
    trade.followedPlan !== null;

  const psychologySection = hasPsychology ? (
    <section data-testid="trade-psychology">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
        {T.psychologyHeading}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {trade.emotionBefore !== null ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {dict.trades.form.emotionBefore}
            </span>
            <span className="font-medium text-foreground" data-testid="trade-emotion-before">
              {dict.trades.emotions[trade.emotionBefore]}
            </span>
          </span>
        ) : null}
        {trade.emotionAfter !== null ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {dict.trades.reflect.emotionAfter}
            </span>
            <span className="font-medium text-foreground" data-testid="trade-emotion-after">
              {dict.trades.emotions[trade.emotionAfter]}
            </span>
          </span>
        ) : null}
        {trade.confidence !== null ? (
          <span
            data-testid="trade-confidence"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs"
          >
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {T.confidenceLabel}
            </span>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {trade.confidence}/5
            </span>
          </span>
        ) : null}
        {trade.followedPlan !== null ? (
          <span
            data-testid="trade-followed-plan"
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              trade.followedPlan ? "border-accent/50 text-accent" : "border-warning/40 text-warning",
            )}
          >
            {trade.followedPlan ? dict.trades.judgment.planYes : dict.trades.judgment.planNo}
          </span>
        ) : null}
      </div>
    </section>
  ) : null;

  const tagsSection = (
    <section>
      <p className="mb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
        {T.tagsHeading}
      </p>
      <div className="flex flex-wrap gap-1.5" data-testid="trade-tags">
        {tags.map((tag) => {
          const selected = selectedTagIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={selected}
              data-testid={`trade-tag-${tag.name}`}
              onClick={() =>
                onSaveTags(
                  selected
                    ? selectedTagIds.filter((id) => id !== tag.id)
                    : [...selectedTagIds, tag.id],
                )
              }
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                selected
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground",
              )}
            >
              {tag.name}
            </button>
          );
        })}
        {tagsDirty ? (
          <span className="self-center text-[10px] text-warning">{T.savingChip}</span>
        ) : null}
      </div>
    </section>
  );

  const notesSection = (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          {T.notesHeading}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-accent"
          onClick={onSaveNotes}
          disabled={!notesDirty || updateNotes.isPending}
          data-testid="trade-notes-save"
        >
          {updateNotes.isPending ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : null}
          {dict.common.save}
        </Button>
      </div>
      <Textarea
        value={notesDraft}
        onChange={(event) => setNotesDraft(event.target.value)}
        placeholder={T.notesPlaceholder}
        className="min-h-24"
        data-testid="trade-notes-input"
      />
    </section>
  );

  const screenshotsSection = (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          {T.screenshotsWord} ({screenshots.length})
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onUploadScreenshot}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-accent"
          onClick={() => fileInputRef.current?.click()}
          disabled={addScreenshot.isPending}
          data-testid="trade-screenshot-add"
        >
          {addScreenshot.isPending ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="size-3.5" aria-hidden="true" />
          )}
          {T.upload}
        </Button>
      </div>
      {screenshots.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          {T.noEvidence}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="trade-screenshots">
          {screenshots.map((screenshot) => (
            <li
              key={screenshot.id}
              className="group relative overflow-hidden rounded-lg border border-border"
            >
              {/* storageKey carries a data URL in the mock API. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshot.storageKey}
                alt={`${T.screenshotAlt} ${screenshot.kind.toLowerCase()}`}
                className="h-24 w-full object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  deleteScreenshot.mutate({ tradeId: trade.id, screenshotId: screenshot.id })
                }
                aria-label={T.deleteScreenshotAria}
                className="absolute top-1 right-1 grid size-6 place-items-center rounded-md bg-background/80 text-loss opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  /** One column on mobile, notes | evidence side by side on desktop. */
  const detailBody = (
    <>
      {verdictSection}
      <TradeSessionChart tradeId={trade.id} open={open} />
      <TradeChartAnalysisSection trade={trade} open={open} />
      <TradePlanSection trade={trade} />
      <div className={cn("grid gap-5", "lg:grid-cols-2")}>
        <div className="space-y-5">
          {strategySection}
          {psychologySection}
          {tagsSection}
          {notesSection}
        </div>
        <div className="space-y-5">{screenshotsSection}</div>
      </div>
    </>
  );

  const actionFooter = (
    <div className="flex items-center gap-2 border-t border-border bg-surface p-3">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => onEdit(trade)}
        data-testid="trade-edit-open"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        {dict.trades.shared.edit}
      </Button>
      {!isClosed ? (
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setExitPrice("");
            setExitAtLocal(isoToLocalInput(new Date().toISOString()));
            setExitReason("MANUAL");
            setCloseOpen(true);
          }}
          data-testid="trade-close-open"
        >
          {T.closePosition}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto gap-1.5 text-loss hover:text-loss"
        onClick={() => setConfirmDelete(true)}
        data-testid="trade-delete-open"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        {dict.trades.shared.delete}
      </Button>
    </div>
  );

  // Shared destructive-action dialogs (rendered by both surfaces).
  const deleteAndCloseDialogs = (
    <>
      {/* Delete confirmation */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm" data-testid="trade-delete-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{T.deleteTitle}</DialogTitle>
            <DialogDescription>
              {instrument?.symbol} {trade.direction} ·{" "}
              {isoToLocalInput(trade.entryAt).slice(0, 10)} {T.deleteBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {dict.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={deleteTrade.isPending}
              data-testid="trade-delete-confirm"
            >
              {deleteTrade.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              {T.deleteTrade}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close position */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="sm:max-w-sm" data-testid="trade-close-dialog">
          <SheetHeader className="p-0">
            <DialogHeader className="gap-1 p-0">
              <DialogTitle className="font-heading">{T.closeDialogTitle}</DialogTitle>
              <DialogDescription>
                {T.closeDialogDescription}
              </DialogDescription>
            </DialogHeader>
          </SheetHeader>
          <form onSubmit={onClosePosition} className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="close-exit-price">{dict.trades.form.exitPrice}</Label>
              <input
                id="close-exit-price"
                value={exitPrice}
                onChange={(event) => setExitPrice(event.target.value)}
                inputMode="decimal"
                autoFocus
                required
                className={inputClasses}
                data-testid="trade-close-exit-price"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="close-exit-at">{dict.trades.form.exitTime}</Label>
              <input
                id="close-exit-at"
                type="datetime-local"
                value={exitAtLocal}
                onChange={(event) => setExitAtLocal(event.target.value)}
                className={`${inputClasses} px-2`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="close-exit-reason">{dict.trades.form.exitReason}</Label>
              <select
                id="close-exit-reason"
                value={exitReason}
                onChange={(event) => setExitReason(event.target.value)}
                className={cn(inputClasses, "font-sans")}
              >
                {EXIT_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setCloseOpen(false)}>
                {dict.common.cancel}
              </Button>
              <Button type="submit" disabled={closeTrade.isPending} data-testid="trade-close-confirm">
                {closeTrade.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {T.closePosition}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );

  // Mobile (< lg): full-width right sheet, single column.
  if (isDesktop === false) {
    return (
      <>
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side="right"
            className="flex w-full! max-w-none! flex-col gap-0 p-0"
            data-testid="trade-detail-drawer"
          >
            <SheetHeader className="gap-1 border-b border-border p-4 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <SheetTitle className="flex items-center gap-2 font-heading text-lg font-semibold">
                    {instrument?.symbol ?? T.fallbackTitle}
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
                        trade.status === "OPEN"
                          ? "border-accent/50 text-accent"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {trade.status}
                    </span>
                  </SheetTitle>
                  <SheetDescription>
                    {trade.direction} · {formatNumber(trade.quantity, 2)} lots ·{" "}
                    {isoToLocalInput(trade.entryAt).slice(0, 10)}
                  </SheetDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => onOpenChange(false)}
                  aria-label={T.closeDetailsAria}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              {detailBody}
            </div>

            {actionFooter}
          </SheetContent>
        </Sheet>
        {deleteAndCloseDialogs}
      </>
    );
  }

  // Desktop (≥ lg): FULL-WIDTH centered dialog — plan/reality on one row,
  // notes and evidence side by side. Built-in close button, no custom X.
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="grid max-h-[92dvh] w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[calc(100%-2rem)]"
          data-testid="trade-detail-dialog"
        >
          <DialogHeader className="gap-1 border-b border-border p-4 pr-14 pb-3">
            <DialogTitle className="flex items-center gap-2 font-heading text-lg font-semibold">
              {instrument?.symbol ?? T.fallbackTitle}
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
                  trade.status === "OPEN"
                    ? "border-accent/50 text-accent"
                    : "border-border text-muted-foreground",
                )}
              >
                {trade.status}
              </span>
            </DialogTitle>
            <DialogDescription>
              {trade.direction} · {formatNumber(trade.quantity, 2)} lots ·{" "}
              {isoToLocalInput(trade.entryAt).slice(0, 10)}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-5 overflow-y-auto p-4">{detailBody}</div>

          {actionFooter}
        </DialogContent>
      </Dialog>
      {deleteAndCloseDialogs}
    </>
  );
}
