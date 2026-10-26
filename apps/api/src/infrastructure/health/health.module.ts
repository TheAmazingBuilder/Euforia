import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaModule } from "../prisma/prisma.module";

/** Infrastructure health module - see health.controller.ts for the contract. */
@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
})
export class HealthModule {}
