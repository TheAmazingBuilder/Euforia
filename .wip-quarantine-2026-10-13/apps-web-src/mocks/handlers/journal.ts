import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, toErrorResponse } from "./utils";

/** Journal domain — the searchable written log (notes, lessons, observations). */
export const journalHandlers = [
  // GET /journal?q=&tag=&linked=&mood=&sort= — filtered + sorted list
  http.get(endpoint(apiPaths.journal), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      const q = url.searchParams.get("q") ?? undefined;
      const tag = url.searchParams.get("tag") ?? undefined;
      const linked = url.searchParams.get("linked") ?? undefined;
      const mood = url.searchParams.get("mood") ?? undefined;
      const sortParam = url.searchParams.get("sort");
      const sort =
        sortParam === "oldest" || sortParam === "title" || sortParam === "newest"
          ? sortParam
          : undefined;
      return HttpResponse.json(
        mockStore.listJournalEntries({ q, tag, linked, mood, sort }),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /journal — write a new entry
  http.post(endpoint(apiPaths.journal), async ({ request }) => {
    await latency();
    try {
      const input = (await request.json()) as Parameters<
        typeof mockStore.createJournalEntry
      >[0];
      return HttpResponse.json(mockStore.createJournalEntry(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /journal/:id — revise an entry
  http.patch(endpoint(apiPaths.journalEntry(":id")), async ({ params, request }) => {
    await latency();
    try {
      const input = (await request.json()) as Parameters<
        typeof mockStore.updateJournalEntry
      >[1];
      return HttpResponse.json(
        mockStore.updateJournalEntry(String(params.id), input),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /journal/:id — tear the page out
  http.delete(endpoint(apiPaths.journalEntry(":id")), async ({ params }) => {
    await latency();
    try {
      return HttpResponse.json(
        mockStore.deleteJournalEntry(String(params.id)),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
