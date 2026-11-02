import { describe, expect, it } from "vitest";
import type { AppConfig } from "../../src/config/app-config";
import { RedisService } from "../../src/infrastructure/redis/redis.service";

describe("RedisService", () => {
  it("disables Redis cleanly when REDIS_URL is not configured", async () => {
    const config = { redis: { url: undefined } } as AppConfig;
    const redis = new RedisService(config);

    expect(redis.status).toBe("disabled");
    await expect(redis.get("test:key")).resolves.toBeNull();
    await expect(redis.set("test:key", "value", 10)).resolves.toBe(false);
    await expect(redis.delete("test:key")).resolves.toBe(false);
    redis.onModuleInit();
    redis.onModuleDestroy();
  });
});
