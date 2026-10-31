"use client";

import * as React from "react";

import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Minimal markdown renderer for playbook rule bodies - no dependency
 * (frozen stack). Supports the subset the form invites: "- " bullets,
 * "1." ordered items, **bold**, *italic* and plain paragraphs. Blank
 * lines separate blocks; everything is rendered as semantic lists.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // **bold** then *italic* - split on the bold markers first.
  const nodes: React.ReactNode[] = [];
  const boldParts = text.split(/\*\*(.+?)\*\*/g);
  boldParts.forEach((part, boldIndex) => {
    const isBold = boldIndex % 2 === 1;
    const italicParts = part.split(/\*(.+?)\*/g);
    italicParts.forEach((segment, italicIndex) => {
      if (segment === "") return;
      const isItalic = italicIndex % 2 === 1;
      const key = `${keyPrefix}-${boldIndex}-${italicIndex}`;
      if (isBold) {
        nodes.push(
          <strong key={key} className="font-semibold text-foreground">
            {segment}
          </strong>,
        );
      } else if (isItalic) {
        nodes.push(
          <em key={key} className="italic">
            {segment}
          </em>,
        );
      } else {
        nodes.push(<React.Fragment key={key}>{segment}</React.Fragment>);
      }
    });
  });
  return nodes;
}

interface MarkdownProps {
  /** Markdown source; null/empty renders the empty hint. */
  source: string | null;
  className?: string;
  /** Overrides the dict empty hint (dict.playbook.markdown.emptyLabel). */
  emptyLabel?: string;
}

export function Markdown({ source, className, emptyLabel }: MarkdownProps) {
  const { dict } = useI18n();
  const empty = emptyLabel ?? dict.playbook.markdown.emptyLabel;
  const blocks = React.useMemo(() => {
    if (source === null) return [];
    return source
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block !== "");
  }, [source]);

  if (blocks.length === 0) {
    return <p className={cn("text-sm italic text-muted-foreground", className)}>{empty}</p>;
  }

  return (
    <div className={cn("space-y-2 text-sm leading-relaxed text-muted-foreground", className)}>
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").map((line) => line.trim()).filter((line) => line !== "");
        const isBullet = lines.every((line) => /^[-*]\s+/.test(line));
        const isOrdered = lines.every((line) => /^\d+[.)]\s+/.test(line));

        if (isBullet) {
          return (
            <ul key={blockIndex} className="list-disc space-y-1 pl-4">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderInline(line.replace(/^[-*]\s+/, ""), `${blockIndex}-${lineIndex}`)}</li>
              ))}
            </ul>
          );
        }
        if (isOrdered) {
          return (
            <ol key={blockIndex} className="list-decimal space-y-1 pl-4">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderInline(line.replace(/^\d+[.)]\s+/, ""), `${blockIndex}-${lineIndex}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={blockIndex} className="whitespace-pre-line">
            {lines.map((line, lineIndex) => (
              <React.Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line, `${blockIndex}-p-${lineIndex}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
