/**
 * Rate limiting foundation (Phase 1 mandate §19).
 *
 * Establishes the MECHANISM, not final per-endpoint policies: a global
 * default guard backed by in-memory counters, with named throttler entries
 * so future phases can attach differentiated policies without changing the
 * architecture:
 *
 *   future policy          →  how it will be attached
 *   ─────────────────────────────────────────────────────────────────
 *   public endpoints       →  route decorator @Throttle({ public: … })
 *   authentication vectors →  @Throttle({ auth: … }) (Identity phase -
 *                             e.g. login 10/15min, MFA 5/15min per mock spec)
 *   sensitive operations   →  @Throttle({ sensitive: … })
 *   provider sync          →  dedicated named entry + queue, not brute IP
 *   general authenticated  →  the `default` entry configured here
 *   WebSocket connections  →  gateway-level limiter (socket.io adapter phase)
 *
 * Tracking key: request IP (honors TRUST_PROXY when behind a reverse proxy).
 * The default in-memory storage is correct for the single-instance modular
 * monolith; swap to a shared store only when horizontal scaling arrives.
 */
import { Module, type Provider } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_CONFIG, type AppConfig } from "../../config/app-config";

/** Named throttler entries. Only `default` is active in Foundation. */
export const THROTTLER_NAMES = ["default"] as const;

const throttlerGuardProvider: Provider = {
  provide: APP_GUARD,
  useClass: ThrottlerGuard,
};

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          {
            name: "default",
            ttl: config.rateLimit.windowSeconds * 1_000,
            limit: config.rateLimit.max,
          },
        ],
      }),
    }),
  ],
  providers: [throttlerGuardProvider],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
