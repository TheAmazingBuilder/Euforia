"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Six-slot one-time-code input: auto-advance on type, backspace walks
 * back, paste fills every slot. Self-contained (no extra dependency);
 * value is the joined digits string.
 */
export function CodeInput({
  value,
  onChange,
  className,
  "aria-invalid": ariaInvalid,
}: {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  "aria-invalid"?: boolean;
}) {
  const SLOTS = 6;
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const digits = React.useMemo(
    () => Array.from({ length: SLOTS }, (_, index) => value[index] ?? ""),
    [value],
  );

  const focusSlot = (index: number) => {
    const clamped = Math.max(0, Math.min(index, SLOTS - 1));
    refs.current[clamped]?.focus();
    refs.current[clamped]?.select();
  };

  const handleSlot = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (typed === "") {
      onChange(value.slice(0, index) + value.slice(index + 1));
      return;
    }
    const chars = value.split("");
    for (let offset = 0; offset < typed.length && index + offset < SLOTS; offset += 1) {
      chars[index + offset] = typed[offset]!;
    }
    onChange(chars.join("").slice(0, SLOTS));
    focusSlot(index + typed.length);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Backspace") return;
    const current = digits[index] ?? "";
    if (current === "") {
      event.preventDefault();
      const previous = index - 1;
      if (previous >= 0) {
        const chars = value.split("");
        chars.splice(previous, 1);
        onChange(chars.join(""));
        focusSlot(previous);
      }
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, SLOTS);
    if (pasted !== "") onChange(pasted);
    focusSlot(pasted.length);
  };

  return (
    <div className={cn("flex gap-2", className)} role="group" aria-label="Reset code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={digit}
          data-testid={`code-slot-${index}`}
          aria-label={`Digit ${index + 1}`}
          aria-invalid={ariaInvalid}
          onChange={(event) => handleSlot(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          className="size-11 rounded-md border border-border bg-surface-raised text-center font-mono text-lg font-semibold tabular-nums text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring"
        />
      ))}
    </div>
  );
}
