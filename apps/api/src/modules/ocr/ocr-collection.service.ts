/**
 * OCR screenshot collections (V2 spec §28) — a lightweight ORGANIZATION
 * layer over existing recognitions ("Gold Scalping", "London Session",
 * "Winning Trades", …).
 *
 * Boundary discipline: collections are NOT a second storage system (the
 * binaries live behind the screenshot storage port, §6) and NOT a second
 * document system — they are named, owner-scoped references to recognition
 * rows. A recognition may live in several collections; deleting a
 * collection never touches recognitions or assets.
 */
import { Injectable } from "@nestjs/common";

import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import type { OcrCollection } from "../../shared/contracts";
import { OCR_ERROR_CODES } from "./ocr.service";
import { OcrCollectionRepository, OcrRepository, type OcrCollectionRow } from "./ocr.repository";
import { SecurityEventService } from "../security/security-event.service";

@Injectable()
export class OcrCollectionService {
  constructor(
    private readonly collections: OcrCollectionRepository,
    private readonly recognitions: OcrRepository,
    private readonly securityEvents: SecurityEventService,
  ) {}

  async create(input: { userId: string; name: string }): Promise<{ collection: OcrCollection }> {
    const name = input.name.trim().slice(0, 64);
    const existing = await this.collections.findByName(input.userId, name);
    if (existing) {
      throw new ConflictError(
        "A collection with this name already exists.",
        OCR_ERROR_CODES.COLLECTION_NAME_TAKEN,
      );
    }
    const row = await this.collections.create(input.userId, name);
    await this.securityEvents
      .record({
        userId: input.userId,
        type: "OCR_COLLECTION_CREATED",
        actor: input.userId,
        context: `collection "${name}" created`,
        outcome: "SUCCESS",
      })
      .catch(() => undefined);
    return { collection: this.toDto(row) };
  }

  async list(userId: string): Promise<{ collections: OcrCollection[] }> {
    const rows = await this.collections.listForUser(userId);
    return { collections: rows.map((row) => this.toDto(row)) };
  }

  async get(input: { userId: string; id: string }): Promise<{ collection: OcrCollection }> {
    const row = await this.collections.findForUser(input.id, input.userId);
    if (!row) throw new NotFoundError("Collection not found.");
    return { collection: this.toDto(row) };
  }

  async addItem(input: {
    userId: string;
    id: string;
    recognitionId: string;
  }): Promise<{ collection: OcrCollection }> {
    const row = await this.collections.findForUser(input.id, input.userId);
    if (!row) throw new NotFoundError("Collection not found.");
    // The recognition must belong to the SAME owner (§ IDOR) — foreign ids
    // are an honest 404, never a 403 leak.
    const recognition = await this.recognitions.findForUser(input.recognitionId, input.userId);
    if (!recognition) throw new NotFoundError("Recognition not found.");
    // Duplicate membership is an idempotent no-op (§51 replay discipline).
    await this.collections.addItem(row.id, input.recognitionId);
    return this.get({ userId: input.userId, id: input.id });
  }

  async removeItem(input: {
    userId: string;
    id: string;
    recognitionId: string;
  }): Promise<{ collection: OcrCollection }> {
    const row = await this.collections.findForUser(input.id, input.userId);
    if (!row) throw new NotFoundError("Collection not found.");
    await this.collections.removeItem(row.id, input.recognitionId);
    return this.get({ userId: input.userId, id: input.id });
  }

  async delete(input: { userId: string; id: string }): Promise<{ deleted: true; id: string }> {
    const deleted = await this.collections.deleteForUser(input.id, input.userId);
    if (!deleted) throw new NotFoundError("Collection not found.");
    await this.securityEvents
      .record({
        userId: input.userId,
        type: "OCR_COLLECTION_DELETED",
        actor: input.userId,
        context: `collection ${input.id} deleted (recognitions kept)`,
        outcome: "SUCCESS",
      })
      .catch(() => undefined);
    return { deleted: true, id: input.id };
  }

  private toDto(row: OcrCollectionRow): OcrCollection {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      items: row.items.map((item) => ({
        recognitionId: item.recognitionId,
        addedAt: item.addedAt.toISOString(),
      })),
    };
  }
}
