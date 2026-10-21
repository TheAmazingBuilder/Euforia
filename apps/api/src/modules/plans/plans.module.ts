import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { TradesModule } from "../trades/trades.module";
import { PlanController } from "./plan.controller";
import { PlanRepository } from "./plan.repository";
import { PlanService } from "./plan.service";

@Module({
  imports: [PrismaModule, TradesModule],
  controllers: [PlanController],
  providers: [PlanRepository, PlanService],
  exports: [PlanRepository],
})
export class PlansModule {}
