import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s — Cosmoz",
    default: "Cosmoz",
  },
  description: "Sign in to Cosmoz — the trading journal that coaches you.",
};

/**
 * The (auth) pages render their own premium split shell via AuthLayout —
 * this group layout only carries shared metadata.
 */
export default function AuthGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
