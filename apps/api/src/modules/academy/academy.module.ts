/**
 * Academy bounded context (B12) - the learning domain: 12 categories of
 * courses with lesson content (visual blocks), server-graded quizzes and
 * mid-lesson checkpoints, personal lesson notes, bookmarks, glossary +
 * full-text search, practice (4 engine-generated drills + honest ledger),
 * scenarios, flashcards (Leitner SRS), category certifications (exam
 * ladder), milestones, journal-driven suggestions, live events and the
 * study task manager.
 *
 * Content lives in `packages/shared/src/content/academy` - the SAME
 * registry the browser mock re-exports, so mock and backend never drift.
 *
 * Dependency graph (acyclic):
 *   AcademyModule → AcademyRepository (own Prisma boundary - STATE | TASK |
 *                   EVENT_REG rows)
 *                 → TradesModule (closed trades for suggestions)
 *
 * Security: routes are all authenticated (global guard), user-scoped (§34).
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { TradesModule } from "../trades/trades.module";
import { AcademyController } from "./academy.controller";
import { AcademyRepository } from "./academy.repository";
import { AcademyService } from "./academy.service";

@Module({
  imports: [PrismaModule, TradesModule],
  controllers: [AcademyController],
  providers: [AcademyRepository, AcademyService],
})
export class AcademyModule {}
