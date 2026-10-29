import { Module } from "@nestjs/common";

import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { TaskyController } from "./tasky.controller";
import { TaskyRepository } from "./tasky.repository";
import { TaskyService } from "./tasky.service";

/** The independent Tasky Kanban bounded context. */
@Module({
  imports: [PrismaModule],
  controllers: [TaskyController],
  providers: [TaskyRepository, TaskyService],
})
export class TaskyModule {}
