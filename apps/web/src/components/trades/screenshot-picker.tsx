"use client";

import * as React from "react";
import { ImagePlus, X } from "lucide-react";

/**
 * Screenshot capture (spec §4/§10): file picker + paste (Ctrl+V) + previews.
 * Client-side only for this phase — real uploads arrive with the API.
 * Files live in component state and are intentionally NOT persisted to the
 * localStorage draft (binary payloads don't belong in storage).
 */

export interface DraftScreenshot {
  id: string;
  name: string;
  url: string;
}

let screenshotCounter = 0;

function makeEntry(file: File): DraftScreenshot {
  screenshotCounter += 1;
  return {
    id: `shot-${screenshotCounter}-${file.name}`,
    name: file.name === "" ? "pasted-image" : file.name,
    url: URL.createObjectURL(file),
  };
}

export interface ScreenshotPickerProps {
  screenshots: DraftScreenshot[];
  onChange: (screenshots: DraftScreenshot[]) => void;
}

export function ScreenshotPicker({ screenshots, onChange }: ScreenshotPickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addFiles = React.useCallback(
    (files: FileList | null) => {
      if (files === null || files.length === 0) return;
      const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) return;
      onChange([...screenshots, ...images.map(makeEntry)]);
    },
    [onChange, screenshots],
  );

  // Paste-anywhere inside the open modal: Ctrl+V grabs clipboard images.
  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (event.clipboardData === null) return;
      if (event.clipboardData.files.length > 0) {
        addFiles(event.clipboardData.files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const remove = (id: string) => {
    const entry = screenshots.find((shot) => shot.id === id);
    if (entry !== undefined) URL.revokeObjectURL(entry.url);
    onChange(screenshots.filter((shot) => shot.id !== id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ImagePlus className="size-4" aria-hidden="true" />
          Add screenshots
        </button>
        <span className="text-[11px] text-muted-foreground">or paste (Ctrl+V) — stored locally for now</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="Add screenshots"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {screenshots.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Screenshot previews">
          {screenshots.map((shot) => (
            <li key={shot.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote asset */}
              <img
                src={shot.url}
                alt={`Screenshot preview: ${shot.name}`}
                className="size-20 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => remove(shot.id)}
                aria-label={`Remove screenshot ${shot.name}`}
                className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border border-border bg-surface text-muted-foreground outline-none transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
