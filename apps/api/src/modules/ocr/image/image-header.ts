/**
 * Image header parsing (Phase 19 §7/§8) - PURE functions.
 *
 * The client-declared MIME type, filename and extension are NEVER trusted
 * (§7): the format is determined from MAGIC BYTES only, and the dimensions
 * are read straight from the binary structure. Supported formats are exactly
 * the ones the product speaks (§8): PNG, JPEG, WEBP - the same set the
 * frontend screenshot contract accepts via `image/*` and the FastAPI sidecar
 * validates with Pillow.
 *
 * Header parsing is deliberately dependency-free: no native image library in
 * the API runtime, no decode - verification of decodability/pixel safety
 * beyond the header is the SIDE CAR's job (Pillow) plus the pixel-count
 * guard here, which is sufficient to reject decompression bombs cheaply
 * (§38) at the API boundary.
 */

export type SupportedImageMime = "image/png" | "image/jpeg" | "image/webp" | "application/pdf";

export interface ImageDimensions {
  width: number;
  height: number;
}

/** Magic-byte sniffing - returns null for anything the product does not speak.
 *  PDF statements (engine quality §4.3) are recognized by the %PDF- magic. */
export function sniffImageMime(bytes: Buffer): SupportedImageMime | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  // PDF statement: %PDF- (pages carry no intrinsic pixel size - the sidecar
  // reports the rendered first-page dimensions in the engine metadata).
  if (bytes.toString("latin1", 0, 5) === "%PDF-") {
    return "application/pdf";
  }
  return null;
}

/**
 * Read pixel dimensions from the binary structure.
 * Returns null when the header is malformed / truncated - the caller treats
 * that as INVALID_IMAGE (malformed image detection, §7).
 */
export function parseImageDimensions(bytes: Buffer, mime: SupportedImageMime): ImageDimensions | null {
  switch (mime) {
    case "image/png":
      return parsePngDimensions(bytes);
    case "image/jpeg":
      return parseJpegDimensions(bytes);
    case "image/webp":
      return parseWebpDimensions(bytes);
    case "application/pdf":
      // Statements carry no intrinsic pixel size - the sidecar reports the
      // rendered first-page dimensions (engine quality §4.3).
      return null;
  }
}

function parsePngDimensions(bytes: Buffer): ImageDimensions | null {
  // IHDR is always the first chunk: 8-byte signature + 4 len + "IHDR".
  if (bytes.length < 24) return null;
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function parseJpegDimensions(bytes: Buffer): ImageDimensions | null {
  // Walk the segment chain (SOI FFD8 followed by FF <marker> [len] payload).
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === undefined) return null;
    // SOF markers carrying dimensions: C0-CF except C4 (DHT), C8 (JPG), CC (DAC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (offset + 9 > bytes.length) return null;
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2; // standalone markers without a length payload
      continue;
    }
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

function parseWebpDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 30) return null;
  const chunk = bytes.toString("latin1", 12, 16);
  if (chunk === "VP8X") {
    // Canvas size: 24-bit little-endian (value − 1) at offsets 24 and 27.
    const width = bytes.readUIntLE(24, 3) + 1;
    const height = bytes.readUIntLE(27, 3) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === "VP8 ") {
    // Lossy keyframe: 3-byte frame tag + sync 9D 01 2A, then 2× u16le (14 bits).
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = bytes.readUInt16LE(26) & 0x3fff;
    const height = bytes.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === "VP8L") {
    // Lossless: signature byte 0x2F then packed 14-bit (size − 1) values.
    if (bytes[20] !== 0x2f) return null;
    const bits = bytes.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}
