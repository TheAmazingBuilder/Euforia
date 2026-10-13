import type { Metadata } from "next";

import { AuthGate } from "@/components/auth/auth-gate";

export const metadata: Metadata = {
  title: "Oryon",
  description:
    "Oryon — Euforia's professional charting workspace: full-screen candlesticks, live quotes and honest data-source labeling.",
};

/**
 * Oryon lives OUTSIDE the (app) route group (docs/specs/oryon-prd.md §6.1):
 * no AppShell chrome — the workspace owns the whole viewport. Authentication
 * is still mandatory through the SAME centralized gate the protected routes
 * use; the backend remains the security boundary.
 */
export default function OryonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGate>{children}</AuthGate>;
}
