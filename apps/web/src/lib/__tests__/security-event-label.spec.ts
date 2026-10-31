import { describe, expect, it } from "vitest";
import { securityEventTypeSchema } from "@cosmoz/shared";

import { EVENT_TYPE_META, getSecurityEventLabel } from "../security/event-label";

const metadata = {
  LOGIN_SUCCESS: { label: "Sign-in" },
  TFA_ENABLED: { label: "Two-factor enabled" },
};

describe("getSecurityEventLabel", () => {
  it("has a non-empty UI label for every event type accepted by the API", () => {
    const eventTypes = securityEventTypeSchema.options;

    expect(Object.keys(EVENT_TYPE_META)).toHaveLength(eventTypes.length);
    for (const type of eventTypes) {
      expect(EVENT_TYPE_META[type]?.label, type).toBeTruthy();
    }
  });

  it("returns the registered label for a known event type", () => {
    expect(getSecurityEventLabel("LOGIN_SUCCESS", metadata)).toBe("Sign-in");
  });

  it("formats an unknown event type instead of failing", () => {
    expect(getSecurityEventLabel("TOKEN_ROTATED", metadata)).toBe(
      "Token Rotated",
    );
  });

  it.each([undefined, null, "   "])(
    "returns a stable fallback when the event type is missing (%s)",
    (type) => {
      expect(getSecurityEventLabel(type, metadata)).toBe("Unknown Event");
    },
  );
});
