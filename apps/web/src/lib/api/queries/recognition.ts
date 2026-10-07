import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OcrAnalyticsResponse,
  OcrConfirmInput,
  OcrCreateInput,
  OcrRecropResponse,
  OcrRecognitionPage,
  OcrRecognitionResponse,
  OcrRecognitionStatus,
  OcrStorageResponse,
} from "@cosmoz/shared";

import { API_MOCKED } from "@/lib/api/mode";
import { buildApiUrl } from "@/lib/api/urls";
import { getAccessToken } from "@/lib/auth/token-store";
import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Import & Recognition hooks — the frontend half of the PROMPT 3 service
 * abstraction. The UI never talks to an OCR engine: it goes
 *
 *   component → hook (React Query) → apiClient → NestJS /ocr/recognitions
 *
 * The MSW handlers are the MockRecognitionService (async pipeline simulated
 * server-side, time-based); the NestJS OcrController is the
 * ApiRecognitionService. Swapping one for the other changes NOTHING in the
 * views (spec §41 — the UI is never coupled to the mocks).
 *
 * Job progress: while a recognition is PROCESSING, useOcrRecognition polls
 * on an interval; the backend settles the job (the mock advances it through
 * its deterministic time-based pipeline). When a real FastAPI-backed NestJS
 * orchestrator later emits progress events, only this layer changes.
 */

/** Poll cadence while a job is PROCESSING — fast enough to feel live. */
const PROCESSING_POLL_MS = 700;

export function useOcrRecognitions(status?: OcrRecognitionStatus) {
  return useQuery({
    queryKey: queryKeys.ocrRecognitions(status),
    queryFn: () =>
      apiRequest<OcrRecognitionPage>(apiPaths.ocrRecognitions, {
        query: { limit: 20, status },
      }),
    refetchOnWindowFocus: false,
  });
}

/**
 * Single recognition job — the URL-state context (?job=<id>). Polls while
 * PROCESSING so the staged progress screen tracks the real pipeline, then
 * stops and lets the result view take over.
 */
export function useOcrRecognition(id: string | null) {
  return useQuery({
    queryKey: queryKeys.ocrRecognition(id ?? "none"),
    queryFn: () =>
      apiRequest<OcrRecognitionResponse>(apiPaths.ocrRecognition(id ?? ""), {}),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.recognition.status;
      return status === "PROCESSING" || status === "QUEUED" ? PROCESSING_POLL_MS : false;
    },
    refetchOnWindowFocus: false,
  });
}

export function useCreateOcrRecognition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OcrCreateInput) =>
      apiRequest<OcrRecognitionResponse>(apiPaths.ocrRecognitions, {
        method: "POST",
        body: input,
      }),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.ocrRecognitionsRoot,
      });
    },
  });
}

export function useConfirmOcrRecognition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      corrections,
      batches,
      accountId,
    }: {
      id: string;
      corrections: OcrConfirmInput["corrections"];
      batches?: OcrConfirmInput["batches"];
      accountId?: string | null;
    }) =>
      apiRequest<OcrRecognitionResponse>(apiPaths.ocrRecognitionConfirm(id), {
        method: "POST",
        body: batches ? { corrections, batches, accountId } : { corrections, accountId },
      }),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.ocrRecognitionsRoot,
      });
    },
  });
}

export function useDeleteOcrRecognition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ deleted: true; id: string }>(apiPaths.ocrRecognition(id), {
        method: "DELETE",
      }),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.ocrRecognitionsRoot,
      });
    },
  });
}

/**
 * Authenticated fetch of the raw screenshot bytes — returns an object URL
 * the views can render in an <img>. Callers own the URL lifetime
 * (revokeObjectURL on cleanup). Works in both mocked and live modes.
 */
/**
 * Re-OCR by crop (engine quality §2.4): targeted re-scan of a framed
 * region. Ephemeral guidance — the caller owns merging the results into
 * the local correction state.
 */
export function useOcrRecrop() {
  return useMutation({
    mutationFn: ({ id, region }: { id: string; region: { x: number; y: number; width: number; height: number } }) =>
      apiRequest<OcrRecropResponse>(apiPaths.ocrRecognitionRecrop(id), {
        method: "POST",
        body: { region },
      }),
  });
}

/** OCR quality analytics (engine quality §3.2) — the Analytics card feed. */
export function useOcrAnalytics(days = 30) {
  return useQuery({
    queryKey: queryKeys.ocrAnalytics(days),
    queryFn: () =>
      apiRequest<OcrAnalyticsResponse>(apiPaths.ocrAnalytics, {
        query: { days },
      }),
    refetchOnWindowFocus: false,
  });
}

/** Storage + retention indicator (engine quality §4.2). */
export function useOcrStorage() {
  return useQuery({
    queryKey: queryKeys.ocrStorage,
    queryFn: () => apiRequest<OcrStorageResponse>(apiPaths.ocrStorage),
    refetchOnWindowFocus: false,
  });
}

/**
 * Real-time progress (engine quality §4.1): subscribe to the SSE stream of
 * a PROCESSING job. The live NestJS backend streams status events; the
 * mocked backend has no stream (MSW cannot intercept EventSource-style
 * responses), so the hook NO-OPs in mock mode and the existing polling
 * keeps the job moving — same UI either way.
 *
 * Implementation is a fetch-stream reader (the browser EventSource cannot
 * send an Authorization header). Each `status` event is written straight
 * into the React Query cache entry the job view reads; the final event
 * invalidates the query so the settled aggregate loads fresh.
 */
export function useOcrRecognitionEvents(id: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (!id || !enabled || API_MOCKED) return;
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const token = getAccessToken();
        const response = await fetch(buildApiUrl(apiPaths.ocrRecognitionEvents(id)), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const eventLine = chunk.split("\n").find((line) => line.startsWith("event: "));
            const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
            if (!eventLine || !dataLine) continue;
            const event = eventLine.slice("event: ".length);
            let payload: { id?: string; status?: string } = {};
            try {
              payload = JSON.parse(dataLine.slice("data: ".length));
            } catch {
              continue;
            }
            if (event === "gone") {
              await queryClient.invalidateQueries({ queryKey: queryKeys.ocrRecognition(id) });
              return;
            }
            if (event === "status" && payload.status) {
              const cached = queryClient.getQueryData<OcrRecognitionResponse>(
                queryKeys.ocrRecognition(id),
              );
              if (cached?.recognition) {
                queryClient.setQueryData<OcrRecognitionResponse>(queryKeys.ocrRecognition(id), {
                  recognition: { ...cached.recognition, status: payload.status as typeof cached.recognition.status },
                });
              }
              if (payload.status !== "QUEUED" && payload.status !== "PROCESSING") {
                await queryClient.invalidateQueries({ queryKey: queryKeys.ocrRecognition(id) });
                await queryClient.invalidateQueries({ queryKey: queryKeys.ocrRecognitionsRoot });
                return;
              }
            }
          }
        }
      } catch {
        // aborted or network loss — the polling fallback already covers it
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, enabled, queryClient]);
}

export async function fetchOcrRecognitionImage(
  recognitionId: string,
): Promise<{ url: string; mime: string }> {
  const token = getAccessToken();
  const response = await fetch(buildApiUrl(apiPaths.ocrRecognitionImage(recognitionId)), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status} on GET /ocr/recognitions/:id/image`);
  }
  const blob = await response.blob();
  return { url: URL.createObjectURL(blob), mime: blob.type };
}
