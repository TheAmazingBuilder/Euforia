/**
 * Eco-Calendar bounded context - global macro releases + the per-user
 * trading-calendar overlay (blocks / news import / range view).
 */
import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { EcoCalendarController } from "./eco-calendar.controller";
import { EcoCalendarService } from "./eco-calendar.service";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [EcoCalendarController],
  providers: [EcoCalendarService],
})
export class EcoCalendarModule {}
