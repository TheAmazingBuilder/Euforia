import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { PersonalEventsState } from "../../shared/contracts";

/** Persistence boundary for one private Events board per authenticated user. */
export interface PersonalEventsBoardRecord {
  data: Prisma.JsonValue;
  updatedAt: Date;
}

@Injectable()
export class PersonalEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<PersonalEventsBoardRecord | null> {
    const row = await this.prisma.personalEventsBoard.findUnique({ where: { userId } });
    return row ? { data: row.data, updatedAt: row.updatedAt } : null;
  }

  async saveForUser(userId: string, state: PersonalEventsState): Promise<PersonalEventsBoardRecord> {
    const data = state as unknown as Prisma.InputJsonValue;
    const row = await this.prisma.personalEventsBoard.upsert({
      where: { userId },
      create: { userId, data },
      update: { data },
    });
    return { data: row.data, updatedAt: row.updatedAt };
  }
}
