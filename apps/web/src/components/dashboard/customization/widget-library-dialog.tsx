"use client";

import * as React from "react";
import { Eye, Plus } from "lucide-react";
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
import { REGISTRY_CATEGORIES, WIDGET_REGISTRY } from "@/lib/dashboard-customization/registry";
import { WIDGET_CATEGORY_LABELS, type WidgetCategory } from "@/lib/dashboard-customization/types";
import type { DashboardWidgetKey } from "@cosmoz/shared";

import { widgetIcon } from "./widget-icons";

/**
 * Widget Library (Phase 01 §8) — discover and add REAL registered widgets,
 * grouped by category. Widgets already on the layout (visible or hidden)
 * show as added; a hidden instance can be restored from here. No fake
 * entries: every card renders with existing components and data.
 */
export interface WidgetLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: DashboardLayoutDocument;
  onAdd: (widgetType: DashboardWidgetKey) => void;
  onShow: (instanceId: string) => void;
}

export function WidgetLibraryDialog({
  open,
  onOpenChange,
  layout,
  onAdd,
  onShow,
}: WidgetLibraryDialogProps) {
  const hiddenInstances = layout.widgets.filter((widget) => !widget.visible);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"
        data-testid="dashboard-widget-library"
      >
        <DialogHeader>
          <DialogTitle className="font-heading">Widget library</DialogTitle>
          <DialogDescription>
            Everything you can put on this layout. Widgets marked Added are already here —
            hidden ones keep their place and settings.
          </DialogDescription>
        </DialogHeader>

        {hiddenInstances.length > 0 && (
          <section aria-label="Hidden widgets" className="space-y-2" data-testid="dashboard-library-hidden">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hidden on this layout
            </h3>
            <ul className="space-y-1.5">
              {hiddenInstances.map((instance) => {
                const def = WIDGET_REGISTRY[instance.type];
                const Icon = widgetIcon(def.iconId);
                return (
                  <li
                    key={instance.instanceId}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{def.name}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`dashboard-library-show-${instance.type.toLowerCase()}`}
                      onClick={() => onShow(instance.instanceId)}
                    >
                      <Eye className="size-4" aria-hidden="true" />
                      Show
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="space-y-5">
          {REGISTRY_CATEGORIES.map((category) => (
            <LibraryCategory
              key={category}
              category={category}
              layout={layout}
              onAdd={onAdd}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LibraryCategory({
  category,
  layout,
  onAdd,
}: {
  category: WidgetCategory;
  layout: DashboardLayoutDocument;
  onAdd: (widgetType: DashboardWidgetKey) => void;
}) {
  const definitions = Object.values(WIDGET_REGISTRY).filter((def) => def.category === category);
  if (definitions.length === 0) return null;

  return (
    <section aria-label={WIDGET_CATEGORY_LABELS[category]} className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {WIDGET_CATEGORY_LABELS[category]}
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {definitions.map((def) => {
          const Icon = widgetIcon(def.iconId);
          const instance = layout.widgets.find((widget) => widget.type === def.type);
          const present = Boolean(instance);
          const hidden = instance ? !instance.visible : false;
          return (
            <li
              key={def.type}
              data-testid={`dashboard-library-item-${def.type.toLowerCase()}`}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{def.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {def.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                  {def.minW === def.maxW ? "Full width" : `From ${def.minW}/12 wide`}
                </Badge>
                {present ? (
                  <Badge
                    variant="secondary"
                    className="text-[10px]"
                    data-testid={`dashboard-library-added-${def.type.toLowerCase()}`}
                  >
                    {hidden ? "Hidden" : "Added"}
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`dashboard-library-add-${def.type.toLowerCase()}`}
                    onClick={() => onAdd(def.type)}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Add
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
