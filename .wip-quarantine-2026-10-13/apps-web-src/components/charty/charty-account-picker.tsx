"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronsUpDown, Landmark } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccounts, useTradingAccountDetailsList } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Charty account selector (Accounts prompt §58) — the trading-account
 * connectivity list, wired into the chart terminal's top toolbar.
 *
 * Identity comes from the journal contract (useAccounts); per-account
 * connection + snapshot come from the Accounts module detail fan-out.
 * Selection persists in localStorage (write-only effect) and seeds to the
 * default journal account. Read-only by doctrine: the pill monitors, it
 * never executes — management routes to /accounts.
 */

const STORE_KEY = "cosmoz.charty.account.v1";

function loadSelectedId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return typeof raw === "string" && raw !== "" ? raw : null;
  } catch {
    return null;
  }
}

/** Connection → dot color (status is also text-labeled — never color-only). */
function dotClass(status: string | undefined): string {
  switch (status) {
    case "CONNECTED":
      return "bg-profit";
    case "CONNECTING":
      return "bg-warning animate-pulse";
    case "ERROR":
      return "bg-loss";
    default:
      return "bg-muted-foreground/50";
  }
}

function envStamp(type: string): string {
  return type === "PROP_FIRM" ? "PROP" : type;
}

export function ChartyAccountPicker() {
  const { data, isLoading } = useAccounts();
  const accounts = data?.accounts ?? [];

  const detailsList = useTradingAccountDetailsList(accounts.map((account) => account.id));
  const detailsById = React.useMemo(() => {
    const map = new Map<string, NonNullable<(typeof detailsList)[number]["data"]>>();
    for (const detail of detailsList) {
      if (detail.data) map.set(detail.data.account.id, detail.data);
    }
    return map;
  }, [detailsList]);

  const [selectedId, setSelectedId] = React.useState<string | null>(loadSelectedId);
  React.useEffect(() => {
    try {
      if (selectedId !== null) window.localStorage.setItem(STORE_KEY, selectedId);
    } catch {
      // Persistence is a convenience — selection stays session-local.
    }
  }, [selectedId]);

  const selected =
    accounts.find((account) => account.id === selectedId) ??
    accounts.find((account) => account.isDefault) ??
    accounts[0] ??
    null;
  const selectedDetails = selected ? (detailsById.get(selected.id) ?? undefined) : undefined;
  const connection = selectedDetails?.account.connection?.status;
  const snapshot = selectedDetails?.account.snapshot ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Trading account selector"
          data-testid="charty-account-trigger"
          disabled={isLoading && accounts.length === 0}
          className={cn(
            "inline-flex h-8 max-w-[240px] shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 text-xs font-medium text-foreground transition-colors",
            "hover:border-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60",
          )}
        >
          <Landmark className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{selected?.name ?? "No account"}</span>
          {selected !== null ? (
            <span className="shrink-0 rounded-sm border border-border bg-muted px-1 py-px font-mono text-[9px] leading-none tracking-wide text-muted-foreground">
              {envStamp(selected.type)}
            </span>
          ) : null}
          {snapshot !== null ? (
            <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground md:inline">
              {Number(snapshot.equity ?? snapshot.balance ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}{" "}
              {snapshot.currency}
            </span>
          ) : null}
          <span
            className={cn("size-1.5 shrink-0 rounded-full", dotClass(connection))}
            data-testid="charty-account-dot"
            aria-hidden="true"
          />
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuLabel>Trading accounts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map((account) => {
          const detail = detailsById.get(account.id);
          const isSelected = account.id === selected?.id;
          const status = detail?.account.connection?.status;
          return (
            <DropdownMenuItem
              key={account.id}
              data-testid={`charty-account-item-${account.id}`}
              onClick={() => setSelectedId(account.id)}
              className="flex items-center gap-2"
            >
              <span
                className={cn("size-4 shrink-0", isSelected ? "text-accent" : "text-transparent")}
                aria-hidden="true"
              >
                <Check className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">{account.name}</span>
              <span className="shrink-0 rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                {envStamp(account.type)}
              </span>
              <span className="flex w-24 shrink-0 items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", dotClass(status))} aria-hidden="true" />
                {status === undefined ? "—" : status.toLowerCase()}
              </span>
            </DropdownMenuItem>
          );
        })}
        {accounts.length === 0 ? (
          <DropdownMenuItem disabled>No connected accounts yet</DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href="/accounts"
            data-testid="charty-account-manage"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <ChevronsUpDown className="size-3.5" aria-hidden="true" />
            Manage in Accounts
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
