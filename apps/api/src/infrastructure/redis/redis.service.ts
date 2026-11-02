import {
  Inject,
  Injectable,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { createClient } from "@redis/client";
import { APP_CONFIG, type AppConfig } from "../../config/app-config";
import { ROOT_LOGGER, type RootLogger } from "../logging/logger.factory";

export type RedisStatus = "disabled" | "connecting" | "up" | "down";

/**
 * Process-wide Redis connection.
 *
 * Redis is an optional acceleration layer, never a source of truth. The
 * connection starts in the background so an unavailable cache cannot prevent
 * the NestJS API or PostgreSQL-backed workflows from starting.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: ReturnType<typeof createClient> | null;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Optional() @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
  ) {
    if (!config.redis.url) {
      this.client = null;
      return;
    }

    this.client = createClient({
      url: config.redis.url,
      socket: {
        connectTimeout: 3_000,
        reconnectStrategy: (retries) => Math.min(250 * 2 ** Math.min(retries, 4), 5_000),
      },
    });

    // node-redis requires an error listener; never log the URL or credentials.
    this.client.on("error", (error: Error) => {
      this.logger?.warn(
        { errorName: error.name },
        "Redis client error; cache operations will be bypassed while unavailable",
      );
    });
    this.client.on("ready", () => {
      this.logger?.info("Redis cache connection ready");
    });
  }

  onModuleInit(): void {
    if (!this.client) return;

    // Deliberately do not await: Redis failure must not block API bootstrap.
    void this.client.connect().catch((error: unknown) => {
      this.logger?.warn(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Redis initial connection failed; API continues without cache",
      );
    });
  }

  onModuleDestroy(): void {
    if (this.client?.isOpen) {
      this.client.destroy();
    }
  }

  get status(): RedisStatus {
    if (!this.client) return "disabled";
    if (this.client.isReady) return "up";
    return this.client.isOpen ? "connecting" : "down";
  }

  async get(key: string): Promise<string | null> {
    if (!this.client?.isReady) return null;

    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client?.isReady || !Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
      return false;
    }

    try {
      await this.client.set(key, value, { EX: ttlSeconds });
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.client?.isReady) return false;

    try {
      await this.client.del(key);
      return true;
    } catch {
      return false;
    }
  }
}
