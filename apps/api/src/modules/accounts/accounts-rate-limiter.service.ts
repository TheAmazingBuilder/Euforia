/**
 * Accounts rate limiting (Phase 3 §37).
 *
 * Reuses the per-vector sliding-window limiter infrastructure from identity
 * (same class, SAME 15-minute window discipline) with its own vectors, keyed
 * by the authenticated userId:
 *
 *   connect    5 / 15 min     — connection attempts are provider-facing
 *   reconnect  5 / 15 min     — credential rotation
 *   sync      20 / 15 min     — manual synchronization triggers
 *
 * In-memory storage is correct for the single-instance monolith (same
 * tradeoff as the identity limiter). The global IP-level throttler still
 * applies underneath (defense in depth).
 */
import { Injectable } from "@nestjs/common";
import { AuthRateLimiterService } from "../identity/auth-rate-limiter.service";

export const ACCOUNT_RATE_LIMITS: Record<string, number> = {
  connect: 5,
  reconnect: 5,
  sync: 20,
};

@Injectable()
export class AccountsRateLimiterService extends AuthRateLimiterService {
  constructor() {
    super(ACCOUNT_RATE_LIMITS);
  }
}
