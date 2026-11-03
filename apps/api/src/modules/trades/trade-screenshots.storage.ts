/**
 * Trading Core screenshot storage (Phase 4 §37/§39).
 *
 * The wire contract carries a data URL; the persistence layer stores the
 * BINARY on local disk (mirroring the OCR bounded context's storage
 * discipline) and PostgreSQL keeps only metadata + the storage reference:
 * raw payloads are isolated, restricted to this adapter, never exposed as
 * file paths (§39). The mapper re-serves the binary as a data URL so the
 * existing frontend renders screenshots unchanged - the swap to signed
 * object-storage URLs is a deployment concern, documented in the report.
 *
 * Validation: MIME comes from MAGIC BYTES (never the client), the payload
 * is size-bounded, and the path is derived server-side only (never
 * client-controlled, path-traversal-proof by construction).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import { sniffImageMime } from "../ocr/image/image-header";

export interface StoredScreenshot {
  storageKey: string;
  checksumSha256: string;
  mime: string;
  sizeBytes: number;
}

export class InvalidScreenshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScreenshotError";
  }
}

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

@Injectable()
export class TradeScreenshotStorage {
  constructor(private readonly root: string) {}

  /**
   * Validate + persist one data-URL screenshot. Throws
   * InvalidScreenshotError on anything that is not a bounded PNG/JPEG/WEBP.
   */
  async store(input: {
    tradeId: string;
    dataUrl: string;
    maxBytes: number;
  }): Promise<StoredScreenshot> {
    const decoded = decodeDataUrl(input.dataUrl);
    if (decoded === null) {
      throw new InvalidScreenshotError("Only image/* data URLs (PNG, JPEG, WEBP) are accepted.");
    }
    if (decoded.bytes.length === 0 || decoded.bytes.length > input.maxBytes) {
      throw new InvalidScreenshotError("The screenshot size is out of bounds.");
    }
    const mime = sniffImageMime(decoded.bytes);
    if (mime === null || mime !== decoded.declaredMime) {
      // The declared and sniffed types must agree - mismatched payloads are
      // exactly how disguised uploads slip through naive receivers.
      throw new InvalidScreenshotError("The screenshot content does not match an accepted image format.");
    }
    const checksumSha256 = createHash("sha256").update(decoded.bytes).digest("hex");
    const storageKey = path.join(
      "trades",
      input.tradeId,
      `${checksumSha256.slice(0, 32)}.${MIME_TO_EXTENSION[mime] ?? "bin"}`,
    );
    const absolute = this.absolutePathOf(storageKey);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, decoded.bytes);
    return { storageKey, checksumSha256, mime, sizeBytes: decoded.bytes.length };
  }

  /** Re-serve the stored binary as a data URL (wire compatibility). */
  async dataUrlOf(storageKey: string): Promise<string | null> {
    try {
      const bytes = await readFile(this.absolutePathOf(storageKey));
      const mime = sniffImageMime(bytes);
      if (mime === null) return null;
      return `data:${mime};base64,${bytes.toString("base64")}`;
    } catch {
      return null;
    }
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.absolutePathOf(storageKey));
    } catch {
      // Removing a missing binary is idempotent - the row is the authority.
    }
  }

  /** Resolve a RELATIVE storage key under the root - absolute paths and
   * traversal inputs are rejected before touching the filesystem. */
  private absolutePathOf(storageKey: string): string {
    if (storageKey.includes("..") || path.isAbsolute(storageKey)) {
      throw new InvalidScreenshotError("Invalid storage reference.");
    }
    return path.join(this.root, storageKey);
  }
}

interface DecodedDataUrl {
  declaredMime: string;
  bytes: Buffer;
}

/** Strict data-URL parsing: data:<image mime>;base64,<payload>. */
function decodeDataUrl(dataUrl: string): DecodedDataUrl | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (match === null) return null;
  const mime = match[1];
  const base64 = match[2];
  if (mime === undefined || base64 === undefined || base64 === "" || base64.length % 4 !== 0) {
    return null;
  }
  const bytes = Buffer.from(base64, "base64");
  return { declaredMime: mime, bytes };
}
