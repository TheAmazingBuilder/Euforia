"use client";

import * as React from "react";
import { AlertTriangle, Check, CircleCheck, Info, Lightbulb, Sigma } from "lucide-react";

import type { AcademyBlock } from "@cosmoz/shared";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";
import { VisualBlock } from "./visuals";

/**
 * Lesson block renderer - turns the API's AcademyBlock[] into the lesson
 * document. Typography follows the design language: hairline rules between
 * sections, mono annotations, one semantic ink per callout tone.
 */

// Tone → icon/ink only - the fallback labels resolve through
// dict.academy.blocks.callout (block.title overrides them).
const CALLOUT_TONES = {
  info: { icon: Info, className: "text-accent" },
  tip: { icon: Lightbulb, className: "text-accent" },
  warn: { icon: AlertTriangle, className: "text-warning" },
  risk: { icon: AlertTriangle, className: "text-loss" },
} as const;

export function LessonBlocks({ blocks }: { blocks: AcademyBlock[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((block, index) => (
        <LessonBlock key={index} block={block} />
      ))}
    </div>
  );
}

export function LessonBlock({ block }: { block: AcademyBlock }) {
  const { dict } = useI18n();
  const B = dict.academy.blocks;
  switch (block.kind) {
    case "text":
      return <p className="max-w-3xl text-sm leading-relaxed text-foreground/90">{block.body}</p>;

    case "callout": {
      const tone = CALLOUT_TONES[block.tone];
      const Icon = tone.icon;
      return (
        <aside
          className={cn("rounded-lg border bg-surface px-4 py-3.5", block.tone === "risk" && "border-loss/30", block.tone === "warn" && "border-warning/30")}
          data-testid={`lesson-callout-${block.tone}`}
        >
          <div className={cn("flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", tone.className)}>
            <Icon className="size-3.5" aria-hidden="true" />
            {block.title ?? B.callout[block.tone]}
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-foreground/90">{block.body}</p>
        </aside>
      );
    }

    case "list":
      return block.ordered ? (
        <ol className="max-w-3xl list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/90 marker:font-mono marker:text-muted-foreground">
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul className="max-w-3xl space-y-1.5 text-sm leading-relaxed text-foreground/90">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case "objectives":
      return (
        <section className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3.5" aria-label={B.objectivesAria}>
          <p className="ledger-label text-accent">{B.objectivesTitle}</p>
          <ul className="mt-2 max-w-3xl space-y-1 text-sm leading-relaxed">
            {block.items.map((item, index) => (
              <li key={index} className="flex gap-2">
                <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      );

    case "takeaways":
      return (
        <section className="rounded-lg border border-border bg-surface-raised px-4 py-3.5" aria-label={B.takeawaysAria}>
          <p className="ledger-label">{B.takeawaysTitle}</p>
          <ul className="mt-2 max-w-3xl space-y-1 text-sm leading-relaxed">
            {block.items.map((item, index) => (
              <li key={index} className="flex gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-profit" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      );

    case "formula":
      return (
        <figure className="max-w-3xl rounded-lg border border-border bg-surface px-4 py-3.5">
          <figcaption className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sigma className="size-3.5" aria-hidden="true" />
            {block.label}
          </figcaption>
          <p className="mt-2 font-mono text-sm font-medium tabular-nums text-foreground">{block.expr}</p>
          {block.note ? <p className="mt-1 text-xs text-muted-foreground">{block.note}</p> : null}
        </figure>
      );

    case "table":
      return (
        <div className="max-w-3xl overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface-raised">
                {block.headers.map((header, index) => (
                  <th key={index} className="border-b border-border px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border/60 last:border-b-0">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cn("px-3 py-2 align-top leading-snug", cellIndex === 0 ? "font-medium text-foreground" : "text-foreground/85")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "example":
      return (
        <section className="max-w-3xl rounded-lg border border-border bg-surface px-4 py-3.5" aria-label={`${B.exampleAriaPrefix}${block.title}`}>
          <p className="stamp stamp-accent text-[10px]" style={{ transform: "rotate(-1deg)" }}>
            {B.exampleStamp}
          </p>
          <p className="mt-2 font-heading text-sm font-semibold text-foreground">{block.title}</p>
          <ol className="mt-2 space-y-1.5 pl-1 text-sm leading-relaxed text-foreground/90">
            {block.steps.map((step, index) => (
              <li key={index} className="flex gap-2.5">
                <span className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      );

    case "candles":
    case "structure":
    case "zones":
    case "risk":
      return <VisualBlock kind={block.kind} variant={block.variant} caption={block.caption} />;

    default:
      return null;
  }
}
