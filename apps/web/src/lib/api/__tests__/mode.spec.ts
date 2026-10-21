/**
 * Unit — the canonical API-mode matrix (lib/api/mode.ts).
 *
 * MASTER QA spec §14.9/§14.10: production builds cannot ACCIDENTALLY
 * activate the demo providers, and an automated check guards that rule.
 * This spec pins the resolution matrix:
 *   explicit "true"  → mocked everywhere (deliberate demo deployment)
 *   explicit "false" → real API everywhere
 *   unset + dev      → mocked (zero-env DX / canonical preview)
 *   unset + prod     → REAL API (the accidental-mock-activation guard)
 */
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadMode(
  mocked: string | undefined,
  nodeEnv: string,
): Promise<boolean> {
  vi.resetModules();
  if (mocked === undefined) {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKED", "");
  } else {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKED", mocked);
  }
  vi.stubEnv("NODE_ENV", nodeEnv);
  const mod = await import("@/lib/api/mode");
  return mod.API_MOCKED;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("API_MOCKED resolution matrix", () => {
  it.each([
    ["true", "production"],
    ["true", "development"],
  ])("explicit NEXT_PUBLIC_API_MOCKED=%s → mocked even in %s (deliberate opt-in)", async (mocked, nodeEnv) => {
    expect(await loadMode(mocked, nodeEnv)).toBe(true);
  });

  it.each([
    ["false", "production"],
    ["false", "development"],
  ])("explicit NEXT_PUBLIC_API_MOCKED=%s → real API even in %s", async (mocked, nodeEnv) => {
    expect(await loadMode(mocked, nodeEnv)).toBe(false);
  });

  it("zero-env development stays mocked (canonical preview / DX)", async () => {
    expect(await loadMode(undefined, "development")).toBe(true);
  });

  it("zero-env PRODUCTION defaults to the REAL API — the accidental-mock-activation guard", async () => {
    expect(await loadMode(undefined, "production")).toBe(false);
  });

  it("the real-API production default yields the versioned same-origin base", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_MOCKED", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const urls = await import("@/lib/api/urls");
    expect(urls.API_BASE).toBe("/api/v1");
  });

  it("the mocked mode yields the MSW-intercepted base", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_MOCKED", "true");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const urls = await import("@/lib/api/urls");
    expect(urls.API_BASE).toBe("/api");
  });
});
