import { http, HttpResponse } from "msw";
import { createTagInputSchema } from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore } from "@/mocks/store";
import { endpoint, latency, parseBody, readJson, toErrorResponse } from "./utils";

/** Catalog domains - instruments (with ?q= search), strategies, accounts. */
export const catalogHandlers = [
  // GET /instruments?q= - search-first autocomplete (symbol or name)
  http.get(endpoint(apiPaths.instruments), async ({ request }) => {
    await latency();
    try {
      const url = new URL(request.url);
      const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
      const all = mockStore.listInstruments();
      const instruments = q === ""
        ? all
        : all.filter(
            (i) => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q),
          );
      return HttpResponse.json({ instruments: instruments.slice(0, 20) });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /strategies - playbook templates / "Trade this setup" prefill
  http.get(endpoint(apiPaths.strategies), async () => {
    await latency();
    try {
      return HttpResponse.json({ strategies: mockStore.listStrategies() });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /accounts - account switcher
  http.get(endpoint(apiPaths.accounts), async () => {
    await latency();
    try {
      return HttpResponse.json({ accounts: mockStore.listAccounts() });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /tags - tag catalog for the capture form ("Add details" chips)
  http.get(endpoint(apiPaths.tags), async () => {
    await latency();
    try {
      return HttpResponse.json(mockStore.listTags());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /tags - inline tag creation (reflect screen)
  http.post(endpoint(apiPaths.tags), async ({ request }) => {
    await latency();
    try {
      const input = parseBody(createTagInputSchema, await readJson(request));
      return HttpResponse.json(mockStore.createTag(input), { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
