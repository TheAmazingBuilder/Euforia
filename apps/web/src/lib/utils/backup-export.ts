import { toast } from "sonner";
import { backupPayloadSchema, type BackupPayload } from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";

/**
 * Shared backup export - fetch the authored-data snapshot and download it
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

/**
 * Copy for the toast-wrapped variant - passed by the caller (settings cards)
 * from the active dictionary: this helper is a pure function, not a hook
 * (dict.* contract rule 8).
 */
export type BackupExportCopy = {
  /** Toast title, e.g. "Backup exported". */
  title: string;
  /** Count words composed as `${n} ${word}, …` - e.g. "trades" / "trades". */
  tradesWord: string;
  strategiesWord: string;
  tagsWord: string;
  /** Failure toast title + description. */
  failedTitle: string;
  failedDescription: string;
};

/** Toast-wrapped variant for direct button handlers (copy is caller-supplied). */
export async function exportBackupWithToasts(copy: BackupExportCopy): Promise<void> {
  try {
    const parsed = await downloadBackupExport();
    toast.success(copy.title, {
      description: `${parsed.trades.length} ${copy.tradesWord}, ${parsed.strategies.length} ${copy.strategiesWord}, ${parsed.tags.length} ${copy.tagsWord}.`,
    });
  } catch {
    toast.error(copy.failedTitle, {
      description: copy.failedDescription,
    });
  }
}
