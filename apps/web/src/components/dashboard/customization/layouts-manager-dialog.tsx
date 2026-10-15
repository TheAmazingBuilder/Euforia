"use client";

import * as React from "react";
import { Check, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { DashboardLayoutDocument } from "@cosmoz/shared";

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
 * Saved-layout manager (Phase 01 §10/§11) — switch, duplicate, rename,
 * delete, create empty, and the template presets. While an edit session
 * is live, active-changing operations are disabled (a draft is never
 * silently discarded — §10.2); templates then replace the draft instead.
 */
export interface LayoutsManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layouts: DashboardLayoutDocument[];
  activeLayoutId: string;
  editing: boolean;
  onSwitch: (layoutId: string) => void;
  onDuplicate: (layoutId: string) => void;
  onRename: (layoutId: string, name: string) => boolean;
  onDelete: (layoutId: string) => void;
  onCreateEmpty: () => void;
  /** View mode: template → new layout. Edit mode: template → draft. */
  onApplyTemplate: (templateId: string) => void;
}

export function LayoutsManagerDialog({
  open,
  onOpenChange,
  layouts,
  activeLayoutId,
  editing,
  onSwitch,
  onDuplicate,
  onRename,
  onDelete,
  onCreateEmpty,
  onApplyTemplate,
}: LayoutsManagerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
        data-testid="dashboard-layouts-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-heading">Dashboard layouts</DialogTitle>
          <DialogDescription>
            {editing
              ? "You are editing — save or cancel first to switch or duplicate. Templates replace your draft."
              : "Switch workspaces, or create one from scratch or from a template."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="layouts">
          <TabsList className="w-full">
            <TabsTrigger value="layouts" className="flex-1" data-testid="dashboard-layouts-tab">
              My layouts
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
                  editing={editing}
                  canDelete={layouts.length > 1 && (!editing || layout.id !== activeLayoutId)}
                  onSwitch={onSwitch}
                  onDuplicate={onDuplicate}
                  onRename={onRename}
                  onDelete={onDelete}
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
              New empty layout
            </Button>
          </TabsContent>

          <TabsContent value="templates" className="space-y-2 pt-2">
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
            {editing && (
              <p className="text-xs text-muted-foreground">
                Applying a template replaces your current draft — save to keep it.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function LayoutRow({
  layout,
  active,
  editing,
  canDelete,
  onSwitch,
  onDuplicate,
  onRename,
  onDelete,
}: {
  layout: DashboardLayoutDocument;
  active: boolean;
  editing: boolean;
  canDelete: boolean;
  onSwitch: (layoutId: string) => void;
  onDuplicate: (layoutId: string) => void;
  onRename: (layoutId: string, name: string) => boolean;
  onDelete: (layoutId: string) => void;
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
            Layout name
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
              aria-label={`Duplicate ${layout.name}`}
              title={editing ? "Save or cancel your edits first" : "Duplicate layout"}
              disabled={editing}
              data-testid={`dashboard-layout-duplicate-${layout.id}`}
              onClick={() => onDuplicate(layout.id)}
            >
              <Copy className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
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
              title={canDelete ? "Delete layout" : editing ? "The layout being edited cannot be deleted" : "Keep at least one layout"}
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
