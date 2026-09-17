import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s — Cosmoz",
    default: "Cosmoz",
  },
  description: "Sign in to Cosmoz — the trading journal that coaches you.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      {children}
    </div>
  );
}
