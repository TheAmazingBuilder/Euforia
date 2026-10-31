"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import type { ExitReason, Trade } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DirectionSegmented } from "@/components/trades/direction-segmented";
import { InstrumentCombobox } from "@/components/trades/instrument-combobox";
import { useStrategies, useUpdateTrade } from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { isoToLocalInput, localInputToISO } from "@/lib/utils/datetime";
import type { UpdateTradeInput } from "@cosmoz/shared";
import { useI18n } from "@/i18n/i18n-provider";

const EXIT_REASONS: ExitReason[] = ["TP", "SL", "MANUAL", "TRAILING", "PARTIAL", "MARGIN"];

const inputClasses =
  "h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

interface TradeEditDialogProps {
  trade: Trade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edit dialog - corrects the journal record. Fields differ by status: OPEN
 * trades edit the plan, CLOSED trades additionally edit the recorded exit
 * (results recompute server-side on save).
 */
export function TradeEditDialog({ trade, open, onOpenChange }: TradeEditDialogProps) {
  const { dict } = useI18n();
  const T = dict.trades.edit;
  const updateTrade = useUpdateTrade();
  const { data: strategiesData } = useStrategies();
  const strategies = strategiesData?.strategies ?? [];

  // Field state (empty string = "unchanged" for optional numeric fields).
  const [instrumentId, setInstrumentId] = React.useState<string | null>(null);
  const [direction, setDirection] = React.useState<"BUY" | "SELL">("BUY");
  const [entryPrice, setEntryPrice] = React.useState("");
  const [entryAtLocal, setEntryAtLocal] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [initialStop, setInitialStop] = React.useState("");
  const [initialTP, setInitialTP] = React.useState("");
  const [strategyId, setStrategyId] = React.useState<string>("");
  const [fees, setFees] = React.useState("");
  const [swap, setSwap] = React.useState("");
  const [exitPrice, setExitPrice] = React.useState("");
  const [exitAtLocal, setExitAtLocal] = React.useState("");
  const [exitReason, setExitReason] = React.useState<ExitReason>("MANUAL");

  // Re-hydrate the form whenever a different trade is opened - the
  // render-time adjustment pattern (no setState inside effects).
  const [hydratedFor, setHydratedFor] = React.useState<string | null>(null);
  const hydratedKey = open && trade ? trade.id : null;
  if (hydratedKey !== null && hydratedFor !== hydratedKey) {
    setHydratedFor(hydratedKey);
    setInstrumentId(trade!.instrumentId);
    setDirection(trade!.direction);
    setEntryPrice(trade!.entryPrice);
    setEntryAtLocal(isoToLocalInput(trade!.entryAt));
    setQuantity(trade!.quantity);
    setInitialStop(trade!.initialStop ?? "");
    setInitialTP(trade!.initialTP ?? "");
    setStrategyId(trade!.strategyId ?? "none");
    setFees(trade!.fees);
    setSwap(trade!.swap);
    setExitPrice(trade!.exitPrice ?? "");
    setExitAtLocal(trade!.exitAt ? isoToLocalInput(trade!.exitAt) : "");
    setExitReason(trade!.exitReason ?? "MANUAL");
  }

  if (trade === null) return null;
  const isClosed = trade.status === "CLOSED";

  const buildPatch = (): UpdateTradeInput | null => {
    const patch: UpdateTradeInput = {};
    if (instrumentId !== trade.instrumentId) patch.instrumentId = instrumentId ?? trade.instrumentId;
    if (direction !== trade.direction) patch.direction = direction;
    if (entryPrice !== trade.entryPrice) patch.entryPrice = entryPrice;
    const entryIso = localInputToISO(entryAtLocal);
    if (entryIso !== null && entryIso !== trade.entryAt) patch.entryAt = entryIso;
    if (quantity !== trade.quantity) patch.quantity = quantity;
    if ((initialStop || null) !== (trade.initialStop ?? "")) {
      if (initialStop === "") patch.initialStop = null;
      else patch.initialStop = initialStop;
    }
    if ((initialTP || null) !== (trade.initialTP ?? "")) {
      if (initialTP === "") patch.initialTP = null;
      else patch.initialTP = initialTP;
    }
    if ((strategyId === "none" ? null : strategyId || null) !== (trade.strategyId ?? null)) {
      patch.strategyId = strategyId === "none" ? null : strategyId || null;
    }
    if (fees !== trade.fees && fees !== "") patch.fees = fees;
    if (swap !== trade.swap && swap !== "") patch.swap = swap;

    if (isClosed) {
      if (exitPrice !== "" && exitPrice !== trade.exitPrice) patch.exitPrice = exitPrice;
      const exitIso = localInputToISO(exitAtLocal);
      if (exitIso !== null && trade.exitAt !== null && exitIso !== trade.exitAt) patch.exitAt = exitIso;
      if (trade.exitReason !== null && exitReason !== trade.exitReason) patch.exitReason = exitReason;
    }
    return Object.keys(patch).length > 0 ? patch : null;
  };

  const onSave = (event: React.FormEvent) => {
    event.preventDefault();
    const patch = buildPatch();
    if (patch === null) {
      onOpenChange(false);
      return;
    }
    updateTrade.mutate(
      { tradeId: trade.id, input: patch },
      {
        onSuccess: () => {
          toast.success(T.tradeUpdated, { description: isClosed ? T.resultsRecomputed : undefined });
          onOpenChange(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, dict.trades.errors.tradeUpdate)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="gap-1 border-b border-border p-4 pb-3">
          <DialogTitle className="font-heading text-lg font-semibold">
            {T.title}
          </DialogTitle>
          <DialogDescription>
            {T.descPrefix}{isClosed ? T.descClosed : T.descOpen}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSave} className="grid gap-3 p-4" data-testid="trade-edit-form">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{dict.trades.form.instrument}</Label>
              <InstrumentCombobox value={instrumentId} onChange={(selected) => setInstrumentId(selected.id)} />
            </div>
            <div className="space-y-1.5">
              <Label>{dict.trades.form.direction}</Label>
              <DirectionSegmented value={direction} onChange={setDirection} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-entry-price">{dict.trades.form.entryPrice}</Label>
              <input
                id="edit-entry-price"
                value={entryPrice}
                onChange={(event) => setEntryPrice(event.target.value)}
                inputMode="decimal"
                className={inputClasses}
                data-testid="trade-edit-entry-price"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-entry-at">{dict.trades.form.entryTime}</Label>
              <input
                id="edit-entry-at"
                type="datetime-local"
                value={entryAtLocal}
                onChange={(event) => setEntryAtLocal(event.target.value)}
                className={`${inputClasses} px-2`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-quantity">{T.quantity}</Label>
              <input
                id="edit-quantity"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                className={inputClasses}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-stop">{dict.trades.detail.initialStop}</Label>
              <input
                id="edit-stop"
                value={initialStop}
                onChange={(event) => setInitialStop(event.target.value)}
                placeholder="-"
                inputMode="decimal"
                className={inputClasses}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-tp">{T.initialTP}</Label>
              <input
                id="edit-tp"
                value={initialTP}
                onChange={(event) => setInitialTP(event.target.value)}
                placeholder="-"
                inputMode="decimal"
                className={inputClasses}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{dict.trades.form.strategy}</Label>
              <Select value={strategyId || "none"} onValueChange={setStrategyId}>
                <SelectTrigger className="h-9" data-testid="trade-edit-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {strategies.map((strategy) => (
                    <SelectItem key={strategy.id} value={strategy.id}>
                      {strategy.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">{dict.trades.shared.outOfPlaybook}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-fees">{dict.trades.detail.fees}</Label>
              <input
                id="edit-fees"
                value={fees}
                onChange={(event) => setFees(event.target.value)}
                inputMode="decimal"
                className={inputClasses}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-swap">{T.swap}</Label>
              <input
                id="edit-swap"
                value={swap}
                onChange={(event) => setSwap(event.target.value)}
                inputMode="decimal"
                className={inputClasses}
              />
            </div>
          </div>

          {isClosed ? (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-exit-price">{dict.trades.form.exitPrice}</Label>
                <input
                  id="edit-exit-price"
                  value={exitPrice}
                  onChange={(event) => setExitPrice(event.target.value)}
                  inputMode="decimal"
                  className={inputClasses}
                  data-testid="trade-edit-exit-price"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-exit-at">{dict.trades.form.exitTime}</Label>
                <input
                  id="edit-exit-at"
                  type="datetime-local"
                  value={exitAtLocal}
                  onChange={(event) => setExitAtLocal(event.target.value)}
                  className={`${inputClasses} px-2`}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{dict.trades.form.exitReason}</Label>
                <Select value={exitReason} onValueChange={(value) => setExitReason(value as ExitReason)}>
                  <SelectTrigger className="h-9">
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
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {dict.common.cancel}
            </Button>
            <Button type="submit" disabled={updateTrade.isPending} data-testid="trade-edit-save">
              {updateTrade.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              {T.saveChanges}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
