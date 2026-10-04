/**
 * OCR test fixtures — handcrafted VALID PNGs without any image library.
 *
 * A minimal PNG is: signature + IHDR (13-byte payload) + IDAT (zlib-deflated
 * scanlines) + IEND, each chunk CRC32-protected. The scanline data is RGB,
 * filter type 0. A `nonce` byte lets tests steer the FNV-1a bucket of the
 * resulting checksum — the deterministic mock engine picks its scenario from
 * that bucket (Phase 3 §55 house pattern: controlled failures without
 * randomness).
 */
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fnv1a32 } from "../../src/modules/ocr/ocr.logic";

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** A structurally valid PNG — no decoder guarantees, header+IDAT are real. */
export function makeOcrFixturePng(options: { nonce?: number; width?: number; height?: number } = {}): Buffer {
  const width = options.width ?? 320;
  const height = options.height ?? 160;
  const nonce = options.nonce ?? 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < stride; x += 1) {
      raw[y * (stride + 1) + 1 + x] = (x + y + nonce) % 256;
    }
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function pngDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

/** SHA-256 of the fixture — mirrors what the API stores as the asset identity. */
export function fixtureChecksum(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Scenario buckets of the deterministic mock engine (§57):
 *   % 50 === 0 → UNPROCESSABLE; % 50 === 1 → malformed payload; else OK.
 * Tests that need the happy path use this to pick a nonce outside the
 * failure buckets — deterministic, zero flake.
 */
export function bucketOf(bytes: Buffer): number {
  return fnv1a32(`${fixtureChecksum(bytes)}|TRADE_SUMMARY`) % 50;
}

export function makeHappyPathPng(): Buffer {
  for (let nonce = 2; nonce < 256; nonce += 1) {
    const bytes = makeOcrFixturePng({ nonce });
    const bucket = bucketOf(bytes);
    if (bucket >= 2) return bytes;
  }
  throw new Error("no happy-path nonce found");
}

export function makeUnprocessablePng(): Buffer {
  for (let nonce = 0; nonce < 256; nonce += 1) {
    const bytes = makeOcrFixturePng({ nonce });
    if (bucketOf(bytes) === 0) return bytes;
  }
  throw new Error("no unprocessable nonce found");
}

export function makeMalformedScenarioPng(): Buffer {
  for (let nonce = 0; nonce < 256; nonce += 1) {
    const bytes = makeOcrFixturePng({ nonce });
    if (bucketOf(bytes) === 1) return bytes;
  }
  throw new Error("no malformed-scenario nonce found");
}
