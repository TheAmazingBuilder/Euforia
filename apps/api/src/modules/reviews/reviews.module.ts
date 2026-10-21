/**
 * Reviews bounded context — the Trade Review workspace + Goals engine.
 */
import { Module } from "@nestjs/common";
import { GoalsController, ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ReviewsController, GoalsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
