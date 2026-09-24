"use client";

import Link from "next/link";
import { useProfile } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/** Deterministic gradient pair from the name — avatars stay distinct without uploads. */
function gradientFor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  const a = hash;
  const b = (hash + 48) % 360;
  return `linear-gradient(135deg, hsl(${a} 62% 46%), hsl(${b} 62% 38%))`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "?";
}

/**
 * User avatar — the one-tap route to /profile (direct editing). The gradient
 * disc + initials doubles as the identity anchor of the topbar.
 */
export function UserAvatar({ className }: { className?: string }) {
  const { data } = useProfile();
  const name = data?.name ?? "Cosmoz Trader";

  return (
    <Link
      href="/profile"
      data-testid="user-avatar"
      aria-label={`Profile — ${name}`}
      title="Your profile"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full font-heading text-[11px] font-bold text-white shadow-sm ring-1 ring-border transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      style={{ backgroundImage: gradientFor(data?.id ?? name) }}
    >
      {initialsOf(name)}
    </Link>
  );
}
