"use client";

import * as React from "react";
import { Check, ChevronDown, Wallet } from "lucide-react";

import { useAccounts } from "@/lib/api/queries";
import type { Account } from "@cosmoz/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const kindLabel = (type: Account["type"]): string =>
  type === "PROP_FIRM" ? "PROP" : type;

/**
 * Account switcher — fed by the accounts API (useAccounts).
 * Selection is local state only; real account-scoped data arrives later.
 */
export function AccountSwitcher() {
  const { data, isLoading } = useAccounts();
  const accounts = data?.accounts ?? [];
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const selected =
    accounts.find((account) => account.id === selectedId) ??
    accounts.find((account) => account.isDefault) ??
    accounts[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          aria-label="Switch account"
          disabled={isLoading && accounts.length === 0}
        >
          <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="hidden max-w-36 truncate sm:inline">
            {isLoading && accounts.length === 0 ? "…" : (selected?.name ?? "No account")}
          </span>
          <ChevronDown
            className="size-3.5 text-muted-foreground"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>Accounts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map((account) => {
          const isSelected = account.id === selected?.id;
          return (
            <DropdownMenuItem
              key={account.id}
              onClick={() => setSelectedId(account.id)}
              className="flex items-center gap-2"
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center",
                  isSelected ? "text-accent" : "text-transparent",
                )}
                aria-hidden="true"
              >
                <Check className="size-4" />
              </span>
              <span className="flex-1 truncate">{account.name}</span>
              <span className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] leading-none tracking-wide text-muted-foreground">
                {kindLabel(account.type)}
              </span>
            </DropdownMenuItem>
          );
        })}
        {accounts.length === 0 ? (
          <DropdownMenuItem disabled>No accounts yet</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
