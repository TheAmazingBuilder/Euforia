import { Module } from "@nestjs/common";

import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { PersonalEventsController } from "./personal-events.controller";
import { PersonalEventsRepository } from "./personal-events.repository";
import { PersonalEventsService } from "./personal-events.service";

@Module({
  imports: [PrismaModule],
  controllers: [PersonalEventsController],
  providers: [PersonalEventsRepository, PersonalEventsService],
})
export class PersonalEventsModule {}
