"use client";

import * as React from "react";
import { Loader2, Lock, Signature, Webhook } from "lucide-react";
import type {
  WebhookDeliverResponse,
  WebhookSignResponse,
  WebhooksResponse,
} from "@cosmoz/shared";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWebhookDeliver, useWebhookSign } from "@/lib/api/queries/integrations";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Inbound webhook console (§12) — the security lab. The backend signs on
 * your behalf (the raw secret never leaves the server, §18); deliveries run
 * through signature verification, timestamp freshness, replay protection and
 * schema sanity before anything touches journal data.
 */

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const DEFAULT_PAYLOADS: Record<string, string> = {
  "trade.closed": JSON.stringify(
    { tradeId: "trd_1042", symbol: "EURUSD", direction: "LONG", netR: 1.8, closedAt: "2026-09-29T14:32:00Z" },
    null,
    2,
  ),
  "rule.breach": JSON.stringify(
    { ruleId: "max_daily_loss", severity: "WARN", note: "Session loss cap reached" },
    null,
    2,
  ),
  "eco.update": JSON.stringify(
    { eventId: "eco_8841", currency: "USD", impact: "HIGH", actual: "3.1" },
    null,
    2,
  ),
  "provider.alert": JSON.stringify(
    { providerId: "news-wire", kind: "LATENCY", message: "Upstream latency elevated" },
    null,
    2,
  ),
};

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2">
      <span
        className={cn(
          "mt-1 size-1.5 shrink-0 rounded-full",
          ok ? "bg-profit" : "bg-loss",
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-xs font-medium", ok ? "text-foreground" : "text-loss")}>{label}</p>
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export function WebhookConsole({ webhooks }: { webhooks: WebhooksResponse }) {
  const sign = useWebhookSign();
  const deliver = useWebhookDeliver();

  const [eventType, setEventType] = React.useState(webhooks.info.eventsSubscribed[0] ?? "trade.closed");
  const [payloadText, setPayloadText] = React.useState(DEFAULT_PAYLOADS[webhooks.info.eventsSubscribed[0] ?? "trade.closed"] ?? "{}");
  const [corrupt, setCorrupt] = React.useState(false);
  // The signature is bound to the exact draft that was signed — any edit
  // invalidates it and forces a fresh server-side sign.
  const [signed, setSigned] = React.useState<{
    response: WebhookSignResponse;
    draft: string;
    corrupt: boolean;
  } | null>(null);
  const [delivery, setDelivery] = React.useState<WebhookDeliverResponse | null>(null);

  const payloadChanged =
    signed === null || signed.draft !== payloadText || signed.corrupt !== corrupt;

  function switchEvent(next: string) {
    setEventType(next);
    setPayloadText(DEFAULT_PAYLOADS[next] ?? "{}");
    setSigned(null);
    setDelivery(null);
  }

  function handleSign() {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadText) as Record<string, unknown>;
    } catch {
      toast.error("Payload is not valid JSON — fix it before signing.");
      return;
    }
    sign.mutate(
      { eventType, payload, timestamp: Date.now(), corrupt },
      {
        onSuccess: (response) => {
          setSigned({ response, draft: payloadText, corrupt });
          setDelivery(null);
          toast.success(
            corrupt
              ? "Payload signed with a corrupted signature — the endpoint must reject it."
              : "Payload signed server-side — the secret never left the backend.",
          );
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Signing failed.")),
      },
    );
  }

  function handleDeliver(withSignature: boolean) {
    if (!withSignature && signed === null) {
      // Unsigned delivery: honest MISSING-signature demo.
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(payloadText) as Record<string, unknown>;
      } catch {
        toast.error("Payload is not valid JSON.");
        return;
      }
      deliver.mutate(
        {
          providerId: webhooks.info.providerId,
          eventType,
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          payload,
          signature: null,
        },
        {
          onSuccess: (response) => setDelivery(response),
          onError: (error) => toast.error(apiErrorMessage(error, "Delivery failed.")),
        },
      );
      return;
    }
    if (!signed) return;
    deliver.mutate(
      {
        providerId: webhooks.info.providerId,
        eventType: signed.response.eventType,
        eventId: signed.response.eventId,
        timestamp: signed.response.timestamp,
        payload: signed.response.payload,
        signature: signed.response.signature,
      },
      {
        onSuccess: (response) => {
          setDelivery(response);
          toast.success(
            response.accepted
              ? response.event.replay || response.event.duplicate
                ? "Accepted idempotently — the event id was already processed."
                : "Accepted — event queued for normalization."
              : response.reason,
          );
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Delivery failed.")),
      },
    );
  }

  const { info } = webhooks;

  return (
    <div className="space-y-6" data-testid="webhook-console">
      {/* Endpoint facts — secret masked by the backend, tolerance explicit. */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        <div className="space-y-1 bg-surface px-3 py-2.5">
          <p className="ledger-label text-[10px]">Endpoint</p>
          <p className="font-mono text-xs text-foreground">{info.endpoint}</p>
        </div>
        <div className="space-y-1 bg-surface px-3 py-2.5">
          <p className="ledger-label text-[10px]">Signing secret</p>
          <p className="font-mono text-xs text-foreground">
            {info.secretHint}
            <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" />
              vault only
            </span>
          </p>
        </div>
        <div className="space-y-1 bg-surface px-3 py-2.5">
          <p className="ledger-label text-[10px]">Subscribed events</p>
          <p className="font-mono text-xs text-foreground">{info.eventsSubscribed.join(" · ")}</p>
        </div>
        <div className="space-y-1 bg-surface px-3 py-2.5">
          <p className="ledger-label text-[10px]">Replay window</p>
          <p className="font-mono text-xs text-foreground">
            ±{info.toleranceMs / 60_000} min — HMAC-SHA256 over `timestamp.payload`
          </p>
        </div>
      </div>

      {/* Builder — sign server-side, then deliver through the verification gauntlet. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="ledger-label">Event builder</p>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Event type">
            {info.eventsSubscribed.map((event) => (
              <button
                key={event}
                type="button"
                onClick={() => switchEvent(event)}
                aria-pressed={eventType === event}
                className={cn(
                  "rounded-md border px-2 py-1 font-mono text-[11px] transition-colors",
                  eventType === event
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {event}
              </button>
            ))}
          </div>
          <Textarea
            value={payloadText}
            onChange={(event) => setPayloadText(event.target.value)}
            rows={9}
            spellCheck={false}
            aria-label="Payload JSON"
            className="font-mono text-xs"
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="webhook-corrupt"
              checked={corrupt}
              onCheckedChange={(checked) => {
                setCorrupt(checked === true);
                setSigned(null);
              }}
            />
            <Label htmlFor="webhook-corrupt" className="text-xs text-muted-foreground">
              Corrupt the signature (demo rejection)
            </Label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSign} disabled={sign.isPending} data-testid="webhook-sign">
              {sign.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Signature className="size-3.5" aria-hidden="true" />
              )}
              Sign payload
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDeliver(true)}
              disabled={signed === null || payloadChanged || deliver.isPending}
              data-testid="webhook-deliver"
            >
              {deliver.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Webhook className="size-3.5" aria-hidden="true" />
              )}
              Deliver signed
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleDeliver(false)}
              disabled={deliver.isPending}
            >
              Deliver unsigned
            </Button>
          </div>
          {signed ? (
            <div className="space-y-1 rounded-md border border-border px-3 py-2.5">
              <p className="ledger-label text-[10px]">Signature (server-signed)</p>
              <p className="break-all font-mono text-[11px] text-foreground">{signed.response.signature}</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                event {signed.response.eventId} · timestamp {signed.response.timestamp}
              </p>
              {payloadChanged ? (
                <p className="font-mono text-[10px] text-warning">
                  Payload changed since signing — sign again to deliver.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Verification gauntlet — every delivery is checked the same way. */}
        <div className="space-y-3">
          <p className="ledger-label">Verification</p>
          <div
            className="divide-y divide-border rounded-lg border border-border"
            data-testid="webhook-checks"
          >
            {delivery ? (
              <>
                <div className="px-3 py-2.5">
                  <p
                    className={cn(
                      "font-mono text-[11px] font-semibold uppercase tracking-wide",
                      delivery.accepted ? "text-profit" : "text-loss",
                    )}
                  >
                    {delivery.accepted ? "Accepted" : "Rejected"}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {delivery.reason}
                  </p>
                </div>
                {delivery.checks.map((check) => (
                  <CheckRow key={check.label} ok={check.ok} label={check.label} detail={check.detail} />
                ))}
              </>
            ) : (
              <p className="px-3 py-6 text-sm leading-relaxed text-muted-foreground">
                Sign a payload, then deliver it. Every delivery — valid or not — passes the same
                gauntlet: signature, timestamp freshness, replay protection, idempotency and
                schema sanity. Invalid payloads never touch journal data.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Delivery log — last 20, newest first. */}
      <div className="space-y-2">
        <p className="ledger-label">Delivery log</p>
        {webhooks.recent.length === 0 ? (
          <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">
            No deliveries yet — sign and deliver a test event above.
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border" data-testid="webhook-log">
            {webhooks.recent.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex shrink-0 items-center gap-2 sm:w-64">
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase",
                      entry.status === "ACCEPTED"
                        ? "border-profit/40 bg-profit/10 text-profit"
                        : "border-loss/40 bg-loss/10 text-loss",
                    )}
                  >
                    {entry.status}
                  </span>
                  <time className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {TIME_FORMAT.format(new Date(entry.at))}
                  </time>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-foreground">
                    {entry.eventType}
                    <span className="ml-2 text-muted-foreground">{entry.provider}</span>
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">{entry.detail}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    sig {entry.signature.toLowerCase()}
                  </span>
                  {entry.replay ? (
                    <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] text-warning">
                      replay
                    </span>
                  ) : null}
                  {entry.duplicate ? (
                    <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] text-warning">
                      duplicate
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
