/**
 * Nofy content domain (Phase 12) - PURE functions over the shared block
 * contract. No Prisma, no Nest: this layer is unit-testable in isolation.
 *
 * Content model (Phase 12 §10): notes are ordered block lists. Blocks are
 * the flexible payload (shared `NofyBlock` contract) while core
 * relationships stay relational. The server keeps a plain-text projection
 * of every note (search + excerpt + word count) that MUST match the mock
 * engine's `textOfBlocks` - the mock is the parity reference.
 *
 * Content security (§11): the editor speaks BLOCK JSON, never HTML. Nothing
 * here accepts raw HTML, so no server-side HTML sanitization is needed -
 * instead the payload is schema-validated (closed type vocabulary + size
 * caps, shared `nofyBlockInputSchema`) and image sources are protocol-
 * restricted (data:image and https/http only - javascript:/vbscript:/data:
 * text/html payloads are rejected before storage). Unknown block shapes
 * coming out of the database are DROPPED defensively (never rendered).
 */
import type { NofyBlock, NofyBlockInput, NofyBlockType } from "../../../shared/contracts";

/** Block types whose `text` participates in the plain-text projection. */
const TEXT_BEARING: ReadonlySet<NofyBlockType> = new Set([
  "paragraph",
  "h1",
  "h2",
  "h3",
  "bullet",
  "numbered",
  "todo",
  "quote",
  "callout",
  "code",
]);

/**
 * Plain-text projection of a block list - the single input for search,
 * excerpts and word counts (mock parity: textOfBlocks).
 */
export function textOfBlocks(blocks: NofyBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (TEXT_BEARING.has(block.type) && block.text.trim() !== "") parts.push(block.text.trim());
    if (block.type === "table" && block.rows) {
      for (const row of block.rows) parts.push(row.join(" - "));
    }
    if (block.type === "image" && block.caption) parts.push(block.caption);
  }
  return parts.join("\n");
}

export function wordCountOf(text: string): number {
  return text.split(/\s+/).filter((word) => word !== "").length;
}

export function countWords(blocks: NofyBlock[]): number {
  return wordCountOf(textOfBlocks(blocks));
}

export function countOpenTodos(blocks: NofyBlock[]): number {
  return blocks.filter((block) => block.type === "todo" && !block.checked).length;
}

/** ~180-char excerpt from the first text-bearing blocks (mock parity). */
export function excerptOf(blocks: NofyBlock[]): string {
  const text = textOfBlocks(blocks).replace(/\n+/g, " · ");
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

/**
 * Search snippet centered on the first full-text hit (mock parity), or the
 * excerpt when only the title/tags matched.
 */
export function searchSnippet(blocks: NofyBlock[], query: string): string {
  const fullText = textOfBlocks(blocks);
  const index = fullText.toLowerCase().indexOf(query);
  if (index === -1) return excerptOf(blocks);
  const start = Math.max(0, index - 60);
  const end = Math.min(fullText.length, index + query.length + 80);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < fullText.length ? "…" : "";
  return `${prefix}${fullText.slice(start, end).replace(/\n+/g, " ")}${suffix}`;
}

/**
 * Storage projection of a submitted block: strips client-supplied ref
 * display fields (label/meta/href) - refs persist as relational pointers
 * (kind + id) and are re-resolved server-side on every read (§18/§24).
 */
export function normalizeBlocks(input: NofyBlockInput[]): NofyBlock[] {
  return input.map((block) => {
    const out: NofyBlock = { id: block.id, type: block.type, text: block.text ?? "" };
    if (block.checked !== undefined) out.checked = block.checked;
    if (block.tone !== undefined) out.tone = block.tone;
    if (block.src !== undefined) out.src = block.src;
    if (block.alt !== undefined) out.alt = block.alt;
    if (block.caption !== undefined) out.caption = block.caption;
    if (block.rows !== undefined) out.rows = block.rows;
    if (block.ref !== undefined && block.ref !== null) {
      out.ref = { kind: block.ref.kind, id: block.ref.id };
    }
    return out;
  });
}

/**
 * Defensive runtime parser for blocks read back from the JSON column.
 * The shared schema validated them on the way in; this guards against
 * hand-migrated/corrupt rows - unknown shapes are dropped, never served.
 */
export function parseStoredBlocks(value: unknown): NofyBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: NofyBlock[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== "object") continue;
    const candidate = raw as Partial<NofyBlock>;
    if (typeof candidate.id !== "string" || candidate.id.length === 0) continue;
    if (typeof candidate.type !== "string") continue;
    const block: NofyBlock = {
      id: candidate.id,
      type: candidate.type as NofyBlockType,
      text: typeof candidate.text === "string" ? candidate.text : "",
    };
    if (typeof candidate.checked === "boolean") block.checked = candidate.checked;
    if (typeof candidate.tone === "string") block.tone = candidate.tone as NofyBlock["tone"];
    if (typeof candidate.src === "string") block.src = candidate.src;
    if (typeof candidate.alt === "string") block.alt = candidate.alt;
    if (typeof candidate.caption === "string") block.caption = candidate.caption;
    if (Array.isArray(candidate.rows)) block.rows = candidate.rows as string[][];
    if (
      candidate.ref !== null &&
      typeof candidate.ref === "object" &&
      typeof (candidate.ref as { kind?: unknown }).kind === "string" &&
      typeof (candidate.ref as { id?: unknown }).id === "string"
    ) {
      const ref = candidate.ref as { kind: NonNullable<NofyBlock["ref"]>["kind"]; id: string };
      block.ref = { kind: ref.kind, id: ref.id };
    }
    blocks.push(block);
  }
  return blocks;
}

const SAFE_IMAGE_SRC = /^(https?:\/\/|data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,)/i;

/**
 * Content security (§11 - "reject unsafe protocols"): image sources are
 * limited to http(s) URLs and base64 data-image payloads. Everything else
 * (javascript:, data:text/html, …) is rejected BEFORE storage - the client
 * renders `src` in a plain <img>, so this is the server-side gate.
 */
export function isSafeImageSrc(src: string | undefined): boolean {
  if (src === undefined) return true;
  return SAFE_IMAGE_SRC.test(src);
}

/** Case-insensitive uniqueness key for folders and tags. */
export function nameKeyOf(name: string): string {
  return name.trim().toLowerCase();
}

/** Tag normalization (mock parity): trim + strip a leading '#'. */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/^#/, "");
}

/** Fresh block id - distinct id space per note, regenerated on copies. */
export function newBlockId(): string {
  return `nb-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
