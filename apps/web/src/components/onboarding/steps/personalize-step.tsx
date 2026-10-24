"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { dashboardLayoutSchema, type DashboardLayout } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { OnboardingStepProps } from "./step-types";

/** Mini CSS schematic - clearly labeled "illustrative", never user data. */
function LayoutSchematic({ layout }: { layout: DashboardLayout }) {
  // Section order per layout - pure presentation, no data.
  const stacks: Record<DashboardLayout, string[]> = {
    COACH_FIRST: ["w-3/4", "w-full", "w-5/6"],
    RISK_FIRST: ["w-2/3", "w-full", "w-4/5"],
    PERFORMANCE_FIRST: ["w-5/6", "w-full", "w-3/4"],
  };
  return (
    <span
      aria-hidden="true"
      className="flex h-14 w-full flex-col justify-center gap-1.5 rounded-lg border border-border bg-background p-2"
    >
      {stacks[layout].map((width, index) => (
        <span
          key={index}
          className={cn("h-2 rounded-sm", index === 0 ? "bg-accent/70" : "bg-muted", width)}
        />
      ))}
    </span>
  );
}

/**
 * Step 5 - Personalize. Writes ONE real setting: the appearance domain's
 * defaultDashboardLayout (a supported dashboard emphasis in the existing
 * data model). The schematics are labeled illustrative previews. "Keep the
 * default layout" performs NO write. Selecting is never color-only: the
 * selected card shows a check icon + aria-checked.
 */
export function PersonalizeStep({ controller, dict, onAdvance, onBack }: OnboardingStepProps) {
  const [selected, setSelected] = React.useState<DashboardLayout | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const currentLayout = controller.appearance?.defaultDashboardLayout ?? "COACH_FIRST";

  async function handleSave() {
    if (pending || selected === null) return;
    setError(null);
    setPending(true);
    if (selected === currentLayout) {
      // Nothing to persist - the choice already matches the stored value.
      onAdvance();
      return;
    }
    const saved = await controller.saveLayout(selected);
    setPending(false);
    if (!saved) {
      setError(dict.personalize.errors.save);
      return;
    }
    onAdvance();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <h2
          data-onb="reveal"
          data-onb-focus
          tabIndex={-1}
          className="font-heading text-2xl font-extrabold tracking-tight text-foreground outline-none sm:text-3xl"
        >
          {dict.personalize.headline}
        </h2>
        <p data-onb="reveal" className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          {dict.personalize.body}
        </p>
      </header>

      <div
        data-onb="reveal"
        role="radiogroup"
        aria-label={dict.personalize.headline}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {dashboardLayoutSchema.options.map((layout) => {
          const isSelected = selected === layout;
          const isCurrent = layout === currentLayout;
          return (
            <button
              key={layout}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(layout)}
              data-testid={`onb-layout-${layout.toLowerCase()}`}
              className={cn(
                "flex min-h-11 flex-col gap-2.5 rounded-xl border bg-surface p-3.5 text-left transition-colors",
                isSelected
                  ? "border-accent ring-1 ring-accent"
                  : "border-border hover:border-accent/40",
              )}
            >
              <LayoutSchematic layout={layout} />
              <span className="flex items-center gap-1.5">
                <span className="font-heading text-sm font-bold text-foreground">
                  {dict.personalize.layouts[layout].title}
                </span>
                {isSelected ? (
                  <Check className="size-3.5 text-accent" aria-hidden="true" />
                ) : null}
                {isCurrent ? (
                  <span className="ml-auto rounded border border-border px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {dict.personalize.current}
                  </span>
                ) : null}
              </span>
              <span className="text-xs leading-snug text-muted-foreground">
                {dict.personalize.layouts[layout].description}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {dict.personalize.illustrative}
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="onb-layout-error"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div data-onb="reveal" className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-muted-foreground"
          onClick={onBack}
          disabled={pending}
          data-testid="onb-back"
        >
          {dict.progress.back}
        </Button>
        <Button
          type="button"
          size="lg"
          className="min-h-11 sm:min-w-44"
          onClick={handleSave}
          disabled={pending || selected === null || controller.isSyncing}
          data-testid="onb-layout-save"
        >
          {pending ? dict.ready.completing : dict.personalize.save}
        </Button>
      </div>
      <div data-onb="reveal" className="flex justify-center">
        <Button
          type="button"
          variant="link"
          className="min-h-11 text-muted-foreground"
          onClick={onAdvance}
          disabled={pending || controller.isSyncing}
          data-testid="onb-layout-keep-default"
        >
          {dict.personalize.keepDefault}
        </Button>
      </div>
    </div>
  );
}
