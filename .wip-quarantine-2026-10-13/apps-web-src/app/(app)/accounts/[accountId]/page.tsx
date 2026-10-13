import type { Metadata } from "next";

import { AccountDetailView } from "@/components/accounts/account-detail-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/accounts");

export const metadata: Metadata = {
  title: nav.label,
  description: nav.description,
};

/**
 * /accounts/[accountId] — Account detail (Accounts prompt §21–§28): header
 * with both status axes, the financial snapshot band, read-only positions /
 * orders / history tables and the connection panel. The accountId is the
 * stable journal identity other modules will reference (§56).
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  return (
    <section aria-label={nav.label} className="flex flex-col">
      <AccountDetailView accountId={accountId} />
    </section>
  );
}
