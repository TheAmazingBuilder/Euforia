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
 * OCR & screenshot recognition hooks — the client half of the Phase 19
 * contract served by the NestJS `OcrController`. The review UI consumes:
 * create (upload → recognition), list (status-filtered page), confirm
 * (corrections become authoritative) and delete. The raw screenshot is
 * fetched separately as authenticated bytes (never exposed to proxies).
 */

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
 * the review dialog can render in an <img>. Callers own the URL lifetime
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
