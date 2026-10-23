"use client";

import * as React from "react";
import type { RevealPayload } from "@cosmoz/shared";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { JudgmentGate } from "@/components/trades/judgment-gate";
import { Reflect } from "@/components/trades/reflect";
import { Reveal } from "@/components/trades/reveal";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import {
  closeJudgmentFlow,
  gateSubmitted,
  useJudgmentFlow,
  type JudgmentStage,
} from "@/lib/hooks/use-judgment-flow";
import { useCurrentBalance } from "@/lib/api/queries";

/**
 * Host for Acts 2 & 3 (gate → reveal → reflect, trade-entry-ux.md §5/§6).
 * Same surface contract as TradeModal: desktop Dialog, mobile full-height
 * Sheet. The stage machine lives in use-judgment-flow; the RevealPayload
 * (the only P&L carrier in the app) is captured here when the gate
 * submission succeeds and handed to the Reveal stage.
 */

const STAGE_COPY: Record<JudgmentStage, { title: string; description: string }> = {
  gate: {
    title: "Judgment Gate",
    description: "Grade the decision - based only on what you knew at entry.",
  },
  reveal: {
    title: "The Reveal",
    description: "The outcome, unlocked by your grade.",
  },
  reflect: {
    title: "Reflect",
    description: "Optional - train your detector while it's fresh.",
  },
};

export function JudgmentFlowModal() {
  const flow = useJudgmentFlow();
  const isDesktop = useIsDesktop();
  const balanceInfo = useCurrentBalance();

  /**
   * The reveal payload arrives with the decision response. Kept keyed by the
   * trade it was graded for — a cached payload can never leak into another
   * trade's flow, and a re-opened gate (stage reset) renders the gate, so the
   * former clear-on-close effect is unnecessary.
   */
  const [graded, setGraded] = React.useState<{ tradeId: string; payload: RevealPayload } | null>(
    null,
  );
  const reveal =
    graded !== null && flow.tradeId !== null && graded.tradeId === flow.tradeId
      ? graded.payload
      : null;

  if (!flow.open || isDesktop === null || flow.tradeId === null) return null;

  const copy = STAGE_COPY[flow.stage];

  const content =
    flow.stage === "gate" ? (
      <JudgmentGate
        tradeId={flow.tradeId}
        onGraded={(payload, decision) => {
          setGraded({ tradeId: flow.tradeId!, payload });
          gateSubmitted(flow.tradeId!, decision);
        }}
      />
    ) : flow.stage === "reveal" && reveal !== null && flow.decision !== null ? (
      <Reveal
        reveal={reveal}
        currency={balanceInfo?.currency ?? "USD"}
        decision={flow.decision}
      />
    ) : flow.stage === "reflect" ? (
      <Reflect tradeId={flow.tradeId} />
    ) : null;

  if (isDesktop) {
    return (
      <Dialog
        open={flow.open}
        onOpenChange={(next) => {
          if (!next) closeJudgmentFlow();
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-xl lg:max-w-2xl">
          <DialogHeader className="gap-1 border-b border-border p-4 pb-3">
            <DialogTitle className="font-heading text-lg font-semibold text-foreground">
              {copy.title}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {copy.description}
            </DialogDescription>
          </DialogHeader>
          <div className="p-4">{content}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet
      open={flow.open}
      onOpenChange={(next) => {
        if (!next) closeJudgmentFlow();
      }}
    >
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] flex-col gap-0 rounded-t-xl p-0 sm:max-h-[100dvh]"
        aria-describedby={undefined}
      >
        <SheetHeader className="gap-1 border-b border-border p-4 pb-3">
          <SheetTitle className="font-heading text-lg font-semibold text-foreground">
            {copy.title}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            {copy.description}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {content}
        </div>
      </SheetContent>
    </Sheet>
  );
}
