import { createReadStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { TaskyAttachmentStorage } from "./tasky-attachment-storage.port";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv", "text/markdown": "md",
};

/** Atomic local-disk adapter. Filenames provided by users never enter the path. */
export class LocalDiskTaskyAttachmentStorage implements TaskyAttachmentStorage {
  private readonly root: string;
  constructor(root: string) { this.root = resolve(root); }

  async put(input: { userId: string; attachmentId: string; mimeType: string; bytes: Buffer }): Promise<string> {
    if (!UUID_PATTERN.test(input.userId) || !UUID_PATTERN.test(input.attachmentId)) {
      throw new Error("Tasky storage identifiers must be UUIDs.");
    }
    const extension = EXT_BY_MIME[input.mimeType];
    if (!extension) throw new Error("Unsupported Tasky attachment MIME type.");
    const storageKey = `${input.userId}/${input.attachmentId}.${extension}`;
    const target = this.resolveInside(storageKey);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    try {
      await writeFile(temporary, input.bytes, { flag: "wx", mode: 0o600 });
      await rename(temporary, target);
      return storageKey;
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async get(storageKey: string): Promise<Buffer | null> {
    const target = this.tryResolveInside(storageKey);
    if (!target) return null;
    try {
      if (!(await stat(target)).isFile()) return null;
      const chunks: Buffer[] = [];
      for await (const chunk of createReadStream(target)) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks);
    } catch { return null; }
  }

  async delete(storageKey: string): Promise<void> {
    const target = this.tryResolveInside(storageKey);
    if (target) await unlink(target).catch(() => undefined);
  }

  private resolveInside(storageKey: string): string {
    const [userId, fileName, ...extra] = storageKey.split("/");
    if (extra.length || !UUID_PATTERN.test(userId ?? "") ||
      !/^[0-9a-f-]{36}\.(png|jpg|webp|pdf|txt|csv|md)$/i.test(fileName ?? "")) {
      throw new Error("Invalid Tasky attachment storage key.");
    }
    const target = resolve(this.root, storageKey);
    if (!target.startsWith(this.root + sep)) throw new Error("Tasky storage key escaped the storage root.");
    return target;
  }

  private tryResolveInside(storageKey: string): string | null {
    try { return this.resolveInside(storageKey); } catch { return null; }
  }
}
