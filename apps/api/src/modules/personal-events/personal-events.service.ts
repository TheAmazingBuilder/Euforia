import { Injectable, InternalServerErrorException } from "@nestjs/common";

import { personalEventsStateSchema, type PersonalEventsState } from "../../shared/contracts";
import { PersonalEventsRepository } from "./personal-events.repository";

/** User-scoped application service for the personal calendar board. */
@Injectable()
export class PersonalEventsService {
  constructor(private readonly repository: PersonalEventsRepository) {}

  async getState(userId: string) {
    const row = await this.repository.findByUserId(userId);
    if (!row) return { state: null };

    const parsed = personalEventsStateSchema.safeParse(row.data);
    if (!parsed.success) {
      throw new InternalServerErrorException(
        "The saved Events board could not be read. No calendar data was overwritten.",
      );
    }
    return { state: parsed.data, updatedAt: row.updatedAt.toISOString() };
  }

  async saveState(userId: string, input: PersonalEventsState) {
    const state = personalEventsStateSchema.parse(input);
    const saved = await this.repository.saveForUser(userId, state);
    const verified = personalEventsStateSchema.safeParse(saved.data);
    if (!verified.success) {
      throw new InternalServerErrorException(
        "The saved Events board could not be verified after writing.",
      );
    }
    return { state: verified.data, updatedAt: saved.updatedAt.toISOString() };
  }
}
