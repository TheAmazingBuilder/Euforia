/**
 * Local-disk screenshot storage adapter (Phase 19 §6/§7/§31).
 *
 * Layout: <storageRoot>/screenshots/<userId>/<checksum[0:2]>/<checksum>.<ext>
 *
 * Security properties (§7):
 *   - keys are constructed ONLY from the (validated) user uuid and the hex
 *     checksum - a client filename can never reach the filesystem;
 *   - every read re-validates that the resolved path stays INSIDE the root
 *     (defense in depth against traversal through a corrupted key);
 *   - writes are atomic (tmp file + rename) so a crash never leaves a
 *     half-written image behind a valid metadata row.
 *
 * Retention (§31): deletion is explicit - recognition DELETE removes the
 * file after the DB transaction commits; user cascade deletes are handled
 * by the application service (storage rows outlive no metadata).
 */
import { createReadStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Injectable } from "@nestjs/common";
import type { AppConfig } from "../../../config/app-config";
import type { ScreenshotStorage } from "./screenshot-storage.port";
import { assertSafeStorageKey } from "../image/image-validation.service";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** UUIDs are the only user ids this adapter ever sees - enforced here. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class LocalDiskScreenshotStorage implements ScreenshotStorage {
  private readonly root: string;

  constructor(config: AppConfig) {
    this.root = resolve(config.ocr.storageRoot);
  }

  async put(input: { userId: string; checksumSha256: string; mime: string; bytes: Buffer }): Promise<string> {
    if (!UUID_PATTERN.test(input.userId)) {
      throw new Error("storage user id must be a uuid");
    }
    if (!/^[a-f0-9]{64}$/.test(input.checksumSha256)) {
      throw new Error("storage checksum must be a hex sha256");
    }
    const ext = EXT_BY_MIME[input.mime];
    if (!ext) {
      throw new Error(`unsupported mime for storage: ${input.mime}`);
    }
    const storageKey = `screenshots/${input.userId}/${input.checksumSha256.slice(0, 2)}/${input.checksumSha256}.${ext}`;
    const target = this.resolveInside(storageKey);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmp, input.bytes);
    await rename(tmp, target);
    return storageKey;
  }

  async get(storageKey: string): Promise<Buffer | null> {
    const target = this.tryResolveInside(storageKey);
    if (target === null) return null;
    try {
      const info = await stat(target);
      if (!info.isFile()) return null;
      const chunks: Buffer[] = [];
      const stream = createReadStream(target);
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }

  async delete(storageKey: string): Promise<void> {
    const target = this.tryResolveInside(storageKey);
    if (target === null) return;
    try {
      await unlink(target);
    } catch {
      // Best-effort (§31): a missing file is already the desired state.
    }
  }

  /** Strict variant - invalid keys are a programming error, not a 404. */
  private resolveInside(storageKey: string): string {
    assertSafeStorageKey(storageKey);
    const target = resolve(this.root, storageKey);
    if (!target.startsWith(this.root + sep)) {
      throw new Error("storage key escapes the storage root");
    }
    return target;
  }

  /** Lenient variant for reads/deletes - invalid keys resolve to null. */
  private tryResolveInside(storageKey: string): string | null {
    try {
      return this.resolveInside(storageKey);
    } catch {
      return null;
    }
  }
}
