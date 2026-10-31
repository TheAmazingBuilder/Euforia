import { describe, expect, it, vi } from "vitest";

import type { RootLogger } from "../../src/infrastructure/logging/logger.factory";
import {
  SecurityEventService,
  type RequestFingerprint,
} from "../../src/modules/security/security-event.service";
import type { SecurityEventRepository } from "../../src/modules/security/security-event.repository";

const FINGERPRINT: RequestFingerprint = {
  device: "Desktop",
  browser: "Chrome",
  os: "Windows",
  ipMasked: "192.0.2.xxx",
  location: "Canada",
  userAgent: "Chrome test agent",
};

describe("SecurityEventService best-effort audit writes", () => {
  it("does not reject a completed business operation when the event insert fails", async () => {
    const repository = {
      appendSecurityEvent: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };
    const logger = { warn: vi.fn() };
    const service = new SecurityEventService(
      repository as unknown as SecurityEventRepository,
      logger as unknown as RootLogger,
    );

    await expect(
      service.record({
        userId: "user-1",
        type: "API_KEY_CREATED",
        actor: "trader@example.com",
        context: "API key created.",
      }),
    ).resolves.toBeUndefined();

    expect(repository.appendSecurityEvent).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      {
        userId: "user-1",
        eventType: "API_KEY_CREATED",
        errorType: "Error",
      },
      "Security event write failed; continuing without blocking the operation.",
    );
  });

  it("still records login history if the paired security-event insert fails", async () => {
    const repository = {
      appendSecurityEvent: vi.fn().mockRejectedValue(new Error("database unavailable")),
      appendLoginRecord: vi.fn().mockResolvedValue(undefined),
    };
    const logger = { warn: vi.fn() };
    const service = new SecurityEventService(
      repository as unknown as SecurityEventRepository,
      logger as unknown as RootLogger,
    );

    await expect(
      service.recordLogin(
        {
          userId: "user-1",
          type: "LOGIN_FAILED",
          context: "Sign-in failed.",
          outcome: "FAILURE",
          reason: "Invalid credentials",
        },
        FINGERPRINT,
      ),
    ).resolves.toBeUndefined();

    expect(repository.appendLoginRecord).toHaveBeenCalledOnce();
    expect(repository.appendLoginRecord).toHaveBeenCalledWith({
      userId: "user-1",
      success: false,
      device: FINGERPRINT.device,
      browser: FINGERPRINT.browser,
      os: FINGERPRINT.os,
      ipMasked: FINGERPRINT.ipMasked,
      location: FINGERPRINT.location,
      reason: "Invalid credentials",
    });
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
