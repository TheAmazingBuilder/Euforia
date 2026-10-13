"use client";

import * as React from "react";
import { ChevronDown, Copy, Keyboard, LifeBuoy, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Help & Support — keyboard map, honest FAQ and a reachable support line.
 * Everything is static content; no backend needed.
 */

const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["N"], action: "Capture a new trade from anywhere" },
  { keys: ["G"], action: "Log a setup you saw but did not take" },
  { keys: ["⌘", "K"], action: "Open the command palette" },
  { keys: ["?"], action: "Show the shortcut overlay" },
  { keys: ["Esc"], action: "Close the current dialog (drafts are kept)" },
];

const FAQ: { question: string; answer: string }[] = [
  {
    question: "Why is the P&L hidden when I close a trade?",
    answer:
      "The judgment gate asks you to grade the decision before the result is revealed. Seeing the money first anchors your grade to the outcome instead of the process — and the process is the only thing you control.",
  },
  {
    question: "What is a ghost trade?",
    answer:
      "A setup you saw but did not take. Log it with G, guess the outcome, and the discipline card prices what the missed setup would have cost or earned. Hesitation has a number too.",
  },
  {
    question: "How is the discipline score computed?",
    answer:
      "It blends plan adherence on graded trades, mistakes per trade and rule violations per trade — never P&L. You can run a green day at −1R and a red day at +2R; only one of them is a good day.",
  },
  {
    question: "Where does my data live?",
    answer:
      "In this preview build, everything lives in your browser. Export a JSON backup from Security → Backups any time; the same file re-imports into a fresh session or the future hosted API.",
  },
  {
    question: "Can I import my broker history?",
    answer:
      "Yes — Settings → CSV import accepts a broker export, previews every row with detected mistakes, then commits. Unknown symbols are created automatically with sensible defaults.",
  },
  {
    question: "Does the app work offline?",
    answer:
      "Cosmoz is an installable PWA: the shell loads without a network and queues gracefully. Captures made offline are kept and reconciled when you are back online.",
  },
];

const SUPPORT_EMAIL = "support@cosmoz.app";

export function HelpView() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      toast.success("Email copied", { description: SUPPORT_EMAIL });
    } catch {
      toast.error("Copy failed", { description: "Select and copy the address manually." });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* Keyboard map */}
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <Keyboard className="size-4 text-accent" aria-hidden="true" />
            Keyboard shortcuts
          </CardTitle>
          <CardDescription>
            The capture loop is built to be faster than the doubt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {SHORTCUTS.map((shortcut) => (
              <li
                key={shortcut.action}
                className="flex items-center justify-between gap-4 py-2.5"
              >
                <span className="text-sm text-foreground">{shortcut.action}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {shortcut.keys.map((key) => (
                    <kbd
                      key={key}
                      className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground"
                    >
                      {key}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <LifeBuoy className="size-4 text-accent" aria-hidden="true" />
            Frequent questions
          </CardTitle>
          <CardDescription>
            How Cosmoz thinks about process, data and honesty.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {FAQ.map((item, index) => {
            const open = openIndex === index;
            return (
              <div
                key={item.question}
                className="overflow-hidden rounded-lg border border-border bg-surface-raised/40"
                data-testid="faq-item"
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-sm font-medium text-foreground">
                    {item.question}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      open && "rotate-180",
                    )}
                  />
                </button>
                {open ? (
                  <p className="border-t border-border/50 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                    {item.answer}
                  </p>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Contact */}
      <Card className="bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <Mail className="size-4 text-accent" aria-hidden="true" />
            Reach the team
          </CardTitle>
          <CardDescription>
            A bug, a data question, a coaching idea — one line is enough.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <code className="rounded-md border border-border bg-muted px-3 py-1.5 font-mono text-sm text-foreground">
            {SUPPORT_EMAIL}
          </code>
          <Button variant="outline" size="sm" onClick={copyEmail}>
            <Copy className="size-3.5" aria-hidden="true" />
            Copy
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Cosmoz%20support`}>
              Write
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
