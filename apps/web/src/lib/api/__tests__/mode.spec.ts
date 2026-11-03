/**
 * Unit - the canonical API-mode constant and the URL base (lib/api/mode.ts,
 * lib/api/urls.ts).
 *
 * HISTORY: the MSW mock/demo layer was removed from the app (task 01); the
 * web now always talks to the real NestJS backend. These specs pin that
 * guarantee: mocking can never be re-activated by accident, and the default
 * base is the versioned same-origin prefix.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("API mode (mock layer removed)", () => {
  it("API_MOCKED is a compile-time false - no env can activate mocking", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_MOCKED", "true");
    const mod = await import("@/lib/api/mode");
    expect(mod.API_MOCKED).toBe(false);
  });

  it("the default base is the versioned same-origin prefix", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const urls = await import("@/lib/api/urls");
    expect(urls.API_BASE).toBe("/api/v1");
  });

  it("NEXT_PUBLIC_API_URL overrides the base when set", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1");
    const urls = await import("@/lib/api/urls");
    expect(urls.API_BASE).toBe("http://localhost:4000/api/v1");
  });
});
