"use client";

import * as React from "react";
import { CheckCircle2, Images, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { OcrFieldKey, OcrSet } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api/client";
import { useConfirmOcrSet, useCreateOcrSet, useDeleteOcrSet } from "@/lib/api/queries";
import {
  formatFinancial,
  recognitionConfidence,
} from "@/components/recognition/recognition-model";
import { recognitionFieldLabel, type RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * SetWorkspace - V2 §1/§2/§14/§15/§18: the multi-screenshot flow.
 *
 * The user picks 2..6 screenshots of ONE trading event (entry / position /
 * exit); the backend recognizes each individually, fuses them into a single
 * TradeDraft, and the fused confirmation goes through the SAME Trading Core
 * bridge as the single path. Individual member recognitions are always
 * preserved (they land in the history too - V2 §15).
 *
 * The pipeline mirrors the single-upload discipline: client validation →
 * create → review → explicit confirm (human-in-the-loop, V2 §103).
 */

const SET_MAX_FILES = 6;
const SET_MAX_BYTES = 6 * 1024 * 1024;

type Stage = "idle" | "review" | "done";

export function SetWorkspace({ dict }: { dict: RecognitionDict }) {
  const createSet = useCreateOcrSet();
  const confirmSet = useConfirmOcrSet();
  const deleteSet = useDeleteOcrSet();
  const [files, setFiles] = React.useState<File[]>([]);
  const [setId, setSetId] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState<Stage>("idle");
  const [result, setResult] = React.useState<OcrSet | null>(null);
  const [corrections, setCorrections] = React.useState<Record<string, string>>({});
  const inputRef = React.useRef<HTMLInputElement>(null);

  const rejection = files.find((file) => file.size > SET_MAX_BYTES) ?? null;

  function acceptFileList(list: FileList | null) {
    if (!list) return;
    const accepted = Array.from(list)
      .filter((file) => /^(image\/png|image\/jpeg|image\/webp|application\/pdf)$/.test(file.type))
      .slice(0, SET_MAX_FILES);
    setFiles((current) => [...current, ...accepted].slice(0, SET_MAX_FILES));
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  // Data URLs are produced asynchronously - the create flow reads them all
  // first, then posts (honest ordering, no state races).
  async function handleCreateSet() {
    if (files.length < 2) return;
    try {
      const imageDataUrls = await Promise.all(
        files.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            }),
        ),
      );
      createSet.mutate(
        { imageDataUrls, requestedProfile: "TRADE_SUMMARY" },
        {
          onSuccess: (data) => {
            setSetId(data.set.id);
            setResult(data.set);
            setStage("review");
            setFiles([]);
          },
          onError: (error) => toast.error(dict.errors.upload, { description: apiErrorMessage(error, "") }),
        },
      );
    } catch {
      toast.error(dict.errors.upload);
    }
  }

  function handleConfirmSet() {
    if (!setId || !result) return;
    const merged: Record<string, string | null> = {};
    for (const field of result.fused?.fields ?? []) {
      merged[field.field] = field.field in corrections ? corrections[field.field] : field.normalizedValue;
    }
    confirmSet.mutate(
      { id: setId, corrections: merged },
      {
        onSuccess: (data) => {
          setResult(data.set);
          setStage("done");
          toast.success(dict.sets.confirmedCount);
        },
        onError: (error) => toast.error(dict.errors.server, { description: apiErrorMessage(error, "") }),
      },
    );
  }

  function handleDiscard() {
    if (!setId) return;
    deleteSet.mutate(setId, {
      onSuccess: () => {
        setSetId(null);
        setResult(null);
        setStage("idle");
        toast.info(dict.sets.deleted);
      },
    });
  }

  const fused = result?.fused ?? null;
  const isDone = stage === "done";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-4" data-testid="set-workspace">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="flex items-center gap-2 font-heading text-sm font-semibold">
            <Images className="size-4 text-accent" strokeWidth={1.5} aria-hidden="true" />
            {dict.sets.uploaderTitle}
          </p>
          <p className="text-xs text-muted-foreground">{dict.sets.uploaderHint}</p>
        </div>
        {result ? (
          <Button type="button" variant="ghost" size="sm" className="min-h-7" onClick={handleDiscard} data-testid="set-discard">
            <Trash2 className="size-3.5" aria-hidden="true" />
            {dict.sets.delete}
          </Button>
        ) : null}
      </div>

      {stage === "idle" || files.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {files.map((file, index) => (
              <span key={`${file.name}-${index}`} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs">
                <span className="max-w-40 truncate font-mono">{file.name}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => removeFile(index)}
                  aria-label={`${file.name} - remove`}
                >
                  ×
                </button>
              </span>
            ))}
            {rejection ? <span className="text-xs text-loss">{rejection.name}: too large</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              multiple
              className="sr-only"
              onChange={(event) => {
                acceptFileList(event.target.files);
                event.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" className="min-h-8" onClick={() => inputRef.current?.click()} data-testid="set-pick">
              {dict.sets.uploaderTitle}
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-h-8"
              disabled={files.length < 2 || files.length > SET_MAX_FILES || createSet.isPending}
              onClick={handleCreateSet}
              data-testid="set-create"
            >
              {createSet.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              {createSet.isPending ? "…" : dict.sets.fusedTitle}
            </Button>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {files.length}/{SET_MAX_FILES}
            </span>
          </div>
        </div>
      ) : null}

      {createSet.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {dict.progress.steps.ocr}…
        </p>
      ) : null}

      {fused && stage !== "idle" ? (
        <div className="flex flex-col gap-4 border-t border-border pt-3" data-testid="set-review">
          {/* Member strip - individual recognitions are preserved (V2 §15). */}
          <div className="flex flex-col gap-1.5">
            <p className="ledger-label">{dict.sets.membersTitle}</p>
            <div className="flex flex-wrap gap-2">
              {result!.members.map((member) => (
                <span
                  key={member.recognitionId}
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <span className="stamp stamp-accent !text-[9px]">
                    {dict.sets.member} {member.order + 1}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {recognitionConfidence(member.recognition.fields) ?? "-"}%
                  </span>
                </span>
              ))}
            </div>
            <p className={cn("text-xs", result!.fused!.coherent ? "text-muted-foreground" : "text-warning")}>
              {result!.fused!.coherent ? dict.sets.coherentOk : dict.sets.coherentWarning}
            </p>
          </div>

          {/* Fused fields - the single TradeDraft (V2 §18). */}
          <div className="flex flex-col">
            <p className="ledger-label border-b border-border pb-1.5">{dict.sets.fusedTitle}</p>
            <p className="pt-1 text-xs text-muted-foreground">{dict.sets.fusedHint}</p>
            {(fused.fields ?? []).map((field) => {
              const corrected = corrections[field.field];
              const value = corrected ?? field.normalizedValue;
              return (
                <div key={field.field} className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {recognitionFieldLabel(dict, field.field as OcrFieldKey)}
                    {field.warnings.includes("CONFLICTING_VALUES") ? (
                      <span className="stamp stamp-warn !text-[9px]">{dict.sets.conflictsTitle}</span>
                    ) : field.warnings.includes("MULTI_SOURCE_AGREEMENT") ? (
                      <span className="stamp stamp-win !text-[9px]">2×</span>
                    ) : null}
                  </span>
                  {isDone ? (
                    <span className="font-mono text-sm tabular-nums">{formatFinancial(value)}</span>
                  ) : (
                    <input
                      type="text"
                      value={value ?? ""}
                      onChange={(event) =>
                        setCorrections((current) => ({ ...current, [field.field]: event.target.value }))
                      }
                      className="w-44 border-b border-border bg-transparent px-1 py-0.5 text-right font-mono text-sm tabular-nums focus:border-accent focus:outline-none"
                      aria-label={recognitionFieldLabel(dict, field.field as OcrFieldKey)}
                      data-testid={`set-field-${field.field}`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Conflicts - both readings kept, the user decides (V2 §18). */}
          {fused.conflicts.length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-warning/40 bg-warning/[0.05] px-3 py-2">
              <p className="flex items-center gap-2 text-xs font-medium">
                <TriangleAlert className="size-3.5 text-warning" strokeWidth={1.5} aria-hidden="true" />
                {dict.sets.conflictsTitle}
              </p>
              {fused.conflicts.map((conflict) => (
                <div key={conflict.field} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{recognitionFieldLabel(dict, conflict.field as OcrFieldKey)}:</span>
                  {conflict.values.map((value) => (
                    <button
                      key={`${conflict.field}-${value.value}`}
                      type="button"
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
                        corrections[conflict.field] === value.value
                          ? "border-accent bg-accent/10 text-foreground"
                          : "border-border hover:border-accent",
                      )}
                      onClick={() => setCorrections((current) => ({ ...current, [conflict.field]: value.value }))}
                      data-testid={`set-conflict-${conflict.field}-${value.value}`}
                    >
                      {formatFinancial(value.value)}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {isDone ? (
            <p className="flex items-center gap-2 text-sm" data-testid="set-done">
              <CheckCircle2 className="size-4 text-profit" strokeWidth={1.5} aria-hidden="true" />
              {dict.sets.confirmedCount}
            </p>
          ) : (
            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <Button type="button" onClick={handleConfirmSet} disabled={confirmSet.isPending} data-testid="set-confirm">
                {confirmSet.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                {dict.sets.confirmTitle}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
