"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Shared labeled field for the TOOLS calculators: label + optional hint on the
 * right, the control injected via render-prop (so error styling and a11y wiring
 * stay consistent), and an inline, text-based error line (never color-only).
 */
export type CalculatorFieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
    className: string;
  }) => React.ReactNode;
};

export function CalculatorField({
  id,
  label,
  hint,
  error,
  children,
}: CalculatorFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {hint ? (
          <span className="text-[11px] font-normal text-muted-foreground">{hint}</span>
        ) : null}
      </Label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": error ? `${id}-error` : undefined,
        className: cn(
          "font-mono",
          error && "border-loss/60 focus-visible:ring-loss/30",
        ),
      })}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-1 text-xs text-loss"
        >
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
