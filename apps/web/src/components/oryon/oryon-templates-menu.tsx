"use client";

import * as React from "react";

import { Bookmark, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { OryonConfigOpError } from "@/lib/oryon/workspace/layouts";
import type { OryonChartTemplate } from "@cosmoz/shared";

import { useDict } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useOryonIndicators } from "@/components/oryon/oryon-indicators-context";
import {
  useOryonWorkspaceConfig,
  useWorkspaceConfigSnapshot,
} from "@/components/oryon/oryon-workspace-context";
import {
  OryonConfigConfirmDialog,
  OryonConfigNameDialog,
} from "@/components/oryon/oryon-config-dialogs";

/**
 * Oryon chart-template management (Phase 6 spec §6, §7, §11 + Phase 7 §12
 * panel scoping).
 *
 * A separate workflow from layouts - templates capture ANALYSIS settings
 * (chart type, optional timeframe, the indicator stack), never workspace
 * arrangement. Applying one replaces the ACTIVE PANEL's indicator stack
 * through its registry store (no duplicates, one diff) and is confirmed
 * first when that panel has a stack; drawings, alerts and positions are
 * structurally out of reach (different stores) and the dialogs say so in
 * plain copy. Other panels keep their own setup.
 *
 * Partial applications are REPORTED: an honest toast states how many
 * indicator entries were skipped (unsupported/invalid/duplicate ids).
 */

type PendingRename = { id: string; name: string } | null;
type PendingDelete = { id: string; name: string } | null;
type PendingApply = { id: string; name: string } | null;

export function OryonTemplatesMenu() {
  const dict = useDict();
  const S = dict.oryon.templates;
  const { store, applyTemplate, saveCurrentTemplate } = useOryonWorkspaceConfig();
  const { registry: indicatorRegistry } = useOryonIndicators();
  const { session } = useWorkspaceConfigSnapshot();
  const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<PendingRename>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<PendingDelete>(null);
  const [applyTarget, setApplyTarget] = React.useState<PendingApply>(null);

  const errorMessages: Record<OryonConfigOpError, string> = {
    name_invalid: S.errorNameInvalid,
    name_taken: S.errorNameTaken,
    capacity: S.errorCapacity,
    not_found: S.errorNotFound,
    default_immutable: S.errorNameInvalid, // templates have no default record
    // Template operations never hit the panel cap - the fallback copy keeps
    // the record exhaustive.
    panel_capacity: S.errorCapacity,
  };

  const runApply = React.useCallback(
    (id: string) => {
      const report = applyTemplate(id);
      if (report === null) {
        toast.error(S.errorNotFound);
        return;
      }
      if (report.skipped > 0) {
        toast.warning(S.appliedPartialToast, {
          description: `${report.skipped} of ${report.total} ${S.skippedDetail}`,
          testId: "oryon-template-apply-partial-toast",
        });
        return;
      }
      toast(S.appliedToast, { testId: "oryon-template-apply-toast" });
    },
    [applyTemplate, S],
  );

  /** Apply entry point - confirmed when the ACTIVE panel's live stack
   *  would be replaced (that panel only; other panels are untouched). */
  const requestApply = (template: OryonChartTemplate) => {
    const activeStore = indicatorRegistry.find(session.activePanelId);
    if (activeStore !== null && activeStore.indicators.length > 0) {
      setApplyTarget({ id: template.id, name: template.name });
      return;
    }
    runApply(template.id);
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={S.triggerHint}
            title={S.triggerHint}
            data-testid="oryon-templates"
            className="size-8 rounded-md text-muted-foreground hover:text-foreground"
          >
            <Bookmark className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          data-testid="oryon-template-menu"
          align="start"
          className="w-64 min-w-64"
        >
          <DropdownMenuLabel>{S.heading}</DropdownMenuLabel>
          <p className="px-1.5 pb-1 text-[11px] text-muted-foreground">{S.headingHint}</p>

          {snapshot.templates.length === 0 ? (
            <div className="px-1.5 py-1.5">
              <p className="text-xs font-medium text-foreground">{S.savedEmpty}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{S.savedEmptyHint}</p>
            </div>
          ) : (
            snapshot.templates.map((template) => (
              <DropdownMenuItem
                key={template.id}
                data-testid={`oryon-template-item-${template.id}`}
                onSelect={() => requestApply(template)}
                className="flex-col items-start gap-0.5"
              >
                <span className="text-sm font-medium text-foreground">{template.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {template.indicators.length} {S.metaIndicators}
                  {" · "}
                  {template.chart.interval ?? S.metaNoInterval}
                </span>
              </DropdownMenuItem>
            ))
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            data-testid="oryon-template-save"
            onSelect={() => setSaveOpen(true)}
          >
            <Plus aria-hidden />
            {S.saveCurrent}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="oryon-template-manage"
            disabled={snapshot.templates.length === 0}
            onSelect={() => setManageOpen(true)}
          >
            <Settings2 aria-hidden />
            {S.manage}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OryonConfigNameDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title={S.saveTitle}
        description={S.saveBody}
        initialName=""
        nameLabel={S.nameLabel}
        placeholder={S.namePlaceholder}
        submitLabel={S.nameSubmitCreate}
        errorMessages={errorMessages}
        testidPrefix="oryon-template-name"
        submit={(name) => {
          const result = saveCurrentTemplate(name);
          if (result.ok) toast(S.savedToast);
          return result;
        }}
      />

      {/* Apply confirmation - replaces the current indicator stack (§6). */}
      {applyTarget !== null ? (
        <OryonConfigConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setApplyTarget(null);
          }}
          title={S.applyTitle}
          body={S.applyBody}
          subjectName={applyTarget.name}
          confirmLabel={S.applySubmit}
          testidPrefix="oryon-template-apply"
          onConfirm={() => runApply(applyTarget.id)}
        />
      ) : null}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent data-testid="oryon-template-manage-dialog" className="max-w-md gap-3">
          <DialogHeader>
            <DialogTitle>{S.manageTitle}</DialogTitle>
            <DialogDescription>{S.headingHint}</DialogDescription>
          </DialogHeader>

          {snapshot.templates.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">{S.manageEmpty}</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1">
              {snapshot.templates.map((template) => (
                <li
                  key={template.id}
                  data-testid={`oryon-template-row-${template.id}`}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-2.5 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {template.name}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {template.indicators.length} {S.metaIndicators}
                      {" · "}
                      {template.chart.interval ?? S.metaNoInterval}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => requestApply(template)}
                    data-testid={`oryon-template-apply-${template.id}`}
                  >
                    {S.apply}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    aria-label={S.rename}
                    onClick={() => setRenameTarget({ id: template.id, name: template.name })}
                    data-testid={`oryon-template-rename-${template.id}`}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-loss hover:bg-loss/10 hover:text-loss"
                    aria-label={S.delete}
                    onClick={() => setDeleteTarget({ id: template.id, name: template.name })}
                    data-testid={`oryon-template-delete-${template.id}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {renameTarget !== null ? (
        <OryonConfigNameDialog
          open
          onOpenChange={(open) => {
            if (!open) setRenameTarget(null);
          }}
          title={S.renameTitle}
          initialName={renameTarget.name}
          nameLabel={S.nameLabel}
          placeholder={S.namePlaceholder}
          submitLabel={S.nameSubmitRename}
          errorMessages={errorMessages}
          testidPrefix="oryon-template-name"
          submit={(name) => store.renameTemplate(renameTarget.id, name)}
        />
      ) : null}

      {deleteTarget !== null ? (
        <OryonConfigConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title={S.deleteTitle}
          body={S.deleteBody}
          subjectName={deleteTarget.name}
          confirmLabel={S.deleteSubmit}
          destructive
          testidPrefix="oryon-template-delete"
          onConfirm={() => {
            const result = store.deleteTemplate(deleteTarget.id);
            if (result.ok) toast(S.deletedToast);
            else toast.error(errorMessages[result.error]);
          }}
        />
      ) : null}
    </>
  );
}
