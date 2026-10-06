import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OcrConfirmInput,
  OcrCreateInput,
  OcrRecognitionPage,
  OcrRecognitionResponse,
  OcrRecognitionStatus,
} from "@cosmoz/shared";

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
    mutationFn: ({ id, corrections }: { id: string; corrections: OcrConfirmInput["corrections"] }) =>
      apiRequest<OcrRecognitionResponse>(apiPaths.ocrRecognitionConfirm(id), {
        method: "POST",
        body: { corrections },
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
