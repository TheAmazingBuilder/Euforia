"use client";

import * as React from "react";
import { Check, ChevronDown, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACCOUNTS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Account switcher — static/cosmetic for now (Phase 1).
 * Selection is local state only; real account switching arrives later.
 */
export function AccountSwitcher() {
  const [selectedId, setSelectedId] = React.useState<string>(
    ACCOUNTS[0]?.id ?? "",
  );
  const selected =
    ACCOUNTS.find((account) => account.id === selectedId) ?? ACCOUNTS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          aria-label="Switch account"
        >
          <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="hidden max-w-36 truncate sm:inline">
            {selected?.name}
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
        {ACCOUNTS.map((account) => {
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
              {account.kind ? (
                <span className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] leading-none tracking-wide text-muted-foreground">
                  {account.kind}
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
