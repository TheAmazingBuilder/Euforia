/**
 * Academy HTTP surface (B12) - 33 routes mirroring the MSW handlers 1:1:
 * catalog, overview, progress, course/lesson content (checkpoints graded
 * server-side), lesson notes, completion, quizzes, glossary, search,
 * bookmarks, practice (log + stats + 4 engine-generated drills), scenarios,
 * flashcards (Leitner SRS), category certifications (exams), milestones,
 * journal-driven suggestions, events and the study task manager. All
 * authenticated (global guard), user-scoped (§34).
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import type { AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { CurrentUser } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import {
  academyBookmarkToggleInputSchema,
  academyCheckpointInputSchema,
  academyEventRegisterInputSchema,
  academyFlashcardReviewInputSchema,
  academyNoteInputSchema,
  academyPracticeLogInputSchema,
  academyQuizSubmitInputSchema,
  academyTaskCreateInputSchema,
  academyTaskDeleteInputSchema,
  academyTaskToggleInputSchema,
} from "../../shared/contracts";
import { AcademyService } from "./academy.service";

const academyQuerySchema = z.object({ q: z.string().optional() });

@Controller("academy")
export class AcademyController {
  constructor(private readonly academy: AcademyService) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  /** GET /academy/catalog - categories, course cards, guided paths. */
  @Get("catalog")
  async catalog(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.getCatalog(principal.userId);
  }

  /** GET /academy/overview - learning dashboard. */
  @Get("overview")
  async overview(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.getOverview(principal.userId);
  }

  /** GET /academy/progress - aggregates. */
  @Get("progress")
  async progress(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.getProgress(principal.userId);
  }

  /** GET /academy/courses/:courseId - course detail. */
  @Get("courses/:courseId")
  async course(@CurrentUser() principal: AuthPrincipal, @Param("courseId") courseId: string) {
    return this.academy.getCourseDetail(principal.userId, courseId);
  }

  /** GET /academy/lessons/:lessonId - full lesson (view tracked). */
  @Get("lessons/:lessonId")
  async lesson(@CurrentUser() principal: AuthPrincipal, @Param("lessonId") lessonId: string) {
    return this.academy.getLesson(principal.userId, lessonId);
  }

  /** POST /academy/lessons/:lessonId/complete - mark done (idempotent). */
  @Post("lessons/:lessonId/complete")
  async completeLesson(@CurrentUser() principal: AuthPrincipal, @Param("lessonId") lessonId: string) {
    return this.academy.completeLesson(principal.userId, lessonId);
  }

  /** POST /academy/lessons/:lessonId/checkpoint - mid-lesson quick check. */
  @Post("lessons/:lessonId/checkpoint")
  async checkpoint(
    @CurrentUser() principal: AuthPrincipal,
    @Param("lessonId") lessonId: string,
    @Body(new ZodValidationPipe(academyCheckpointInputSchema)) payload: unknown,
  ) {
    return this.academy.submitCheckpoint(
      principal.userId,
      lessonId,
      payload as z.infer<typeof academyCheckpointInputSchema>,
    );
  }

  /** PUT /academy/lessons/:lessonId/notes - save the personal note. */
  @Put("lessons/:lessonId/notes")
  async saveNote(
    @CurrentUser() principal: AuthPrincipal,
    @Param("lessonId") lessonId: string,
    @Body(new ZodValidationPipe(academyNoteInputSchema)) payload: z.infer<typeof academyNoteInputSchema>,
  ) {
    return this.academy.saveLessonNote(principal.userId, lessonId, payload);
  }

  /** GET /academy/quizzes/:quizId - public questions (answers stripped). */
  @Get("quizzes/:quizId")
  async quiz(@CurrentUser() principal: AuthPrincipal, @Param("quizId") quizId: string) {
    return this.academy.getQuiz(principal.userId, quizId);
  }

  /** POST /academy/quizzes/:quizId/attempts - graded server-side. */
  @Post("quizzes/:quizId/attempts")
  async submitQuiz(
    @CurrentUser() principal: AuthPrincipal,
    @Param("quizId") quizId: string,
    @Body(new ZodValidationPipe(academyQuizSubmitInputSchema)) payload: unknown,
  ) {
    return this.academy.submitQuizAttempt(
      principal.userId,
      quizId,
      payload as z.infer<typeof academyQuizSubmitInputSchema>,
    );
  }

  /** GET /academy/glossary?q= - searchable term library. */
  @Get("glossary")
  async glossary(@CurrentUser() principal: AuthPrincipal, @Query(new ZodValidationPipe(academyQuerySchema)) query: { q?: string }) {
    return this.academy.getGlossary(principal.userId, query.q);
  }

  /** GET /academy/search?q= - courses + lessons + glossary. */
  @Get("search")
  async search(@CurrentUser() principal: AuthPrincipal, @Query(new ZodValidationPipe(academyQuerySchema)) query: { q?: string }) {
    return this.academy.search(principal.userId, query.q ?? "");
  }

  /** GET /academy/bookmarks - newest first. */
  @Get("bookmarks")
  async bookmarks(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.getBookmarks(principal.userId);
  }

  /** POST /academy/bookmarks - toggle by (kind, refId). */
  @Post("bookmarks")
  async toggleBookmark(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(academyBookmarkToggleInputSchema)) payload: z.infer<typeof academyBookmarkToggleInputSchema>,
  ) {
    return this.academy.toggleBookmark(principal.userId, payload);
  }

  /** POST /academy/practice/log - one honest ledger row. */
  @Post("practice/log")
  async practiceLog(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(academyPracticeLogInputSchema)) payload: z.infer<typeof academyPracticeLogInputSchema>,
  ) {
    return this.academy.logPractice(principal.userId, payload);
  }

  /** GET /academy/practice/pattern-drill - weakness bank resurfaces. */
  @Get("practice/pattern-drill")
  async patternDrill(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.patternDrill(principal.userId);
  }

  /** GET /academy/practice/sr-drill - engine-generated random walk. */
  @Get("practice/sr-drill")
  async srDrill(@CurrentUser() principal: AuthPrincipal) {
    void principal;
    return this.academy.srDrill();
  }

  /** GET /academy/practice/position-drill - randomized sizing arithmetic. */
  @Get("practice/position-drill")
  async positionDrill(@CurrentUser() principal: AuthPrincipal) {
    void principal;
    return this.academy.positionDrill();
  }

  /** GET /academy/practice/zone-drill - supply/demand band reading. */
  @Get("practice/zone-drill")
  async zoneDrill(@CurrentUser() principal: AuthPrincipal) {
    void principal;
    return this.academy.zoneDrill();
  }

  /** GET /academy/practice/stats - per-drill accuracy + recent rows. */
  @Get("practice/stats")
  async practiceStats(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.practiceStats(principal.userId);
  }

  /** GET /academy/scenarios - self-paced decision sequences. */
  @Get("scenarios")
  async scenarios(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.getScenarios(principal.userId);
  }

  /** GET /academy/flashcards - due queue (daily cap) + free practice. */
  @Get("flashcards")
  async flashcards(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.getFlashcards(principal.userId);
  }

  /** POST /academy/flashcards/review - Leitner box update. */
  @Post("flashcards/review")
  async flashcardReview(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(academyFlashcardReviewInputSchema)) payload: z.infer<typeof academyFlashcardReviewInputSchema>,
  ) {
    return this.academy.reviewFlashcard(principal.userId, payload);
  }

  /** GET /academy/certifications - the exam ladder per category. */
  @Get("certifications")
  async certifications(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.getCertifications(principal.userId);
  }

  /** GET /academy/exams/:categoryId - exam paper (public questions). */
  @Get("exams/:categoryId")
  async exam(@CurrentUser() principal: AuthPrincipal, @Param("categoryId") categoryId: string) {
    return this.academy.getExamPaper(principal.userId, categoryId);
  }

  /** POST /academy/exams/:categoryId/attempts - graded + tiered. */
  @Post("exams/:categoryId/attempts")
  async submitExam(
    @CurrentUser() principal: AuthPrincipal,
    @Param("categoryId") categoryId: string,
    @Body(new ZodValidationPipe(academyQuizSubmitInputSchema)) payload: unknown,
  ) {
    return this.academy.submitExamAttempt(
      principal.userId,
      categoryId,
      payload as z.infer<typeof academyQuizSubmitInputSchema>,
    );
  }

  /** GET /academy/milestones - computed from real state. */
  @Get("milestones")
  async milestones(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.getMilestones(principal.userId);
  }

  /** GET /academy/suggestions - journal evidence → lesson links. */
  @Get("suggestions")
  async suggestions(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.getSuggestions(principal.userId);
  }

  /** GET /academy/events - upcoming + past (replay chips). */
  @Get("events")
  async events(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.getEvents(principal.userId);
  }

  /** POST /academy/events/register - toggle (past events cannot be joined). */
  @Post("events/register")
  async registerEvent(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(academyEventRegisterInputSchema)) payload: z.infer<typeof academyEventRegisterInputSchema>,
  ) {
    return this.academy.registerEvent(principal.userId, payload);
  }

  /** GET /academy/tasks - the study board (lazy seeded). */
  @Get("tasks")
  async tasks(@CurrentUser() principal: AuthPrincipal) {
    return this.academy.getTasks(principal.userId);
  }

  /** POST /academy/tasks - create a custom study task. */
  @Post("tasks")
  @HttpCode(HttpStatus.CREATED)
  async createTask(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(academyTaskCreateInputSchema)) payload: z.infer<typeof academyTaskCreateInputSchema>,
  ) {
    return this.academy.createTask(principal.userId, payload);
  }

  /** POST /academy/tasks/toggle - done/undone (XP accrues on done). */
  @Post("tasks/toggle")
  async toggleTask(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(academyTaskToggleInputSchema)) payload: z.infer<typeof academyTaskToggleInputSchema>,
  ) {
    return this.academy.toggleTask(principal.userId, payload);
  }

  /** POST /academy/tasks/delete - remove from the board. */
  @Post("tasks/delete")
  async deleteTask(
    @CurrentUser() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(academyTaskDeleteInputSchema)) payload: z.infer<typeof academyTaskDeleteInputSchema>,
  ) {
    return this.academy.deleteTask(principal.userId, payload);
  }
}
