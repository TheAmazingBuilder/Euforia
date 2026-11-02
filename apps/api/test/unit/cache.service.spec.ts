import { beforeEach, describe, expect, it, vi } from "vitest";
import { CacheService } from "../../src/infrastructure/redis/cache.service";
import { RedisService } from "../../src/infrastructure/redis/redis.service";

describe("CacheService", () => {
  const get = vi.fn<(key: string) => Promise<string | null>>();
  const set = vi.fn<(key: string, value: string, ttlSeconds: number) => Promise<boolean>>();
  const deleteKey = vi.fn<(key: string) => Promise<boolean>>();
  const redis = { get, set, delete: deleteKey } as unknown as RedisService;
  let cache: CacheService;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new CacheService(redis);
    get.mockResolvedValue(null);
    set.mockResolvedValue(true);
    deleteKey.mockResolvedValue(true);
  });

  it("uses a versioned Euforia namespace and parses JSON values", async () => {
    get.mockResolvedValueOnce(JSON.stringify({ total: 12 }));

    await expect(cache.get<{ total: number }>("user:42:dashboard")).resolves.toEqual({ total: 12 });
    expect(get).toHaveBeenCalledWith("euforia:cache:v1:user:42:dashboard");
  });

  it("invalidates malformed JSON instead of returning a poisoned entry", async () => {
    get.mockResolvedValueOnce("{not-json");

    await expect(cache.get("user:42:dashboard")).resolves.toBeNull();
    expect(deleteKey).toHaveBeenCalledWith("euforia:cache:v1:user:42:dashboard");
  });

  it("sets JSON with an explicit TTL", async () => {
    await expect(cache.set("user:42:summary", { pnl: "125.50" }, 30)).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith(
      "euforia:cache:v1:user:42:summary",
      JSON.stringify({ pnl: "125.50" }),
      30,
    );
  });

  it("rejects missing or invalid TTLs", async () => {
    await expect(cache.set("user:42:summary", {}, 0)).rejects.toThrow(/positive integer/);
    await expect(cache.set("user:42:summary", {}, 1.5)).rejects.toThrow(/positive integer/);
  });

  it("rejects blank or excessively long keys", async () => {
    await expect(cache.get("   ")).rejects.toThrow(/must not be empty/);
    await expect(cache.get("x".repeat(513))).rejects.toThrow(/512 characters/);
  });

  it("passes cache misses through when Redis is unavailable", async () => {
    get.mockResolvedValueOnce(null);
    set.mockResolvedValueOnce(false);

    await expect(cache.get("user:42:summary")).resolves.toBeNull();
    await expect(cache.set("user:42:summary", { pnl: "1" }, 10)).resolves.toBe(false);
  });
});
