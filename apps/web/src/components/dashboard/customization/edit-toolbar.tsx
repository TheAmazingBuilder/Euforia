"use client";

import * as React from "react";
import { LayoutGrid, Library, RotateCcw, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Edit-mode toolbar (Phase 01 §5) - the editing transaction's control
 * surface: Add Widget, Layouts & templates, Reset, then Cancel/Save.
 * Save is disabled until the draft actually differs (§ no fake actions);
 * a persistence error renders inline (role=alert) and keeps the draft.
 */
export interface EditToolbarProps {
  layoutName: string;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  onAddWidgets: () => void;
  onManageLayouts: () => void;
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function EditToolbar({
  layoutName,
  dirty,
  saving,
  saveError,
  onAddWidgets,
  onManageLayouts,
  onReset,
  onCancel,
  onSave,
}: EditToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Dashboard layout editor"
      data-testid="dashboard-edit-toolbar"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-surface-raised/60 p-2 backdrop-blur"
    >
      <span className="ml-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
        <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
        Editing
      </span>
      <span
        className="max-w-40 truncate rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
        data-testid="dashboard-editing-layout"
      >
        {layoutName}
      </span>

      <Button
        variant="outline"
        size="sm"
        data-testid="dashboard-toolbar-add"
        onClick={onAddWidgets}
      >
        <Library className="size-4" aria-hidden="true" />
        Add widget
      </Button>
      <Button
        variant="outline"
        size="sm"
        data-testid="dashboard-toolbar-layouts"
        onClick={onManageLayouts}
      >
        <LayoutGrid className="size-4" aria-hidden="true" />
        Layouts
      </Button>
      <Button
        variant="ghost"
        size="sm"
        data-testid="dashboard-toolbar-reset"
        onClick={onReset}
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        Reset
      </Button>

      <span className="flex-1" aria-hidden="true" />

      {saveError && (
        <p role="alert" className="text-xs font-medium text-loss" data-testid="dashboard-save-error">
          {saveError}
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        data-testid="dashboard-toolbar-cancel"
        onClick={onCancel}
        disabled={saving}
      >
        <X className="size-4" aria-hidden="true" />
        Cancel
      </Button>
      <Button
        variant="default"
        size="sm"
        data-testid="dashboard-toolbar-save"
        onClick={onSave}
        disabled={!dirty || saving}
      >
        <Save className="size-4" aria-hidden="true" />
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
