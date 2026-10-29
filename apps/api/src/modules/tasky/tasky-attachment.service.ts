import { createHash, randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { Inject, Injectable, BadRequestException, InternalServerErrorException, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../../config/app-config";
import {
  taskyKanbanAttachmentUploadSchema, taskyKanbanBoardStateSchema,
  type TaskyKanbanAttachment, type TaskyKanbanAttachmentMime, type TaskyKanbanAttachmentUploadInput,
} from "../../shared/contracts";
import { TaskyRepository } from "./tasky.repository";
import { TaskyAttachmentRepository } from "./tasky-attachment.repository";
import { TASKY_ATTACHMENT_STORAGE, type TaskyAttachmentStorage } from "./tasky-attachment-storage.port";

const EXTENSIONS_BY_MIME: Record<TaskyKanbanAttachmentMime, string[]> = {
  "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"],
  "application/pdf": [".pdf"], "text/plain": [".txt"], "text/csv": [".csv"],
  "text/markdown": [".md", ".markdown"],
};
const MAX_ATTACHMENTS_PER_CARD = 20;

@Injectable()
export class TaskyAttachmentService {
  constructor(
    private readonly boards: TaskyRepository,
    private readonly attachments: TaskyAttachmentRepository,
    @Inject(TASKY_ATTACHMENT_STORAGE) private readonly storage: TaskyAttachmentStorage,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, "tasky">,
  ) {}

  async list(userId: string, cardId: string): Promise<{ attachments: TaskyKanbanAttachment[] }> {
    await this.assertCardOwned(userId, cardId);
    const rows = await this.attachments.listForCard(userId, cardId);
    return { attachments: rows.map((row) => this.toDto(row)) };
  }

  async upload(userId: string, cardId: string, rawInput: TaskyKanbanAttachmentUploadInput) {
    await this.assertCardOwned(userId, cardId);
    const input = taskyKanbanAttachmentUploadSchema.parse(rawInput);
    if (await this.attachments.countForCard(userId, cardId) >= MAX_ATTACHMENTS_PER_CARD) {
      throw new BadRequestException("A card may contain at most 20 attachments.");
    }

    const normalizedName = input.fileName.replace(/\\/g, "/");
    const extension = extname(normalizedName.split("/").pop() ?? "").toLowerCase();
    if (!EXTENSIONS_BY_MIME[input.mimeType].includes(extension)) {
      throw new BadRequestException("The file extension does not match the selected file type.");
    }

    const bytes = Buffer.from(input.contentBase64, "base64");
    if (!bytes.length || bytes.length > this.config.tasky.attachmentMaxBytes) {
      throw new PayloadTooLargeException("Each Tasky attachment must be between 1 byte and 5 MiB.");
    }
    if (bytes.toString("base64") !== input.contentBase64) {
      throw new BadRequestException("The uploaded file data is not valid base64.");
    }
    this.validateFileBytes(input.mimeType, bytes);

    const originalName = basename(normalizedName)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[<>:"|?*]/g, "_")
      .trim()
      .slice(0, 160);
    if (!originalName) throw new BadRequestException("A valid file name is required.");

    const id = randomUUID();
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    const storageKey = await this.storage.put({ userId, attachmentId: id, mimeType: input.mimeType, bytes });
    try {
      const row = await this.attachments.create({
        id, userId, cardId, originalName, mimeType: input.mimeType,
        sizeBytes: bytes.length, checksumSha256, storageKey,
      });
      return { attachment: this.toDto(row) };
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }
  }

  async download(userId: string, cardId: string, attachmentId: string) {
    await this.assertCardOwned(userId, cardId);
    const row = await this.attachments.findForCard(userId, cardId, attachmentId);
    if (!row) throw new NotFoundException("Tasky attachment not found.");
    const bytes = await this.storage.get(row.storageKey);
    if (!bytes) throw new NotFoundException("Tasky attachment file is missing from storage.");
    if (bytes.length !== row.sizeBytes ||
      createHash("sha256").update(bytes).digest("hex") !== row.checksumSha256) {
      throw new InternalServerErrorException("Tasky attachment integrity check failed.");
    }
    return {
      fileName: row.originalName,
      mimeType: row.mimeType as TaskyKanbanAttachmentMime,
      contentBase64: bytes.toString("base64"),
    };
  }

  async remove(userId: string, cardId: string, attachmentId: string) {
    await this.assertCardOwned(userId, cardId);
    const row = await this.attachments.deleteForCard(userId, cardId, attachmentId);
    if (!row) throw new NotFoundException("Tasky attachment not found.");
    await this.storage.delete(row.storageKey);
    return { deleted: true, id: row.id };
  }

  private async assertCardOwned(userId: string, cardId: string): Promise<void> {
    if (!cardId.trim() || cardId.length > 100) throw new NotFoundException("Tasky card not found.");
    const board = await this.boards.findByUserId(userId);
    if (!board) throw new NotFoundException("Tasky card not found.");
    const parsed = taskyKanbanBoardStateSchema.safeParse(board.data);
    if (!parsed.success) throw new InternalServerErrorException("The saved Tasky board could not be read.");
    if (!parsed.data.columns.some((column) => column.cards.some((card) => card.id === cardId))) {
      throw new NotFoundException("Tasky card not found.");
    }
  }

  private validateFileBytes(mimeType: TaskyKanbanAttachmentMime, bytes: Buffer): void {
    const hasPrefix = (hex: string) => {
      const signature = Buffer.from(hex, "hex");
      return bytes.subarray(0, signature.length).equals(signature);
    };
    switch (mimeType) {
      case "image/png":
        if (!hasPrefix("89504e470d0a1a0a")) throw new BadRequestException("The file content is not a valid PNG image.");
        return;
      case "image/jpeg":
        if (!hasPrefix("ffd8ff")) throw new BadRequestException("The file content is not a valid JPEG image.");
        return;
      case "image/webp":
        if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
          throw new BadRequestException("The file content is not a valid WebP image.");
        }
        return;
      case "application/pdf":
        if (bytes.toString("ascii", 0, 5) !== "%PDF-") throw new BadRequestException("The file content is not a valid PDF document.");
        return;
      case "text/plain":
      case "text/csv":
      case "text/markdown":
        if (bytes.includes(0) || !Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) {
          throw new BadRequestException("Only valid UTF-8 text files are accepted.");
        }
        return;
    }
  }

  private toDto(row: {
    id: string; cardId: string; originalName: string; mimeType: string; sizeBytes: number; createdAt: Date;
  }): TaskyKanbanAttachment {
    return {
      id: row.id, cardId: row.cardId, originalName: row.originalName,
      mimeType: row.mimeType as TaskyKanbanAttachmentMime, sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
