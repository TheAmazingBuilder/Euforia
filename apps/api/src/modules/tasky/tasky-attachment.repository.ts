import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

@Injectable()
export class TaskyAttachmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForCard(userId: string, cardId: string) {
    return this.prisma.taskyAttachment.findMany({
      where: { userId, cardId },
      orderBy: { createdAt: "desc" },
    });
  }

  countForCard(userId: string, cardId: string) {
    return this.prisma.taskyAttachment.count({ where: { userId, cardId } });
  }

  create(input: {
    id: string; userId: string; cardId: string; originalName: string; mimeType: string;
    sizeBytes: number; checksumSha256: string; storageKey: string;
  }) {
    return this.prisma.taskyAttachment.create({ data: input });
  }

  findForCard(userId: string, cardId: string, id: string) {
    return this.prisma.taskyAttachment.findFirst({ where: { userId, cardId, id } });
  }

  async deleteForCard(userId: string, cardId: string, id: string) {
    const row = await this.prisma.taskyAttachment.findFirst({ where: { userId, cardId, id } });
    if (!row) return null;
    await this.prisma.taskyAttachment.delete({ where: { id: row.id } });
    return row;
  }
}
