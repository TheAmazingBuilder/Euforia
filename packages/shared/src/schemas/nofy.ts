import { z } from "zod";

/**
 * Nofy contracts — the personal trading knowledge & notes workspace.
 *
 * Nofy is an independent first-class module (ACADEMY section, beside the
 * Academy module) that owns the trader's notes, ideas, research and
 * documentation. Notes are composed of ordered BLOCKS (Notion-style), stored
 * as structured data so block-level operations (reorder, query, version)
 * stay possible. Trading-entity references are real relational pointers
 * (kind + id) resolved server-side at read time — never plain-text names.
 */

// ── Blocks ───────────────────────────────────────────────────────────────────

export const nofyBlockTypeSchema = z.enum([
  "paragraph",
  "h1",
  "h2",
  "h3",
  "bullet",
  "numbered",
  "todo",
  "quote",
  "callout",
  "divider",
  "code",
  "table",
  "image",
  "ref",
]);
export type NofyBlockType = z.infer<typeof nofyBlockTypeSchema>;

/** Callout semantic tones (rendered with token inks, not decorative colors). */
export const nofyCalloutToneSchema = z.enum(["info", "tip", "warn", "risk"]);
export type NofyCalloutTone = z.infer<typeof nofyCalloutToneSchema>;

/** Trading-entity reference kinds — resolved against real app entities. */
export const nofyRefKindSchema = z.enum([
  "TRADE",
  "STRATEGY",
  "SETUP",
  "RULE",
  "LESSON",
  "EVENT",
  "SYMBOL",
  "NOTE",
]);
export type NofyRefKind = z.infer<typeof nofyRefKindSchema>;

export type NofyRefResolved = {
  kind: NofyRefKind;
  /** Real entity id — the relational pointer, not a name. */
  id: string;
  /** Server-resolved display label (fresh at read time). */
  label: string;
  /** Server-resolved one-line metadata (symbol+side, course title, ...). */
  meta: string | null;
  /** In-app SPA href for bidirectional navigation. */
  href: string | null;
};

/**
 * A single content block. Flat, editor-friendly shape: text-bearing blocks
 * use `text` (with inline markdown **bold** / *italic* / `code` parsed at
 * render); media/table/ref blocks carry their payload in dedicated fields.
 * The server re-resolves `ref` display fields on every read so labels and
 * hrefs never go stale.
 */
export type NofyBlock = {
  id: string;
  type: NofyBlockType;
  text: string;
  checked?: boolean;
  tone?: NofyCalloutTone;
  /** image blocks: data URL or remote URL. */
  src?: string;
  alt?: string;
  caption?: string;
  /** table blocks: first row is the header row. */
  rows?: string[][];
  /** ref blocks: authoritative relational pointer. */
  ref?: { kind: NofyRefKind; id: string; label?: string; meta?: string | null; href?: string | null };
};

export const nofyBlockInputSchema = z.object({
  id: z.string().min(1).max(64),
  type: nofyBlockTypeSchema,
  text: z.string().max(20_000).default(""),
  checked: z.boolean().optional(),
  tone: nofyCalloutToneSchema.optional(),
  src: z.string().max(2_000_000).optional(),
  alt: z.string().max(300).optional(),
  caption: z.string().max(300).optional(),
  rows: z.array(z.array(z.string().max(2_000)).max(8)).max(200).optional(),
  ref: z
    .object({
      kind: nofyRefKindSchema,
      id: z.string().min(1).max(128),
      label: z.string().max(200).optional(),
      meta: z.string().max(200).nullable().optional(),
      href: z.string().max(300).nullable().optional(),
    })
    .optional(),
});
export type NofyBlockInput = z.infer<typeof nofyBlockInputSchema>;

export const nofyBlocksInputSchema = z.array(nofyBlockInputSchema).max(500);

// ── Folders, tags, templates ─────────────────────────────────────────────────

export type NofyFolder = {
  id: string;
  name: string;
  createdAt: string;
};

export type NofyTag = {
  id: string;
  name: string;
};

export type NofyTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string;
  blocks: NofyBlock[];
  builtIn: boolean;
  createdAt: string;
};

/** Academy origin stamped on notes created from a lesson ("Take notes"). */
export type NofyLessonRef = {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
};

// ── Note ─────────────────────────────────────────────────────────────────────

export type NofyNote = {
  id: string;
  userId: string;
  title: string;
  icon: string | null;
  folderId: string | null;
  tagIds: string[];
  favorite: boolean;
  templateId: string | null;
  lessonRef: NofyLessonRef | null;
  blocks: NofyBlock[];
  createdAt: string;
  updatedAt: string;
  lastViewedAt: string | null;
  deletedAt: string | null;
};

/** List projection — one line in My Notes / Favorites / Trash / search. */
export type NofyNoteRow = {
  id: string;
  title: string;
  icon: string | null;
  folderId: string | null;
  folderName: string | null;
  tagIds: string[];
  tagNames: string[];
  favorite: boolean;
  templateId: string | null;
  lessonRef: NofyLessonRef | null;
  /** Plain-text excerpt of the first text-bearing blocks. */
  excerpt: string;
  wordCount: number;
  blockCount: number;
  refCount: number;
  todoOpen: number;
  createdAt: string;
  updatedAt: string;
  lastViewedAt: string | null;
  deletedAt: string | null;
};

export type NofyNoteResponse = {
  note: NofyNote;
  folderName: string | null;
  tagNames: string[];
};

export type NofyNotesResponse = {
  notes: NofyNoteRow[];
  total: number;
};

export type NofyFoldersResponse = {
  folders: (NofyFolder & { noteCount: number })[];
};

export type NofyTagsResponse = {
  tags: (NofyTag & { noteCount: number })[];
};

export type NofyTemplatesResponse = {
  templates: NofyTemplate[];
};

export type NofyVersionsResponse = {
  versions: { id: string; title: string; savedAt: string; wordCount: number }[];
};

export type NofyVersionResponse = {
  version: { id: string; title: string; savedAt: string; blocks: NofyBlock[] };
};

/** Weekly note activity for the Overview (last N weeks, oldest first). */
export type NofyActivityWeek = {
  weekStart: string;
  created: number;
  edited: number;
};

export type NofyOverviewResponse = {
  totals: {
    notes: number;
    createdThisWeek: number;
    favorites: number;
    folders: number;
    tags: number;
    trashed: number;
  };
  recentEdited: NofyNoteRow[];
  recentViewed: NofyNoteRow[];
  favorites: NofyNoteRow[];
  folders: (NofyFolder & { noteCount: number })[];
  topTags: (NofyTag & { noteCount: number })[];
  activity: NofyActivityWeek[];
  templates: NofyTemplate[];
};

export type NofySearchResponse = {
  results: (NofyNoteRow & { snippet: string })[];
  total: number;
};

/** Entity picker hit — one referenceable app entity. */
export type NofyRefHit = {
  kind: NofyRefKind;
  id: string;
  label: string;
  meta: string | null;
  href: string | null;
};

export type NofyRefsResponse = {
  refs: NofyRefHit[];
};

// ── Inputs ───────────────────────────────────────────────────────────────────

export const nofyNoteCreateInputSchema = z.object({
  title: z.string().max(200).optional(),
  folderId: z.string().nullable().optional(),
  templateId: z.string().optional(),
  lessonRef: z
    .object({
      courseId: z.string().min(1),
      courseTitle: z.string().min(1),
      lessonId: z.string().min(1),
      lessonTitle: z.string().min(1),
    })
    .optional(),
  blocks: nofyBlocksInputSchema.optional(),
});
export type NofyNoteCreateInput = z.infer<typeof nofyNoteCreateInputSchema>;

/**
 * Autosave PATCH — every field optional; the server touches updatedAt only
 * when at least one meaningful field is present.
 */
export const nofyNoteUpdateInputSchema = z.object({
  title: z.string().max(200).optional(),
  icon: z.string().max(16).nullable().optional(),
  folderId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).max(24).optional(),
  favorite: z.boolean().optional(),
  blocks: nofyBlocksInputSchema.optional(),
  /** Viewing the note bumps lastViewedAt without touching updatedAt. */
  touchViewed: z.boolean().optional(),
});
export type NofyNoteUpdateInput = z.infer<typeof nofyNoteUpdateInputSchema>;

export const nofyNoteDuplicateInputSchema = z.object({
  title: z.string().max(200).optional(),
});
export type NofyNoteDuplicateInput = z.infer<typeof nofyNoteDuplicateInputSchema>;

export const nofyFolderCreateInputSchema = z.object({
  name: z.string().min(1).max(80),
});
export type NofyFolderCreateInput = z.infer<typeof nofyFolderCreateInputSchema>;

export const nofyFolderUpdateInputSchema = z.object({
  name: z.string().min(1).max(80),
});
export type NofyFolderUpdateInput = z.infer<typeof nofyFolderUpdateInputSchema>;

export const nofyTemplateCreateInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(300).default(""),
  icon: z.string().max(16).default("📄"),
  fromNoteId: z.string().optional(),
  blocks: nofyBlocksInputSchema.optional(),
});
export type NofyTemplateCreateInput = z.infer<typeof nofyTemplateCreateInputSchema>;

export const nofyTemplateInstantiateInputSchema = z.object({
  templateId: z.string().min(1),
  title: z.string().max(200).optional(),
  folderId: z.string().nullable().optional(),
});
export type NofyTemplateInstantiateInput = z.infer<typeof nofyTemplateInstantiateInputSchema>;
// ── Response schemas (read models validated by BOTH the API and the tests) ──

export const nofyBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: nofyBlockTypeSchema,
  text: z.string().max(20_000),
  checked: z.boolean().optional(),
  tone: nofyCalloutToneSchema.optional(),
  src: z.string().max(2_000_000).optional(),
  alt: z.string().max(300).optional(),
  caption: z.string().max(300).optional(),
  rows: z.array(z.array(z.string().max(2_000)).max(8)).max(200).optional(),
  ref: z
    .object({
      kind: nofyRefKindSchema,
      id: z.string().min(1).max(128),
      label: z.string().max(200).optional(),
      meta: z.string().max(200).nullable().optional(),
      href: z.string().max(300).nullable().optional(),
    })
    .optional(),
});
export type NofyBlockSchema = z.infer<typeof nofyBlockSchema>;

export const nofyLessonRefSchema = z.object({
  courseId: z.string().min(1),
  courseTitle: z.string().min(1),
  lessonId: z.string().min(1),
  lessonTitle: z.string().min(1),
});
export type NofyLessonRefSchema = z.infer<typeof nofyLessonRefSchema>;

export const nofyNoteSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  title: z.string().max(200),
  icon: z.string().max(16).nullable(),
  folderId: z.string().nullable(),
  tagIds: z.array(z.string()),
  favorite: z.boolean(),
  templateId: z.string().nullable(),
  lessonRef: nofyLessonRefSchema.nullable(),
  blocks: z.array(nofyBlockSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastViewedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});
export type NofyNoteSchema = z.infer<typeof nofyNoteSchema>;

export const nofyNoteRowSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  icon: z.string().max(16).nullable(),
  folderId: z.string().nullable(),
  folderName: z.string().nullable(),
  tagIds: z.array(z.string()),
  tagNames: z.array(z.string()),
  favorite: z.boolean(),
  templateId: z.string().nullable(),
  lessonRef: nofyLessonRefSchema.nullable(),
  excerpt: z.string(),
  wordCount: z.number().int().min(0),
  blockCount: z.number().int().min(0),
  refCount: z.number().int().min(0),
  todoOpen: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastViewedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});
export type NofyNoteRowSchema = z.infer<typeof nofyNoteRowSchema>;

export const nofyNoteResponseSchema = z.object({
  note: nofyNoteSchema,
  folderName: z.string().nullable(),
  tagNames: z.array(z.string()),
});
export type NofyNoteResponseSchema = z.infer<typeof nofyNoteResponseSchema>;

export const nofyNotesResponseSchema = z.object({
  notes: z.array(nofyNoteRowSchema),
  total: z.number().int().min(0),
});
export type NofyNotesResponseSchema = z.infer<typeof nofyNotesResponseSchema>;

export const nofyFoldersResponseSchema = z.object({
  folders: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(80),
      createdAt: z.string(),
      noteCount: z.number().int().min(0),
    }),
  ),
});
export type NofyFoldersResponseSchema = z.infer<typeof nofyFoldersResponseSchema>;

export const nofyTagsResponseSchema = z.object({
  tags: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      noteCount: z.number().int().min(0),
    }),
  ),
});
export type NofyTagsResponseSchema = z.infer<typeof nofyTagsResponseSchema>;

export const nofyTemplatesResponseSchema = z.object({
  templates: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(120),
      description: z.string().max(300),
      icon: z.string().max(16),
      blocks: z.array(nofyBlockSchema),
      builtIn: z.boolean(),
      createdAt: z.string(),
    }),
  ),
});
export type NofyTemplatesResponseSchema = z.infer<typeof nofyTemplatesResponseSchema>;

export const nofyVersionsResponseSchema = z.object({
  versions: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      savedAt: z.string(),
      wordCount: z.number().int().min(0),
    }),
  ),
});
export type NofyVersionsResponseSchema = z.infer<typeof nofyVersionsResponseSchema>;

export const nofyVersionResponseSchema = z.object({
  version: z.object({
    id: z.string().min(1),
    title: z.string(),
    savedAt: z.string(),
    blocks: z.array(nofyBlockSchema),
  }),
});
export type NofyVersionResponseSchema = z.infer<typeof nofyVersionResponseSchema>;

export const nofyActivityWeekSchema = z.object({
  weekStart: z.string(),
  created: z.number().int().min(0),
  edited: z.number().int().min(0),
});
export type NofyActivityWeekSchema = z.infer<typeof nofyActivityWeekSchema>;

export const nofyOverviewResponseSchema = z.object({
  totals: z.object({
    notes: z.number().int().min(0),
    createdThisWeek: z.number().int().min(0),
    favorites: z.number().int().min(0),
    folders: z.number().int().min(0),
    tags: z.number().int().min(0),
    trashed: z.number().int().min(0),
  }),
  recentEdited: z.array(nofyNoteRowSchema),
  recentViewed: z.array(nofyNoteRowSchema),
  favorites: z.array(nofyNoteRowSchema),
  folders: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(80),
      createdAt: z.string(),
      noteCount: z.number().int().min(0),
    }),
  ),
  topTags: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      noteCount: z.number().int().min(0),
    }),
  ),
  activity: z.array(nofyActivityWeekSchema),
  templates: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(120),
      description: z.string().max(300),
      icon: z.string().max(16),
      blocks: z.array(nofyBlockSchema),
      builtIn: z.boolean(),
      createdAt: z.string(),
    }),
  ),
});
export type NofyOverviewResponseSchema = z.infer<typeof nofyOverviewResponseSchema>;

export const nofySearchResponseSchema = z.object({
  results: z.array(nofyNoteRowSchema.extend({ snippet: z.string() })),
  total: z.number().int().min(0),
});
export type NofySearchResponseSchema = z.infer<typeof nofySearchResponseSchema>;

export const nofyRefsResponseSchema = z.object({
  refs: z.array(
    z.object({
      kind: nofyRefKindSchema,
      id: z.string().min(1),
      label: z.string(),
      meta: z.string().nullable(),
      href: z.string().nullable(),
    }),
  ),
});
export type NofyRefsResponseSchema = z.infer<typeof nofyRefsResponseSchema>;
