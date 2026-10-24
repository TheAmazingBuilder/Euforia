/**
 * OCR recognition SETS (V2 spec §1/§2/§14/§15/§18) - the multi-screenshot
 * orchestration service.
 *
 * Architectural position (§27/§36):
 *   - each member screenshot runs the FULL single-image pipeline (validation
 *     → storage → engine → domain validation) through OcrService - the set
 *     NEVER re-implements recognition, it GROUPS it;
 *   - the FUSED draft is evidence (agreement boosts, conflicts recorded) -
 *     the user review remains the authority (V2 §103) and confirmation goes
 *     through the SAME Trading Core bridge as the single path (§77);
 *   - member recognitions are NEVER destroyed by fusion (V2 §15) - the set
 *     references them, deletes of the set leave them intact;
 *   - idempotency: the fused import ref is `ocr:set:<setId>` - deterministic,
 *     replay-safe through Trading Core's external-ref dedup (§79).
 */
import { Injectable } from "@nestjs/common";

import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/app-error";
import type {
  OcrCorrectionRecord,
  OcrSet,
  OcrSetMember,
} from "../../shared/contracts";
import { OcrSetRepository, type OcrSetFusedPayload, type OcrSetRow } from "./ocr.repository";
import {
  OCR_ERROR_CODES,
  OcrService,
  applyCorrectionsSafe,
  canonicalizeCorrections,
  toRecognitionDto,
} from "./ocr.service";
import { collectCorrectionPatterns } from "./ocr.logic";
import type { OcrRecognition } from "../../shared/contracts";
import { OcrRateLimiterService } from "./ocr-rate-limiter.service";
import { OcrTradeImportService } from "./ocr-trade-import.service";
import { AccountsRepository } from "../accounts/accounts.repository";
import { SecurityEventService } from "../security/security-event.service";
import {
  buildFusedTimeline,
  deriveFusedIssues,
  fusedQualityScore,
  fuseMemberFields,
  type FusionMember,
} from "./fusion.logic";

export interface OcrSetDto {
  set: OcrSet;
}

@Injectable()
export class OcrSetService {
  constructor(
    private readonly sets: OcrSetRepository,
    private readonly ocr: OcrService,
    private readonly tradeImport: OcrTradeImportService,
    private readonly accounts: AccountsRepository,
    private readonly securityEvents: SecurityEventService,
    private readonly limiter: OcrRateLimiterService,
  ) {}

  // ── Creation (V2 §1/§2 - one session, N screenshots, reading order) ──────

  async createSet(input: {
    userId: string;
    imageDataUrls: string[];
    requestedProfile: "TRADE_SUMMARY";
    requestId: string | null;
    accountId?: string | null;
  }): Promise<OcrSetDto> {
    // Ownership check of the ACCOUNTS choice BEFORE anything persists (§39).
    if (input.accountId) {
      const account = await this.accounts.findAccountForUser(input.accountId, input.userId);
      if (!account) {
        throw new NotFoundError("Trading account not found.", OCR_ERROR_CODES.ACCOUNT_NOT_FOUND);
      }
    }

    // Each member runs the full single-image pipeline (validation, storage,
    // engine, domain validation) - and consumes one upload-rate slot per
    // image, the same discipline as individual uploads (documented, honest).
    const memberDtos: OcrRecognition[] = [];
    for (const imageDataUrl of input.imageDataUrls) {
      memberDtos.push(
        (
          await this.ocr.createRecognition({
            userId: input.userId,
            imageDataUrl,
            requestedProfile: input.requestedProfile,
            requestId: input.requestId,
            accountId: input.accountId ?? null,
          })
        ).recognition,
      );
    }

    // One recognition belongs to AT MOST ONE set position - the same bytes
    // twice would collapse onto the same row (idempotency, §32). An honest
    // 400 beats a constraint violation (V2 §2: grouping is explicit).
    const distinctIds = new Set(memberDtos.map((dto) => dto.id));
    if (distinctIds.size !== memberDtos.length) {
      throw new ValidationError(
        "The same screenshot appears more than once in this set.",
        [{ path: "imageDataUrls", message: "screenshots must be distinct" }],
        "OCR_SET_DUPLICATE_IMAGE",
      );
    }

    const set = await this.sets.createSetWithItems(
      input.userId,
      memberDtos.map((dto) => dto.id),
    );
    await this.fuseAndPersist(input.userId, set);

    await this.securityEvents.record({
      userId: input.userId,
      type: "OCR_UPLOAD",
      actor: input.userId,
      context: `recognition set created with ${memberDtos.length} screenshots`,
      outcome: "SUCCESS",
    });

    return this.getSet({ userId: input.userId, id: set.id });
  }

  // ── Reads (V2 §62 - sets live in the history surface) ────────────────────

  async getSet(input: { userId: string; id: string }): Promise<OcrSetDto> {
    const row = await this.sets.findForUser(input.id, input.userId);
    if (!row) throw new NotFoundError("Recognition set not found.");
    return this.toSetDto(row);
  }

  async listSets(input: {
    userId: string;
    limit: number;
    cursor: { createdAt: Date; id: string } | null;
  }): Promise<{ items: OcrSet[]; nextCursor: string | null }> {
    const page = await this.sets.listSetsPageForUser(input.userId, {
      limit: input.limit,
      cursor: input.cursor,
    });
    const items = await Promise.all(page.items.map((row) => this.toSetDto(row)));
    return { items: items.map((dto) => dto.set), nextCursor: page.nextCursor };
  }

  // ── Confirmation (V2 §18/§20/§58 - fused draft → canonical Trade) ────────

  async confirmSet(input: {
    userId: string;
    id: string;
    corrections: OcrCorrectionRecord;
    accountId?: string | null;
    acknowledgeDuplicateScreenshot?: boolean;
    acknowledgeDuplicateTrade?: boolean;
  }): Promise<OcrSetDto> {
    const check = this.limiter.check("confirm", input.userId);
    if (!check.allowed) {
      throw new BusinessRuleError(
        "Too many confirmation attempts. Please wait before trying again.",
        OCR_ERROR_CODES.RATE_LIMITED_CONFIRM,
      );
    }
    this.limiter.hit("confirm", input.userId);

    const row = await this.sets.findForUser(input.id, input.userId);
    if (!row) throw new NotFoundError("Recognition set not found.");

    const members = await this.loadMembers(row);
    const storedFused = row.result;

    // Idempotent replay of the SAME declared corrections (§51): a confirmed
    // set replays as a no-op success, a different payload is a conflict.
    const canonicalCorrections = canonicalizeCorrections(input.corrections);
    if (row.status === "CONFIRMED") {
      const sameCorrections =
        JSON.stringify(row.corrections ?? {}) === JSON.stringify(canonicalCorrections);
      if (sameCorrections) return this.toSetDto(row);
      throw new ConflictError("This recognition set is already confirmed.", OCR_ERROR_CODES.ALREADY_CONFIRMED);
    }
    if (row.status !== "REVIEW_REQUIRED") {
      throw new ConflictError(
        "Only a processed recognition set can be confirmed.",
        OCR_ERROR_CODES.NO_REVIEW_PENDING,
      );
    }

    // V2 §58 - the duplicate warnings are blocking at confirmation.
    const anyMemberDuplicate = members.some(
      (member) => member.duplicateOf !== null,
    );
    if (anyMemberDuplicate && input.acknowledgeDuplicateScreenshot !== true) {
      throw new ConflictError(
        "A screenshot in this set was flagged as a near-duplicate of an earlier import. Acknowledge the warning to proceed.",
        OCR_ERROR_CODES.DUPLICATE_SCREENSHOT_UNACKNOWLEDGED,
      );
    }
    if (storedFused?.possibleTradeDuplicate && input.acknowledgeDuplicateTrade !== true) {
      throw new ConflictError(
        "This set was flagged as a possible duplicate of an existing trade. Acknowledge the warning to proceed.",
        OCR_ERROR_CODES.DUPLICATE_TRADE_UNACKNOWLEDGED,
      );
    }

    if (input.accountId) {
      const account = await this.accounts.findAccountForUser(input.accountId, input.userId);
      if (!account) {
        throw new NotFoundError("Trading account not found.", OCR_ERROR_CODES.ACCOUNT_NOT_FOUND);
      }
    }

    // Corrections apply to the FUSED fields with the SAME domain rules (§21).
    const fusedMachineFields = storedFused?.fields ?? [];
    const { fields: mergedFields, correctionCount } = applyCorrectionsSafe(
      fusedMachineFields,
      canonicalCorrections,
    );

    // Re-derive the fused payload from the MERGED fields (the stored result
    // reflects what the user actually confirmed - V2 §33 discipline).
    const duplicateDetection = await this.tradeImport
      .detectTradeDuplicate({ userId: input.userId, fields: mergedFields })
      .catch(() => ({ symbolInCatalog: false, duplicate: null }));
    const storedClassification = storedFused?.classification ?? null;
    const fusedResult: OcrSetFusedPayload = {
      fields: mergedFields,
      conflicts: storedFused?.conflicts ?? [],
      issues: deriveFusedIssues({
        fields: mergedFields,
        conflicts: storedFused?.conflicts ?? [],
        classification: storedClassification,
        duplicateOf: null,
        possibleTradeDuplicate: duplicateDetection.duplicate,
        symbolInCatalog: duplicateDetection.symbolInCatalog,
      }),
      qualityScore: fusedQualityScore({
        fields: mergedFields,
        classification: storedClassification,
        duplicateOf: null,
        coherent: storedFused?.coherent ?? true,
      }),
      timeline: buildFusedTimeline({
        fusedFields: mergedFields,
        members: members.map((member) => ({
          recognitionId: member.id,
          fields: member.fields,
          createdAt: member.createdAt,
        })),
        confirmedAt: new Date().toISOString(),
      }),
      coherent: storedFused?.coherent ?? true,
      classification: storedClassification,
      possibleTradeDuplicate: duplicateDetection.duplicate === null ? null : {
        tradeId: duplicateDetection.duplicate.tradeId,
        matchedOn: [...duplicateDetection.duplicate.matchedOn],
        detectedAt: new Date().toISOString(),
      },
      symbolInCatalog: duplicateDetection.symbolInCatalog,
    };

    // Fused values → canonical Trade through the SAME bridge (§77). The set
    // scope makes the import idempotent per SET (`ocr:set:<id>`, §79).
    const outcome = await this.tradeImport.importFromConfirmation({
      userId: input.userId,
      recognitionId: row.id,
      mergedFields,
      accountId: input.accountId ?? null,
      scopeLabel: `set:${row.id}`,
    });

    const updated = await this.sets.confirmSet(row.id, {
      corrections: canonicalCorrections,
      result: fusedResult,
      tradeId: outcome.tradeId,
      tradeIds: outcome.tradeIds,
      accountId: input.accountId !== undefined ? input.accountId : undefined,
    });
    if (!updated) {
      // A concurrent confirmation won (§51) - replay the same policy.
      const winner = await this.sets.findForUser(row.id, input.userId);
      if (winner?.status === "CONFIRMED") return this.toSetDto(winner);
      throw new ConflictError("This recognition set is already confirmed.", OCR_ERROR_CODES.ALREADY_CONFIRMED);
    }

    // Corrections memory - the fused corrections are the user's declaration
    // (engine quality §2.3 semantics, advisory only).
    const machineFused = storedFused?.fields ?? [];
    const memoryEntries = collectCorrectionPatterns(machineFused, canonicalCorrections);
    if (memoryEntries.length > 0) {
      await this.securityEvents.record({
        userId: input.userId,
        type: "OCR_RESULT_CONFIRMED",
        actor: input.userId,
        context: `recognition set confirmed with ${correctionCount} correction(s) → ${outcome.tradeIds.length} trade(s)`,
        outcome: "SUCCESS",
      }).catch(() => undefined);
    } else {
      await this.securityEvents.record({
        userId: input.userId,
        type: "OCR_RESULT_CONFIRMED",
        actor: input.userId,
        context: `recognition set confirmed → ${outcome.tradeIds.length} trade(s)`,
        outcome: "SUCCESS",
      });
    }

    return this.toSetDto(updated);
  }

  // ── Deletion (V2 §15 - fusion never destroys individual results) ─────────

  async deleteSet(input: { userId: string; id: string }): Promise<{ deleted: true; id: string }> {
    const row = await this.sets.findForUser(input.id, input.userId);
    if (!row) throw new NotFoundError("Recognition set not found.");
    const deleted = await this.sets.deleteSetForUser(input.id, input.userId);
    if (!deleted) throw new NotFoundError("Recognition set not found.");
    await this.securityEvents.record({
      userId: input.userId,
      type: "OCR_RESULT_DELETED",
      actor: input.userId,
      context: `recognition set deleted (member recognitions kept)`,
      outcome: "SUCCESS",
    });
    return { deleted: true, id: input.id };
  }

  // ── Fusion core (V2 §18) ─────────────────────────────────────────────────

  /** Recognize once, then combine the members' machine fields into a draft. */
  private async fuseAndPersist(userId: string, set: OcrSetRow): Promise<void> {
    const members = await this.loadMembers(set);
    if (members.length < 2) return; // defensive - the contract enforces 2..6

    const fusionMembers: FusionMember[] = members.map((member) => ({
      recognitionId: member.id,
      fields: member.fields,
      createdAt: member.createdAt,
    }));
    const fusion = fuseMemberFields(fusionMembers);
    const classification = members[0]?.classification ?? null;
    const duplicateOf = members.find((m) => m.duplicateOf !== null)?.duplicateOf ?? null;

    const duplicateDetection = await this.tradeImport
      .detectTradeDuplicate({ userId, fields: fusion.fields })
      .catch(() => ({ symbolInCatalog: false, duplicate: null }));

    const payload: OcrSetFusedPayload = {
      fields: fusion.fields,
      conflicts: fusion.conflicts,
      issues: deriveFusedIssues({
        fields: fusion.fields,
        conflicts: fusion.conflicts,
        classification,
        duplicateOf,
        possibleTradeDuplicate: duplicateDetection.duplicate,
        symbolInCatalog: duplicateDetection.symbolInCatalog,
      }),
      qualityScore: fusedQualityScore({
        fields: fusion.fields,
        classification,
        duplicateOf,
        coherent: fusion.coherent,
      }),
      timeline: buildFusedTimeline({ fusedFields: fusion.fields, members: fusionMembers, confirmedAt: null }),
      coherent: fusion.coherent,
      classification,
      possibleTradeDuplicate: duplicateDetection.duplicate === null ? null : {
        tradeId: duplicateDetection.duplicate.tradeId,
        matchedOn: [...duplicateDetection.duplicate.matchedOn],
        detectedAt: new Date().toISOString(),
      },
      symbolInCatalog: duplicateDetection.symbolInCatalog,
    };
    await this.sets.updateSetResult(set.id, payload);
  }

  /** Member rows in reading order (the DTOs already carry everything). */
  private async loadMembers(set: OcrSetRow) {
    const rows = await this.sets.findMemberRecognitions(set.id, set.userId);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return set.items
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => byId.get(item.recognitionId))
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .map((row) => {
        const dto = toRecognitionDto(row);
        return {
          id: dto.id,
          fields: dto.fields,
          classification: dto.classification,
          duplicateOf: dto.duplicateOf,
          createdAt: dto.createdAt,
        };
      });
  }

  /** OcrSetRow + member recognitions → the wire DTO (V2 contract). */
  private async toSetDto(row: OcrSetRow): Promise<OcrSetDto> {
    const memberRows = await this.sets.findMemberRecognitions(row.id, row.userId);
    const dtoById = new Map(memberRows.map((member) => [member.id, toRecognitionDto(member)]));
    const members: OcrSetMember[] = row.items
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => {
        const dto = dtoById.get(item.recognitionId);
        if (!dto) throw new NotFoundError("Recognition set member is missing.");
        return { order: item.order, recognitionId: item.recognitionId, recognition: dto };
      });

    const result = row.result;
    return {
      set: {
        id: row.id,
        status: row.status as OcrSet["status"],
        members,
        fused: result
          ? {
              fields: result.fields,
              conflicts: result.conflicts ?? [],
              issues: result.issues ?? [],
              qualityScore: result.qualityScore ?? null,
              timeline: result.timeline ?? [],
              coherent: result.coherent ?? true,
            }
          : null,
        corrections: row.corrections,
        tradeId: row.tradeId,
        tradeIds: row.tradeIds,
        accountId: row.accountId,
        confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    };
  }
}
