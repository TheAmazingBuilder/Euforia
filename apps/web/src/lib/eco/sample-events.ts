/**
 * Deterministic sample economic events - server-side fixture data.
 *
 * This module was previously owned by the MSW demo layer (src/mocks),
 * which has been removed from the app: Euforia now runs exclusively on
 * the real NestJS API + real providers. It is kept here because the
 * /api/eco-events bridge (app/api/eco-events/route.ts) legitimately uses
 * it to FILL the calendar horizon outside the real ForexFactory week, so
 * the wide window the Analytics and calendar pages rely on stays intact.
 */
export { buildEcoEvents } from "./sample-events-data";

