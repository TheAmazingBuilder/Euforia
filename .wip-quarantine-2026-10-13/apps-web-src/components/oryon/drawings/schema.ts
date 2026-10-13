import { z } from "zod";

import {
  DEFAULT_FIBONACCI_STYLE,
  DEFAULT_LINE_STYLE,
  DEFAULT_SHAPE_STYLE,
  DEFAULT_TEXT_STYLE,
  type DrawingObject,
  type DrawingKind,
} from "@/components/oryon/drawings/types";

/**
 * Persisted drawing form — Zod-validated (PRD §8.6: schema versioning from
 * day 1; unknown versions and malformed records are REJECTED, never silently
 * coerced into wrong geometry). This is the exact shape written to the
 * local persistence adapter today; a future server contract (PRD §15.2,
 * module à créer) will reuse this schema, which is why it stays pure Zod
 * with no browser dependency.
 *
 * Anchors must be finite; time > 0 (epoch ms); price > 0 (market price).
 * `price` on a vertical line's anchor is carried but geometrically unused —
 * it keeps the anchor tuple uniform and preserves the pick position.
 */

export const drawingAnchorSchema = z
  .object({
    time: z.number().finite().gt(0),
    price: z.number().finite().gt(0),
  })
  .strict();

export const drawingColorTokenSchema = z.enum([
  "accent",
  "profit",
  "loss",
  "warning",
  "textPrimary",
  "textMuted",
  "cat0",
  "cat1",
  "cat2",
  "cat3",
  "cat4",
  "cat5",
  "cat6",
]);

export const drawingLineStyleSchema = z
  .object({
    color: drawingColorTokenSchema,
    width: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    dash: z.enum(["solid", "dashed", "dotted"]),
  })
  .strict();

export const drawingShapeStyleSchema = drawingLineStyleSchema.extend({
  fill: drawingColorTokenSchema,
  fillOpacity: z.number().finite().min(0).max(1),
});

export const drawingTextStyleSchema = drawingLineStyleSchema.extend({
  fontSize: z.union([z.literal(11), z.literal(12), z.literal(14)]),
});

/** Every kind declares its exact anchor count — no variable-length arrays. */
export const drawingObjectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("trendLine"),
      anchors: z.tuple([drawingAnchorSchema, drawingAnchorSchema]),
      style: drawingLineStyleSchema,
    })
    .merge(baseObjectFields()),
  z
    .object({
      kind: z.literal("horizontalLine"),
      anchors: z.tuple([drawingAnchorSchema]),
      style: drawingLineStyleSchema,
    })
    .merge(baseObjectFields()),
  z
    .object({
      kind: z.literal("verticalLine"),
      anchors: z.tuple([drawingAnchorSchema]),
      style: drawingLineStyleSchema,
    })
    .merge(baseObjectFields()),
  z
    .object({
      kind: z.literal("ray"),
      anchors: z.tuple([drawingAnchorSchema, drawingAnchorSchema]),
      style: drawingLineStyleSchema,
    })
    .merge(baseObjectFields()),
  z
    .object({
      kind: z.literal("rectangle"),
      anchors: z.tuple([drawingAnchorSchema, drawingAnchorSchema]),
      style: drawingShapeStyleSchema,
    })
    .merge(baseObjectFields()),
  z
    .object({
      kind: z.literal("text"),
      anchors: z.tuple([drawingAnchorSchema]),
      text: z.string().max(500),
      style: drawingTextStyleSchema,
    })
    .merge(baseObjectFields()),
  z
    .object({
      kind: z.literal("fibonacci"),
      anchors: z.tuple([drawingAnchorSchema, drawingAnchorSchema]),
      style: drawingShapeStyleSchema,
    })
    .merge(baseObjectFields()),
]);

function baseObjectFields() {
  return z.object({
    id: z.string().min(1).max(128),
    locked: z.boolean(),
    hidden: z.boolean(),
    label: z.string().max(200).optional(),
    createdAt: z.number().finite().gt(0),
    updatedAt: z.number().finite().gt(0),
  });
}

/** One instrument's drawing book — the unit of persistence (PRD §8.6). */
export const drawingBookSchema = z.object({
  version: z.literal(1),
  instrumentId: z.string().min(1),
  objects: z.array(drawingObjectSchema),
  updatedAt: z.number().finite().gt(0),
});

export type DrawingBook = z.infer<typeof drawingBookSchema>;

export const DRAWING_BOOK_VERSION = 1 as const;

/** Hard book size guard (PRD §15.2: payload ≤ 512 Ko). */
export const MAX_BOOK_BYTES = 512 * 1024;
/** Hard object-count guard — keeps hit-testing and rendering predictable. */
export const MAX_OBJECTS_PER_BOOK = 300;

export class DrawingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrawingValidationError";
  }
}

function assertValidObject(object: DrawingObject): void {
  for (const anchor of object.anchors) {
    if (
      !Number.isFinite(anchor.time) ||
      anchor.time <= 0 ||
      !Number.isFinite(anchor.price) ||
      anchor.price <= 0
    ) {
      throw new DrawingValidationError(
        `invalid anchor on ${object.kind} ${object.id}`,
      );
    }
  }
}

/** Serialize a book for persistence (throws on impossible geometry). */
export function serializeDrawingBook(
  instrumentId: string,
  objects: readonly DrawingObject[],
  updatedAt: number,
): string {
  if (objects.length > MAX_OBJECTS_PER_BOOK) {
    throw new DrawingValidationError(
      `book for ${instrumentId} exceeds ${MAX_OBJECTS_PER_BOOK} objects`,
    );
  }
  for (const object of objects) assertValidObject(object);
  const book: DrawingBook = {
    version: DRAWING_BOOK_VERSION,
    instrumentId,
    objects: [...objects],
    updatedAt,
  };
  const json = JSON.stringify(book);
  if (json.length > MAX_BOOK_BYTES) {
    throw new DrawingValidationError(
      `book for ${instrumentId} exceeds ${MAX_BOOK_BYTES} bytes`,
    );
  }
  return json;
}

/**
 * Parse + validate a persisted book. Returns the objects on success, null on
 * ANY invalid record (wrong version, unknown kind, non-finite anchor, shape
 * mismatch) — callers render an empty book and log; a corrupt record never
 * crashes the workspace.
 */
export function parseDrawingBook(
  raw: string,
  instrumentId: string,
): DrawingObject[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // not JSON — corrupt, ignore
  }
  const result = drawingBookSchema.safeParse(parsed);
  if (!result.success) return null;
  const book = result.data;
  // A book is only valid for its instrument — a mismatched record must not
  // leak another instrument's drawings (storage-key mix guard).
  if (book.instrumentId !== instrumentId) return null;
  return book.objects as DrawingObject[];
}

/** Default style for a new object of the given kind. */
export function defaultStyleFor(kind: DrawingKind) {
  switch (kind) {
    case "rectangle":
      return DEFAULT_SHAPE_STYLE;
    case "fibonacci":
      return DEFAULT_FIBONACCI_STYLE;
    case "text":
      return DEFAULT_TEXT_STYLE;
    default:
      return DEFAULT_LINE_STYLE;
  }
}
