import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../config/app-config";
import type { TaskyRepository } from "./tasky.repository";
import type { TaskyAttachmentRepository } from "./tasky-attachment.repository";
import type { TaskyAttachmentStorage } from "./tasky-attachment-storage.port";
import { TaskyAttachmentService } from "./tasky-attachment.service";

const userId = "11111111-1111-4111-8111-111111111111";
const cardId = "card-1";
const boardData = {
  columns: [{
    id: "backlog",
    title: "Backlog",
    dot: "bg-muted-foreground/70",
    cards: [{ id: cardId, title: "Review plan", tag: "Task", priority: "High", assignee: "ME" }],
  }],
};
const now = new Date("2026-10-29T14:00:00.000Z");
const fileBytes = Buffer.from("Tasky attachment test");
const storageKey = `${userId}/22222222-2222-4222-8222-222222222222.txt`;

function createService() {
  const boardRepository = {
    findByUserId: vi.fn().mockResolvedValue({ data: boardData, updatedAt: now }),
  };
  const attachmentRepository = {
    listForCard: vi.fn().mockResolvedValue([]),
    countForCard: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockImplementation(async (input: Record<string, unknown>) => ({
      ...input,
      createdAt: now,
    })),
    findForCard: vi.fn(),
    deleteForCard: vi.fn(),
  };
  const storage = {
    put: vi.fn().mockResolvedValue(storageKey),
    get: vi.fn().mockResolvedValue(fileBytes),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const service = new TaskyAttachmentService(
    boardRepository as unknown as TaskyRepository,
    attachmentRepository as unknown as TaskyAttachmentRepository,
    storage as unknown as TaskyAttachmentStorage,
    { tasky: { attachmentMaxBytes: 5 * 1024 * 1024 } } as Pick<AppConfig, "tasky">,
  );
  return { service, boardRepository, attachmentRepository, storage };
}

describe("TaskyAttachmentService", () => {
  it("stores a validated text file outside the board JSON and returns metadata only", async () => {
    const { service, attachmentRepository, storage } = createService();

    const result = await service.upload(userId, cardId, {
      fileName: "notes.txt",
      mimeType: "text/plain",
      contentBase64: fileBytes.toString("base64"),
    });

    expect(result.attachment).toMatchObject({
      cardId,
      originalName: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: fileBytes.length,
    });
    expect(result.attachment).not.toHaveProperty("storageKey");
    expect(result.attachment).not.toHaveProperty("checksumSha256");
    expect(attachmentRepository.create).toHaveBeenCalledOnce();
    expect(storage.put).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      mimeType: "text/plain",
      bytes: fileBytes,
    }));
  });

  it("rejects a card not present on the authenticated user's board", async () => {
    const { service, storage, attachmentRepository } = createService();

    await expect(service.upload(userId, "foreign-card", {
      fileName: "notes.txt",
      mimeType: "text/plain",
      contentBase64: fileBytes.toString("base64"),
    })).rejects.toThrow("Tasky card not found.");
    expect(storage.put).not.toHaveBeenCalled();
    expect(attachmentRepository.create).not.toHaveBeenCalled();
  });

  it("rejects content that does not match the declared file type before storing it", async () => {
    const { service, storage, attachmentRepository } = createService();

    await expect(service.upload(userId, cardId, {
      fileName: "fake.pdf",
      mimeType: "application/pdf",
      contentBase64: fileBytes.toString("base64"),
    })).rejects.toThrow("The file content is not a valid PDF document.");
    expect(storage.put).not.toHaveBeenCalled();
    expect(attachmentRepository.create).not.toHaveBeenCalled();
  });

  it("removes stored files when their card is removed from the board", async () => {
    const { service, attachmentRepository, storage } = createService();
    const row = {
      id: "22222222-2222-4222-8222-222222222222",
      storageKey,
    };
    attachmentRepository.listForCard.mockImplementation(async () => [row]);
    attachmentRepository.deleteForCard.mockResolvedValue(row);

    await service.removeForDeletedCards(userId, ["deleted-card", "deleted-card"]);

    expect(attachmentRepository.listForCard).toHaveBeenCalledOnce();
    expect(attachmentRepository.listForCard).toHaveBeenCalledWith(userId, "deleted-card");
    expect(attachmentRepository.deleteForCard).toHaveBeenCalledWith(userId, "deleted-card", row.id);
    expect(storage.delete).toHaveBeenCalledWith(storageKey);
  });

  it("owner-scopes deletion and removes the stored binary after metadata is deleted", async () => {
    const { service, attachmentRepository, storage } = createService();
    attachmentRepository.deleteForCard.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      userId,
      cardId,
      originalName: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: fileBytes.length,
      checksumSha256: "a".repeat(64),
      storageKey,
      createdAt: now,
    });

    await expect(service.remove(userId, cardId, "22222222-2222-4222-8222-222222222222"))
      .resolves.toEqual({ deleted: true, id: "22222222-2222-4222-8222-222222222222" });
    expect(attachmentRepository.deleteForCard).toHaveBeenCalledWith(
      userId, cardId, "22222222-2222-4222-8222-222222222222",
    );
    expect(storage.delete).toHaveBeenCalledWith(storageKey);
  });
});
