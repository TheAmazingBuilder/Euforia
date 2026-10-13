import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import {
  createCalendarEvent,
  createEventCalendar,
  deleteCalendarEvent,
  deleteEventCalendar,
  eventsBoard,
  updateCalendarEvent,
  updateEventCalendar,
} from "@/mocks/events-engine";
import { endpoint, latency, readJson, toErrorResponse } from "./utils";

/**
 * Events endpoints — the independent personal calendar. The board read
 * carries calendars + events in one shot (the month grid needs both);
 * mutations are Zod-validated inside the engine, calendar deletes cascade
 * to their events (the UI confirms first).
 */
export const eventsHandlers = [
  /** GET /events/board — calendars + events (relative to now). */
  http.get(endpoint(apiPaths.eventsBoard), async () => {
    await latency();
    try {
      return HttpResponse.json(eventsBoard());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /events/calendars — the "New Calendar" modal. */
  http.post(endpoint(apiPaths.eventsCalendars), async ({ request }) => {
    await latency();
    try {
      return HttpResponse.json(createEventCalendar(await readJson(request)));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /events/calendars/update — rename/recolor/move between groups. */
  http.post(endpoint(apiPaths.eventsCalendarUpdate), async ({ request }) => {
    await latency();
    try {
      return HttpResponse.json(updateEventCalendar(await readJson(request)));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /events/calendars/delete — cascade to the calendar's events. */
  http.post(endpoint(apiPaths.eventsCalendarDelete), async ({ request }) => {
    await latency();
    try {
      return HttpResponse.json(deleteEventCalendar(await readJson(request)));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /events/events — quick-create from a day cell or the toolbar. */
  http.post(endpoint(apiPaths.eventsEventCreate), async ({ request }) => {
    await latency();
    try {
      return HttpResponse.json(createCalendarEvent(await readJson(request)));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /events/events/update — edit (reschedule, recolor, move). */
  http.post(endpoint(apiPaths.eventsEventUpdate), async ({ request }) => {
    await latency();
    try {
      return HttpResponse.json(updateCalendarEvent(await readJson(request)));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /events/events/delete — remove an event. */
  http.post(endpoint(apiPaths.eventsEventDelete), async ({ request }) => {
    await latency();
    try {
      return HttpResponse.json(deleteCalendarEvent(await readJson(request)));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
