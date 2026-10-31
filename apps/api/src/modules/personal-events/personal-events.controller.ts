import { Body, Controller, Get, Put } from "@nestjs/common";

import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import {
  personalEventsStateSchema,
  type PersonalEventsState,
} from "../../shared/contracts";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { PersonalEventsService } from "./personal-events.service";

/** Authenticated HTTP contract for the current user's personal Events board. */
@Controller("events")
export class PersonalEventsController {
  constructor(private readonly events: PersonalEventsService) {}

  @Get()
  async getState(@CurrentUser() principal: AuthPrincipal) {
    return this.events.getState(principal.userId);
  }

  @Put()
  async saveState(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(personalEventsStateSchema)) state: PersonalEventsState,
  ) {
    return this.events.saveState(principal.userId, state);
  }
}
