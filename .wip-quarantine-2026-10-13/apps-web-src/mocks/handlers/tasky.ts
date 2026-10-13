import { http, HttpResponse } from "msw";

import { apiPaths } from "@/lib/api/endpoints";
import {
  createTaskyTask,
  deleteTaskyTask,
  moveTaskyTask,
  taskyBoard,
  updateTaskyTask,
} from "@/mocks/tasky-engine";
import { endpoint, latency, readJson, toErrorResponse } from "./utils";

/**
 * Tasky endpoints — the independent kanban board. Reads are public-shaped
 * (same posture as Academy); every mutation is Zod-validated inside the
 * engine and renumbers card orders so the client renders stable columns.
 */
export const taskyHandlers = [
  /** GET /tasky/board — columns + cards. */
  http.get(endpoint(apiPaths.taskyBoard), async () => {
    await latency();
    try {
      return HttpResponse.json(taskyBoard());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /tasky/tasks — create a card in a column. */
  http.post(endpoint(apiPaths.taskyTasks), async ({ request }) => {
    await latency();
    try {
      return HttpResponse.json(createTaskyTask(await readJson(request)));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /tasky/tasks/move — drag & drop persistence. */
  http.post(endpoint(apiPaths.taskyTaskMove), async ({ request }) => {
    await latency();
    try {
      return HttpResponse.json(moveTaskyTask(await readJson(request)));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /tasky/tasks/update — inline edits (title/tag/priority/due/assignee). */
  http.post(endpoint(apiPaths.taskyTaskUpdate), async ({ request }) => {
    await latency();
    try {
      return HttpResponse.json(updateTaskyTask(await readJson(request)));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /tasky/tasks/delete — remove a card permanently. */
  http.post(endpoint(apiPaths.taskyTaskDelete), async ({ request }) => {
    await latency();
    try {
      return HttpResponse.json(deleteTaskyTask(await readJson(request)));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
