import type { PanelTable } from "@cosmoz/shared";

import { cn } from "@/lib/utils";

import { SECTION_INK_TEXT } from "@/components/analytics/section";

/**
 * Dense server-formatted table — risk metrics, statistical readouts, daily
 * and weekly reports. Numeric columns sit right-aligned in mono; the server
 * already decided every cell's text and ink, the client adds only layout.
 * Honest at zero: cells arrive as "—" from the server when there is nothing
 * to claim.
 */

export function PanelTable({ panel }: { panel: PanelTable }) {
  const numeric = new Set(panel.numericCols);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <caption className="sr-only">{panel.ariaLabel}</caption>
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            {panel.columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={cn("px-3 py-2 font-medium", numeric.has(index) && "text-right")}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {panel.rows.map((row) => (
            <tr key={row.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised/60">
              {row.cells.map((c, index) => (
                <td
                  key={index}
                  className={cn(
                    "px-3 py-2.5",
                    numeric.has(index) && "text-right",
                    c.mono && "font-mono tabular-nums",
                    c.ink ? SECTION_INK_TEXT[c.ink] : "text-foreground",
                    c.strong && "font-semibold",
                  )}
                >
                  {c.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {panel.footnote ? (
        <p className="px-3 pt-2 text-[11px] leading-relaxed text-muted-foreground">{panel.footnote}</p>
      ) : null}
    </div>
  );
}
