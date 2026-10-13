"use client";

/**
 * RecognitionSettings — pre-analysis configuration (spec §14). Only options
 * the V1 backend will actually support are enabled (AUTO/MT5 platform,
 * Automatic mode); future options are visible but disabled with a
 * "Coming soon" tag — never faked.
 */

import * as React from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  RECOGNITION_MODE_OPTIONS,
  RECOGNITION_PLATFORM_OPTIONS,
} from "@/lib/recognition/constants";
import type {
  RecognitionMode,
  RecognitionPlatform,
} from "@/lib/recognition/types";
import { useI18n } from "@/i18n/i18n-provider";
import { formatFileSize } from "./import-shared";

export function RecognitionSettings({
  platform,
  mode,
  onPlatformChange,
  onModeChange,
  onStart,
  onBack,
  starting,
  startDisabled,
  fileMeta,
}: {
  platform: RecognitionPlatform;
  mode: RecognitionMode;
  onPlatformChange: (platform: RecognitionPlatform) => void;
  onModeChange: (mode: RecognitionMode) => void;
  onStart: () => void;
  onBack: () => void;
  starting: boolean;
  startDisabled: boolean;
  fileMeta: { fileName: string; fileSize: number } | null;
}) {
  const { dict } = useI18n();
  const V = dict.recognition.settings;

  return (
    <Card data-testid="import-settings">
      <CardHeader>
        <CardTitle className="text-base">{V.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{V.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {fileMeta && (
          <p className="rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
            {fileMeta.fileName} — {formatFileSize(fileMeta.fileSize)}
          </p>
        )}

        {/* Platform (spec §14) */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{V.platformLabel}</legend>
          <p className="text-xs text-muted-foreground">{V.platformHint}</p>
          <div
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            role="radiogroup"
            aria-label={V.platformAria}
            data-testid="import-platform-group"
          >
            {RECOGNITION_PLATFORM_OPTIONS.map((option) => {
              const label =
                V.platformOptions[
                  option.value as keyof typeof V.platformOptions
                ];
              return (
                <label
                  key={option.value}
                  className={cn(
                    "relative flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                    "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
                    platform === option.value
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border hover:border-accent/50",
                    !option.enabled && "cursor-not-allowed opacity-55",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="recognition-platform"
                      value={option.value}
                      checked={platform === option.value}
                      disabled={!option.enabled}
                      onChange={() => onPlatformChange(option.value)}
                      className="size-3.5 accent-[var(--accent)]"
                      data-testid={`import-platform-${option.value.toLowerCase()}`}
                    />
                    {label}
                  </span>
                  {!option.enabled && (
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <Lock className="size-3" aria-hidden />
                      {dict.recognition.shared.soon}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Recognition mode (spec §14) */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{V.modeLabel}</legend>
          <p className="text-xs text-muted-foreground">{V.modeHint}</p>
          <div
            className="grid gap-2 sm:grid-cols-2"
            role="radiogroup"
            aria-label={V.modeAria}
            data-testid="import-mode-group"
          >
            {RECOGNITION_MODE_OPTIONS.map((option) => {
              const label = V.modeOptions[option.value as keyof typeof V.modeOptions];
              return (
                <label
                  key={option.value}
                  className={cn(
                    "relative flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                    "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
                    mode === option.value
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border hover:border-accent/50",
                    !option.enabled && "cursor-not-allowed opacity-55",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="recognition-mode"
                      value={option.value}
                      checked={mode === option.value}
                      disabled={!option.enabled}
                      onChange={() => onModeChange(option.value)}
                      className="size-3.5 accent-[var(--accent)]"
                      data-testid={`import-mode-${option.value.toLowerCase()}`}
                    />
                    {label}
                  </span>
                  {!option.enabled && (
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <Lock className="size-3" aria-hidden />
                      {dict.recognition.shared.soon}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        <p
          className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
          data-testid="import-settings-privacy"
        >
          <span className="font-medium text-foreground">{V.privacyTitle} — </span>
          {V.privacyBody}
        </p>

        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={onBack} disabled={starting}>
            {V.back}
          </Button>
          <Button
            type="button"
            onClick={onStart}
            disabled={starting || startDisabled}
            data-testid="import-start"
            aria-label={V.startAria}
          >
            {V.start}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
