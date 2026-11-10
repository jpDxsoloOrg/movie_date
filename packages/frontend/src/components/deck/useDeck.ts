import { useCallback, useEffect, useRef, useState } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useRoom } from "../../hooks/useRoom";
import { useToast } from "../../hooks/useToast";
import { api, ApiError, errorMessage, type DeckPage, type MediaType, type SwipeDirection } from "../../services/api";
import { useMode } from "../../mode/ModeProvider";
import { runInOrder, swipeSessionFor, type DeckEntry, type SwipeRecord } from "./swipeSession";

/** Cards on screen at once. */
export const STACK_SIZE = 3;
/** Fetch the next page with this many cards left, so a fast swiper never sees a spinner. */
const PREFETCH_BELOW = 6;
const PRELOAD_AHEAD = 5;
const SWIPE_RETRY_DELAYS_MS = [500, 1500];
/**
 * An empty page with a nextPage means the server gave up looking, not that the deck is
 * done. Each costs real TMDB calls and a rare filter can run to page 500, so nobody
 * should pay for that by leaving a tab open: after this many in a row, ask first.
 */
const MAX_EMPTY_WALKS = 3;

/** `paused`: nothing to show after several empty walks, and more may be further on. */
export type DeckStatus = "loading" | "error" | "ready" | "paused" | "end";

export interface ExitingEntry {
  entry: DeckEntry;
  direction: SwipeDirection;
}

export interface Deck {
  status: DeckStatus;
  error: unknown;
  retry: () => void;
  /** Search on after `paused`. */
  keepWalking: () => void;
  entries: DeckEntry[];
  /** Cards already swiped and still flying off. */
  exiting: ExitingEntry[];
  swipe: (direction: SwipeDirection) => void;
  undo: () => void;
  canUndo: boolean;
  finishExit: (movieId: number) => void;
}

const movieIdOf = (entry: DeckEntry): number => entry.card.movie.id;

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** Repeating a swipe is a no-op on the server, so a blip is safe to retry before giving up on it. */
async function deliverSwipe(
  movieId: number,
  direction: SwipeDirection,
  mediaType: MediaType,
): ReturnType<typeof api.swipe> {
  for (const delay of SWIPE_RETRY_DELAYS_MS) {
    try {
      return await api.swipe(movieId, direction, mediaType);
    } catch (error) {
      if (!(error instanceof ApiError && error.isTransient)) throw error;
      await pause(delay);
    }
  }
  return api.swipe(movieId, direction, mediaType);
}

/** Mount under a `key` of `deckVersion`: a reset is then just a fresh instance. */
export function useDeck(): Deck {
  const { me, room, goToMatch } = useRoom();
  const toast = useToast();
  const { mode: mediaType, copy } = useMode();
  const round = mediaType === "TV" ? room.tvRound : room.round;
  const [session] = useState(() => swipeSessionFor(`${me.id}:${room.id}:${round}`, mediaType));

  const firstPage = useAsyncData(() => api.deck(1, mediaType), []);
  const [entries, setEntries] = useState<DeckEntry[]>([]);
  const [exiting, setExiting] = useState<ExitingEntry[]>([]);
  /** undefined until the first page is dealt; null when TMDB has no more. */
  const [nextPage, setNextPage] = useState<number | null>();
  const [pageError, setPageError] = useState<unknown>(null);
  const [emptyWalks, setEmptyWalks] = useState(0);
  const [undoDepth, setUndoDepth] = useState(session.records.length);

  // Two swipes can land before React re-renders, and each must take a different
  // card, so the source of truth can't be the state from the last render.
  const queue = useRef<DeckEntry[]>([]);
  const fetchingPage = useRef(false);
  const preloaded = useRef(new Set<string>());
  // Phones never show a backdrop, so only the details panel pays for these.
  const showsBackdrops = useBreakpoint() === "desktop";

  const publish = useCallback((next: DeckEntry[]) => {
    queue.current = next;
    setEntries(next);
  }, []);

  const deal = useCallback(
    (page: DeckPage) => {
      // The server can't exclude a swipe still in flight.
      const dealt = new Set([
        ...queue.current.map(movieIdOf),
        ...session.records.map((record) => movieIdOf(record.entry)),
      ]);
      const fresh = page.cards
        .filter((card) => !dealt.has(card.movie.id))
        .map((card) => {
          session.nextSeq += 1;
          return { card, seq: session.nextSeq };
        });
      publish([...queue.current, ...fresh]);
      setNextPage(page.nextPage ?? null);
      setEmptyWalks((walks) => (fresh.length > 0 ? 0 : walks + 1));
    },
    [publish, session],
  );

  useEffect(() => {
    if (firstPage.data) deal(firstPage.data);
  }, [firstPage.data, deal]);

  const walkPaused = emptyWalks >= MAX_EMPTY_WALKS;
  const needsMore = nextPage != null && pageError === null && !walkPaused && entries.length < PREFETCH_BELOW;
  useEffect(() => {
    if (!needsMore || nextPage == null || fetchingPage.current) return;
    fetchingPage.current = true;
    const fetchPage = async (): Promise<void> => {
      try {
        deal(await api.deck(nextPage, mediaType));
      } catch (error) {
        setPageError(error);
      } finally {
        fetchingPage.current = false;
      }
    };
    void fetchPage();
  }, [needsMore, nextPage, deal, mediaType]);

  useEffect(() => {
    const posters = entries.slice(STACK_SIZE, STACK_SIZE + PRELOAD_AHEAD).map(({ card }) => card.movie.posterUrl);
    const backdrops = showsBackdrops ? entries.slice(1, STACK_SIZE).map(({ card }) => card.movie.backdropUrl) : [];
    for (const url of [...posters, ...backdrops]) {
      if (url && !preloaded.current.has(url)) {
        preloaded.current.add(url);
        new Image().src = url;
      }
    }
  }, [entries, showsBackdrops]);

  const finishExit = useCallback((movieId: number) => {
    setExiting((current) => current.filter(({ entry }) => movieIdOf(entry) !== movieId));
  }, []);

  const putBack = useCallback(
    (entry: DeckEntry, returningFrom: SwipeDirection) => {
      const movieId = movieIdOf(entry);
      finishExit(movieId);
      const others = queue.current.filter((other) => movieIdOf(other) !== movieId);
      const later = others.findIndex((other) => other.seq > entry.seq);
      const index = later === -1 ? others.length : later;
      publish([...others.slice(0, index), { ...entry, returningFrom }, ...others.slice(index)]);
    },
    [finishExit, publish],
  );

  const takeOut = useCallback(
    (movieId: number) => {
      publish(queue.current.filter((entry) => movieIdOf(entry) !== movieId));
    },
    [publish],
  );

  const syncUndoDepth = useCallback(() => setUndoDepth(session.records.length), [session]);

  const swipe = useCallback(
    (direction: SwipeDirection) => {
      const [top, ...rest] = queue.current;
      if (!top) return;
      const movieId = movieIdOf(top);
      publish(rest);
      setExiting((current) => [...current, { entry: top, direction }]);
      // A later swipe is as good a moment as any to try a failed page again.
      setPageError(null);
      setEmptyWalks(0);

      const record: SwipeRecord = { entry: top, direction, failed: false, undone: false };
      session.records.push(record);
      syncUndoDepth();

      runInOrder(session, movieId, async () => {
        try {
          const result = await deliverSwipe(movieId, direction, mediaType);
          if (result.match) goToMatch(result.match);
        } catch (error) {
          record.failed = true;
          if (record.undone) return;
          session.records.splice(session.records.indexOf(record), 1);
          syncUndoDepth();
          putBack(top, direction);
          toast.error(errorMessage(error));
        }
      });
    },
    [goToMatch, mediaType, publish, putBack, session, syncUndoDepth, toast],
  );

  const undo = useCallback(() => {
    const record = session.records.pop();
    if (!record) return;
    const movieId = movieIdOf(record.entry);
    record.undone = true;
    syncUndoDepth();
    putBack(record.entry, record.direction);

    runInOrder(session, movieId, async () => {
      if (record.failed) return;
      try {
        const { undone } = await api.undoSwipe(movieId, mediaType);
        if (!undone) {
          takeOut(movieId);
          toast.info(copy.undoRefused);
        }
      } catch (error) {
        // If it's no longer in the deck it has been swiped again, which has its own record.
        if (queue.current.some((entry) => movieIdOf(entry) === movieId)) {
          takeOut(movieId);
          record.undone = false;
          session.records.push(record);
          syncUndoDepth();
        }
        toast.error(errorMessage(error));
      }
    });
  }, [copy, mediaType, putBack, session, syncUndoDepth, takeOut, toast]);

  const { reload } = firstPage;
  const retry = useCallback(() => {
    if (nextPage === undefined) void reload();
    else setPageError(null);
  }, [nextPage, reload]);

  const keepWalking = useCallback(() => setEmptyWalks(0), []);

  const firstPageError = nextPage === undefined ? firstPage.error : null;
  const error = firstPageError || pageError;
  let status: DeckStatus = "loading";
  if (entries.length > 0) status = "ready";
  else if (error) status = "error";
  else if (nextPage === null) status = "end";
  else if (walkPaused) status = "paused";

  return {
    status,
    error,
    retry,
    keepWalking,
    entries,
    exiting,
    swipe,
    undo,
    canUndo: undoDepth > 0,
    finishExit,
  };
}
