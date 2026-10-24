"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileJson, Upload } from "lucide-react";
import { toast } from "sonner";
import type { PreferenceDomain, UserPreferences } from "@cosmoz/shared";
import { userPreferencesSchema } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";
import { usePreferences } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Preferences backup (module upgrade) - the preferences PROFILE as a
 * portable JSON file: export downloads the whole document, import restores
 * it domain by domain through the SAME server-validated PATCH endpoints the
 * settings cards use. Journal data is NOT included - that lives in the
 * data backup (plain JSON snapshot of trades/strategies/tags).
 */

const PREFERENCE_DOMAINS: PreferenceDomain[] = [
  "trading",
  "risk",
  "journal",
  "notifications",
  "appearance",
  "dashboard",
  "academy",
  "privacy",
  "localization",
];

export function PreferencesBackupCard() {
  const { data: prefs } = usePreferences();
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importing, setImporting] = React.useState(false);
  const { dict } = useI18n();
  const B = dict.settings.backup;

  const onExport = () => {
    if (prefs === undefined) return;
    const blob = new Blob([JSON.stringify(prefs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cosmoz-preferences-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(B.toastProfileExported, {
      description: B.toastProfileExportedDescription,
    });
  };

  const onImportFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      // Client-side validation - the same schema the server enforces per PATCH.
      const parsed = userPreferencesSchema.parse(json);
      let restored = 0;
      for (const domain of PREFERENCE_DOMAINS) {
        const body = parsed[domain];
        if (body !== undefined && body !== null) {
          // One server-validated PATCH per domain - exactly the endpoints the
          // settings cards write through (same merges, same constraints).
          const updated = await apiRequest<UserPreferences>(
            apiPaths.preferenceDomain(domain),
            { method: "PATCH", body: body as Record<string, unknown> },
          );
          queryClient.setQueryData<UserPreferences>(queryKeys.preferences, updated);
          restored += 1;
        }
      }
      toast.success(B.toastProfileRestored, {
        description: `${restored} ${restored === 1 ? B.sectionOne : B.sectionMany} ${B.sectionImportedSuffix}`,
      });
    } catch {
      toast.error(B.toastImportFailed, {
        description: B.toastProfileImportFailedDescription,
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="bg-surface" data-testid="preferences-backup-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
          <FileJson className="size-4 text-accent" aria-hidden="true" />
          {B.profileTitle}
        </CardTitle>
        <CardDescription>
          {B.profileDescription}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={onExport} disabled={prefs === undefined} data-testid="export-preferences">
          <Download className="size-4" aria-hidden="true" />
          {B.exportProfileButton}
        </Button>

        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          data-testid="import-preferences"
        >
          <Upload className="size-4" aria-hidden="true" />
          {importing ? B.restoring : B.importProfileButton}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label={B.profileFileAria}
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
