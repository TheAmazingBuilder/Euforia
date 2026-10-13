import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  /** Optional mono eyebrow above the title ("OVERVIEW", "PROCESS", …). */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Optional right-aligned action cluster (buttons, selects). */
  actions?: ReactNode;
  /** Optional chip rendered inline after the title (status badges). */
  badge?: ReactNode;
  className?: string;
};

/**
 * Shared page header (design refonte): quieter Linear-style headings —
 * semibold + tight tracking, muted description, optional actions. One
 * component so every screen shares the same rhythm.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  badge,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
