/**
 * Academy flashcard scheduling — Leitner boxes over the derived deck
 * (glossary terms + lesson takeaways). Pure state transition + queue logic;
 * the ledger/state lives in the repository (Phase 11 §57: derived, not
 * duplicated).
 *
 * Parity source: mocks/academy-engine.ts FLASH_INTERVALS/flashcards/
 * reviewFlashcard — intervals [1,2,4,8,15] days, AGAIN resets to box 0 due
 * today, GOOD advances 1 box, EASY 2, with a 10-reviews-per-day cap and free
 * practice when nothing is due.
 */
import type { AcademyFlashcard, AcademyFlashcardsResponse } from "../../../shared/contracts";
import { flashcardDeck } from "./catalog";

export const FLASH_INTERVALS = [1, 2, 4, 8, 15]; // days per box
export const FLASHCARD_DAILY_CAP = 10;
export const FLASHCARD_FREE_QUEUE_SIZE = 5;

export interface FlashcardCardState {
  box: number;
  /** UTC date key (YYYY-MM-DD) the card is next due. */
  due: string;
  reviews: number;
}

/** Next state after grading a card (pure). */
export function nextFlashcardState(
  current: FlashcardCardState | undefined,
  grade: "AGAIN" | "GOOD" | "EASY",
  today: Date,
): FlashcardCardState {
  const todayKey = today.toISOString().slice(0, 10);
  if (grade === "AGAIN") {
    return { box: 0, due: todayKey, reviews: (current?.reviews ?? 0) + 1 };
  }
  const box = Math.min((current?.box ?? 0) + (grade === "EASY" ? 2 : 1), FLASH_INTERVALS.length - 1);
  const intervalDays = FLASH_INTERVALS[box] ?? 1;
  const due = new Date(today.getTime() + intervalDays * 86_400_000).toISOString().slice(0, 10);
  return { box, due, reviews: (current?.reviews ?? 0) + 1 };
}

/** Due queue view (pure over the deck + user states). */
export function flashcardsQueue(input: {
  deck: readonly AcademyFlashcard[];
  states: ReadonlyMap<string, FlashcardCardState>;
  today: Date;
  reviewedToday: number;
  shuffle: <T>(items: readonly T[]) => T[];
}): AcademyFlashcardsResponse {
  const { deck, states, today, reviewedToday, shuffle } = input;
  const todayKey = today.toISOString().slice(0, 10);

  const dueCards = deck.filter((card) => {
    const state = states.get(card.id);
    return !state || state.due <= todayKey;
  });
  const remaining = Math.max(0, FLASHCARD_DAILY_CAP - reviewedToday);
  const queue = dueCards.slice(0, remaining).map((card) => ({ ...card, extra: false }));
  if (queue.length === 0) {
    // Nothing due — free practice keeps the deck warm without touching caps.
    const free = shuffle(deck).slice(0, FLASHCARD_FREE_QUEUE_SIZE).map((card) => ({ ...card, extra: true }));
    return { due: free, dueCount: dueCards.length, reviewedToday, totalCards: deck.length };
  }
  return { due: queue, dueCount: dueCards.length, reviewedToday, totalCards: deck.length };
}

export const deckSize = (): number => flashcardDeck().length;
