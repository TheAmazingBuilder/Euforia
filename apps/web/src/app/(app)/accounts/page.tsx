import { Suspense } from "react";

import type { Metadata } from "next";

import { AccountsView } from "@/components/accounts/accounts-view";

export const metadata: Metadata = {
  title: "Accounts",
  description:
    "Connected trading accounts: balances, positions and history read from the provider — read-only, synced on demand, never traded through.",
};

export default function AccountsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-40 w-full max-w-6xl animate-pulse rounded-xl bg-muted" />
      }
    >
      <AccountsView />
    </Suspense>
  );
}
