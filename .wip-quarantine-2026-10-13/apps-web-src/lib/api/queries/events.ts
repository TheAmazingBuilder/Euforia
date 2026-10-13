import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CalendarEvent,
  CalendarEventCreateInput,
  CalendarEventDeleteInput,
  CalendarEventUpdateInput,
  EventCalendar,
  EventCalendarCreateInput,
  EventCalendarDeleteInput,
  EventCalendarUpdateInput,
  EventsBoardResponse,
} from "@cosmoz/shared";

import { apiErrorMessage, apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/**
 * Events hooks — the independent calendar's data layer. One board query
 * (calendars + events fly together); every mutation refreshes it so the
 * sidebar groups and the month grid never disagree.
 */

export function useEventsBoard() {
  return useQuery({
    queryKey: queryKeys.eventsBoard,
    queryFn: () => apiRequest<EventsBoardResponse>(apiPaths.eventsBoard),
  });
}

export function useCreateEventCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EventCalendarCreateInput) =>
      apiRequest<EventCalendar>(apiPaths.eventsCalendars, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventsBoard });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not create the calendar")),
  });
}

export function useUpdateEventCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EventCalendarUpdateInput) =>
      apiRequest<EventCalendar>(apiPaths.eventsCalendarUpdate, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventsBoard });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not update the calendar")),
  });
}

export function useDeleteEventCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EventCalendarDeleteInput) =>
      apiRequest<{ ok: boolean; removedEvents: number }>(apiPaths.eventsCalendarDelete, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventsBoard });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not delete the calendar")),
  });
}

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarEventCreateInput) =>
      apiRequest<CalendarEvent>(apiPaths.eventsEventCreate, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventsBoard });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not create the event")),
  });
}

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarEventUpdateInput) =>
      apiRequest<CalendarEvent>(apiPaths.eventsEventUpdate, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventsBoard });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not update the event")),
  });
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarEventDeleteInput) =>
      apiRequest<{ ok: boolean }>(apiPaths.eventsEventDelete, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventsBoard });
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not delete the event")),
  });
}
