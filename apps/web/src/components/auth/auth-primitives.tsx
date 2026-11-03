"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Reusable authentication form patterns (spec §41, §42, §43) - one source
 * for fields, password visibility, strength, and status banners so Login,
 * Register, Reset and Change never duplicate validation/error rendering.
 *
 * Accessibility: every field is properly labelled, errors are announced
 * (aria-live / role=alert), the visibility toggle is a labelled button and
 * color is never the only error signal.
 */

// ── Text field with inline error ─────────────────────────────────────────────

type FieldProps = {
  id: string;
  label: string;
  error?: string | null;
  hint?: string | null;
  children: React.ReactNode;
};

export function AuthField({ id, label, error, hint, children }: FieldProps) {
  const describedBy = [
    error ? `${id}-error` : null,
    hint ? `${id}-hint` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>, {
            id,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": describedBy || undefined,
          })
        : children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-destructive"
        >
          <span aria-hidden="true">✕</span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ── Password field with accessible show/hide (§42) ───────────────────────────

type PasswordFieldProps = {
  /** Optional - supplied automatically when rendered inside an AuthField. */
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: "current-password" | "new-password";
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function PasswordField({
  id,
  value,
  onChange,
  placeholder,
  autoComplete = "current-password",
  disabled,
  autoFocus,
  ...aria
}: PasswordFieldProps) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? "••••••••"}
        autoComplete={autoComplete}
        disabled={disabled}
        autoFocus={autoFocus}
        className="pr-10"
        {...aria}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        disabled={disabled}
        className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

// ── Password strength - factual contract feedback, no invented rules (§16) ───

export function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "10+ characters", pass: password.length >= 10 },
    { label: "Upper & lower case", pass: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: "A number", pass: /\d/.test(password) },
  ];
  const passed = checks.filter((c) => c.pass).length;
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              index < passed
                ? passed >= 3
                  ? "bg-emerald-500"
                  : passed === 2
                    ? "bg-amber-500"
                    : "bg-destructive/70"
                : "bg-border",
            )}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {checks.map((check) => (
          <span
            key={check.label}
            className={cn(
              "flex items-center gap-1",
              check.pass && "text-foreground",
            )}
          >
            <span aria-hidden="true">{check.pass ? "✓" : "·"}</span>
            {check.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Status banners (§43 - never color-only; announced to screen readers) ─────

export function FormError({
  title,
  body,
  children,
  testId,
}: {
  title?: string;
  body: string;
  children?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm"
    >
      <p className="flex items-start gap-2 font-medium text-destructive">
        <span aria-hidden="true">✕</span>
        <span>
          {title ? (
            <>
              <span className="sr-only">Error: </span>
              {title}{" "}
            </>
          ) : null}
          {body}
        </span>
      </p>
      {children ? <div className="pl-6 text-xs text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function FormSuccess({
  title,
  body,
  children,
  testId,
}: {
  title?: string;
  body: string;
  children?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      role="status"
      data-testid={testId}
      className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-3 text-sm"
    >
      <p className="flex items-start gap-2 font-medium text-emerald-600 dark:text-emerald-400">
        <span aria-hidden="true">✓</span>
        <span>
          {title ? <>{title}{" "}</> : null}
          {body}
        </span>
      </p>
      {children ? <div className="pl-6 text-xs text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function FormInfo({
  title,
  body,
  testId,
}: {
  title?: string;
  body: string;
  testId?: string;
}) {
  return (
    <div
      role="status"
      data-testid={testId}
      className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3.5 py-3 text-sm"
    >
      <span aria-hidden="true" className="text-accent">
        ⓘ
      </span>
      <p className="text-muted-foreground">
        {title ? <span className="font-medium text-foreground">{title}{" "}</span> : null}
        {body}
      </p>
    </div>
  );
}

// ── Submit button with deliberate loading state (§47) ────────────────────────

export function SubmitButton({
  pending,
  label,
  pendingLabel,
  testId,
  className,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  testId?: string;
  className?: string;
}) {
  return (
    <Button
      type="submit"
      disabled={pending}
      data-testid={testId}
      aria-busy={pending}
      className={cn("w-full", className)}
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}
