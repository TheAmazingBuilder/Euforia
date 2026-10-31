/**
 * Nofy data access (B11) - the ONLY place the nofy context touches Prisma.
 * Rows land in nofyRow with a `kind` (NOTE | FOLDER | TAG | TEMPLATE |
 * VERSION); the row id IS the entity id (version snapshots get their own
 * uuid). Aggregate state (blocks, tagIds, …) lives in the shared-contract
 * JSON under `data`, exactly like every bounded context of the module
 * upgrade.
 */
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface NofyRow {
  id: string;
  userId: string;
  kind: string;
  data: Record<string, unknown>;
}

/**
 * JSONB `data` payload shapes of the row store, per kind
 * (FOLDER | NOTE | TAG | TEMPLATE). Type-only exports derived from the
 * mapper field accesses (nofy.mappers.ts) - the stored JSON is revivable,
 * so timestamps surface as Date at this boundary.
 */

/** kind=FOLDER payload (mapper: toFolder - noteCount is the projection). */
export interface NofyFolderData {
  id: string;
  name: string;
  createdAt: Date;
  noteCount: number;
}

/** kind=TAG payload (mapper: toTag - noteCount is the projection). */
export interface NofyTagData {
  id: string;
  name: string;
  noteCount: number;
}

/** kind=NOTE payload (mappers: toNote / toNoteRow - folderName/tagNames are
 *  the per-read projections; lessonRef/blocks stay opaque JSON for the
 *  defensive parsers in nofy-content). */
export interface NofyNoteData {
  id: string;
  userId: string;
  title: string;
  icon: string | null;
  folderId: string | null;
  folderName: string | null;
  tagIds: string[];
  tagNames: string[];
  favorite: boolean;
  templateId: string | null;
  lessonRef: unknown;
  blocks: unknown;
  createdAt: Date;
  updatedAt: Date;
  lastViewedAt: Date | null;
  deletedAt: Date | null;
}

/** kind=TEMPLATE payload (mapper: toTemplate). */
export interface NofyTemplateData {
  id: string;
  name: string;
  description: string;
  icon: string;
  blocks: unknown;
  builtIn: boolean;
  createdAt: Date;
}

@Injectable()
export class NofyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByKind(userId: string, kind: string): Promise<NofyRow[]> {
    const rows = await this.prisma.nofyRow.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as NofyRow[];
  }

  async findForUser(userId: string, kind: string, rowId: string): Promise<NofyRow | null> {
    const row = await this.prisma.nofyRow.findFirst({
      where: { userId, kind, id: rowId },
    });
    return (row as unknown as NofyRow) ?? null;
  }

  async insert(userId: string, kind: string, id: string, data: Prisma.InputJsonValue): Promise<NofyRow> {
    const row = await this.prisma.nofyRow.create({
      data: { userId, kind, id, data },
    });
    return row as unknown as NofyRow;
  }

  async updateData(id: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.nofyRow.update({ where: { id }, data: { data } });
  }

  async deleteRow(id: string): Promise<void> {
    await this.prisma.nofyRow.delete({ where: { id } });
  }
}
