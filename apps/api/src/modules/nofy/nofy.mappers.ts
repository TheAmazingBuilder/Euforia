/**
 * Nofy mappers (Phase 12) - repository rows → shared wire contracts.
 * Pure functions; the excerpt/wordCount/refCount/todoOpen projections are
 * computed from the parsed blocks so list rows stay server-authoritative
 * and light (no block payload in list responses - only excerpts).
 *
 * Ref blocks are NOT resolved in list rows (mock parity: the pointer is
 * stored data; fresh label/meta/href resolution happens in NOTE responses
 * only, where the editor consumes it).
 */
import type {
  NofyActivityWeek,
  NofyBlock,
  NofyFolder,
  NofyLessonRef,
  NofyNote,
  NofyNoteRow,
  NofyRefKind,
  NofyTag,
  NofyTemplate,
} from "../../shared/contracts";

import type { NofyFolderData, NofyNoteData, NofyTagData, NofyTemplateData } from "./nofy.repository";
import {
  countOpenTodos,
  countWords,
  excerptOf,
  parseStoredBlocks,
} from "./domain/nofy-content";

/** Defensive parse of the lessonRef JSON column → NofyLessonRef | null. */
export function parseLessonRef(value: unknown): NofyLessonRef | null {
  if (value === null || value === undefined || typeof value !== "object") return null;
  const candidate = value as Partial<NofyLessonRef>;
  if (
    typeof candidate.courseId === "string" &&
    typeof candidate.courseTitle === "string" &&
    typeof candidate.lessonId === "string" &&
    typeof candidate.lessonTitle === "string"
  ) {
    return {
      courseId: candidate.courseId,
      courseTitle: candidate.courseTitle,
      lessonId: candidate.lessonId,
      lessonTitle: candidate.lessonTitle,
    };
  }
  return null;
}

const iso = (at: Date): string => at.toISOString();

/** Full note projection - blocks parsed; refs resolved by the caller. */
export function toNote(data: NofyNoteData, blocks: NofyBlock[]): NofyNote {
  return {
    id: data.id,
    userId: data.userId,
    title: data.title,
    icon: data.icon,
    folderId: data.folderId,
    tagIds: data.tagIds,
    favorite: data.favorite,
    templateId: data.templateId,
    lessonRef: parseLessonRef(data.lessonRef),
    blocks,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
    lastViewedAt: data.lastViewedAt === null ? null : iso(data.lastViewedAt),
    deletedAt: data.deletedAt === null ? null : iso(data.deletedAt),
  };
}

/** List projection - one line in My Notes / Favorites / Trash / search. */
export function toNoteRow(data: NofyNoteData): NofyNoteRow {
  const blocks = parseStoredBlocks(data.blocks);
  return {
    id: data.id,
    title: data.title,
    icon: data.icon,
    folderId: data.folderId,
    folderName: data.folderName,
    tagIds: data.tagIds,
    tagNames: data.tagNames,
    favorite: data.favorite,
    templateId: data.templateId,
    lessonRef: parseLessonRef(data.lessonRef),
    excerpt: excerptOf(blocks),
    wordCount: countWords(blocks),
    blockCount: blocks.length,
    refCount: blocks.filter((block) => block.type === "ref").length,
    todoOpen: countOpenTodos(blocks),
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
    lastViewedAt: data.lastViewedAt === null ? null : iso(data.lastViewedAt),
    deletedAt: data.deletedAt === null ? null : iso(data.deletedAt),
  };
}

export function toFolder(data: NofyFolderData): NofyFolder & { noteCount: number } {
  return { id: data.id, name: data.name, createdAt: iso(data.createdAt), noteCount: data.noteCount };
}

export function toTag(data: NofyTagData): NofyTag & { noteCount: number } {
  return { id: data.id, name: data.name, noteCount: data.noteCount };
}

export function toTemplate(data: NofyTemplateData): NofyTemplate {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    icon: data.icon,
    blocks: parseStoredBlocks(data.blocks),
    builtIn: data.builtIn,
    createdAt: iso(data.createdAt),
  };
}

/** Weekly activity buckets (last N weeks, oldest first - mock parity). */
export function toActivityWeek(weekStart: string, created: number, edited: number): NofyActivityWeek {
  return { weekStart, created, edited };
}

export type { NofyRefKind };
