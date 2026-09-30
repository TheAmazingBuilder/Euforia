import { http, HttpResponse } from "msw";
import { createSessionNoteInputSchema } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, toErrorResponse } from "./utils";

/**
 * Session Live domain (trade-entry-ux.md §9) — today's event timeline +
 * mood strip, assembled server-side for the server's trading date, plus
 * the session logbook (timestamped in-session notes).
 */
export const sessionHandlers = [
  http.get(endpoint(apiPaths.sessionTimeline), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.sessionTimeline());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // ── Session logbook ──────────────────────────────────────────────────────
  http.get(endpoint(apiPaths.sessionNotes), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listSessionNotes());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.post(endpoint(apiPaths.sessionNotes), async ({ request }) => {
    await latency();
    try {
      const body = await request.json();
      const input = createSessionNoteInputSchema.parse(body);
      return HttpResponse.json(mockStore.addSessionNote(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  http.delete(endpoint(apiPaths.sessionNote(":noteId")), async ({ params }) => {
    await latency();
    try {
      const noteId = String(params.noteId);
      return HttpResponse.json(mockStore.deleteSessionNote(noteId));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
