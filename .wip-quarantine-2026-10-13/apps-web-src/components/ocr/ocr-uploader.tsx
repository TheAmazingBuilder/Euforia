"use client";

import * as React from "react";

import { FileText, ImageUp, RefreshCw, Trash2, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_MEDIA_EXTENSIONS,
  UPLOAD_ERROR_MESSAGES,
  validateScreenshotFile,
  type UploadValidationError,
} from "@/lib/recognition/contract";
import { formatBytes, formatImageType } from "./ocr-format";

/**
 * ScreenshotUploader (Prompt 3 §11–§13): drag & drop, click to upload,
 * paste (Ctrl+V), image preview with metadata, replace and remove. Upload
 * must always be possible WITHOUT drag & drop (§36) — the whole dropzone is
 * a real <button> that opens the native file picker. The selected file
 * never leaves the client until the user starts the analysis.
 */

export interface SelectedScreenshot {
  file: File;
  previewUrl: string;
  width: number | null;
  height: number | null;
}

type DragState = "idle" | "dragging" | "accepted" | "rejected";

export function ScreenshotUploader({
  value,
  onChange,
  disabled = false,
}: {
  value: SelectedScreenshot | null;
  onChange: (next: SelectedScreenshot | null) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dragDepth = React.useRef(0);
  const [dragState, setDragState] = React.useState<DragState>("idle");
  const [error, setError] = React.useState<UploadValidationError | null>(null);
  const objectUrlRef = React.useRef<string | null>(null);

  // Object URL lifecycle (§54): the URL is handed off to the job workspace
  // on Start Analysis, so unmounting must NOT revoke it — explicit Replace
  // and Remove revoke their predecessor themselves.
  React.useEffect(() => {
    objectUrlRef.current = value?.previewUrl ?? null;
  }, [value]);

  const acceptFile = React.useCallback(
    (file: File) => {
      const validationError = validateScreenshotFile({
        type: file.type,
        size: file.size,
        name: file.name,
      });
      if (validationError !== null) {
        setError(validationError);
        setDragState("rejected");
        return;
      }
      setError(null);
      setDragState("accepted");
      const previewUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        onChange({
          file,
          previewUrl,
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      };
      image.onerror = () => {
        onChange({ file, previewUrl, width: null, height: null });
      };
      image.src = previewUrl;
    },
    [onChange],
  );

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    if (disabled) return;
    setDragState("idle");
    const file = event.dataTransfer.files[0];
    if (file) acceptFile(file);
  };

  const onDragEnter = (event: React.DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragState((prev) => (prev === "accepted" || prev === "rejected" ? prev : "dragging"));
  };

  const onDragLeave = (event: React.DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragState((prev) => (prev === "dragging" ? "idle" : prev));
    }
  };

  // Paste-anywhere support (same affordance as the trades screenshot picker).
  React.useEffect(() => {
    if (disabled) return;
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) acceptFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptFile, disabled]);

  const remove = () => {
    if (value !== null) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
    setDragState("idle");
    setError(null);
  };

  if (value !== null) {
    return (
      <div className="space-y-3" data-testid="ocr-preview">
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <ImageUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="truncate text-xs font-medium">{value.file.name}</p>
            </div>
            <p className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {formatImageType(value.file.type)} · {formatBytes(value.file.size)}
              {value.width !== null && value.height !== null
                ? ` · ${value.width}×${value.height}`
                : ""}
            </p>
          </div>
          {value.file.type === "application/pdf" ? (
            <div
              className="flex h-40 flex-col items-center justify-center gap-2 border-t border-border text-muted-foreground"
              data-testid="ocr-pdf-preview"
            >
              <FileText className="size-8" aria-hidden />
              <p className="text-xs">PDF statement — pages are analyzed page by page.</p>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote asset */
            <img
              src={value.previewUrl}
              alt={`Screenshot preview: ${value.file.name}`}
              className="mx-auto max-h-[320px] w-full object-contain"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            data-testid="ocr-preview-replace"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Replace
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={remove}
            data-testid="ocr-preview-remove"
            className="text-loss hover:text-loss"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Remove
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MEDIA_EXTENSIONS.join(",")}
          className="sr-only"
          aria-label="Replace screenshot"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) acceptFile(file);
            event.target.value = "";
          }}
        />
      </div>
    );
  }

  const dragHintId = "ocr-dropzone-hint";

  return (
    <div className="space-y-2">
      <button
        type="button"
        data-testid="ocr-dropzone"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        aria-describedby={dragHintId}
        className={cn(
          "flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center outline-none transition-colors",
          "hover:border-accent/60 hover:bg-accent/5",
          "focus-visible:ring-2 focus-visible:ring-ring",
          dragState === "dragging" && "border-accent bg-accent/10",
          dragState === "rejected" && "border-loss/60 bg-loss/5",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-xl border border-border bg-background",
            dragState === "dragging" && "border-accent/40 text-accent",
          )}
        >
          <UploadCloud className="size-5 text-muted-foreground" aria-hidden />
        </span>
        <span className="space-y-1">
          <span className="block text-sm font-semibold">
            {dragState === "dragging"
              ? "Drop the screenshot to attach it"
              : "Drag a screenshot here, or click to browse"}
          </span>
          <span className="block text-xs text-muted-foreground" id={dragHintId}>
            PNG, JPG or WEBP up to 10 MB — a full trading-platform window works best
          </span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
          Supports MetaTrader 5 · TradingView · cTrader
        </span>
      </button>

      <div aria-live="polite">
        {error !== null ? (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-xs text-loss"
            data-testid="ocr-uploader-error"
          >
            <ImageUp className="size-3.5 shrink-0" aria-hidden />
            {UPLOAD_ERROR_MESSAGES[error]}
          </p>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MEDIA_EXTENSIONS.join(",")}
        className="sr-only"
        aria-label="Upload screenshot"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) acceptFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
