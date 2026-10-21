"use client";

import type { AddScreenshotInput } from "@cosmoz/shared";

import { draftToDataUrl, type DraftScreenshot } from "@/components/trades/screenshot-picker";

/**
 * Sequential draft-screenshot upload (Livrable 4 seam closure): the capture
 * and reflect flows hold picked files in component state; this helper turns
 * each into a data URL and pushes it through POST /trades/:id/screenshots
 * (the same useAddScreenshot mutation the detail drawer uses) — ONE BY ONE,
 * so a large batch never floods the wire. Failures NEVER propagate: the
 * returned split tells the caller which drafts to drop from the picker and
 * how to surface the failure (toast) without blocking the flow.
 */
export async function uploadDraftsSequentially(
  tradeId: string,
  shots: readonly DraftScreenshot[],
  upload: (input: { tradeId: string; input: AddScreenshotInput }) => Promise<unknown>,
): Promise<{ uploaded: DraftScreenshot[]; failed: DraftScreenshot[] }> {
  const uploaded: DraftScreenshot[] = [];
  const failed: DraftScreenshot[] = [];
  for (const shot of shots) {
    try {
      const dataUrl = await draftToDataUrl(shot);
      await upload({ tradeId, input: { kind: "CHART", dataUrl } });
      uploaded.push(shot);
    } catch {
      failed.push(shot);
    }
  }
  return { uploaded, failed };
}
