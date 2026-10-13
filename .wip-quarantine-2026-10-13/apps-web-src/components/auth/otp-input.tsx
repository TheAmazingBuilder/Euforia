"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface OtpInputProps {
  /** Raw digit string, e.g. "482913" — may be shorter than `length`. */
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
}

/**
 * Six-box one-time-code input: auto-advance on type, backspace falls back
 * to the previous box, arrow keys navigate, paste fills every box at once.
 */
export function OtpInput({ value, onChange, length = 6, disabled }: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);

  const chars = React.useMemo(
    () => Array.from({ length }, (_, index) => value[index] ?? ""),
    [value, length],
  );

  const focusAt = (index: number) => {
    const clamped = Math.max(0, Math.min(length - 1, index));
    refs.current[clamped]?.focus();
  };

  const setChar = (index: number, char: string) => {
    const next = Array.from({ length }, (_, i) => value[i] ?? "");
    next[index] = char;
    onChange(next.join(""));
  };

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits === "") {
      setChar(index, "");
      return;
    }
    // Typing over a selected box keeps the last digit entered.
    setChar(index, digits.slice(-1));
    if (index < length - 1) focusAt(index + 1);
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (chars[index]) {
        setChar(index, "");
      } else if (index > 0) {
        focusAt(index - 1);
        setChar(index - 1, "");
      }
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusAt(index - 1);
    }
    if (event.key === "ArrowRight" && index < length - 1) {
      event.preventDefault();
      focusAt(index + 1);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const digits = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (digits === "") return;
    onChange(digits);
    focusAt(digits.length);
  };

  return (
    <div className="flex gap-2" onPaste={handlePaste} data-testid="otp-input">
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          value={char}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          disabled={disabled}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          /* size={1} keeps the intrinsic width tiny so the six boxes can
             shrink to the container (see the layout's minmax(0,1fr) note). */
          size={1}
          maxLength={1}
          aria-label={`Digit ${index + 1} of ${length}`}
          className={cn(
            "h-12 min-w-0 flex-1 rounded-lg border bg-background text-center font-mono text-lg text-foreground transition-colors outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            char !== "" ? "border-accent/60" : "border-border",
          )}
        />
      ))}
    </div>
  );
}
