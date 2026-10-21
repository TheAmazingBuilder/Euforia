import type { Metadata } from "next";
import { Suspense } from "react";

import { SecurityCenterView } from "@/components/security/security-view";

export const metadata: Metadata = {
  title: "Security",
  description:
    "The Security center: authentication, sessions, two-factor authentication, API keys, connected accounts, the append-only event log and login history.",
};

export default function SecurityPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl bg-muted" />}>
      <SecurityCenterView />
    </Suspense>
  );
}
