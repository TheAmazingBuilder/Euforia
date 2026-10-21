"use client";

import * as React from "react";
import {
  BookOpen,
  CandlestickChart,
  FileText,
  FlaskConical,
  Folder,
  Globe2,
  GraduationCap,
  Newspaper,
  NotebookText,
  ScrollText,
  Swords,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { NofyRefKind, NofyTag } from "@cosmoz/shared";
import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * Nofy shared primitives — relative time, tag/folder chips, empty states,
 * inline-markdown rendering and reference-kind identity. Everything is
 * token-colored; no raw HTML is ever rendered (XSS-safe by construction).
 */

// ── Time ─────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Locale-aware relative time — takes the nofy.time dictionary slice. */
export function nofyRelativeTime(
  iso: string | null | undefined,
  time: Dictionary["nofy"]["time"],
): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const ago = (value: number, unit: string): string =>
    `${time.agoPrefix !== "" ? `${time.agoPrefix} ` : ""}${value} ${unit}${time.agoSuffix !== "" ? ` ${time.agoSuffix}` : ""}`;
  if (diff < 45_000) return time.justNow;
  if (diff < 3_600_000) {
    const minutes = Math.max(1, Math.round(diff / 60_000));
    return ago(minutes, minutes === 1 ? time.minuteOne : time.minuteMany);
  }
  if (diff < DAY_MS) {
    const hours = Math.round(diff / 3_600_000);
    return ago(hours, hours === 1 ? time.hourOne : time.hourMany);
  }
  if (diff < 2 * DAY_MS) return time.yesterday;
  if (diff < 7 * DAY_MS) {
    const days = Math.round(diff / DAY_MS);
    return ago(days, time.days);
  }
  return new Date(iso).toLocaleDateString("en-CA");
}

// ── Chips ────────────────────────────────────────────────────────────────────

export function TagChip({
  tag,
  active,
  onClick,
  className,
}: {
  tag: Pick<NofyTag, "id" | "name">;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const interactive = onClick !== undefined;
  const content = (
    <span
      className={cn(
        "inline-flex max-w-40 items-center truncate rounded-sm border px-1.5 py-0.5 text-[11px] font-medium",
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border bg-muted text-muted-foreground",
        interactive && "transition-colors hover:border-accent/40 hover:text-accent",
        className,
      )}
    >
      #{tag.name}
    </span>
  );
  if (!interactive) return content;
  return (
    <button type="button" onClick={onClick} title={`Filter by #${tag.name}`} className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
      {content}
    </button>
  );
}

export function FolderChip({ name, className }: { name: string | null; className?: string }) {
  if (name === null) return null;
  return (
    <span
      className={cn(
        "inline-flex max-w-44 items-center gap-1 truncate rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <Folder className="size-3 shrink-0" aria-hidden="true" />
      {name}
    </span>
  );
}

// ── Inline markdown (render only — the editor shows raw text) ───────────────

type InlineToken =
  | { kind: "plain"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "code"; value: string };

/**
 * Parses **bold**, *italic* and `code` spans into React nodes — text only,
 * so no HTML ever reaches the DOM from note content (spec §49).
 */
export function parseInlineMarkdown(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) tokens.push({ kind: "plain", value: text.slice(lastIndex, match.index) });
    const raw = match[0];
    if (raw.startsWith("**")) tokens.push({ kind: "bold", value: raw.slice(2, -2) });
    else if (raw.startsWith("`")) tokens.push({ kind: "code", value: raw.slice(1, -1) });
    else tokens.push({ kind: "italic", value: raw.slice(1, -1) });
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) tokens.push({ kind: "plain", value: text.slice(lastIndex) });
  return tokens;
}

export function InlineMarkdown({ text, className }: { text: string; className?: string }) {
  const tokens = React.useMemo(() => parseInlineMarkdown(text), [text]);
  return (
    <span className={className}>
      {tokens.map((token, index) => {
        if (token.kind === "bold") return <strong key={index} className="font-semibold text-foreground">{token.value}</strong>;
        if (token.kind === "italic") return <em key={index}>{token.value}</em>;
        if (token.kind === "code") {
          return (
            <code key={index} className="rounded-sm border border-border bg-muted px-1 py-0.5 font-mono text-[0.85em]">
              {token.value}
            </code>
          );
        }
        return <React.Fragment key={index}>{token.value}</React.Fragment>;
      })}
    </span>
  );
}

// ── Reference identity ───────────────────────────────────────────────────────

export const NOFY_REF_META: Record<NofyRefKind, { label: string; icon: LucideIcon; hue: string }> = {
  TRADE: { label: "Trade", icon: CandlestickChart, hue: "var(--profit)" },
  STRATEGY: { label: "Strategy", icon: Swords, hue: "var(--cat-strategies)" },
  SETUP: { label: "Setup", icon: FlaskConical, hue: "var(--cat-advanced)" },
  RULE: { label: "Rule", icon: ScrollText, hue: "var(--cat-risk)" },
  LESSON: { label: "Lesson", icon: GraduationCap, hue: "var(--cat-ta)" },
  EVENT: { label: "Economic event", icon: Globe2, hue: "var(--warning)" },
  SYMBOL: { label: "Symbol", icon: Newspaper, hue: "var(--cat-fund)" },
  NOTE: { label: "Note", icon: NotebookText, hue: "var(--accent)" },
};

/** Href guard — only in-app SPA paths are ever linked (spec §49). */
export function safeNofyHref(href: string | null | undefined): string | null {
  if (!href) return null;
  return href.startsWith("/") ? href : null;
}

// ── Empty states (spec §42) ──────────────────────────────────────────────────

export function NofyEmptyState({
  icon: Icon = FileText,
  title,
  body,
  action,
  testid,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  testid?: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center"
      data-testid={testid}
    >
      <span className="flex size-11 items-center justify-center rounded-lg border border-border bg-muted">
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-hover outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

/** Section header used across the Nofy panels. */
export function NofySectionHeader({
  title,
  hint,
  action,
  testid,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  testid?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2" data-testid={testid}>
      <div>
        <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Academy-origin chip for notes created from a lesson (spec §25). */
export function LessonOriginChip({
  lessonRef,
}: {
  lessonRef: { courseTitle: string; lessonTitle: string } | null;
}) {
  if (!lessonRef) return null;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border px-2 py-1 text-xs"
      style={{ borderColor: "color-mix(in srgb, var(--cat-ta) 35%, transparent)", background: "color-mix(in srgb, var(--cat-ta) 10%, transparent)" }}
      title={`Created from the Academy lesson "${lessonRef.lessonTitle}" (${lessonRef.courseTitle})`}
      data-testid="nofy-lesson-origin"
    >
      <BookOpen className="size-3.5 shrink-0" style={{ color: "var(--cat-ta)" }} aria-hidden="true" />
      <span className="truncate" style={{ color: "var(--cat-ta)" }}>
        {lessonRef.lessonTitle} · {lessonRef.courseTitle}
      </span>
    </span>
  );
}

/** Compact stat cell for the Overview band. */
export function NofyStatCell({
  label,
  value,
  hint,
  testid,
}: {
  label: string;
  value: number | string;
  hint?: string;
  testid?: string;
}) {
  return (
    <div className="rounded-lg border bg-surface p-4" data-testid={testid} title={hint}>
      <p className="font-mono text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
