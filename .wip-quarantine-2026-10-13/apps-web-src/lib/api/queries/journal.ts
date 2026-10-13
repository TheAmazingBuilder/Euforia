import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateJournalEntryInput,
  JournalEntry,
  JournalListResponse,
  UpdateJournalEntryInput,
  JournalUpsertInput,
  JournalDayResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";

/** GET /journal — filtered + sorted list (search, tag, linkage, mood, sort). */
export function useJournalEntries(params: {
  q?: string;
  tag?: string;
  linked?: string;
  mood?: string;
  sort?: string;
}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.tag) search.set("tag", params.tag);
  if (params.linked) search.set("linked", params.linked);
  if (params.mood) search.set("mood", params.mood);
  if (params.sort && params.sort !== "newest") search.set("sort", params.sort);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return useQuery({
    queryKey: queryKeys.journal(params),
    queryFn: () => apiRequest<JournalListResponse>(`${apiPaths.journal}${suffix}`),
  });
}

/** POST /journal — write a new entry, invalidate the whole log. */
export function useCreateJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJournalEntryInput) =>
      apiRequest<JournalEntry>(apiPaths.journal, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.journalRoot }),
  });
}

/** PATCH /journal/:id — revise an entry. */
export function useUpdateJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, input }: { entryId: string; input: UpdateJournalEntryInput }) =>
      apiRequest<JournalEntry>(apiPaths.journalEntry(entryId), {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.journalRoot }),
  });
}

/** DELETE /journal/:id — tear the page out. */
export function useDeleteJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      apiRequest<{ id: string; deleted: boolean }>(apiPaths.journalEntry(entryId), {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.journalRoot }),
  });
}

/** PUT /journal/day/:date — create-or-update the daily journal entry. */
export function useUpsertJournal(date: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: JournalUpsertInput) =>
      apiRequest<JournalDayResponse>(apiPaths.journalDay(date), {
        method: "PUT",
        body: input,
      }),
    onSuccess: (day) => {
      queryClient.setQueryData(queryKeys.journalDay(date), day);
      void queryClient.invalidateQueries({ queryKey: queryKeys.journalRoot });
      void queryClient.invalidateQueries({ queryKey: queryKeys.statsOverview });
    },
  });
}
