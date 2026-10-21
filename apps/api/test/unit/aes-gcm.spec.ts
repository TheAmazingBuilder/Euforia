/**
 * Unit tests — AES-256-GCM encryption primitive (Phase 3 §22).
 */
import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptWithAesGcm, encryptWithAesGcm } from "../../src/infrastructure/crypto/aes-gcm";

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);

describe("encryptWithAesGcm / decryptWithAesGcm", () => {
  it("roundtrips plaintext", () => {
    const secret = "broker-api-key-abc123";
    const payload = encryptWithAesGcm(KEY, secret);
    expect(payload).toMatch(/^v1\./);
    expect(decryptWithAesGcm(KEY, payload)).toBe(secret);
  });

  it("produces fresh IVs — same plaintext, different ciphertexts", () => {
    const a = encryptWithAesGcm(KEY, "same-secret");
    const b = encryptWithAesGcm(KEY, "same-secret");
    expect(a).not.toBe(b);
    expect(decryptWithAesGcm(KEY, a)).toBe("same-secret");
    expect(decryptWithAesGcm(KEY, b)).toBe("same-secret");
  });

  it("returns null on tampering (GCM auth tag)", () => {
    const payload = encryptWithAesGcm(KEY, "tamper-me");
    const parts = payload.split(".");
    const data = Buffer.from(parts[3] ?? "", "base64url");
    data[0] = (data[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], data.toString("base64url")].join(".");
    expect(decryptWithAesGcm(KEY, tampered)).toBeNull();
  });

  it("returns null for a wrong key", () => {
    const payload = encryptWithAesGcm(KEY, "key-separation");
    expect(decryptWithAesGcm(OTHER_KEY, payload)).toBeNull();
  });

  it("returns null for malformed payloads", () => {
    expect(decryptWithAesGcm(KEY, "")).toBeNull();
    expect(decryptWithAesGcm(KEY, "not-a-payload")).toBeNull();
    expect(decryptWithAesGcm(KEY, "v2.a.b.c")).toBeNull();
    expect(decryptWithAesGcm(KEY, "v1.a.b")).toBeNull();
  });
});
