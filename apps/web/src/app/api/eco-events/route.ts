import { NextResponse } from "next/server";

import type { EcoEventsResponse } from "@cosmoz/shared";

import { fetchRealEcoWeek } from "@/lib/eco/forexfactory";
import { buildEcoEvents } from "@/mocks/fixtures/eco-events";

/**
 * GET /api/eco-events - the REAL economic provider bridge behind the
 * EXISTING route (the workspace, the calendar pages and every consumer
 * keep the exact same query and wire shape; only provenance changes and
 * is honestly labeled by `source`).
 *
 * Composition (this route is the ONLY place that mixes sources):
 *   1. the real ForexFactory weekly feed (server-side - the public JSON
 *      has no CORS headers, so this fetch never runs in the browser);
 *   2. the deterministic sample fixtures FILL the horizon OUTSIDE the real
 *      week ([-92..+13] days window) - the wide window Analytics and the
 *      calendar pages rely on stays intact, and no day is ever double-
 *      represented (fixture rows inside the real week are dropped);
 *   3. when the real provider is unreachable (offline sandbox, timeout,
 *      shape drift) the response is the exact pre-bridge sample surface -
 *      source: "sample" - the product never breaks behind the provider.
 *
 * Server-only state: the bridge owns its 30 min TTL + single-flight
 * cache; this handler stays force-dynamic (fresh composition per call).
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<EcoEventsResponse>> {
  const fixtures = buildEcoEvents(Date.now());

  const real = await fetchRealEcoWeek();
  if (real === null) {
    return NextResponse.json({ events: fixtures, source: "sample" });
  }

  // Drop fixture rows inside the real window - the real feed owns those
  // days (no double representation of a release).
  const outside = fixtures.filter((event) => {
    const at = new Date(event.scheduledAt).getTime();
    return at < real.windowStartMs || at > real.windowEndMs;
  });

  const events = [...outside, ...real.events].sort((a, b) =>
    a.scheduledAt.localeCompare(b.scheduledAt),
  );

  return NextResponse.json({
    events,
    source: outside.length === 0 ? "forexfactory" : "forexfactory+sample",
  });
}
