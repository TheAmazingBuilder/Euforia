/**
 * Application wiring shared by BOTH production bootstrap (main.ts) and the
 * e2e test harness — one single source of truth for how the HTTP server is
 * configured (Phase 1 mandate §34: no divergence between tested and shipped).
 */
import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyPluginCallback } from "fastify";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import pinoHttp from "pino-http";
import { REQUEST_ID_HEADER, resolveRequestId } from "./shared/http/request-id";
import type { AppConfig } from "./config/app-config";
import { getOrCreateRootLogger } from "./infrastructure/logging/logger.factory";
import { buildPinoHttpOptions } from "./infrastructure/logging/logging.module";

/**
 * Create the Fastify adapter. Server-level transport options (body size,
 * proxy trust) must be known BEFORE the app is created, so they live here.
 */
export function createAdapter(config: AppConfig): FastifyAdapter {
  return new FastifyAdapter({
    bodyLimit: config.bodyLimitBytes,
    trustProxy: config.trustProxy,
    // Nest lifecycle logs are routed to pino via useLogger(NestPinoLogger);
    // Fastify's own stdout logger stays off.
    logger: false,
    // Fastify owns request-id generation (it stamps req.id before any hook);
    // pino-http and the onSend echo hook reuse that same id.
    genReqId: (request: { headers: Record<string, string | string[] | undefined> }) =>
      resolveRequestId(request.headers[REQUEST_ID_HEADER]),
  });
}

/**
 * Configure the application: request logging + correlation, security
 * headers, CORS, API prefix/versioning and shutdown hooks.
 *
 * Error funneling note: unknown routes and transport-level errors (bad JSON,
 * oversized body) are routed by Nest's own fastify handlers through the
 * global exception filter chain — no custom fastify error handler here.
 *
 * Conventions (Phase 0 §P.2 + Phase 1 §21):
 *   - Infrastructure endpoints (health) live at the root, unversioned.
 *   - Domain routes are versioned by URI: /api/v1/...
 */
export async function configureApp(app: NestFastifyApplication, config: AppConfig): Promise<void> {
  const adapter = app.getHttpAdapter() as FastifyAdapter;
  const instance = adapter.getInstance();

  // ── Request logging + correlation id (pino-http) ──────────────────────────
  // pino-http is runtime-compatible with Fastify (documented integration) but
  // its factory typing is middleware-shaped, hence the plugin cast.
  await instance.register(
    pinoHttp as unknown as FastifyPluginCallback,
    buildPinoHttpOptions(getOrCreateRootLogger(config)),
  );

  // Echo the correlation id on every response (client → API → logs → client).
  instance.addHook("onSend", (request, reply, payload, done) => {
    reply.header("x-request-id", String(request.id));
    done(null, payload);
  });

  // ── Security headers (helmet defaults) ────────────────────────────────────
  // Defaults include CSP, HSTS, no-sniff, frameguard, referrer-policy and
  // hide-powered-by. A JSON API needs no exceptions today; relax explicitly
  // (and document) only if a browser-served surface is ever added here.
  await instance.register(helmet);

  // ── Cookies (refresh-token cookie jar: HttpOnly cosmoz_rt) ────────────────
  await instance.register(cookie);

  // ── CORS (origin allowlist from validated config) ─────────────────────────
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 600,
  });

  // ── API prefix + versioning ───────────────────────────────────────────────
  // Domain routes: /api/v1/… (frontend: NEXT_PUBLIC_API_URL=http://host:port/api/v1)
  // Infrastructure: /health, /health/live, /health/ready (no prefix, no version).
  app.setGlobalPrefix("api", {
    exclude: ["health", "health/(.*)"],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  // SIGTERM/SIGINT → close HTTP server → PrismaModule.onModuleDestroy.
  app.enableShutdownHooks();
}
