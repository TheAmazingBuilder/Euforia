/**
 * OCR rate limiting (Phase 19 §37) — reuses the identity per-vector
 * sliding-window limiter with OCR-specific vectors, keyed by the
 * authenticated userId (same class + window discipline as Accounts, §37:
 * "do not create a separate rate limiter").
 *
 * Vectors (resource-heavy operations only — §38):
 *   upload    10 / 15 min — image ingestion + recognition (CPU-heavy)
 *   confirm   30 / 15 min — cheap state flip, generous for review UX
 *
 * In-memory storage is correct for the single-instance monolith (same
 * tradeoff as the identity/accounts limiters); the global IP-level
 * ThrottlerGuard still applies underneath (defense in depth).
 */
import { Injectable } from "@nestjs/common";
import { AuthRateLimiterService } from "../identity/auth-rate-limiter.service";

export const OCR_RATE_LIMITS: Record<string, number> = {
  upload: 10,
  confirm: 30,
  recrop: 30, // targeted re-OCR — same cost class as a confirmation (one engine call)
};

@Injectable()
export class OcrRateLimiterService extends AuthRateLimiterService {
  constructor() {
    super(OCR_RATE_LIMITS);
  }
}
