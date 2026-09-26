"use client";

import * as React from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, PencilLine, Smile, StickyNote, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import type { Emotion, ExitReason, Instrument, Trade } from "@cosmoz/shared";
import { formatPrice } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmotionPicker } from "@/components/trades/emotion-picker";
import { useCloseTrade, useUpdateNotes, useUpdatePlan, useUpdatePsychology } from "@/lib/api/queries";
import { unrealizedPnl, type LiveQuote } from "@/lib/realtime/market";
import { useNowMs } from "@/lib/realtime/use-now";
import { localInputToISO, nowLocalInput } from "@/lib/utils/datetime";
import { openGate } from "@/lib/hooks/use-judgment-flow";
import { cn } from "@/lib/utils";

/**
 * Open-trade card (spec §9): instrument + direction badge, live-ticking open
 * duration, entry, current price, initial SL/TP, potential R:R and the
 * unrealized P&L marked to the session's live feed (Session Live V1). The
 * in-session actions stay journal-side — [Close] (→ POST close → the
 * Judgment Gate), [Modify SL] (inline editor with a "stop widened" warning
 * when risk increases), 1-tap emotion quick-log and the note icon. None of
 * them talk to a broker: the feed is read-only (mission §21).
 */

/** Live-ticking open duration "01h 42m 22s" — a 1 Hz interval, starting one tick after mount. */
function LiveDuration({ entryAt }: { entryAt: string }) {
  const [nowMs, setNowMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    // setState inside the interval callback (external system ticking) —
    // never synchronously in the effect body.
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (nowMs === null) {
    return <span className="font-mono tabular-nums">--h --m</span>;
  }
  const seconds = Math.max(0, Math.floor((nowMs - Date.parse(entryAt)) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    <span className="font-mono tabular-nums">
      {pad(h)}h {pad(m)}m {pad(s)}s
    </span>
  );
}

function DirectionBadge({ direction }: { direction: Trade["direction"] }) {
  const sell = direction === "SELL";
  const Icon = sell ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        sell ? "bg-destructive/15 text-destructive" : "bg-profit/15 text-profit",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {sell ? "Short" : "Long"}
    </span>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm tabular-nums text-foreground">{children}</div>
    </div>
  );
}

// ── Close dialog ─────────────────────────────────────────────────────────────

const CLOSE_REASONS: readonly ExitReason[] = ["TP", "SL", "MANUAL", "TRAILING", "MARGIN"];

function CloseTradeDialog({
  trade,
  open,
  onOpenChange,
}: {
  trade: Trade;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Initial values are set once per mount — the card remounts this dialog
  // with a fresh key each time it opens (see OpenTradeCard below).
  const [exitPrice, setExitPrice] = React.useState("");
  const [exitAtLocal, setExitAtLocal] = React.useState(() => nowLocalInput());
  const [reason, setReason] = React.useState<ExitReason>("MANUAL");
  const closeTrade = useCloseTrade();

  const ready = exitPrice.trim() !== "" && localInputToISO(exitAtLocal) !== null && !closeTrade.isPending;

  const submit = async () => {
    const exitAt = localInputToISO(exitAtLocal);
    if (exitAt === null || exitPrice.trim() === "") return;
    try {
      const response = await closeTrade.mutateAsync({
        tradeId: trade.id,
        input: {
          mode: "single",
          exitPrice: exitPrice.trim(),
          exitAt,
          exitReason: reason,
        },
      });
      onOpenChange(false);
      if ("awaitingDecision" in response && response.awaitingDecision) {
        // Hard contract: closing withholds P&L — the Gate comes next (§5).
        openGate(response.id);
      }
    } catch {
      toast.error("Could not close the trade", { description: "Check the exit price and retry." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Close position</DialogTitle>
          <DialogDescription>
            Log the exit — the judgment gate opens right after, before any result is shown.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="close-exit-price">Exit price</Label>
              <Input
                id="close-exit-price"
                inputMode="decimal"
                autoComplete="off"
                value={exitPrice}
                onChange={(event) => setExitPrice(event.target.value)}
                className="font-mono"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="close-exit-time">Exit time</Label>
              <Input
                id="close-exit-time"
                type="datetime-local"
                value={exitAtLocal}
                onChange={(event) => setExitAtLocal(event.target.value)}
                className="font-mono"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="close-reason">Exit reason</Label>
            <Select value={reason} onValueChange={(value) => setReason(value as ExitReason)}>
              <SelectTrigger id="close-reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLOSE_REASONS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!ready} type="button">
            Close trade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modify SL inline editor ──────────────────────────────────────────────

function ModifyStopEditor({
  trade,
  instrument,
  onDone,
}: {
  trade: Trade;
  instrument: Instrument | null;
  onDone: () => void;
}) {
  const currentStop = trade.finalStop ?? trade.initialStop;
  const [value, setValue] = React.useState(currentStop ?? "");
  const updatePlan = useUpdatePlan();

  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && parsed > 0 && value.trim() !== "";
  // Widening = the stop moves FARTHER from the entry (risk increases):
  // further down for a long, further up for a short.
  const widened =
    valid &&
    currentStop !== null &&
    (trade.direction === "BUY" ? parsed < Number(currentStop) : parsed > Number(currentStop));

  const digits = instrument?.digits ?? 5;

  const save = async () => {
    if (!valid) return;
    try {
      await updatePlan.mutateAsync({
        tradeId: trade.id,
        input: { stop: value.trim() },
      });
      toast.success(
        widened ? "Stop widened — logged as a behavioral event" : "Stop updated",
        { description: "The server recorded this modification in the trade event log." },
      );
      onDone();
    } catch {
      toast.error("Could not update the stop", { description: "Check the price and retry." });
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface-raised p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono line-through tabular-nums">
          {currentStop !== null ? formatPrice(currentStop, digits) : "—"}
        </span>
        <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className={cn("font-mono tabular-nums", widened ? "text-warning" : "text-foreground")}>
          {valid ? formatPrice(value, digits) : "…"}
        </span>
        {widened ? (
          <span className="inline-flex items-center gap-1 rounded border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
            <TriangleAlert className="size-3" aria-hidden="true" /> Stop widened — risk increases
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          autoComplete="off"
          aria-label="New stop price"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-8 w-32 font-mono"
        />
        <Button size="sm" variant="outline" onClick={onDone} type="button">
          Cancel
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={!valid || updatePlan.isPending} type="button">
          {updatePlan.isPending ? "Saving…" : "Save stop"}
        </Button>
      </div>
    </div>
  );
}

// ── Note popover ─────────────────────────────────────────────────────────────

function NotePopover({ trade }: { trade: Trade }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(trade.notes ?? "");
  const updateNotes = useUpdateNotes();

  const save = async () => {
    try {
      await updateNotes.mutateAsync({ tradeId: trade.id, input: { notes: text } });
      toast.success("Note saved");
      setOpen(false);
    } catch {
      toast.error("Could not save the note");
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setText(trade.notes ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Trade note">
          <StickyNote className="size-3.5" aria-hidden="true" />
          Note
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2" align="start">
        <Label htmlFor="trade-note">Session note</Label>
        <Textarea
          id="trade-note"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="What are you seeing right now?"
          rows={3}
        />
        <Button size="sm" onClick={() => void save()} disabled={updateNotes.isPending} type="button">
          {updateNotes.isPending ? "Saving…" : "Save note"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ── Emotion quick-log ────────────────────────────────────────────────────────

const EMOTION_LABELS: Record<Emotion, string> = {
  CALM: "Calm",
  CONFIDENT: "Confident",
  ANXIOUS: "Anxious",
  FOMO: "FOMO",
  TIRED: "Tired",
  FRUSTRATED: "Frustrated",
  REVENGE: "Revenge",
  EUPHORIC: "Euphoric",
  RELIEVED: "Relieved",
  BORED: "Bored",
};

function EmotionQuickLog({ trade }: { trade: Trade }) {
  const [open, setOpen] = React.useState(false);
  const updatePsychology = useUpdatePsychology();

  const log = async (emotion: Emotion | null) => {
    setOpen(false);
    if (emotion === null || emotion === trade.emotionAfter) return;
    try {
      await updatePsychology.mutateAsync({ tradeId: trade.id, input: { emotionAfter: emotion } });
      toast.success(`Feeling logged: ${EMOTION_LABELS[emotion]}`);
    } catch {
      toast.error("Could not log the feeling");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Quick-log how you feel">
          <Smile className="size-3.5" aria-hidden="true" />
          {trade.emotionAfter !== null ? EMOTION_LABELS[trade.emotionAfter] : "Feeling"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <p className="mb-2 text-xs font-medium text-muted-foreground">How does this trade feel right now?</p>
        <EmotionPicker value={trade.emotionAfter} onChange={(emotion) => void log(emotion)} ariaLabel="In-trade emotion" />
      </PopoverContent>
    </Popover>
  );
}

// ── The card ─────────────────────────────────────────────────────────────

export function OpenTradeCard({
  trade,
  instrument,
  quote,
}: {
  trade: Trade;
  instrument: Instrument | null;
  quote: LiveQuote | null;
}) {
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [editingStop, setEditingStop] = React.useState(false);
  const digits = instrument?.digits ?? 5;
  const contractSize = instrument?.contractSize ?? "1";
  // A frozen quote must not keep valuing the position as if the market moved
  // (stale-data protection, mission §17). Time gating via useNowMs — no
  // impure reads during render.
  const nowMs = useNowMs();
  const price =
    quote !== null && nowMs !== null && nowMs - quote.ts <= 10_000 ? quote.price : null;
  const pnl = unrealizedPnl({
    entryPrice: trade.entryPrice,
    quantity: trade.quantity,
    contractSize,
    direction: trade.direction,
    lastPrice: price,
  });

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3">
        <span className="font-heading text-base font-semibold tracking-tight text-foreground">
          {instrument?.symbol ?? "…"}
        </span>
        <DirectionBadge direction={trade.direction} />
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
          <LiveDuration entryAt={trade.entryAt} />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-3">
        <Metric label="Entry">{formatPrice(trade.entryPrice, digits)}</Metric>
        <Metric label="Current">
          {price !== null ? formatPrice(price, digits) : "—"}
        </Metric>
        <Metric label="Unrealized P&L">
          <span
            className={cn(
              pnl === null ? "text-muted-foreground" : pnl >= 0 ? "text-profit" : "text-loss",
            )}
          >
            {pnl === null ? "—" : `${pnl >= 0 ? "+" : "-"}${formatPrice(Math.abs(pnl), 2)}`}
          </span>
        </Metric>
        <Metric label="Initial SL">
          {trade.initialStop !== null ? formatPrice(trade.initialStop, digits) : "—"}
        </Metric>
        <Metric label="Initial TP">
          {trade.initialTP !== null ? formatPrice(trade.initialTP, digits) : "—"}
        </Metric>
        <Metric label="Potential R:R">
          {trade.plannedRR !== null ? `1:${Number(trade.plannedRR).toFixed(2)}` : "—"}
        </Metric>
      </div>

      <div className="space-y-2 border-t border-border px-4 py-3">
        {editingStop ? (
          <ModifyStopEditor trade={trade} instrument={instrument} onDone={() => setEditingStop(false)} />
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="destructive" onClick={() => setCloseOpen(true)}>
            <X className="size-3.5" aria-hidden="true" />
            Close
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditingStop((previous) => !previous)}
            aria-expanded={editingStop}
          >
            <PencilLine className="size-3.5" aria-hidden="true" />
            Modify SL
          </Button>
          <EmotionQuickLog trade={trade} />
          <NotePopover trade={trade} />
        </div>
      </div>

      <CloseTradeDialog
        key={closeOpen ? "open" : "closed"}
        trade={trade}
        open={closeOpen}
        onOpenChange={setCloseOpen}
      />
    </div>
  );
}
