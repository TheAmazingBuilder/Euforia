"use client";

import * as React from "react";

import { useDict } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { OryonConfigOpError } from "@/lib/oryon/workspace/layouts";

/**
 * Compact dialogs shared by the Oryon workspace-configuration surfaces
 * (Phase 6 spec §4, §6, §13): a NAME dialog (save-as / rename / template
 * save) and a CONFIRM dialog (destructive deletes + the unsaved-changes
 * guard). Both follow the established Radix conventions — content unmounts
 * on close, so every open starts from fresh, honest state; errors render
 * inline and never discard the user's input.
 */

/** Maps store operation errors to their dictionary message. */
export function configOpErrorMessage(
  error: OryonConfigOpError,
  messages: Record<OryonConfigOpError, string>,
): string {
  return messages[error];
}

export function OryonConfigNameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialName,
  nameLabel,
  placeholder,
  submitLabel,
  errorMessages,
  submit,
  testidPrefix,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Seed for rename; empty for create flows. */
  initialName: string;
  nameLabel: string;
  placeholder: string;
  submitLabel: string;
  errorMessages: Record<OryonConfigOpError, string>;
  /** Runs the operation. Returning an error keeps the dialog open, inline. */
  submit: (name: string) => { ok: true } | { ok: false; error: OryonConfigOpError };
  testidPrefix: string;
}) {
  const dict = useDict();
  const [name, setName] = React.useState(initialName);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = submit(name);
    if (result.ok) {
      onOpenChange(false);
      return;
    }
    setError(configOpErrorMessage(result.error, errorMessages));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`${testidPrefix}-dialog`} className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle data-testid={`${testidPrefix}-dialog-title`}>{title}</DialogTitle>
          {description !== undefined ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${testidPrefix}-input`}
              className="text-xs font-medium text-muted-foreground"
            >
              {nameLabel}
            </label>
            <Input
              id={`${testidPrefix}-input`}
              data-testid={`${testidPrefix}-input`}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error !== null) setError(null);
              }}
              maxLength={64}
              autoComplete="off"
              placeholder={placeholder}
              aria-invalid={error !== null}
              autoFocus
            />
            {error !== null ? (
              <p data-testid={`${testidPrefix}-error`} className="text-[11px] font-medium text-loss">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="mt-1 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              data-testid={`${testidPrefix}-cancel`}
            >
              {dict.common.cancel}
            </Button>
            <Button type="submit" size="sm" data-testid={`${testidPrefix}-submit`}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Confirmation dialog. `body` is static copy; the subject record's name is
 * rendered separately (the dictionary carries static strings only). Custom
 * footers let the unsaved-changes guard offer its three-way decision.
 */
export function OryonConfigConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  subjectName,
  confirmLabel,
  destructive = false,
  onConfirm,
  footer = null,
  testidPrefix,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  /** The record name, shown emphasized (optional). */
  subjectName?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  /** Replaces the default Cancel/Confirm footer when provided. */
  footer?: React.ReactNode;
  testidPrefix: string;
}) {
  const dict = useDict();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`${testidPrefix}-dialog`} className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle data-testid={`${testidPrefix}-dialog-title`}>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>

        {subjectName !== undefined ? (
          <p
            data-testid={`${testidPrefix}-subject`}
            className="inline-flex w-fit items-center rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-xs font-semibold text-foreground"
          >
            {subjectName}
          </p>
        ) : null}

        {footer ?? (
          <DialogFooter className="mt-1 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              data-testid={`${testidPrefix}-cancel`}
            >
              {dict.common.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={destructive ? "destructive" : "default"}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
              data-testid={`${testidPrefix}-submit`}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
