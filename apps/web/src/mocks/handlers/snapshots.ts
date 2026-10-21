import { http, HttpResponse } from "msw";
import {
  analyticsFiltersSchema,
  createPerformanceSnapshotInputSchema,
  performanceSnapshotSchema,
  SNAPSHOT_SCHEMA_VERSION,
  type PerformanceSnapshot,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { mockStore, MockError } from "@/mocks/store";
import { endpoint, latency, parseBody, pathParam, readJson, requireAuth, toErrorResponse } from "./utils";

/**
 * Performance snapshots (Dashboard Customization Phase 08) — MSW mirror of
 * the NestJS module. Capture semantics are HONEST: the mock computes the
 * SAME analytics-suite engine the mock /stats/analytics-suite route serves
 * (mockStore.analyticsSuite) and freezes its summary — no fabricated
 * metrics, same contract parse as the API. Captured values are immutable
 * (PATCH merges name/notes only); names are unique per user
 * (case-insensitive → 409), matching the API's SNAPSHOT_NAME_TAKEN rule.
 */

/** In-memory snapshot documents (session-scoped, like every mock collection). */
const snapshots: PerformanceSnapshot[] = [];

/** Minimal sims (same rationale as the API service: summary band only). */
const CAPTURE_SIMS = 100;

function nowIso(): string {
  return new Date().toISOString();
}

/** Non-period half of the filter bag — the frozen scope (mirrors the API). */
function scopeOfFilters(filters: ReturnType<typeof analyticsFiltersSchema.parse>): PerformanceSnapshot["scope"] {
  const scope: PerformanceSnapshot["scope"] = {};
  if (filters.accountId !== undefined) scope.accountId = filters.accountId;
  if (filters.instrumentId !== undefined) scope.instrumentId = filters.instrumentId;
  if (filters.assetClass !== undefined) scope.assetClass = filters.assetClass;
  if (filters.strategyId !== undefined) scope.strategyId = filters.strategyId;
  if (filters.direction !== undefined) scope.direction = filters.direction;
  if (filters.session !== undefined) scope.session = filters.session;
  if (filters.emotion !== undefined) scope.emotion = filters.emotion;
  if (filters.exitReason !== undefined) scope.exitReason = filters.exitReason;
  if (filters.tagId !== undefined) scope.tagId = filters.tagId;
  return scope;
}

export const snapshotHandlers = [
  // GET /snapshots — newest first
  http.get(endpoint(apiPaths.snapshots), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      return HttpResponse.json({
        snapshots: [...snapshots].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // POST /snapshots — capture the CURRENT mock analytics scope
  http.post(endpoint(apiPaths.snapshots), async ({ request }) => {
    await latency();
    try {
      requireAuth(request);
      const input = parseBody(createPerformanceSnapshotInputSchema, await readJson(request));
      const nameKey = input.name.trim().toLowerCase();
      if (snapshots.some((snapshot) => snapshot.name.toLowerCase() === nameKey)) {
        throw new MockError(409, "A snapshot with this name already exists");
      }
      // Re-parse through the SAME filter schema the API embeds — restores
      // the `.default("ALL")` output semantics (parseBody infers the input
      // type where period is optional) and validates with contract parity.
      const filters = analyticsFiltersSchema.parse(input.filters);
      const suite = mockStore.analyticsSuite(filters, CAPTURE_SIMS);
      const doc = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        notes: input.notes ?? "",
        capturedAt: nowIso(),
        period: filters.period,
        periodFrom: suite.meta.resolvedFrom,
        periodTo: suite.meta.resolvedTo,
        scope: scopeOfFilters(filters),
        descriptor: suite.meta.descriptor,
        currency: suite.meta.singleCurrency ? suite.currency : null,
        singleCurrency: suite.meta.singleCurrency,
        metrics: {
          netPnl: suite.summary.netPnl,
          winRate: suite.summary.winRate,
          profitFactor: suite.summary.profitFactor,
          trades: suite.summary.trades,
          avgR: suite.summary.avgR,
          expectancyR: suite.summary.expectancyR,
          maxDrawdownR: suite.summary.maxDrawdownR,
          maxDrawdownPct: suite.summary.maxDrawdownPct,
        },
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      } satisfies PerformanceSnapshot;
      snapshots.push(performanceSnapshotSchema.parse(doc));
      return HttpResponse.json(doc, { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // GET /snapshots/:snapshotId
  http.get(endpoint(apiPaths.snapshot(":snapshotId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const id = pathParam(params, "snapshotId");
      const snapshot = snapshots.find((row) => row.id === id);
      if (snapshot === undefined) {
        throw new MockError(404, "Snapshot not found");
      }
      return HttpResponse.json(snapshot);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // PATCH /snapshots/:snapshotId — metadata only (name/notes)
  http.patch(endpoint(apiPaths.snapshot(":snapshotId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const id = pathParam(params, "snapshotId");
      const snapshot = snapshots.find((row) => row.id === id);
      if (snapshot === undefined) {
        throw new MockError(404, "Snapshot not found");
      }
      const patch = (await readJson(request)) as Record<string, unknown>;
      if (typeof patch.name === "string" && patch.name.trim() !== "") {
        const nextKey = patch.name.trim().toLowerCase();
        if (snapshots.some((row) => row.id !== id && row.name.toLowerCase() === nextKey)) {
          throw new MockError(409, "A snapshot with this name already exists");
        }
        snapshot.name = patch.name.trim();
      }
      if (typeof patch.notes === "string") {
        snapshot.notes = patch.notes;
      }
      return HttpResponse.json(snapshot);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  // DELETE /snapshots/:snapshotId
  http.delete(endpoint(apiPaths.snapshot(":snapshotId")), async ({ request, params }) => {
    await latency();
    try {
      requireAuth(request);
      const id = pathParam(params, "snapshotId");
      const index = snapshots.findIndex((row) => row.id === id);
      if (index === -1) {
        throw new MockError(404, "Snapshot not found");
      }
      snapshots.splice(index, 1);
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];
