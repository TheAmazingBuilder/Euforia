import { useQuery } from "@tanstack/react-query";
import type { SessionTimelineResponse } from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** GET /session/timeline — today's events + mood strip (server-assembled). */
export function useSessionTimeline() {
  return useQuery({
    queryKey: queryKeys.sessionTimeline,
    queryFn: () => apiRequest<SessionTimelineResponse>(apiPaths.sessionTimeline),
  });
}
