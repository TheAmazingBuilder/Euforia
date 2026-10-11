"use client";

import * as React from "react";

import { Copy, LayoutPanelLeft, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { OryonConfigOpError } from "@/lib/oryon/workspace/layouts";

import { useDict } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useOryonWorkspaceConfig } from "@/components/oryon/oryon-workspace-context";
import {
  OryonConfigConfirmDialog,
  OryonConfigNameDialog,
} from "@/components/oryon/oryon-config-dialogs";
import { cn } from "@/lib/utils";

/**
 * Oryon workspace-layout management (Phase 6 spec §4, §7, §10).
 *
 * A compact toolbar menu — routine switching stays one click, management
 * targets the ACTIVE layout (rename/duplicate/delete state that plainly in
 * the header). The default layout is a radio item like any other and a
 * code-level constant: restoring it never deletes saved records.
 *
 * Unsaved-changes policy (§10): the header shows an honest dirty dot; any
 * action that would REPLACE the arrangement (switch, restore-default) while
 * the active saved layout is dirty prompts first — save & proceed, or
 * discard explicitly. Nothing is silently lost.
 *
 * All persistence is browser-local (same disclosure as the other Oryon
 * records); the menu does not imply account synchronization anywhere.
 */

const DEFAULT_RADIO_VALUE = "__default__";

type NameDialogState =
  | { kind: "closed" }
  | { kind: "save-as" }
  | { kind: "rename"; id: string; name: string };

type ConfirmState =
  | { kind: "closed" }
  | { kind: "delete"; id: string; name: string }
  | /** Switch or restore-default while dirty. */ { kind: "unsaved"; targetId: string | null };

export function OryonLayoutsMenu() {
  const dict = useDict();
  const S = dict.oryon.layouts;
  const { store, applySavedLayout } = useOryonWorkspaceConfig();
  const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [nameDialog, setNameDialog] = React.useState<NameDialogState>({ kind: "closed" });
  const [confirm, setConfirm] = React.useState<ConfirmState>({ kind: "closed" });

  const activeLayout =
    snapshot.activeLayoutId !== null
      ? snapshot.layouts.find((l) => l.id === snapshot.activeLayoutId) ?? null
      : null;
  const activeName = activeLayout?.name ?? S.defaultName;

  const errorMessages: Record<OryonConfigOpError, string> = {
    name_invalid: S.errorNameInvalid,
    name_taken: S.errorNameTaken,
    capacity: S.errorCapacity,
    not_found: S.errorNotFound,
    default_immutable: S.errorDefaultImmutable,
    // Layout operations never hit the panel cap — the fallback copy keeps
    // the record exhaustive without inventing a layouts-specific message.
    panel_capacity: S.errorCapacity,
  };

  /** Radio change — guarded by the unsaved-changes policy when dirty.
   *  Switching to the already-active layout is a no-op, but RESTORE-DEFAULT
   *  (targetId null) always resets: the live session may have drifted from
   *  the default arrangement even while the default is active. The
   *  orchestrated apply (context) also lands the record's per-panel
   *  indicator stacks (Phase 7). */
  const requestSwitch = (targetId: string | null) => {
    if (targetId !== null && targetId === snapshot.activeLayoutId) return;
    if (snapshot.dirty) {
      setConfirm({ kind: "unsaved", targetId });
      return;
    }
    if (targetId === null) {
      applySavedLayout(null);
      toast(S.restoredToast);
      return;
    }
    const target = snapshot.layouts.find((l) => l.id === targetId);
    if (target === undefined) {
      toast.error(S.errorNotFound);
      return;
    }
    applySavedLayout(targetId);
  };

  const confirmUnsaved = (saveFirst: boolean) => {
    if (confirm.kind !== "unsaved") return;
    const targetId = confirm.targetId;
    if (saveFirst) {
      const saved = store.saveActiveLayout();
      if (!saved.ok) {
        toast.error(errorMessages[saved.error]);
        return;
      }
      toast(S.savedToast);
    }
    setConfirm({ kind: "closed" });
    if (targetId === null) {
      applySavedLayout(null);
      toast(S.restoredToast);
      return;
    }
    applySavedLayout(targetId);
    if (saveFirst) toast(S.switchSavedToast);
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={S.triggerHint}
            data-testid="oryon-layouts"
            data-active={snapshot.activeLayoutId !== null || undefined}
            className="h-8 gap-1.5 rounded-md px-2 text-muted-foreground hover:text-foreground"
          >
            <LayoutPanelLeft className="size-4" aria-hidden />
            <span
              data-testid="oryon-layout-active-name"
              className="hidden max-w-28 truncate text-xs font-medium sm:inline"
            >
              {activeName}
            </span>
            {snapshot.dirty ? (
              <span
                data-testid="oryon-layout-dirty"
                title={S.dirtyLabel}
                aria-label={S.dirtyLabel}
                className="size-1.5 shrink-0 rounded-full bg-warning"
              />
            ) : null}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          data-testid="oryon-layout-menu"
          align="start"
          className="w-64 min-w-64"
        >
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span>{S.activeHeading}</span>
          </DropdownMenuLabel>
          <div className="px-1.5 pb-1 text-sm font-medium text-foreground" data-testid="oryon-layout-active-row">
            {activeName}
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuRadioGroup
            value={snapshot.activeLayoutId ?? DEFAULT_RADIO_VALUE}
            // Radix fires this on select; the guard decides what happens.
            onValueChange={(value) => {
              requestSwitch(value === DEFAULT_RADIO_VALUE ? null : value);
            }}
          >
            <DropdownMenuRadioItem
              value={DEFAULT_RADIO_VALUE}
              data-testid="oryon-layout-item-default"
              className="text-sm"
            >
              {S.defaultName}
            </DropdownMenuRadioItem>
            {snapshot.layouts.map((layout) => (
              <DropdownMenuRadioItem
                key={layout.id}
                value={layout.id}
                data-testid={`oryon-layout-item-${layout.id}`}
                className="text-sm"
              >
                {layout.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          {snapshot.layouts.length === 0 ? (
            <p className="px-1.5 py-1 text-[11px] text-muted-foreground">{S.savedEmpty}</p>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            data-testid="oryon-layout-save"
            disabled={activeLayout === null || !snapshot.dirty}
            onSelect={() => {
              const result = store.saveActiveLayout();
              if (result.ok) toast(S.savedToast);
              else toast.error(errorMessages[result.error]);
            }}
          >
            <Save aria-hidden />
            {S.saveChanges}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="oryon-layout-save-as"
            onSelect={() => setNameDialog({ kind: "save-as" })}
          >
            <Plus aria-hidden />
            {S.saveAsNew}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="oryon-layout-rename"
            disabled={activeLayout === null}
            onSelect={() => {
              if (activeLayout === null) return;
              setNameDialog({ kind: "rename", id: activeLayout.id, name: activeLayout.name });
            }}
          >
            <Pencil aria-hidden />
            {S.rename}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="oryon-layout-duplicate"
            disabled={activeLayout === null}
            onSelect={() => {
              if (activeLayout === null) return;
              const result = store.duplicateLayout(activeLayout.id);
              if (result.ok) toast(S.duplicatedToast);
              else toast.error(errorMessages[result.error]);
            }}
          >
            <Copy aria-hidden />
            {S.duplicate}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="oryon-layout-delete"
            variant="destructive"
            disabled={activeLayout === null}
            onSelect={() => {
              if (activeLayout === null) return;
              setConfirm({ kind: "delete", id: activeLayout.id, name: activeLayout.name });
            }}
          >
            <Trash2 aria-hidden />
            {S.delete}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            data-testid="oryon-layout-restore"
            onSelect={() => requestSwitch(null)}
          >
            <RotateCcw aria-hidden />
            {S.restoreDefault}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {nameDialog.kind === "save-as" ? (
        <OryonConfigNameDialog
          open
          onOpenChange={(open) => {
            if (!open) setNameDialog({ kind: "closed" });
          }}
          title={S.nameSaveTitle}
          initialName=""
          nameLabel={S.nameLabel}
          placeholder={S.namePlaceholder}
          submitLabel={S.nameSubmitCreate}
          errorMessages={errorMessages}
          testidPrefix="oryon-layout-name"
          submit={(name) => {
            const result = store.saveAsNewLayout(name);
            if (result.ok) toast(S.createdToast);
            return result;
          }}
        />
      ) : null}

      {nameDialog.kind === "rename" ? (
        <OryonConfigNameDialog
          open
          onOpenChange={(open) => {
            if (!open) setNameDialog({ kind: "closed" });
          }}
          title={S.nameRenameTitle}
          initialName={nameDialog.name}
          nameLabel={S.nameLabel}
          placeholder={S.namePlaceholder}
          submitLabel={S.nameSubmitRename}
          errorMessages={errorMessages}
          testidPrefix="oryon-layout-name"
          submit={(name) => store.renameLayout(nameDialog.id, name)}
        />
      ) : null}

      {confirm.kind === "delete" ? (
        <OryonConfigConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirm({ kind: "closed" });
          }}
          title={S.deleteTitle}
          body={S.deleteBody}
          subjectName={confirm.name}
          confirmLabel={S.deleteSubmit}
          destructive
          testidPrefix="oryon-layout-delete"
          onConfirm={() => {
            const result = store.deleteLayout(confirm.id);
            if (result.ok) toast(S.deletedToast);
            else toast.error(errorMessages[result.error]);
          }}
        />
      ) : null}

      {confirm.kind === "unsaved" ? (
        <OryonConfigConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirm({ kind: "closed" });
          }}
          title={S.switchTitle}
          body={S.switchBody}
          confirmLabel={S.switchDiscard}
          testidPrefix="oryon-layout-switch"
          footer={
            <UnsavedFooter
              onCancel={() => setConfirm({ kind: "closed" })}
              onDiscard={() => confirmUnsaved(false)}
              onSave={() => confirmUnsaved(true)}
            />
          }
          onConfirm={() => confirmUnsaved(false)}
        />
      ) : null}
    </>
  );
}

/** Three-way footer for the unsaved-changes guard (§10 explicit policy). */
function UnsavedFooter({
  onCancel,
  onDiscard,
  onSave,
}: {
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const dict = useDict();
  const S = dict.oryon.layouts;

  return (
    <div className={cn("mt-1 flex flex-col gap-2")}>
      <Button type="button" size="sm" onClick={onSave} data-testid="oryon-layout-switch-save">
        {S.switchSave}
      </Button>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          data-testid="oryon-layout-switch-cancel"
        >
          {S.switchCancel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDiscard}
          data-testid="oryon-layout-switch-discard"
        >
          {S.switchDiscard}
        </Button>
      </div>
    </div>
  );
}
