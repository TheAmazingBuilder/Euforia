/**
 * Image validation service (Phase 19 §7/§8/§38) — the API-boundary gate for
 * every screenshot upload.
 *
 * Threat model (§7): every upload is UNTRUSTED input. The declared MIME,
 * the filename, the extension and any client metadata are never trusted —
 * the wire format (frontend contract) is a data URL, so this service:
 *
 *   1. strictly parses the data-URL envelope;
 *   2. bounds the DECODED size (config OCR_UPLOAD_MAX_BYTES, §8);
 *   3. sniffs the real format from magic bytes and rejects mismatches
 *      (unsupported format rejection, §7);
 *   4. parses pixel dimensions from the binary header and enforces the
 *      pixel-count ceiling (decompression/resource-exhaustion guard, §38)
 *      without decoding the image;
 *   5. computes the SHA-256 checksum — the asset identity + idempotency
 *      anchor (§6/§32).
 */
import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  parseImageDimensions,
  sniffImageMime,
  type SupportedImageMime,
} from "./image-header";
import {
  BusinessRuleError,
  ValidationError,
} from "../../../shared/errors/app-error";

export interface ValidatedImage {
  bytes: Buffer;
  mime: SupportedImageMime;
  sizeBytes: number;
  width: number;
  height: number;
  checksumSha256: string;
}

@Injectable()
export class ImageValidationService {
  validateDataUrl(dataUrl: string, limits: { maxBytes: number; maxPixels: number }): ValidatedImage {
    // 1. Strict envelope parse — anything outside data:<allowed>;base64 is a 400.
    const match = /^data:((?:image\/[a-z0-9.+-]+)|application\/pdf);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
    if (match === null || match[2] === undefined) {
      throw new ValidationError(
        "The image payload must be a base64 data URL (image/png, image/jpeg, image/webp or application/pdf).",
        [{ path: "imageDataUrl", message: "expected a data:image/* or application/pdf base64 URL" }],
        "INVALID_IMAGE",
      );
    }
    const declared = match[1];
    const base64 = match[2];

    // 2. Size guard BEFORE decoding (cheap, deterministic). base64 length × 3/4
    //    is an upper bound of the decoded size (padding only shrinks it).
    if (Math.floor((base64.length * 3) / 4) > limits.maxBytes) {
      throw new ValidationError(
        "The image is too large.",
        [{ path: "imageDataUrl", message: `decoded image exceeds ${limits.maxBytes} bytes` }],
        "IMAGE_TOO_LARGE",
      );
    }
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length === 0 || bytes.length > limits.maxBytes) {
      throw new ValidationError(
        "The image is too large or empty.",
        [{ path: "imageDataUrl", message: `decoded image must be 1..${limits.maxBytes} bytes` }],
        "IMAGE_TOO_LARGE",
      );
    }

    // 3. Magic bytes — the declared type must MATCH the binary (§7).
    const actual = sniffImageMime(bytes);
    if (actual === null) {
      throw new ValidationError(
        "Unsupported image format.",
        [{ path: "imageDataUrl", message: "only PNG, JPEG, WEBP images and PDF statements are supported" }],
        "UNSUPPORTED_FORMAT",
      );
    }
    if (actual !== declared) {
      // Content-Type spoofing — the bytes win, and a mismatch is rejected.
      throw new ValidationError(
        "The declared image type does not match the actual content.",
        [{ path: "imageDataUrl", message: `declared ${declared} but content is ${actual}` }],
        "INVALID_IMAGE",
      );
    }

    // PDF statements (engine quality §4.3): no intrinsic pixel size and no
    // header dimension parse — the page budget + pixel ceiling are enforced
    // by the SIDE CAR at render time (pypdfium2). Dimensions land on the
    // asset row once the engine reports the rendered first page.
    if (actual === "application/pdf") {
      const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
      return {
        bytes,
        mime: actual,
        sizeBytes: bytes.length,
        width: 1,
        height: 1,
        checksumSha256,
      };
    }

    // 4. Structural dimension parse (also catches truncated/malformed files).
    //    (PDF never reaches here — handled above.)
    const dimensions = parseImageDimensions(bytes, actual as "image/png" | "image/jpeg" | "image/webp");
    if (dimensions === null) {
      throw new ValidationError(
        "The image is malformed.",
        [{ path: "imageDataUrl", message: "unreadable image structure" }],
        "INVALID_IMAGE",
      );
    }
    if (dimensions.width * dimensions.height > limits.maxPixels) {
      throw new ValidationError(
        "The image dimensions exceed the supported maximum.",
        [{
          path: "imageDataUrl",
          message: `${dimensions.width}x${dimensions.height} exceeds ${limits.maxPixels} pixels`,
        }],
        "IMAGE_DIMENSIONS_INVALID",
      );
    }

    // 5. Checksum — identity + integrity anchor (§6).
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    return {
      bytes,
      mime: actual,
      sizeBytes: bytes.length,
      width: dimensions.width,
      height: dimensions.height,
      checksumSha256,
    };
  }
}

/**
 * Guard used by the storage adapter: storage keys are SERVER-CONSTRUCTED
 * from validated inputs only. This function is the last line of defense
 * against path traversal through any future refactor (§7).
 */
export function assertSafeStorageKey(storageKey: string): void {
  if (!/^[a-z0-9][a-z0-9/._-]*$/i.test(storageKey) || storageKey.includes("..")) {
    throw new BusinessRuleError("Invalid storage reference.", "INVALID_STORAGE_REFERENCE");
  }
}
