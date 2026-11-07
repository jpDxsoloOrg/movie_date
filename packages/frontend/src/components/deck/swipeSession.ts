import type { DeckCard, SwipeDirection } from "../../services/api";

/** A dealt card. `seq` is its place in the deal, so a card put back lands where it was. */
export interface DeckEntry {
  card: DeckCard;
  seq: number;
  /** Set when a card comes back after a swipe, so it can fly in from the side it left by. */
  returningFrom?: SwipeDirection;
}

export interface SwipeRecord {
  entry: DeckEntry;
  direction: SwipeDirection;
  /** The server never took this swipe. */
  failed: boolean;
  /** The person took it back; a late failure must not put the card back a second time. */
  undone: boolean;
}

export interface SwipeSession {
  key: string;
  /** Newest last. Doubles as the undo stack and the list of cards not to deal again. */
  records: SwipeRecord[];
  nextSeq: number;
  /** The last write sent for each movie. */
  tails: Map<number, Promise<void>>;
}

let current: SwipeSession | null = null;

/**
 * Lives outside React because Home unmounts on every trip to Filters, and the deck
 * remounts on a filter change, yet both leave the round's swipes undoable. A new
 * key (another person, room or round) starts clean, which is what drops the old
 * round's undo stack.
 */
export function swipeSessionFor(key: string): SwipeSession {
  if (current?.key !== key) {
    current = { key, records: [], nextSeq: 0, tails: new Map() };
  }
  return current;
}

/**
 * Different movies' swipes go out at once, so a slow request never holds up the
 * next one. Writes for one movie stay in order: an undo sent ahead of its own
 * swipe would find nothing to undo, and the swipe would then land anyway.
 * `task` must handle its own errors.
 */
export function runInOrder(session: SwipeSession, movieId: number, task: () => Promise<void>): void {
  const previous = session.tails.get(movieId);
  const run = async (): Promise<void> => {
    await previous;
    await task();
  };
  session.tails.set(movieId, run());
}
