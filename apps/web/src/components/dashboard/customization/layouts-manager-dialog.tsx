"use client";

import * as React from "react";
import { Check, Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { DashboardLayoutDocument, DashboardUserTemplate } from "@cosmoz/shared";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboard-customization/templates";
import { WIDGET_REGISTRY } from "@/lib/dashboard-customization/registry";
import { cn } from "@/lib/utils";

import { widgetIcon } from "./widget-icons";

/**
 * Workspace manager (Phase 01 §10/§11, extended by Phase 06) - the layout
 * collection presented as what it is: the user's named dashboard
 * workspaces. Switch, duplicate, rename, delete, create empty, set the
 * default workspace, and templates (built-in presets + the user's own
 * frozen snapshots). While an edit session is live, active-changing
 * operations are disabled (a draft is never silently discarded - §10.2);
 * templates then replace the draft instead.
 *
 * Stored testids keep the `dashboard-layout-*` / `dashboard-template-*`
 * prefixes (Phase 01 contract) - only the human labels say "workspace".
 */
export interface LayoutsManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layouts: DashboardLayoutDocument[];
  activeLayoutId: string;
  editing: boolean;
  /** Phase 06 - the user's default workspace id (null = none). */
  defaultLayoutId: string | null;
  /** Phase 06 - user-created templates (frozen snapshots). */
  userTemplates: DashboardUserTemplate[];
  onSwitch: (layoutId: string) => void;
  onDuplicate: (layoutId: string) => void;
  onRename: (layoutId: string, name: string) => boolean;
  onDelete: (layoutId: string) => void;
  onCreateEmpty: () => void;
  /** View mode: template → new layout. Edit mode: template → draft. */
  onApplyTemplate: (templateId: string) => void;
  /** Phase 06 - mark a workspace as the default. */
  onSetDefault: (layoutId: string) => void;
  /** Phase 06 - freeze the active workspace into a user template. */
  onSaveAsTemplate: (name: string) => boolean;
  onDeleteUserTemplate: (templateId: string) => void;
  /** Phase 06 - spawn a NEW independent workspace from a user template. */
  onApplyUserTemplate: (templateId: string) => boolean;
}

export function LayoutsManagerDialog({
  open,
  onOpenChange,
  layouts,
  activeLayoutId,
  editing,
  defaultLayoutId,
  userTemplates,
  onSwitch,
  onDuplicate,
  onRename,
  onDelete,
  onCreateEmpty,
  onApplyTemplate,
  onSetDefault,
  onSaveAsTemplate,
  onDeleteUserTemplate,
  onApplyUserTemplate,
}: LayoutsManagerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
        data-testid="dashboard-layouts-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-heading">Workspaces</DialogTitle>
          <DialogDescription>
            {editing
              ? "You are editing - save or cancel first to switch or duplicate. Templates replace your draft."
              : "Switch workspaces, or create one from scratch, from a template, or from one of your saved snapshots."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="layouts">
          <TabsList className="w-full">
            <TabsTrigger value="layouts" className="flex-1" data-testid="dashboard-layouts-tab">
              My workspaces
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex-1" data-testid="dashboard-templates-tab">
              Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="layouts" className="space-y-2 pt-2">
            <ul className="space-y-1.5">
              {layouts.map((layout) => (
                <LayoutRow
                  key={layout.id}
                  layout={layout}
                  active={layout.id === activeLayoutId}
                  isDefault={layout.id === defaultLayoutId}
                  editing={editing}
                  canDelete={layouts.length > 1 && (!editing || layout.id !== activeLayoutId)}
                  onSwitch={onSwitch}
                  onDuplicate={onDuplicate}
                  onRename={onRename}
                  onDelete={onDelete}
                  onSetDefault={onSetDefault}
                />
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              data-testid="dashboard-layouts-new"
              onClick={onCreateEmpty}
            >
              <Plus className="size-4" aria-hidden="true" />
              New empty workspace
            </Button>
            <p className="text-xs text-muted-foreground">
              The default workspace is restored when the last active one can no longer be found.
            </p>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4 pt-2">
            <SaveAsTemplateSection editing={editing} onSave={onSaveAsTemplate} existing={userTemplates} />
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Your templates
              </h3>
              {userTemplates.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No saved templates yet - freeze one of your workspaces above and spawn new
                  dashboards from it. Templates are private to your account.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {userTemplates.map((template) => (
                    <li
                      key={template.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                      data-testid={`dashboard-user-template-row-${template.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold">
                          {template.name}
                          <Badge variant="outline" className="text-[10px]">
                            Yours
                          </Badge>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {template.layout.widgets.filter((widget) => widget.visible).length} widgets ·
                          frozen snapshot
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={editing}
                        title={editing ? "Save or cancel your edits first" : "Create a workspace from this template"}
                        data-testid={`dashboard-user-template-apply-${template.id}`}
                        onClick={() => onApplyUserTemplate(template.id)}
                      >
                        {editing ? "Replace draft" : "Use"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete template ${template.name}`}
                        title="Delete template - workspaces already created from it are untouched"
                        data-testid={`dashboard-user-template-delete-${template.id}`}
                        onClick={() => onDeleteUserTemplate(template.id)}
                        className="hover:text-loss"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Built-in templates
              </h3>
              <ul className="space-y-2">
                {DASHBOARD_TEMPLATES.map((template) => (
                  <li
                    key={template.id}
                    data-testid={`dashboard-template-${template.id}`}
                    className="rounded-lg border border-border bg-surface p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{template.name}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {template.description}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {template.widgets.map((spec, specIndex) => {
                            const Icon = widgetIcon(WIDGET_REGISTRY[spec.type].iconId);
                            return (
                              <span
                                key={`${template.id}-${spec.type}-${specIndex}`}
                                className="inline-flex items-center gap-1 rounded border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] text-muted-foreground"
                              >
                                <Icon className="size-3" aria-hidden="true" />
                                {WIDGET_REGISTRY[spec.type].name}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`dashboard-template-apply-${template.id}`}
                        onClick={() => onApplyTemplate(template.id)}
                      >
                        {editing ? "Replace draft" : "Use"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {editing && (
              <p className="text-xs text-muted-foreground">
                Applying a template replaces your current draft - save to keep it.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Freeze-current-workspace flow (view mode only - a live draft is not a
 * saved workspace). Inline name input; validation happens in the hook. */
function SaveAsTemplateSection({
  editing,
  onSave,
  existing,
}: {
  editing: boolean;
  onSave: (name: string) => boolean;
  existing: DashboardUserTemplate[];
}) {
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const atCap = existing.length >= 10;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (onSave(name)) {
      setName("");
      setError(null);
    } else {
      setError(
        atCap
          ? "Template limit reached (10) - delete one first."
          : name.trim().length === 0
            ? "Give the template a name."
            : "That name is unavailable or too long.",
      );
    }
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-surface-raised p-3" data-testid="dashboard-save-as-template">
      <Label htmlFor="dashboard-save-as-template-name" className="text-sm font-medium">
        Save current workspace as a template
      </Label>
      <p className="mt-0.5 text-xs text-muted-foreground">
        A frozen copy of this workspace - widgets, sizes and settings at the moment you save.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Input
          id="dashboard-save-as-template-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          placeholder="e.g. My research layout"
          disabled={editing || atCap}
          aria-invalid={error !== null}
          aria-describedby={error !== null ? "dashboard-save-as-template-error" : undefined}
          data-testid="dashboard-save-as-template-input"
        />
        <Button type="submit" variant="outline" size="sm" disabled={editing || atCap}>
          Save
        </Button>
      </div>
      {error && (
        <p id="dashboard-save-as-template-error" className="mt-1.5 text-xs text-loss" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function LayoutRow({
  layout,
  active,
  isDefault,
  editing,
  canDelete,
  onSwitch,
  onDuplicate,
  onRename,
  onDelete,
  onSetDefault,
}: {
  layout: DashboardLayoutDocument;
  active: boolean;
  isDefault: boolean;
  editing: boolean;
  canDelete: boolean;
  onSwitch: (layoutId: string) => void;
  onDuplicate: (layoutId: string) => void;
  onRename: (layoutId: string, name: string) => boolean;
  onDelete: (layoutId: string) => void;
  onSetDefault: (layoutId: string) => void;
}) {
  const [renaming, setRenaming] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(layout.name);

  const visibleCount = layout.widgets.filter((widget) => widget.visible).length;
  const canSwitch = !active && !editing;

  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-2",
        active ? "border-accent/40 bg-accent/5" : "border-border bg-surface",
      )}
      data-testid={`dashboard-layout-row-${layout.id}`}
    >
      {renaming ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (onRename(layout.id, nameDraft)) setRenaming(false);
          }}
        >
          <Label htmlFor={`layout-name-${layout.id}`} className="sr-only">
            Workspace name
          </Label>
          <Input
            id={`layout-name-${layout.id}`}
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            maxLength={60}
            autoFocus
            data-testid={`dashboard-layout-rename-input-${layout.id}`}
          />
          <Button type="submit" variant="default" size="icon-sm" aria-label="Save name">
            <Check className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel rename"
            onClick={() => {
              setNameDraft(layout.name);
              setRenaming(false);
            }}
          >
            <span aria-hidden="true" className="text-sm">✕</span>
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-sm font-semibold">
              {layout.name}
              {active && (
                <Badge className="text-[10px]" data-testid={`dashboard-layout-active-${layout.id}`}>
                  Active
                </Badge>
              )}
              {isDefault && (
                <Badge variant="outline" className="text-[10px]" data-testid={`dashboard-layout-default-${layout.id}`}>
                  <Star className="mr-0.5 size-2.5" aria-hidden="true" />
                  Default
                </Badge>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {visibleCount} widget{visibleCount === 1 ? "" : "s"}
              {layout.templateId ? " · from template" : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {canSwitch && (
              <Button
                variant="outline"
                size="sm"
                data-testid={`dashboard-layout-activate-${layout.id}`}
                onClick={() => onSwitch(layout.id)}
              >
                Use
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={isDefault ? `Default workspace: ${layout.name}` : `Set ${layout.name} as default`}
              title={isDefault ? "This is your default workspace" : editing ? "Save or cancel your edits first" : "Restore this workspace when the last active one is gone"}
              disabled={editing || isDefault}
              data-testid={`dashboard-layout-set-default-${layout.id}`}
              onClick={() => onSetDefault(layout.id)}
            >
              <Star className={cn("size-4", isDefault && "fill-current")} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Duplicate ${layout.name}`}
              title={editing ? "Save or cancel your edits first" : "Duplicate workspace"}
              disabled={editing}
              data-testid={`dashboard-layout-duplicate-${layout.id}`}
              onClick={() => onDuplicate(layout.id)}
            >
              <Copy className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="edit"
              size="icon-sm"
              aria-label={`Rename ${layout.name}`}
              data-testid={`dashboard-layout-rename-${layout.id}`}
              onClick={() => {
                setNameDraft(layout.name);
                setRenaming(true);
              }}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${layout.name}`}
              title={canDelete ? "Delete workspace" : editing ? "The workspace being edited cannot be deleted" : "Keep at least one workspace"}
              disabled={!canDelete}
              data-testid={`dashboard-layout-delete-${layout.id}`}
              onClick={() => onDelete(layout.id)}
              className="hover:text-loss"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
