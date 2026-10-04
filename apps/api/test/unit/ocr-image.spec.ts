/**
 * Unit — OCR image boundary (Phase 19 §7/§8/§38): magic-byte sniffing,
 * header dimension parsing, data-URL validation guards, checksum stability.
 * Pure/parsing functions — no Nest, no DB.
 */
import { describe, expect, it } from "vitest";
import { parseImageDimensions, sniffImageMime } from "../../src/modules/ocr/image/image-header";
import { ImageValidationService, assertSafeStorageKey } from "../../src/modules/ocr/image/image-validation.service";
import { ValidationError } from "../../src/shared/errors/app-error";
import { makeOcrFixturePng, pngDataUrl } from "../helpers/ocr-fixtures";

// ── Minimal JPEG/WEBP byte builders (header-level, enough for the parser) ────

/** JPEG with a synthetic SOF0 segment carrying 640x420. */
function makeJpegBytes(width = 640, height = 420): Buffer {
  const header = Buffer.from([0xff, 0xd8]); // SOI
  const app0 = Buffer.alloc(18);
  app0[0] = 0xff; app0[1] = 0xe0; // APP0
  app0.writeUInt16BE(16, 2);
  app0.write("JFIF\0", 4, "latin1");
  const sof = Buffer.alloc(19);
  sof[0] = 0xff; sof[1] = 0xc0; // SOF0
  sof.writeUInt16BE(17, 2); // segment length
  sof[5] = (height >> 8) & 0xff; sof[6] = height & 0xff;
  sof[7] = (width >> 8) & 0xff; sof[8] = width & 0xff;
  sof[9] = 3; // components
  const tail = Buffer.from([0xff, 0xd9]); // EOI
  return Buffer.concat([header, app0, sof, tail]);
}

/** WEBP-VP8X with canvas 800x600 (dims stored as value−1, 24-bit LE). */
function makeWebpVp8xBytes(width = 800, height = 600): Buffer {
  const riff = Buffer.from("RIFF", "latin1");
  const size = Buffer.alloc(4);
  const webp = Buffer.from("WEBP", "latin1");
  const vp8x = Buffer.from("VP8X", "latin1");
  const vp8xSize = Buffer.alloc(4);
  vp8xSize.writeUInt32LE(10, 0);
  const flags = Buffer.alloc(4); // reserved
  const dims = Buffer.alloc(6);
  dims.writeUIntLE(width - 1, 0, 3);
  dims.writeUIntLE(height - 1, 3, 3);
  const payload = Buffer.concat([vp8x, vp8xSize, flags, dims]);
  size.writeUInt32LE(payload.length + 4, 0);
  return Buffer.concat([riff, size, webp, payload]);
}

// ── Sniffing + dimensions ────────────────────────────────────────────────────

describe("image header parsing (§7 magic bytes)", () => {
  it("sniffs PNG/JPEG/WEBP from magic bytes", () => {
    expect(sniffImageMime(makeOcrFixturePng())).toBe("image/png");
    expect(sniffImageMime(makeJpegBytes())).toBe("image/jpeg");
    expect(sniffImageMime(makeWebpVp8xBytes())).toBe("image/webp");
    expect(sniffImageMime(Buffer.from("GIF89a something"))).toBeNull();
    expect(sniffImageMime(Buffer.alloc(4))).toBeNull();
  });

  it("reads dimensions for all three formats", () => {
    expect(parseImageDimensions(makeOcrFixturePng({ width: 320, height: 160 }), "image/png")).toEqual({ width: 320, height: 160 });
    expect(parseImageDimensions(makeJpegBytes(640, 420), "image/jpeg")).toEqual({ width: 640, height: 420 });
    expect(parseImageDimensions(makeWebpVp8xBytes(800, 600), "image/webp")).toEqual({ width: 800, height: 600 });
  });

  it("returns null for truncated/malformed structures", () => {
    const png = makeOcrFixturePng();
    expect(parseImageDimensions(png.subarray(0, 15), "image/png")).toBeNull();
    expect(parseImageDimensions(Buffer.from([0x89, 0x50]), "image/png")).toBeNull();
  });
});

// ── Data-URL validation guards ───────────────────────────────────────────────

describe("ImageValidationService (§7/§8/§38 upload guards)", () => {
  const limits = { maxBytes: 6_291_456, maxPixels: 24_000_000 };
  const service = new ImageValidationService();

  it("validates a good PNG and computes a stable checksum", () => {
    const bytes = makeOcrFixturePng({ nonce: 7 });
    const first = service.validateDataUrl(pngDataUrl(bytes), limits);
    const second = service.validateDataUrl(pngDataUrl(bytes), limits);
    expect(first.mime).toBe("image/png");
    expect(first.width).toBe(320);
    expect(first.height).toBe(160);
    expect(first.checksumSha256).toBe(second.checksumSha256);
    expect(first.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects non-data-URL payloads (INVALID_IMAGE)", () => {
    expect(() => service.validateDataUrl("https://example.com/a.png", limits)).toThrow(ValidationError);
    expect(() => service.validateDataUrl("data:text/html;base64,PGI+", limits)).toThrow(ValidationError);
    expect(() => service.validateDataUrl("data:image/png;text,abc", limits)).toThrow(ValidationError);
  });

  it("rejects unsupported formats from magic bytes (no trust in the declared type)", () => {
    const gif = Buffer.from("GIF89a" + "0".repeat(64));
    expect(() =>
      service.validateDataUrl(`data:image/png;base64,${gif.toString("base64")}`, limits),
    ).toThrow(/Unsupported image format/);
  });

  it("catches MIME/extension spoofing — declared type must match the bytes", () => {
    const jpeg = makeJpegBytes();
    expect(() =>
      service.validateDataUrl(`data:image/png;base64,${jpeg.toString("base64")}`, limits),
    ).toThrow(/does not match/);
  });

  it("rejects oversized binaries before decoding fully (IMAGE_TOO_LARGE)", () => {
    const bytes = makeOcrFixturePng({ width: 900, height: 900 });
    const tiny = { maxBytes: 1024, maxPixels: 24_000_000 };
    expect(() => service.validateDataUrl(pngDataUrl(bytes), tiny)).toThrow(/too large/i);
  });

  it("enforces the decompression-bomb pixel ceiling (§38)", () => {
    const bytes = makeOcrFixturePng({ width: 4000, height: 4000 }); // 16 MP
    const capped = { maxBytes: 6_291_456, maxPixels: 1_000_000 };
    expect(() => service.validateDataUrl(pngDataUrl(bytes), capped)).toThrow(/dimensions/);
  });

  it("rejects truncated images (malformed detection)", () => {
    const bytes = makeOcrFixturePng().subarray(0, 14);
    expect(() => service.validateDataUrl(pngDataUrl(bytes), limits)).toThrow(/malformed/i);
  });
});

// ── Storage key guard ────────────────────────────────────────────────────────

describe("assertSafeStorageKey (§7 traversal prevention)", () => {
  it("accepts server-shaped keys", () => {
    expect(() =>
      assertSafeStorageKey("screenshots/8f1d2c3e/ab/ab12cd34ef56.png"),
    ).not.toThrow();
  });

  it("rejects traversal and odd shapes", () => {
    expect(() => assertSafeStorageKey("../../etc/passwd")).toThrow();
    expect(() => assertSafeStorageKey("screenshots/../..//etc")).toThrow();
    expect(() => assertSafeStorageKey("")).toThrow();
    expect(() => assertSafeStorageKey("screenshots/a b#c.png")).toThrow();
  });
});
