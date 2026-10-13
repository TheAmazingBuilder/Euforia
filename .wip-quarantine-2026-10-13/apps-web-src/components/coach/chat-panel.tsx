"use client";

import * as React from "react";
import {
  ArrowUp,
  Eraser,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { sendCoachMessage } from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import type { CoachChatMessage, CoachContext } from "@cosmoz/shared";

/**
 * Coach chat (feature 11) — the conversational surface. Owns the message
 * list (persisted to localStorage), the send/retry flow and the typing
 * state. Pure presentation + chat logic: the DATA snapshot is built by the
 * parent view from react-query caches and attached to every request.
 */

const STORAGE_KEY = "cosmoz.coach.history.v1";
/** Rendered turns kept locally; also the storage cap. */
const MAX_STORED = 40;
/** Turns sent to the API (mirrors the server-side zod cap of 16). */
const MAX_SENT = 16;
const INPUT_MAX = 4000;

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
  /** assistant-only: this turn failed — content holds the error message. */
  failed?: boolean;
}

const SUGGESTIONS = [
  "What's my biggest leak right now?",
  "Which strategy should I pause?",
  "How is my discipline trending?",
  "Review my last 10 trades",
] as const;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Restore-persisted turns; anything malformed is dropped. */
function loadStoredTurns(): ChatTurn[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const turns: ChatTurn[] = [];
    for (const item of parsed) {
      if (item === null || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (
        (record.role === "user" || record.role === "assistant") &&
        typeof record.content === "string" &&
        typeof record.at === "number" &&
        record.content.trim() !== ""
      ) {
        turns.push({
          id: typeof record.id === "string" ? record.id : newId(),
          role: record.role,
          content: record.content,
          at: record.at,
        });
      }
      if (turns.length >= MAX_STORED) break;
    }
    return turns;
  } catch {
    return [];
  }
}

/** Minimal **bold** renderer for coach replies — React nodes, never HTML. */
function renderReply(text: string): React.ReactNode[] {
  return text.split("\n").map((line, lineIndex) => {
    const parts = line.split(/\*\*(.+?)\*\*/g);
    const nodes = parts.map((part, partIndex) =>
      partIndex % 2 === 1 ? (
        <strong key={partIndex} className="font-semibold text-foreground">
          {part}
        </strong>
      ) : (
        <span key={partIndex}>{part}</span>
      ),
    );
    return (
      <React.Fragment key={lineIndex}>
        {lineIndex > 0 ? <br /> : null}
        {nodes}
      </React.Fragment>
    );
  });
}

function formatTime(at: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(at),
  );
}

export interface ChatPanelProps {
  /** Data snapshot attached to every request — null while data loads. */
  context: CoachContext | null;
  /** One-line human summary of the snapshot (e.g. "52 trades · 6 strategies"). */
  snapshotSummary: string;
}

export function ChatPanel({ context, snapshotSummary }: ChatPanelProps) {
  const [turns, setTurns] = React.useState<ChatTurn[]>([]);
  const [restored, setRestored] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const abortRef = React.useRef<AbortController | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Restore once after mount (hydration-safe: server rendered an empty
  // list). Deferred so the restore never setState-synchronously in the
  // effect; unmount aborts any in-flight coach request.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setTurns(loadStoredTurns());
      setRestored(true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, []);

  // Persist after every settled change.
  React.useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          turns.slice(-MAX_STORED).map(({ id, role, content, at }) => ({ id, role, content, at })),
        ),
      );
    } catch {
      // Storage full/blocked — the chat still works, it just won't persist.
    }
  }, [turns, restored]);

  // Keep the newest turn in view.
  React.useEffect(() => {
    const node = listRef.current;
    if (node === null) return;
    node.scrollTo({ top: node.scrollHeight, behavior: restored ? "smooth" : "auto" });
  }, [turns, pending, restored]);

  const send = React.useCallback(
    async (history: ChatTurn[], userContent: string) => {
      if (context === null) return;
      const userTurn: ChatTurn = { id: newId(), role: "user", content: userContent, at: Date.now() };
      const optimistic = [...history, userTurn];
      setTurns([...optimistic, { id: newId(), role: "assistant", content: "…", at: Date.now() }]);
      setPending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const payloadMessages: CoachChatMessage[] = optimistic.slice(-MAX_SENT).map((turn) => ({
          role: turn.role,
          content: turn.content,
        }));
        const { reply } = await sendCoachMessage({ messages: payloadMessages, context }, controller.signal);
        setTurns((previous) => [
          ...previous.slice(0, -1),
          { id: newId(), role: "assistant", content: reply, at: Date.now() },
        ]);
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error && error.name !== "AbortError"
            ? error.message
            : "The coach could not answer. Please retry.";
        setTurns((previous) => [
          ...previous.slice(0, -1),
          { id: newId(), role: "assistant", content: message, at: Date.now(), failed: true },
        ]);
        toast.error("Coach request failed", { description: message });
      } finally {
        if (!controller.signal.aborted) setPending(false);
        abortRef.current = null;
      }
    },
    [context],
  );

  const retry = React.useCallback(
    (failedId: string) => {
      if (pending) return;
      const failedIndex = turns.findIndex((turn) => turn.id === failedId);
      if (failedIndex < 1) return;
      const history = turns.slice(0, failedIndex);
      const lastUser = [...history].reverse().find((turn) => turn.role === "user");
      if (!lastUser) return;
      void send(history, lastUser.content);
    },
    [turns, pending, send],
  );

  const submit = () => {
    const content = draft.trim();
    if (content === "" || pending || context === null) return;
    setDraft("");
    requestAnimationFrame(() => inputRef.current?.focus());
    void send(turns.filter((turn) => !turn.failed), content);
  };

  const clear = () => {
    abortRef.current?.abort();
    setTurns([]);
    setDraft("");
    toast.success("Conversation cleared");
    inputRef.current?.focus();
  };

  const empty = turns.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      {/* Header — identity + data badge (inline mark, no icon tile) */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <Sparkles className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-sm font-semibold text-foreground">Your coach</p>
          <p className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
            {context !== null ? `Grounded in ${snapshotSummary}` : "Loading your data…"}
          </p>
        </div>
        {turns.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={clear}
            disabled={pending}
            aria-label="Clear conversation"
          >
            <Eraser className="size-3.5" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Coach conversation"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-2 text-center">
            <Sparkles className="size-6 text-muted-foreground/50" aria-hidden="true" />
            <div>
              <p className="font-heading text-base font-semibold text-foreground">
                Talk about your trading, not the market
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Your coach reads your journal — trades, strategies, mistakes and discipline — and
                answers with your real numbers. Process first, P&amp;L second.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={context === null}
                  onClick={() => void send([], suggestion)}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn) =>
            turn.role === "user" ? (
              <div key={turn.id} className="flex justify-end">
                <div className="max-w-[85%] sm:max-w-[75%]">
                  <div className="rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground whitespace-pre-wrap">
                    {turn.content}
                  </div>
                  <p className="mt-1 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                    {formatTime(turn.at)}
                  </p>
                </div>
              </div>
            ) : turn.failed ? (
              <div key={turn.id} className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-loss/40 bg-loss/5 px-3.5 py-2.5">
                  <p className="flex items-center gap-2 text-sm text-foreground">
                    <TriangleAlert className="size-4 shrink-0 text-loss" aria-hidden="true" />
                    {turn.content}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 gap-1.5 px-2.5 text-xs"
                    onClick={() => retry(turn.id)}
                    disabled={pending}
                  >
                    <RotateCcw className="size-3" aria-hidden="true" />
                    Retry
                  </Button>
                </div>
              </div>
            ) : (
              <div key={turn.id} className="flex justify-start">
                <div className="max-w-[90%] sm:max-w-[80%]">
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent/10"
                      aria-hidden="true"
                    >
                      <Sparkles className="size-3.5 text-accent" />
                    </span>
                    <div className="rounded-2xl rounded-tl-md border border-border bg-background px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                      {renderReply(turn.content)}
                    </div>
                  </div>
                  <p className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground sm:pl-9.5">
                    {formatTime(turn.at)}
                  </p>
                </div>
              </div>
            ),
          )
        )}

        {/* Typing indicator */}
        {pending ? (
          <div className="flex justify-start" aria-label="Coach is typing">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/10" aria-hidden="true">
                <Sparkles className="size-3.5 text-accent" />
              </span>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-border bg-background px-4 py-3">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:0ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:150ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background/40 px-3 py-3">
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="coach-input">
            Ask your coach
          </label>
          <textarea
            id="coach-input"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={INPUT_MAX}
            placeholder={
              context === null ? "Loading your data…" : "Ask your coach…"
            }
            disabled={context === null || pending}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-accent/50 disabled:opacity-60"
          />
          <Button
            size="icon"
            className="size-10 shrink-0 rounded-xl"
            onClick={submit}
            disabled={context === null || pending || draft.trim() === ""}
            aria-label="Send message"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 px-1 text-[10px] leading-none text-muted-foreground">
          <ShieldAlert className={cn("size-3 shrink-0")} aria-hidden="true" />
          Coaching on your journal data — not financial advice. Enter to send, Shift+Enter for a
          new line.
        </p>
      </div>
    </div>
  );
}
