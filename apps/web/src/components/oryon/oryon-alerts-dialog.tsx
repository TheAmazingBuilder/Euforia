"use client";

import * as React from "react";

import type { OryonAlert, OryonAlertCondition } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useOryonAlerts, type AlertCreatePrefill } from "@/components/oryon/oryon-alerts-context";

/**
 * Oryon price-alert creation dialog (Phase 5 spec §6.1).
 *
 * One entry point (the toolbar button — redundant chart interactions are
 * deliberately avoided), prefilled with the ACTIVE chart instrument and its
 * current quote price. Compact, keyboard-accessible (Radix focus trap,
 * Escape dismisses), inline validation:
 *   - the target price must be a finite positive number — anything else is
 *     rejected with an inline message, the dialog stays open;
 *   - the optional label is capped at 64 chars (shared contract);
 *   - no notification-method selector: the only implemented channel is the
 *     in-app toast, and the scope note says exactly that (§6.1 — never imply
 *     a delivery method that does not exist).
 *
 * State lifecycle: the FORM MOUNTS FRESH on every open (keyed content) and
 * seeds its fields from the prefill — no effect-driven resets, no stale
 * state across opens (the react-hooks v6 discipline).
 *
 * Read-only discipline: creating an alert writes a browser-local record and
 * draws a line — it NEVER touches orders, positions or any broker surface.
 */
export function OryonAlertDialog() {
  const { createOpen, prefill, closeCreate } = useOryonAlerts();

  return (
    <Dialog open={createOpen} onOpenChange={(open) => (open ? undefined : closeCreate())}>
      <DialogContent
        data-testid="oryon-alert-dialog"
        className="max-w-sm gap-4"
        // Plain Radix portal — chart pointer events never reach it.
      >
        {createOpen && prefill !== null ? (
          <OryonAlertForm key={`${prefill.symbol}:${createOpen}`} prefill={prefill} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Mounted fresh per open — state seeded from the prefill, never reset. */
function OryonAlertForm({ prefill }: { prefill: AlertCreatePrefill }) {
  const dict = useDict();
  const S = dict.oryon.alerts;
  const { closeCreate, createAlert } = useOryonAlerts();

  const [target, setTarget] = React.useState(() => {
    const price = prefill.price;
    return typeof price === "number" && Number.isFinite(price) && price > 0
      ? price.toFixed(Math.max(0, prefill.digits))
      : "";
  });
  const [condition, setCondition] = React.useState<OryonAlertCondition>("crosses_above");
  const [label, setLabel] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = Number(target.trim());
    if (target.trim() === "" || !Number.isFinite(parsed) || parsed <= 0) {
      setError(S.errorTarget);
      return;
    }
    let created: OryonAlert | null = null;
    const trimmedLabel = label.trim();
    created = createAlert({
      symbol: prefill.symbol,
      targetPrice: parsed,
      condition,
      label: trimmedLabel.length > 0 ? trimmedLabel : null,
    });
    if (created === null) {
      // Record cap reached / store refused — inline message, dialog stays.
      setError(S.errorTarget);
      return;
    }
    closeCreate();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle data-testid="oryon-alert-dialog-title">{S.createTitle}</DialogTitle>
        <DialogDescription>{S.notificationNote}</DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{S.instrumentLabel}</span>
          <span
            data-testid="oryon-alert-dialog-symbol"
            className="inline-flex w-fit items-center rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-xs font-semibold text-foreground"
          >
            {prefill.symbol}
          </span>
          <span className="text-[10px] text-muted-foreground">{S.instrumentHint}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="oryon-alert-target" className="text-xs font-medium text-muted-foreground">
            {S.targetLabel}
          </label>
          <Input
            id="oryon-alert-target"
            data-testid="oryon-alert-target"
            value={target}
            onChange={(event) => {
              setTarget(event.target.value);
              if (error !== null) setError(null);
            }}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-invalid={error !== null}
            className="font-mono"
          />
          {error !== null ? (
            <p data-testid="oryon-alert-target-error" className="text-[11px] font-medium text-loss">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{S.conditionLabel}</span>
          <Select
            value={condition}
            onValueChange={(value) => setCondition(value as OryonAlertCondition)}
          >
            <SelectTrigger data-testid="oryon-alert-condition" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="crosses_above">{S.conditionAbove}</SelectItem>
              <SelectItem value="crosses_below">{S.conditionBelow}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="oryon-alert-label" className="text-xs font-medium text-muted-foreground">
            {S.labelOptional}
          </label>
          <Input
            id="oryon-alert-label"
            data-testid="oryon-alert-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={64}
            autoComplete="off"
            placeholder={S.labelPlaceholder}
          />
        </div>

        <DialogFooter className="mt-1 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={closeCreate}
            data-testid="oryon-alert-cancel"
          >
            {S.cancel}
          </Button>
          <Button type="submit" size="sm" data-testid="oryon-alert-submit">
            {S.create}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
