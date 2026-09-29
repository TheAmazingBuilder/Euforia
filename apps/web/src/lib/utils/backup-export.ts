import { toast } from "sonner";
import { backupPayloadSchema, type BackupPayload } from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";

/**
 * Shared backup export — fetch the authored-data snapshot and download it
 * as a plain JSON file. Used by the Privacy tab (BackupCard) and the
 * Account tab ("Export your data"). Validation happens twice: client-side
 * (zod, instant feedback) and server-side (same schema).
 */
export async function downloadBackupExport(): Promise<BackupPayload> {
  const payload = await apiRequest<unknown>(apiPaths.exportBackup);
  const parsed = backupPayloadSchema.parse(payload);
  const blob = new Blob([JSON.stringify(parsed, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const dateStamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `cosmoz-backup-${dateStamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return parsed;
}

/** Toast-wrapped variant for direct button handlers. */
export async function exportBackupWithToasts(): Promise<void> {
  try {
    const parsed = await downloadBackupExport();
    toast.success("Backup exported", {
      description: `${parsed.trades.length} trades, ${parsed.strategies.length} strategies, ${parsed.tags.length} tags.`,
    });
  } catch {
    toast.error("Export failed", {
      description: "The backup could not be generated — please retry.",
    });
  }
}
