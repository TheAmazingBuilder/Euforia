"use client";

import {
  BarChart3,
  Bell,
  BookOpen,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import type { OnboardingStepProps } from "./step-types";

type TourModule = {
  icon: LucideIcon;
  title: string;
  description: string;
};

/**
 * Step 2 - Discover the workspace. ONLY modules that actually exist in the
 * repository (sidebar navigation is the source of truth). Icon tiles instead
 * of fabricated screenshots - nothing here pretends to be the user's data.
 */
export function TourStep({ dict, onAdvance, onBack }: OnboardingStepProps) {
  const modules: TourModule[] = [
    { icon: LayoutDashboard, title: dict.tour.modules.dashboard.title, description: dict.tour.modules.dashboard.description },
    { icon: ArrowLeftRight, title: dict.tour.modules.trades.title, description: dict.tour.modules.trades.description },
    { icon: BookOpen, title: dict.tour.modules.review.title, description: dict.tour.modules.review.description },
    { icon: Wallet, title: dict.tour.modules.accounts.title, description: dict.tour.modules.accounts.description },
    { icon: BarChart3, title: dict.tour.modules.analytics.title, description: dict.tour.modules.analytics.description },
    { icon: ClipboardList, title: dict.tour.modules.playbook.title, description: dict.tour.modules.playbook.description },
    { icon: GraduationCap, title: dict.tour.modules.academy.title, description: dict.tour.modules.academy.description },
    { icon: Bell, title: dict.tour.modules.nofy.title, description: dict.tour.modules.nofy.description },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <h2
          data-onb="reveal"
          data-onb-focus
          tabIndex={-1}
          className="font-heading text-2xl font-extrabold tracking-tight text-foreground outline-none sm:text-3xl"
        >
          {dict.tour.headline}
        </h2>
        <p data-onb="reveal" className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          {dict.tour.body}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {modules.map((module) => (
          <div
            key={module.title}
            data-onb="reveal"
            className="flex items-start gap-3.5 rounded-xl border border-border bg-surface p-4"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-background">
              <module.icon className="size-4.5 text-accent" aria-hidden="true" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="font-heading text-sm font-bold text-foreground">{module.title}</span>
              <span className="text-sm leading-snug text-muted-foreground">{module.description}</span>
            </span>
          </div>
        ))}
      </div>

      <p data-onb="reveal" className="text-xs leading-relaxed text-muted-foreground/80">
        {dict.tour.more}
      </p>

      <div data-onb="reveal" className="mt-1 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-muted-foreground"
          onClick={onBack}
          data-testid="onb-back"
        >
          {dict.progress.back}
        </Button>
        <Button
          type="button"
          size="lg"
          className="min-h-11 sm:min-w-40"
          onClick={onAdvance}
          data-testid="onb-continue"
        >
          {dict.progress.continue}
        </Button>
      </div>
    </div>
  );
}
