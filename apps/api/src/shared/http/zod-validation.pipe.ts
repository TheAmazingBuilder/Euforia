import type { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { ValidationError } from "../errors/app-error";

/**
 * Global request validation over Zod contracts.
 *
 * Binds route payloads (body / query / param) to a Zod schema — ideally one
 * coming from the shared contracts barrel (`src/shared/contracts`), so the
 * API cannot drift from the frontend contract. Parsing happens BEFORE any
 * domain logic sees the value (Phase 1 mandate §12); failures are mapped to
 * `400 { error: "ValidationError", issues }` — the exact envelope the
 * frontend already renders.
 *
 * Usage:
 *   @Post()
 *   create(@Body(new ZodValidationPipe(CreateTradeSchema)) dto: CreateTradeInput) { … }
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    // Nothing to validate (e.g. no body on GET) — pass through untouched.
    if (value === undefined || value === null) {
      return value;
    }

    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new ValidationError(
        "The request payload is invalid.",
        parsed.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          message: issue.message,
        })),
      );
    }
    return parsed.data;
  }
}
