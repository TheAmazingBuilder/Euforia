/**
 * Settings data access (infrastructure, Phase 15).
 *
 * The ONLY place in the settings context that touches Prisma. All methods
 * return narrow row projections - no Prisma type crosses into services or
 * controllers (Phase 1 §10 boundary, Identity repository precedent).
 *
 * Concurrency (§36): the frontend PATCHes one domain at a time from multiple
 * tabs/devices without a version protocol, so the repository performs the
 * read-modify-write inside ONE transaction holding a row lock (SELECT … FOR
 * UPDATE). Two concurrent patches on DIFFERENT domains serialize instead of
 * losing an update; same-domain patches keep last-write-wins per field group
 * - the semantics the UI contract implies - without inventing an optimistic
 * concurrency protocol the client does not speak.
 */
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

export interface UserSettingsRow {
  userId: string;
  preferences: unknown;
  updatedAt: Date;
}

export interface DomainUpdateComputation {
  /** The NEW validated document to persist. */
  preferences: unknown;
}

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findForUser(userId: string): Promise<UserSettingsRow | null> {
    const row = await this.prisma.userSettings.findUnique({ where: { userId } });
    return row ? { userId: row.userId, preferences: row.preferences, updatedAt: row.updatedAt } : null;
  }

  async create(userId: string, preferences: Prisma.InputJsonValue): Promise<UserSettingsRow> {
    const row = await this.prisma.userSettings.create({ data: { userId, preferences } });
    return { userId: row.userId, preferences: row.preferences, updatedAt: row.updatedAt };
  }

  /**
   * Domain update under the row lock: compute(currentRaw) receives the RAW
   * stored doc (or null on first write), returns the validated NEW document;
   * create-or-update happens in the SAME transaction that held the lock.
   * The computation itself is pure domain code (no I/O) so the critical
   * section stays short.
   */
  async updateDomainUnderLock(
    userId: string,
    compute: (currentRaw: unknown) => DomainUpdateComputation,
  ): Promise<UserSettingsRow> {
    const row = await this.prisma.$transaction(async (tx) => {
      const locked = (await tx.$queryRaw<Array<{ preferences: unknown }>>`
        SELECT "preferences" FROM "UserSettings" WHERE "userId" = ${userId}::uuid FOR UPDATE
      `) as Array<{ preferences: unknown }>;
      const currentRaw = locked[0]?.preferences ?? null;
      const { preferences } = compute(currentRaw);
      if (locked.length === 0) {
        return tx.userSettings.create({ data: { userId, preferences: preferences as Prisma.InputJsonValue } });
      }
      return tx.userSettings.update({
        where: { userId },
        data: { preferences: preferences as Prisma.InputJsonValue },
      });
    });
    return { userId: row.userId, preferences: row.preferences, updatedAt: row.updatedAt };
  }
}
