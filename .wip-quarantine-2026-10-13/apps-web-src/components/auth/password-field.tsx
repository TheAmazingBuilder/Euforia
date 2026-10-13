"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string | null;
  disabled?: boolean;
  /** Optional node rendered at the right of the label row (e.g. "Forgot?"). */
  action?: React.ReactNode;
  /** Content rendered under the input (hint / live match indicator). */
  hint?: React.ReactNode;
  /** Renders a live strength meter under the input. */
  showStrength?: boolean;
  /** Marks the field invalid for assistive tech + destructive ring. */
  invalid?: boolean;
  /** HTML required flag. */
  required?: boolean;
  /** data-testid passthrough. */
  testId?: string;
}

/**
 * Password input with a show/hide reveal — shared by login, register and
 * reset so the reveal behaviour and error styling stay identical.
 */
function strengthScore(value: string): { label: string; ratio: number } {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  const labels = ["too weak", "weak", "fair", "good", "strong"];
  return { label: labels[score] ?? "too weak", ratio: score / 4 };
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  disabled,
  action,
  hint,
  showStrength = false,
  invalid = false,
  required = false,
  testId,
}: PasswordFieldProps) {
  const [visible, setVisible] = React.useState(false);
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder ?? "••••••••"}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={invalid || error ? true : undefined}
          data-testid={testId}
          disabled={disabled}
          aria-describedby={error ? errorId : undefined}
          className={cn("pr-9", error && "border-destructive")}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-loss">
          {error}
        </p>
      ) : null}
              {showStrength && value.length > 0 ? (
          <p
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
            aria-live="polite"
          >
            Strength: {strengthScore(value).label}
          </p>
        ) : null}
        {hint}
    </div>
  );
}
