"use client";

import * as React from "react";
import { Printer } from "lucide-react";

import type { NofyBlock, NofyRefKind } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/i18n-provider";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { InlineMarkdown, NOFY_REF_META } from "./nofy-shared";

/**
 * Note print sheet (Export PDF) — the note rendered as a clean document and
 * offered to the browser's print dialog ("Save as PDF"). Same mechanics as
 * the quarterly analytics report: while the dialog is open the body carries
 * `printing-nofy`, and the @media print rules hide everything but the
 * `.print-sheet` — so a print started anywhere else is never hijacked.
 */

export type NofyPrintNote = {
  title: string;
  icon: string | null;
  blocks: NofyBlock[];
  folderName: string | null;
  tagNames: string[];
  updatedAt: string;
};

/** refKinds dict key for a machine ref kind (TRADE → trade). */
const refKindKey = (kind: NofyRefKind): keyof Dictionary["nofy"]["refKinds"] =>
  kind.toLowerCase() as keyof Dictionary["nofy"]["refKinds"];

/** Groups consecutive list blocks (bullet/numbered/todo) into list items. */
type Item =
  | { kind: "block"; block: NofyBlock }
  | { kind: "bullets"; blocks: NofyBlock[] }
  | { kind: "numbered"; blocks: NofyBlock[] };

function toItems(blocks: NofyBlock[]): Item[] {
  const items: Item[] = [];
  for (const block of blocks) {
    const last = items[items.length - 1];
    if (block.type === "bullet") {
      if (last && last.kind === "bullets") last.blocks.push(block);
      else items.push({ kind: "bullets", blocks: [block] });
      continue;
    }
    if (block.type === "numbered") {
      if (last && last.kind === "numbered") last.blocks.push(block);
      else items.push({ kind: "numbered", blocks: [block] });
      continue;
    }
    items.push({ kind: "block", block });
  }
  return items;
}

function PrintBlock({ block }: { block: NofyBlock }) {
  const { dict } = useI18n();
  const N = dict.nofy;
  switch (block.type) {
    case "h1":
      return <h2 className="mt-6 font-heading text-xl font-bold text-foreground">{block.text}</h2>;
    case "h2":
      return <h3 className="mt-5 font-heading text-lg font-bold text-foreground">{block.text}</h3>;
    case "h3":
      return <h4 className="mt-4 font-heading text-base font-semibold text-foreground">{block.text}</h4>;
    case "bullet":
      return (
        <li className="text-[13px] leading-relaxed text-foreground">
          <InlineMarkdown text={block.text} />
        </li>
      );
    case "numbered":
      return (
        <li className="text-[13px] leading-relaxed text-foreground">
          <InlineMarkdown text={block.text} />
        </li>
      );
    case "todo":
      return (
        <li className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground">
          <span aria-hidden="true" className="mt-0.5 font-mono text-xs">
            [{block.checked ? "x" : " "}]
          </span>
          <span className={block.checked ? "text-muted-foreground" : undefined}>
            <InlineMarkdown text={block.text} />
          </span>
        </li>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-border pl-3 text-[13px] italic leading-relaxed text-muted-foreground">
          <InlineMarkdown text={block.text} />
        </blockquote>
      );
    case "callout":
      return (
        <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-[13px] leading-relaxed text-foreground">
          <span className="mr-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {N.blocks.tones[block.tone ?? "info"]}
          </span>
          <InlineMarkdown text={block.text} />
        </div>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
          {block.text}
        </pre>
      );
    case "divider":
      return <hr className="border-border" />;
    case "image":
      return block.src ? (
        <figure className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URLs / user-provided chart screenshots, print-only */}
          <img src={block.src} alt={block.alt ?? ""} className="max-h-72 max-w-full rounded-md border border-border" />
          {block.caption ? (
            <figcaption className="text-center text-[11px] italic text-muted-foreground">{block.caption}</figcaption>
          ) : null}
        </figure>
      ) : null;
    case "table": {
      const rows = block.rows ?? [];
      if (rows.length === 0) return null;
      return (
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {rows[0]!.map((cell, index) => (
                <th key={index} className="border border-border bg-muted/60 px-2 py-1.5 text-left font-semibold text-foreground">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border border-border px-2 py-1.5 align-top text-foreground">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case "ref": {
      if (!block.ref) return null;
      const meta = NOFY_REF_META[block.ref.kind];
      return (
        <p className="rounded-md border border-border px-3 py-2 text-[12px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider" style={{ color: meta.hue }}>
            {N.refKinds[refKindKey(block.ref.kind)]}
          </span>
          {" — "}
          <span className="font-medium text-foreground">{block.ref.label ?? "—"}</span>
          {block.ref.meta ? <span className="text-muted-foreground"> · {block.ref.meta}</span> : null}
        </p>
      );
    }
    default:
      return (
        <p className="text-[13px] leading-relaxed text-foreground">
          <InlineMarkdown text={block.text} />
        </p>
      );
  }
}

export function NotePrintDialog({
  open,
  onOpenChange,
  note,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: NofyPrintNote | null;
}) {
  const { dict } = useI18n();
  const N = dict.nofy;
  const P = N.print;
  // Keep the body class in sync while the dialog is open so the @media print
  // rules only ever hijack a print that STARTED from this sheet.
  React.useEffect(() => {
    if (!open) return;
    document.body.classList.add("printing-nofy");
    return () => document.body.classList.remove("printing-nofy");
  }, [open]);

  const onPrint = () => {
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-nofy"), 400);
  };

  if (!note) return null;

  const updated = new Date(note.updatedAt);
  const items = toItems(note.blocks);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" data-testid="nofy-print-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">{P.title}</DialogTitle>
          <DialogDescription>
            {P.body}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end gap-2">
          <Button onClick={onPrint} className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent-hover" data-testid="nofy-print-button">
            <Printer className="size-4" aria-hidden="true" />
            {P.button}
          </Button>
        </div>

        {/* ── The printable sheet ─────────────────────────────────────────── */}
        <div className="print-sheet rounded-xl border border-border bg-background p-6" data-testid="nofy-print-sheet">
          <header className="flex items-start justify-between gap-4 border-b border-border pb-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {P.sheetLabel}
              </p>
              <h1 className="mt-1 truncate font-heading text-2xl font-bold tracking-tight text-foreground">
                {note.icon ? `${note.icon} ` : ""}
                {note.title === "" ? N.shared.untitledNote : note.title}
              </h1>
            </div>
            <div className="shrink-0 text-right text-[10px] leading-relaxed text-muted-foreground">
              <p className="font-mono">{P.updated} {updated.toLocaleDateString("en-CA")}</p>
              {note.folderName ? <p>{note.folderName}</p> : null}
              {note.tagNames.length > 0 ? <p>{note.tagNames.map((tag) => `#${tag}`).join(" ")}</p> : null}
            </div>
          </header>

          <div className="mt-4 space-y-3">
            {items.length === 0 ? (
              <p className="text-[13px] italic text-muted-foreground">{P.empty}</p>
            ) : (
              items.map((item, index) => {
                if (item.kind === "bullets") {
                  return (
                    <ul key={index} className="list-disc space-y-1 pl-5">
                      {item.blocks.map((block) => (
                        <PrintBlock key={block.id} block={block} />
                      ))}
                    </ul>
                  );
                }
                if (item.kind === "numbered") {
                  return (
                    <ol key={index} className="list-decimal space-y-1 pl-5">
                      {item.blocks.map((block) => (
                        <PrintBlock key={block.id} block={block} />
                      ))}
                    </ol>
                  );
                }
                return <PrintBlock key={item.block.id} block={item.block} />;
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
