"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Password input with a reveal toggle — the eye never lies about state. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder = "••••••••",
  invalid,
  ariaDescribedBy,
  required = false,
  testId,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  invalid?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  testId?: string;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
        required={required}
        data-testid={testId}
        className="h-9 pr-9"
      />
      <button
        type="button"
        onClick={() => setShow((current) => !current)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {show ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/** Inline issue line under a field (carmin when present). */
export function FieldIssue({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="text-xs text-loss" role="alert">
      {children}
    </p>
  );
}

/** Live password-confirmation indicator (aria-live, emerald/carmin). */
export function MatchIndicator({
  password,
  confirm,
}: {
  password: string;
  confirm: string;
}) {
  if (confirm === "") return null;
  const match = password === confirm;
  return (
    <p
      aria-live="polite"
      className={cn(
        "text-xs font-medium",
        match ? "text-profit" : "text-loss",
      )}
    >
      {match ? "Passwords match" : "Passwords don't match"}
    </p>
  );
}
