"use client";

import * as React from "react";

import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Shared compact icon button for the Oryon chrome (toolbar + rails).
 * Professional charting ergonomics: 8×8 hit area, tooltip + aria-label,
 * active/disabled states, optional testid. Disabled buttons keep their
 * tooltip so deferred tools explain WHY they are off (never faked).
 */
export function OryonIconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
  testid,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  testid?: string;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            aria-pressed={disabled ? undefined : active}
            disabled={disabled}
            data-testid={testid}
            data-active={active || undefined}
            onClick={onClick}
            className={cn(
              "size-8 rounded-md text-muted-foreground hover:text-foreground",
              active && "bg-accent/12 text-accent hover:bg-accent/20 hover:text-accent",
              disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
              className,
            )}
          >
            <Icon className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
