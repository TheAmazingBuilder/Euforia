import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The analytics suite's section frame — one step of the register's ink cycle.
 * A colored dot + mono label in the section's ink, then the card with a
 * 2px left rule in the same ink: the same left-ruled grammar the Academy
 * ledger rows use, carried across the whole tab. Tokens only; no hex.
 */

export const SECTION_INK_TEXT = {
  accent: "text-accent",
  profit: "text-profit",
  warning: "text-warning",
  loss: "text-loss",
} as const;

export const SECTION_INK_BG = {
  accent: "bg-accent",
  profit: "bg-profit",
  warning: "bg-warning",
  loss: "bg-loss",
} as const;

export const SECTION_INK_BORDER = {
  accent: "border-accent",
  profit: "border-profit",
  warning: "border-warning",
  loss: "border-loss",
} as const;

export type SectionInk = keyof typeof SECTION_INK_TEXT;

interface AnalyticsSectionProps {
  ink: SectionInk;
  /** Mono uppercase kicker, e.g. "01 · THE EDGE MAP". */
  label: string;
  title: string;
  description?: string;
  testid?: string;
  children: ReactNode;
}

export function AnalyticsSection({ ink, label, title, description, testid, children }: AnalyticsSectionProps) {
  return (
    <section data-testid={testid} className="scroll-mt-20 space-y-3">
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className={cn("mt-2 size-2 shrink-0 rounded-full", SECTION_INK_BG[ink])} />
        <div className="min-w-0">
          <p className={cn("font-mono text-[11px] font-semibold uppercase tracking-[0.16em]", SECTION_INK_TEXT[ink])}>
            {label}
          </p>
          <h2 className="font-heading text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
          {description ? (
            <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <Card className={cn("border-l-2 bg-surface", SECTION_INK_BORDER[ink])}>
        <CardContent className="p-4 sm:p-5">{children}</CardContent>
      </Card>
    </section>
  );
}
