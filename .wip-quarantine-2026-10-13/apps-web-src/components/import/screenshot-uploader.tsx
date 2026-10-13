"use client";

/**
 * ScreenshotUploader — the upload experience (spec §11/§12/§13):
 * drag & drop + click-to-upload via a native file picker (keyboard
 * accessible through the focusable sr-only input), image preview with file
 * metadata, replace/remove. Validation errors are surfaced by category —
 * the uploader never trusts the file itself (untrusted input, spec §37).
 *
 * Presentational over `useScreenshotUpload()` (owned by the parent flow):
 * idle → uploading → ready → error, with visual dragging state (spec §12).
 */

import * as React from "react";
import { FileImage, ImageUp, Loader2, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ScreenshotUploadState } from "@/lib/recognition/use-recognition";
import { useI18n } from "@/i18n/i18n-provider";
import { formatFileSize } from "./import-shared";

const ACCEPT = ".png,.jpg,.jpeg,.webp";

export function ScreenshotUploader({
  state,
  onSelect,
  onClear,
}: {
  state: ScreenshotUploadState;
  onSelect: (file: File) => void;
  onClear: () => void;
}) {
  const { dict } = useI18n();
  const V = dict.recognition.uploader;
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dragDepth = React.useRef(0);

  const openPicker = () => inputRef.current?.click();

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onSelect(file);
  };

  const dragHandlers = {
    onDragEnter: (event: React.DragEvent) => {
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (event: React.DragEvent) => event.preventDefault(),
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop,
  };

  const shownUpload = state.kind === "ready" ? state.screenshot : null;
  const uploading = state.kind === "uploading";

  return (
    <Card data-testid="import-uploader">
      <CardHeader>
        <CardTitle className="text-base">{V.panelTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label={V.browseAria}
          data-testid="import-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onSelect(file);
          }}
        />

        {!shownUpload && (
          <div
            role="button"
            tabIndex={0}
            aria-label={V.dropzoneAria}
            data-testid="import-dropzone"
            onClick={openPicker}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openPicker();
              }
            }}
            {...dragHandlers}
            className={cn(
              "group flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              dragging
                ? "border-accent bg-accent/10"
                : "border-border hover:border-accent/60 hover:bg-muted/40",
            )}
            data-dragging={dragging ? "true" : "false"}
          >
            {uploading ? (
              <Loader2 className="size-8 animate-spin text-accent" aria-hidden />
            ) : (
              <ImageUp
                className="size-8 text-muted-foreground transition-colors group-hover:text-accent"
                aria-hidden
              />
            )}
            <div className="space-y-1">
              <p className="font-medium">{dragging ? V.dragging : V.dropTitle}</p>
              <p className="text-sm text-muted-foreground">{V.dropOr}</p>
            </div>
            <Button type="button" variant="outline" size="sm" tabIndex={-1}>
              {V.browse}
            </Button>
            <p className="text-xs text-muted-foreground">
              {V.formatsLabel} : {V.formats} — {V.maxSizeLabel} : {V.maxSize}
            </p>
            <p className="text-xs text-muted-foreground/80">{V.privacyNote}</p>
          </div>
        )}

        {state.kind === "error" && !shownUpload && (
          <p
            role="alert"
            data-testid="import-upload-error"
            className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss"
          >
            {state.code === "UNSUPPORTED_FORMAT"
              ? V.errorInvalidFormat
              : state.code === "UPLOAD_FAILED"
                ? V.errorTooLarge
                : V.errorInvalidFormat}
          </p>
        )}

        {shownUpload && (
          <div
            className="space-y-3"
            data-testid="import-preview-card"
            {...dragHandlers}
          >
            <div className="overflow-hidden rounded-xl border bg-muted/30">
              <div className="flex max-h-80 items-center justify-center overflow-y-auto bg-black/20">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img
                  src={shownUpload.previewUrl}
                  alt={V.previewAria}
                  className="max-h-80 w-auto max-w-full object-contain"
                  data-testid="import-preview-image"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileImage className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span
                  className="truncate font-mono text-sm"
                  data-testid="import-preview-filename"
                >
                  {shownUpload.file.fileName}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatFileSize(shownUpload.file.fileSize)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openPicker}
                  data-testid="import-preview-replace"
                  aria-label={V.replaceAria}
                  disabled={uploading}
                >
                  <RefreshCcw aria-hidden />
                  {V.replace}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClear}
                  data-testid="import-preview-remove"
                  aria-label={V.removeAria}
                  disabled={uploading}
                >
                  <Trash2 aria-hidden />
                  {V.remove}
                </Button>
              </div>
            </div>

            <dl
              className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3"
              data-testid="import-preview-meta"
            >
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{V.formatLabel}</dt>
                <dd className="font-mono text-xs uppercase">
                  {shownUpload.file.mimeType.replace("image/", "")}
                </dd>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{V.sizeLabel}</dt>
                <dd className="font-mono text-xs tabular-nums">
                  {formatFileSize(shownUpload.file.fileSize)}
                </dd>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{V.dimensionsLabel}</dt>
                <dd className="font-mono text-xs tabular-nums" data-testid="import-preview-dimensions">
                  {state.kind === "ready" && state.dimensions
                    ? `${state.dimensions.width} × ${state.dimensions.height}`
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
