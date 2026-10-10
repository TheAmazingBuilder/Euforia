"use client";

import * as React from "react";

import { X } from "lucide-react";

import { useDict } from "@/i18n/i18n-provider";

/**
 * Oryon lower panel — the collapsed-by-default shell reserved for the
 * open-position visualization of a later phase (Phase 1 spec §6E). When
 * opened it states honestly that position data is not integrated: no mock
 * broker position is ever presented as real, and there are no trading
 * controls.
 */
export function OryonLowerPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dict = useDict();
  const S = dict.oryon.lower;

  if (!open) return null;

  return (
    <section
      data-testid="oryon-lower-panel"
      aria-label={S.title}
      className="flex h-48 shrink-0 flex-col border-t border-border bg-surface"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="text-xs font-semibold text-foreground">{S.title}</span>
        <button
          type="button"
          aria-label={dict.common.close}
          data-testid="oryon-lower-close"
          onClick={onClose}
          className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-foreground">{S.deferredTitle}</p>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{S.body}</p>
        <a
          href="/trades"
          data-testid="oryon-lower-trades-link"
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          {S.link}
        </a>
      </div>
    </section>
  );
}
