import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { TradesModule } from "../trades/trades.module";
import { OryonAnalysisController } from "./oryon-analysis.controller";
import { OryonAnalysisRepository } from "./oryon-analysis.repository";
import { OryonAnalysisService } from "./oryon-analysis.service";

@Module({
  imports: [PrismaModule, TradesModule],
  controllers: [OryonAnalysisController],
  providers: [OryonAnalysisRepository, OryonAnalysisService],
  exports: [OryonAnalysisRepository],
})
export class OryonModule {}
