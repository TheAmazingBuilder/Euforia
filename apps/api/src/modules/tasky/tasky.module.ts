import { Module } from "@nestjs/common";

import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { TaskyController } from "./tasky.controller";
import { TaskyRepository } from "./tasky.repository";
import { APP_CONFIG, type AppConfig } from "../../config/app-config";
import { TaskyService } from "./tasky.service";
import { TaskyAttachmentService } from "./tasky-attachment.service";
import { TaskyAttachmentRepository } from "./tasky-attachment.repository";
import { LocalDiskTaskyAttachmentStorage } from "./local-disk-tasky-attachment-storage";
import { TASKY_ATTACHMENT_STORAGE } from "./tasky-attachment-storage.port";

/** The independent Tasky Kanban bounded context. */
@Module({
  imports: [PrismaModule],
  controllers: [TaskyController],
  providers: [
    TaskyRepository,
    TaskyService,
    TaskyAttachmentRepository,
    TaskyAttachmentService,
    {
      provide: TASKY_ATTACHMENT_STORAGE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new LocalDiskTaskyAttachmentStorage(config.tasky.attachmentsRoot),
    },
  ],
})
export class TaskyModule {}
