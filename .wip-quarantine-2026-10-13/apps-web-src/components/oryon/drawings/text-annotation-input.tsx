"use client";

import * as React from "react";

import { useDict } from "@/i18n/i18n-provider";

/**
 * Inline text-annotation editor (Phase 2 §7 Tool 7). A small uncontrolled
 * input positioned at the anchor's screen coordinates:
 *   - Enter commits, Escape cancels;
 *   - blur COMMITS non-empty text — accidental loss of unsaved edits is
 *     avoided (cahier de charge §7); empty text cancels (an empty
 *     annotation is meaningless).
 * No rich text — the PRD does not require it (§7 Tool 7).
 */
export function TextAnnotationInput({
  screen,
  initial,
  onCommit,
  onCancel,
}: {
  screen: { x: number; y: number };
  initial: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const dict = useDict().oryon;
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const committedRef = React.useRef(false);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const value = inputRef.current?.value ?? "";
    if (value.trim().length > 0) onCommit(value);
    else onCancel();
  };

  const cancel = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCancel();
  };

  return (
    <div
      className="absolute z-30"
      style={{ left: screen.x + 4, top: Math.max(0, screen.y - 34) }}
      data-testid="oryon-text-editor"
    >
      <input
        ref={inputRef}
        type="text"
        defaultValue={initial}
        maxLength={500}
        aria-label={dict.drawing.text}
        placeholder={dict.drawing.textPlaceholder}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }
        }}
        onBlur={commit}
        className="h-7 w-52 rounded-md border border-accent/60 bg-surface px-2 font-mono text-xs text-foreground shadow-md outline-none focus:border-accent"
      />
    </div>
  );
}
