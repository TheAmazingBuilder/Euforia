/**
 * API telemetry (Phase 17 — §12/§40/§42): a BOUNDED in-memory observation
 * ring of completed HTTP requests, registered as a single Fastify
 * onResponse hook for the whole application (production bootstrap AND the
 * e2e harness share it via app.setup.ts).
 *
 * Why in-memory and NOT PostgreSQL: the Monitoring mandate forbids turning
 * the database into a metrics warehouse (§40). A capped ring (500 calls ≈
 * the last minutes of traffic) is enough to compute the contract's
 * aggregations (per-endpoint p50/p95, status-code histogram, 30-minute
 * buckets) with negligible overhead — the hook does one array push.
 *
 * Privacy/scoping (§34): the auth guard stamps the authenticated principal
 * on the request BEFORE the handler runs; the hook only reads that stamp
 * (`CURRENT_USER`) — it never decodes tokens itself. Public requests are
 * recorded with userId null and are excluded from user-scoped monitoring.
 *
 * Secrets: route TEMPLATE (no query string), status code and duration are
 * recorded — never headers, bodies or query strings (§17).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CURRENT_USER, type AuthPrincipal } from "../../shared/auth/current-user.decorator";

export interface ApiCallRecord {
  /** "GET /api/v1/trades" style — the ROUTE TEMPLATE, never the raw URL. */
  routeKey: string;
  statusCode: number;
  durationMs: number;
  at: Date;
  /** Authenticated principal stamped by JwtAuthGuard; null on public routes. */
  userId: string | null;
}

const MAX_CALLS = 500;

class ApiTelemetryRecorder {
  /** Process boot — the observation window start ("session start"). */
  readonly bootAt = new Date();
  private calls: ApiCallRecord[] = [];

  record(entry: ApiCallRecord): void {
    this.calls.push(entry);
    if (this.calls.length > MAX_CALLS) {
      this.calls.splice(0, this.calls.length - MAX_CALLS);
    }
  }

  snapshot(): { bootAt: Date; calls: readonly ApiCallRecord[] } {
    return { bootAt: this.bootAt, calls: this.calls };
  }

  /** Test seam — fresh window without a process restart. */
  reset(): void {
    this.calls = [];
  }
}

/** Process-wide singleton — one HTTP server, one observation ring. */
export const apiTelemetry = new ApiTelemetryRecorder();

function rawPath(url: string | undefined): string {
  if (!url) return "unmatched";
  const questionMark = url.indexOf("?");
  return questionMark === -1 ? url : url.slice(0, questionMark);
}

/**
 * Register the onResponse telemetry hook on the Fastify instance. Route
 * templates come from the router (bounded cardinality); unmatched routes
 * (404 probes) fall back to the raw path — the ring's own cap bounds any
 * cardinality a hostile client could create.
 */
export function registerApiTelemetryHook(instance: FastifyInstance): void {
  instance.addHook("onResponse", async (request: FastifyRequest & { [CURRENT_USER]?: AuthPrincipal }, reply: FastifyReply) => {
    const template = request.routeOptions?.url;
    apiTelemetry.record({
      routeKey: `${request.method} ${template ?? rawPath(request.raw.url)}`,
      statusCode: reply.statusCode,
      durationMs: Math.max(0, Math.round(reply.elapsedTime)),
      at: new Date(),
      userId: request[CURRENT_USER]?.userId ?? null,
    });
  });
}
