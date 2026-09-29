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
 * User avatar — the one-tap route to /profile (direct editing). Shows the
 * uploaded image when the profile has one (Settings → Profile), otherwise
 * the deterministic gradient disc + initials.
 */
export function UserAvatar({ className }: { className?: string }) {
  const { data } = useProfile();
  const name = data?.name ?? "Cosmoz Trader";
  const avatarUrl = data?.avatarUrl ?? null;

  return (
    <Link
      href="/profile"
      data-testid="user-avatar"
      aria-label={`Profile — ${name}`}
      title="Your profile"
      className={cn(
        "grid size-8 shrink-0 place-items-center overflow-hidden rounded-full font-heading text-[11px] font-bold text-white shadow-sm ring-1 ring-border transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      style={avatarUrl ? undefined : { backgroundImage: gradientFor(data?.id ?? name) }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL from the profile, no optimization pipeline in V1
        <img src={avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </Link>
  );
}
