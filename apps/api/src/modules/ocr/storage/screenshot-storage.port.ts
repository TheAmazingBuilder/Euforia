/**
 * Screenshot storage PORT (Phase 19 §6) — the OCR context's storage seam.
 *
 * The database stores METADATA + storageKey; actual binaries live behind
 * this port (§6: "PostgreSQL → metadata + storage reference; object storage
 * → actual image"). The local-disk adapter ships in this build; a MinIO/S3
 * adapter can replace it without touching the domain (the frontend's
 * `storageKey` field on TradeScreenshot was designed for exactly this —
 * see packages/shared schemas/trade.ts).
 */
export interface ScreenshotStorage {
  /**
   * Store the binary and return its storage key. Implementations MUST derive
   * the key from server-validated inputs only (user id + checksum + format)
   * so client-controlled filenames can never influence paths (§7).
   */
  put(input: { userId: string; checksumSha256: string; mime: string; bytes: Buffer }): Promise<string>;

  /** Read back the binary, or null when absent/invalid reference (404 path). */
  get(storageKey: string): Promise<Buffer | null>;

  /** Best-effort removal — deletion must never fail the whole request (§31). */
  delete(storageKey: string): Promise<void>;
}

export const SCREENSHOT_STORAGE = Symbol("SCREENSHOT_STORAGE");
