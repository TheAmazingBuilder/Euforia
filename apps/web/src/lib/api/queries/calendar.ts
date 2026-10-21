"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";
import type {
  CalendarBlockMutationResponse,
  CalendarBlocksResponse,
  CalendarViewResponse,
  ImportEcoBlockersResponse,
  UpsertCalendarBlockInput,
} from "@cosmoz/shared";

/**
 * Calendar module queries — the trading overlay (server-computed day rows +
 * aggregates), the day-off / news-block store and the eco-blocker import.
 */

/** GET /calendar-view?from&to — day rows + range aggregates (server truth). */
export function useCalendarView(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendarView(from, to),
    queryFn: () =>
      apiRequest<CalendarViewResponse>(
        `${apiPaths.calendarView}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    enabled,
  });
}

/** GET /calendar-blocks — marked days off / news blockers. */
export function useCalendarBlocks() {
  return useQuery({
    queryKey: queryKeys.calendarBlocks,
    queryFn: () => apiRequest<CalendarBlocksResponse>(apiPaths.calendarBlocks),
  });
}

function useInvalidateCalendar() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ["calendar-view"] });
    await queryClient.invalidateQueries({ queryKey: queryKeys.calendarBlocks });
  };
}

/** PUT /calendar-blocks — mark (or re-mark) a day. */
export function useUpsertCalendarBlock() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (input: UpsertCalendarBlockInput) =>
      apiRequest<CalendarBlockMutationResponse>(apiPaths.calendarBlocks, {
        method: "PUT",
        body: input,
      }),
    onSuccess: invalidate,
  });
}

/** DELETE /calendar-blocks/:date — unmark a day. */
export function useDeleteCalendarBlock() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (date: string) =>
      apiRequest<CalendarBlockMutationResponse>(apiPaths.calendarBlock(date), { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

/** POST /calendar-blocks/import-eco — HIGH-impact days ahead → NEWS blocks. */
export function useImportEcoBlockers() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: () =>
      apiRequest<ImportEcoBlockersResponse>(apiPaths.calendarBlocksImportEco, { method: "POST" }),
    onSuccess: invalidate,
  });
}
