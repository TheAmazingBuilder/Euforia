/** Private storage port for Tasky card attachments. */
export interface TaskyAttachmentStorage {
  put(input: { userId: string; attachmentId: string; mimeType: string; bytes: Buffer }): Promise<string>;
  get(storageKey: string): Promise<Buffer | null>;
  delete(storageKey: string): Promise<void>;
}
export const TASKY_ATTACHMENT_STORAGE = Symbol("TASKY_ATTACHMENT_STORAGE");
