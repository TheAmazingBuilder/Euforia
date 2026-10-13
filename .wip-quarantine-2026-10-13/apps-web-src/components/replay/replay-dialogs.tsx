"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

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
import { computeRR, computeRiskAmount, formatMoney, suggestPositionSize } from "@cosmoz/shared";
import type { Instrument, ReplayTrade } from "@cosmoz/shared";

import {
  useReplayCloseTrade,
  useReplayCreateNote,
  useReplayCreateTrade,
} from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Replay simulation dialogs (REPLAY MASTER PROMPT §23/§25/§28) — open a
 * SIMULATED position (with the shared risk/position-size math reused — no
 * second risk engine), settle it, or pin a timestamped note. Nothing here
 * touches a broker; these are journal-adjacent replay records only.
 */

const inputClass = "h-9 font-mono text-sm";

interface TradeDialogProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instrument: Instrument | null;
  /** Last visible close — the honest pre-fill for the entry. */
  lastPrice: number | null;
  startingBalance: string | null;
  riskPerTradePct: number | null;
  direction: "BUY" | "SELL";
  onDirectionChange: (direction: "BUY" | "SELL") => void;
}

export function ReplayTradeDialog({
  sessionId,
  open,
  onOpenChange,
  instrument,
  lastPrice,
  startingBalance,
  riskPerTradePct,
  direction,
  onDirectionChange,
}: TradeDialogProps) {
  const { dict } = useI18n();
  const T = dict.replay;
  const create = useReplayCreateTrade(sessionId);

  const [entry, setEntry] = React.useState("");
  const [stop, setStop] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [note, setNote] = React.useState("");
  const [wasOpen, setWasOpen] = React.useState(false);

  // Open-transition state reset — render-phase adjustment (React docs
  // pattern), no effect cascades.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEntry(lastPrice !== null ? String(lastPrice) : "");
      setStop("");
      setTarget("");
      setQuantity("");
      setNote("");
    }
  }

  const specs = instrument
    ? { pipSize: instrument.pipSize, contractSize: instrument.contractSize }
    : { pipSize: "0.0001", contractSize: "1" };

  const suggestion =
    stop !== "" && startingBalance !== null && riskPerTradePct !== null
      ? suggestPositionSize(entry, stop, riskPerTradePct, startingBalance, specs)
      : null;
  const rr = stop !== "" && target !== "" ? computeRR(entry, stop, target, direction) : null;
  const riskAtStop =
    stop !== "" && quantity !== ""
      ? computeRiskAmount(entry, stop, quantity, specs.contractSize)
      : null;

  const submit = () => {
    if (entry.trim() === "" || quantity.trim() === "") return;
    create.mutate(
      {
        direction,
        entryPrice: entry.trim(),
        stopLoss: stop.trim() === "" ? null : stop.trim(),
        takeProfit: target.trim() === "" ? null : target.trim(),
        quantity: quantity.trim(),
        note: note.trim() === "" ? null : note.trim(),
      },
      { onSettled: (result) => { if (result) onOpenChange(false); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="replay-trade-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">{T.trade.title}</DialogTitle>
          <DialogDescription>{T.trade.subtitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={T.trade.direction}>
            {(
              [
                { value: "BUY" as const, label: T.trade.long, Icon: ArrowUpRight, tone: "border-profit/50 bg-profit/10 text-profit" },
                { value: "SELL" as const, label: T.trade.short, Icon: ArrowDownRight, tone: "border-loss/50 bg-loss/10 text-loss" },
              ]
            ).map(({ value, label, Icon, tone }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={direction === value}
                data-testid={`replay-direction-${value}`}
                onClick={() => onDirectionChange(value)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                  direction === value ? tone : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="replay-entry" className="text-xs">{T.trade.entry}</Label>
              <Input id="replay-entry" inputMode="decimal" value={entry} onChange={(event) => setEntry(event.target.value)} className={inputClass} data-testid="replay-entry" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="replay-stop" className="text-xs">{T.trade.stop}</Label>
              <Input id="replay-stop" inputMode="decimal" value={stop} onChange={(event) => setStop(event.target.value)} className={inputClass} data-testid="replay-stop" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="replay-target" className="text-xs">{T.trade.target}</Label>
              <Input id="replay-target" inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} className={inputClass} data-testid="replay-target" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="replay-qty" className="text-xs">{T.trade.quantity}</Label>
              <Input id="replay-qty" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} data-testid="replay-qty" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="replay-note" className="text-xs">{T.trade.note}</Label>
              <Input id="replay-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={T.trade.notePlaceholder} className={inputClass} data-testid="replay-note-input" />
            </div>
          </div>

          {/* Risk math — the shared engine, live estimate (§23: reuse, don't rebuild) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-[11px] text-muted-foreground" data-testid="replay-trade-math">
            {suggestion ? (
              <button
                type="button"
                onClick={() => setQuantity(suggestion.quantity)}
                className="underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                title={T.trade.suggestedSize}
              >
                {T.trade.suggestedSize}: <span className="font-mono text-foreground">{suggestion.quantity}</span>
              </button>
            ) : null}
            {riskAtStop ? (
              <span>
                {T.trade.riskAmount}: <span className="font-mono text-foreground">{formatMoney(riskAtStop, instrument?.quoteCurrency ?? "USD")}</span>
              </span>
            ) : null}
            {rr !== null ? (
              <span>
                {T.trade.rr}: <span className="font-mono text-foreground">1:{rr.toFixed(2)}</span>
              </span>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            {dict.common.cancel}
          </Button>
          <Button onClick={submit} disabled={create.isPending || entry.trim() === "" || quantity.trim() === ""} data-testid="replay-trade-submit">
            {create.isPending ? T.trade.opening : T.trade.open}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CloseDialogProps {
  sessionId: string;
  trade: ReplayTrade | null;
  onOpenChange: (open: boolean) => void;
  lastPrice: number | null;
}

export function ReplayCloseTradeDialog({ sessionId, trade, onOpenChange, lastPrice }: CloseDialogProps) {
  const { dict } = useI18n();
  const T = dict.replay;
  const close = useReplayCloseTrade(sessionId);
  const [exit, setExit] = React.useState("");
  const [wasTradeId, setWasTradeId] = React.useState<string | null>(null);

  if (trade !== null && trade.id !== wasTradeId) {
    setWasTradeId(trade.id);
    setExit(lastPrice !== null ? String(lastPrice) : "");
  }

  return (
    <Dialog open={trade !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="replay-close-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">{T.trade.closeTitle}</DialogTitle>
          <DialogDescription>{T.trade.closeSubtitle}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="replay-exit" className="text-xs">{T.trade.exitPrice}</Label>
          <Input
            id="replay-exit"
            inputMode="decimal"
            value={exit}
            onChange={(event) => setExit(event.target.value)}
            className={inputClass}
            data-testid="replay-exit"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={close.isPending}>
            {dict.common.cancel}
          </Button>
          <Button
            onClick={() => {
              if (!trade || exit.trim() === "") return;
              close.mutate(
                { tradeId: trade.id, exitPrice: exit.trim() },
                { onSettled: (result) => { if (result) onOpenChange(false); } },
              );
            }}
            disabled={close.isPending || exit.trim() === ""}
            data-testid="replay-close-submit"
          >
            {close.isPending ? T.trade.closing : T.trade.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface NoteDialogProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMs: number;
}

export function ReplayNoteDialog({ sessionId, open, onOpenChange, currentMs }: NoteDialogProps) {
  const { dict } = useI18n();
  const T = dict.replay;
  const create = useReplayCreateNote(sessionId);
  const [body, setBody] = React.useState("");
  const [wasOpen, setWasOpen] = React.useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setBody("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="replay-note-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">{T.note.title}</DialogTitle>
          <DialogDescription>
            {new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(currentMs))} UTC
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={T.note.bodyPlaceholder}
          rows={4}
          data-testid="replay-note-body"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-accent/60"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            {dict.common.cancel}
          </Button>
          <Button
            onClick={() => {
              if (body.trim() === "") return;
              create.mutate(
                { body: body.trim() },
                { onSettled: (result) => { if (result) onOpenChange(false); } },
              );
            }}
            disabled={create.isPending || body.trim() === ""}
            data-testid="replay-note-submit"
          >
            {create.isPending ? T.note.saving : T.note.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
