import type { CoachChatRequest, CoachChatResponse } from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";

/**
 * Coach domain — feature 11. The chat is intentionally NOT a react-query
 * cache entry: each exchange is a stateless POST carrying the conversation
 * and the data snapshot. The view owns the message list (persisted to
 * localStorage) and calls this function imperatively.
 */
export async function sendCoachMessage(
  payload: CoachChatRequest,
  signal?: AbortSignal,
): Promise<CoachChatResponse> {
  return apiRequest<CoachChatResponse>(apiPaths.coachChat, {
    method: "POST",
    body: payload,
    signal,
  });
}
