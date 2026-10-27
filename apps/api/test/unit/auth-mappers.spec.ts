/**
 * Regression unit tests for the identity contract mappers.
 * Guards the TS2322 fix (roles/permissions must satisfy the shared
 * authUserSchema enum unions) and the register() auto-login typing path.
 * Pure functions - no database required.
 */
import { describe, expect, it } from "vitest";
import { authUserSchema } from "../../src/shared/contracts";
import {
  isoDateTime,
  permissionsForRole,
  toAccountStatus,
  toAuthUser,
  type MappedAccountStatus,
} from "../../src/modules/identity/mappers";
import type { UserRow } from "../../src/modules/identity/identity.repository";

const BASE_ROW: UserRow = {
  id: "3f2b7a6e-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
  email: "trader@example.com",
  name: "Test Trader",
  role: "TRADER",
  status: "ACTIVE",
  emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2025-12-01T10:20:30.000Z"),
  passwordHash: "hidden-never-exposed",
  passwordLastChangedAt: new Date("2025-12-01T10:20:30.000Z"),
  mfaSecretEnc: null,
  mfaPendingSecretEnc: null,
  mfaEnabledAt: null,
  mfaDisabledAt: null,
  mfaLastVerifiedAt: null,
  mfaMethod: null,
  timezone: "UTC",
  baseCurrency: "USD",
  username: null,
  bio: null,
  avatarUrl: null,
  preferences: null,
  deletionScheduledFor: null,
};

describe("toAuthUser - shared contract compliance", () => {
  it("produces a payload that validates against authUserSchema", () => {
    const parsed = authUserSchema.safeParse(toAuthUser(BASE_ROW));
    expect(parsed.success).toBe(true);
  });

  it("narrows known statuses to the account status union", () => {
    const statuses: MappedAccountStatus[] = [
      "PENDING_VERIFICATION",
      "ACTIVE",
      "SUSPENDED",
      "DEACTIVATED",
    ];
    for (const status of statuses) {
      expect(toAccountStatus(status)).toBe(status);
    }
  });

  it("falls back to PENDING_VERIFICATION on an unknown persisted status", () => {
    expect(toAccountStatus("???")).toBe("PENDING_VERIFICATION");
  });

  it("maps ADMIN role and falls back unknown roles to TRADER", () => {
    expect(toAuthUser({ ...BASE_ROW, role: "ADMIN" }).roles).toEqual(["ADMIN"]);
    expect(toAuthUser({ ...BASE_ROW, role: "MYSTERY" }).roles).toEqual(["TRADER"]);
  });

  it("emits only contract permission literals", () => {
    for (const p of permissionsForRole("TRADER")) {
      expect(typeof p).toBe("string");
    }
    // The wire payload must parse even with odd persisted values.
    const parsed = authUserSchema.safeParse(
      toAuthUser({ ...BASE_ROW, status: "BOGUS", role: "BOGUS" }),
    );
    expect(parsed.success).toBe(true);
  });

  it("formats timestamps as UTC ISO-8601 without millis", () => {
    expect(isoDateTime(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01T00:00:00Z");
  });

  it("never leaks the password hash into the wire shape", () => {
    const json = JSON.stringify(toAuthUser(BASE_ROW));
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("hidden-never-exposed");
  });
});
