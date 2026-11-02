import { Injectable } from "@nestjs/common";
import { RedisService } from "./redis.service";

const CACHE_KEY_PREFIX = "euforia:cache:v1:";
const MAX_CACHE_KEY_LENGTH = 512;

/**
 * JSON cache facade shared by bounded contexts.
 *
 * Callers must include tenant/user/account scope in keys for user-owned data.
 * Values are disposable copies; PostgreSQL and provider sources stay
 * authoritative. Every write requires an explicit positive TTL.
 */
@Injectable()
export class CacheService {
  constructor(private readonly redis: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    const redisKey = this.toRedisKey(key);
    const serialized = await this.redis.get(redisKey);
    if (serialized === null) return null;

    try {
      return JSON.parse(serialized) as T;
    } catch {
      // Corrupt/stale entries must not poison every subsequent read.
      await this.redis.delete(redisKey);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
      throw new RangeError("Cache TTL must be a positive integer number of seconds");
    }

    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(value);
    } catch {
      return false;
    }
    if (serialized === undefined) return false;

    return this.redis.set(this.toRedisKey(key), serialized, ttlSeconds);
  }

  async delete(key: string): Promise<boolean> {
    return this.redis.delete(this.toRedisKey(key));
  }

  private toRedisKey(key: string): string {
    const normalized = key.trim();
    if (!normalized) throw new Error("Cache key must not be empty");
    if (normalized.length > MAX_CACHE_KEY_LENGTH) {
      throw new RangeError(`Cache key must not exceed ${MAX_CACHE_KEY_LENGTH} characters`);
    }
    return `${CACHE_KEY_PREFIX}${normalized}`;
  }
}
