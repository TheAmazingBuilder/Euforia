import { cn } from "@/lib/utils";

/**
 * The register's quad-ink bookmark ribbon — accent, profit, warning, loss —
 * plus the shared ink cycle used across the Academy views. One signature,
 * four inks: the same grammar the Overview introduced, carried through the
 * whole study hall. Tokens only; no hex.
 */

export const ACADEMY_TEXT_INKS = [
  "text-accent",
  "text-profit",
  "text-warning",
  "text-loss",
] as const;

export const ACADEMY_SPINE_INKS = [
  "bg-accent",
  "bg-profit",
  "bg-warning",
  "bg-loss",
] as const;

/** Stable ink for a position — cycles through the register's four inks. */
export function inkTextOf(index: number): string {
  return ACADEMY_TEXT_INKS[((index % ACADEMY_TEXT_INKS.length) + ACADEMY_TEXT_INKS.length) % ACADEMY_TEXT_INKS.length];
}

export function inkSpineOf(index: number): string {
  return ACADEMY_SPINE_INKS[((index % ACADEMY_SPINE_INKS.length) + ACADEMY_SPINE_INKS.length) % ACADEMY_SPINE_INKS.length];
}

export function InkRibbon({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid="academy-ink-ribbon"
      className={cn("flex h-0.5 w-44 overflow-hidden rounded-full", className)}
    >
      <span className="h-full flex-1 bg-accent" />
      <span className="h-full flex-1 bg-profit" />
      <span className="h-full flex-1 bg-warning" />
      <span className="h-full flex-1 bg-loss" />
    </div>
  );
}
