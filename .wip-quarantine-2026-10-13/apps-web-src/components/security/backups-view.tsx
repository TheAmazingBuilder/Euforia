"use client";

import { DatabaseBackup, FileJson } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BackupCard } from "@/components/settings/backup-card";
import { useExportHistory } from "@/lib/hooks/use-export-history";

/**
 * Backups screen — the data-ownership page: export/import (BackupCard,
 * moved from Settings) plus the local export history recorded on every
 * snapshot. A quiet reminder card explains what a backup contains.
 */

function ExportHistoryCard() {
  const rows = useExportHistory();

  return (
    <Card className="bg-surface" data-testid="export-history">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <FileJson className="size-4 text-accent" aria-hidden="true" />
          Export history
        </CardTitle>
        <CardDescription>
          Snapshots taken from this browser — newest first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows === null ? null : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No exports yet — take your first snapshot above.
          </p>
        ) : (
          <ol className="overflow-hidden rounded-lg border border-border">
            {rows.map((row, index) => (
              <li
                key={`${row.at}-${index}`}
                className="flex items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2.5 text-sm last:border-b-0"
              >
                <time
                  dateTime={row.at}
                  className="font-mono text-xs tabular-nums text-muted-foreground"
                >
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(row.at))}
                </time>
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {row.trades} trades · {row.strategies} strategies · {row.tags} tags
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {row.sizeKo} Ko
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function BackupsView() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <BackupCard />

      <ExportHistoryCard />

      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <DatabaseBackup className="size-4 text-accent" aria-hidden="true" />
            What a backup contains
          </CardTitle>
          <CardDescription>
            Authored data only — the full journal, ready to re-import.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
              Every trade with its psychology, grades, mistakes and review text.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
              Your playbook: strategies, rules and their ordering.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
              The tag system, so filters survive a fresh start.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
