"use client";

import * as React from "react";
import { FileScan, FileText, ImageUp, RefreshCw, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ACCEPT_ATTR,
  ACCEPTED_MIMES,
  UPLOAD_MAX_BYTES,
  isPdfFile,
} from "@/components/recognition/recognition-model";
import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * ScreenshotUploader — the reusable upload surface (PROMPT 3 §11/§12/§13).
 *
 * Drag & drop AND a native file picker (uploading is always possible
 * without drag & drop, §36). Owns the idle/dragging/accepted/rejected
 * visual states, the client-side validation (type, size, empty), the
 * preview with metadata and the replace/remove actions. The caller owns
 * the File; this component NEVER reads its bytes.
 *
 * Object-URL hygiene (§54): the preview URL is created here for the file
 * the caller handed us and revoked on replacement/unmount.
 */

export type UploadRejection = "empty" | "type" | "size" | "read";

export type UploadValidationError = { code: UploadRejection; fileName: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ScreenshotUploader({
  file,
  onFile,
  onClear,
  dict,
  disabled = false,
}: {
  /** The accepted file (preview mode when set). */
  file: File | null;
  onFile: (file: File) => void;
  onClear: () => void;
  dict: RecognitionDict;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [rejection, setRejection] = React.useState<UploadRejection | null>(null);
  const [dimensions, setDimensions] = React.useState<{ width: number; height: number } | null>(null);

  // Object-URL lifetime — derived DURING RENDER from the file prop (React's
  // "adjust state when a prop changes" pattern; no effect, no cascading
  // render, no ref writes). The URL itself is revoked by the effect that
  // consumes it — on URL change AND on unmount (cleanup owns the lifetime).
  const [preview, setPreview] = React.useState<{ file: File | null; url: string | null }>({
    file: null,
    url: null,
  });
  if (file !== preview.file) {
    setPreview({ file, url: file ? URL.createObjectURL(file) : null });
    setDimensions(null);
  }
  // Dimension probe + URL lifetime: async image decode (setState lands in
  // the load callback, never synchronously in an effect body).
  React.useEffect(() => {
    const url = preview.url;
    if (!url) return;
    const image = new Image();
    image.onload = () => setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;
    return () => {
      image.onload = null;
      URL.revokeObjectURL(url);
    };
  }, [preview.url]);

  const validate = React.useCallback(
    (candidate: File): UploadRejection | null => {
      if (candidate.size === 0) return "empty";
      const typeOk =
        (ACCEPTED_MIMES as readonly string[]).includes(candidate.type) ||
        isPdfFile(candidate); // some browsers report an empty/legacy type for PDFs
      if (!typeOk) return "type";
      if (candidate.size > UPLOAD_MAX_BYTES) return "size";
      return null;
    },
    [],
  );

  const acceptFile = React.useCallback(
    (candidate: File) => {
      const problem = validate(candidate);
      setRejection(problem);
      if (problem) return;
      onFile(candidate);
    },
    [onFile, validate],
  );

  const onDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      if (disabled) return;
      const dropped = event.dataTransfer.files?.[0];
      if (dropped) acceptFile(dropped);
    },
    [acceptFile, disabled],
  );

  const rejectionText = (code: UploadRejection): string => {
    switch (code) {
      case "empty":
        return dict.uploader.errEmpty;
      case "type":
        return dict.uploader.errType;
      case "size":
        return dict.uploader.errSize;
      case "read":
        return dict.uploader.errRead;
    }
  };

  if (file) {
    const pdf = isPdfFile(file);
    return (
      <div className="flex flex-col gap-3" data-testid="recognition-upload-preview">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {pdf ? (
            // PDF statements carry no inline raster preview — an honest file card.
            <div className="flex max-h-[340px] flex-col items-center justify-center gap-2 bg-background/60 p-8 sm:max-h-[420px]">
              <FileText className="size-10 text-muted-foreground" strokeWidth={1.25} aria-hidden="true" />
              <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {dict.uploader.pdfLabel}
              </p>
            </div>
          ) : (
            <div className="flex max-h-[340px] items-center justify-center bg-background/60 p-2 sm:max-h-[420px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-local object URL, never routed */}
              <img
                src={preview.url ?? undefined}
                alt={dict.uploader.previewLabel}
                className="max-h-[320px] w-auto max-w-full rounded-lg object-contain sm:max-h-[400px]"
                data-testid="recognition-preview-image"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-border px-4 py-2.5">
            <span className="font-mono text-xs text-muted-foreground" data-testid="recognition-file-name">
              {file.name}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {dimensions ? `${dimensions.width} × ${dimensions.height}` : formatBytes(file.size)} · {formatBytes(file.size)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            data-testid="recognition-replace"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {dict.uploader.replace}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setRejection(null);
              onClear();
            }}
            disabled={disabled}
            data-testid="recognition-remove"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            {dict.uploader.remove}
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = ""; // allow re-picking the same file
            if (picked) acceptFile(picked);
          }}
          aria-label={dict.uploader.replace}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-disabled={disabled}
        aria-label={dict.uploader.dropTitle}
        className={cn(
          "flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center transition-colors",
          "hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          dragging && "border-accent bg-accent/[0.04]",
          disabled && "pointer-events-none opacity-60",
        )}
        data-testid="recognition-dropzone"
        data-state={dragging ? "dragging" : "idle"}
      >
        {dragging ? (
          <ImageUp className="size-7 text-accent" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <FileScan className="size-7 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        )}
        <div className="flex flex-col gap-1">
          <p className="font-heading text-base font-semibold">
            {dragging ? dict.uploader.dragging : dict.uploader.dropTitle}
          </p>
          <p className="text-sm text-muted-foreground">{dict.uploader.dropSubtitle}</p>
        </div>
        <Button type="button" variant="outline" size="sm" tabIndex={-1} aria-hidden="true">
          {dict.uploader.browse}
        </Button>
      </div>
      {rejection ? (
        <p className="text-sm text-loss" role="alert" data-testid="recognition-upload-error">
          {rejectionText(rejection)}
        </p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = ""; // allow re-picking the same file
          if (picked) acceptFile(picked);
        }}
        aria-label={dict.uploader.browse}
      />
    </div>
  );
}
