import { Global, Module } from "@nestjs/common";
import { CacheService } from "./cache.service";
import { RedisService } from "./redis.service";

/** Shared Redis connection and fail-open cache facade for the modular monolith. */
@Global()
@Module({
  providers: [RedisService, CacheService],
  exports: [RedisService, CacheService],
})
export class RedisModule {}
