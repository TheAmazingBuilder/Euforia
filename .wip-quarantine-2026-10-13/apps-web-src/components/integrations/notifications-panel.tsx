"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import type { NotificationsResponse } from "@cosmoz/shared";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/integrations/hub-bits";
import { useTestNotifyChannel } from "@/lib/api/queries/integrations";
import { apiErrorMessage } from "@/lib/api/client";

/**
 * Notification relay channels — the relay only SENDS (email, Telegram,
 * Discord, webhook push). One test push per channel; delivery is honest
 * about unreachable targets.
 */

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function NotificationsPanel({ notifications }: { notifications: NotificationsResponse }) {
  const test = useTestNotifyChannel();
  const [testedAt, setTestedAt] = React.useState<Record<string, string>>({});

  function handleTest(channelId: string) {
    test.mutate(channelId, {
      onSuccess: (response) => {
        setTestedAt((current) => ({ ...current, [channelId]: response.at }));
        if (response.ok) {
          toast.success(response.detail);
        } else {
          toast.warning(response.detail);
        }
      },
      onError: (error) => {
        toast.error(apiErrorMessage(error, "The test push could not be sent."));
      },
    });
  }

  return (
    <div className="space-y-4" data-testid="notifications-panel">
      <div className="divide-y divide-border border-y border-border">
        {notifications.channels.map((channel) => (
          <div
            key={channel.id}
            className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-6"
            data-testid={`notify-channel-${channel.id}`}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-heading text-sm font-semibold text-foreground">{channel.label}</p>
                <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {channel.kind}
                </span>
                <StatusPill status={channel.status} />
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                {channel.target ?? "No target configured"}
              </p>
              {channel.events.length > 0 ? (
                <p className="font-mono text-[11px] text-muted-foreground/80">
                  Events: {channel.events.join(", ")}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {testedAt[channel.id] ? (
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  tested {TIME_FORMAT.format(new Date(testedAt[channel.id]!))}
                </span>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest(channel.id)}
                disabled={test.isPending || channel.status === "DISCONNECTED"}
              >
                {test.isPending && test.variables === channel.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="size-3.5" aria-hidden="true" />
                )}
                Send test
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
        {notifications.disclaimer}
      </p>
    </div>
  );
}
