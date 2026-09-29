"use client";

import * as React from "react";
import { DatabaseBackup, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { backupPayloadSchema } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useImportBackup } from "@/lib/api/queries";
import { exportBackupWithToasts } from "@/lib/utils/backup-export";

/**
 * Data & backup card (Priorité 3, feature 12) — export the user's authored
 * data as a plain JSON file, re-import it later. Validation happens twice:
 * client-side (zod, instant feedback) and server-side (same schema).
 * Export goes through the shared helper (also used by the Account tab).
 */
export function BackupCard() {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const importBackup = useImportBackup();
  const [exporting, setExporting] = React.useState(false);

  const onExport = async () => {
    setExporting(true);
    await exportBackupWithToasts();
    setExporting(false);
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      // Client-side validation — same contract as the server.
      const payload = backupPayloadSchema.parse(json);
      const result = await importBackup.mutateAsync(payload);
      toast.success("Backup imported", {
        description: `${result.imported.trades} trades restored, ${result.imported.strategies} strategies and ${result.imported.tags} tags added.`,
      });
    } catch {
      toast.error("Import failed", {
        description: "That file is not a valid Cosmoz backup (JSON + schema).",
      });
    }
  };

  return (
    <Card className="bg-surface" data-testid="backup-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <DatabaseBackup className="size-4 text-accent" aria-hidden="true" />
          Data &amp; backup
        </CardTitle>
        <CardDescription>
          Your journal lives on this device — carry a plain JSON snapshot with you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={onExport} disabled={exporting} data-testid="export-backup">
          <Download className="size-4" aria-hidden="true" />
          {exporting ? "Exporting…" : "Export backup"}
        </Button>

        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={importBackup.isPending}
          data-testid="import-backup"
        >
          <Upload className="size-4" aria-hidden="true" />
          {importBackup.isPending ? "Importing…" : "Import backup"}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Backup file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onImportFile(file);
            // Reset so selecting the same file twice still fires onChange.
            event.target.value = "";
          }}
        />
      </CardContent>
    </Card>
  );
}
