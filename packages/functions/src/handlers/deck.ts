import {
  emptyFilters,
  parseMediaKey,
  type DeckCard,
  type DeckPage,
  type FieldArguments,
  type Filters,
  type Movie,
} from "@movie-date/core";
import { getItem, queryAll, type Item } from "../lib/db.js";
import { deckSource, type DeckSource } from "../lib/deckSource.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import { parseSwipeSk, prefixes, profile, roomMeta, roomPk } from "../lib/keys.js";
import { hydrateMovies } from "../lib/tmdb.js";

/** TMDB rejects anything past this even when total_pages reports more. */
const MAX_TMDB_PAGE = 500;
const MAX_WALK_FORWARD = 5;

interface ProfileRow extends Item {
  roomId?: string;
}

interface RoomRow extends Item {
  round: number;
  filters?: Filters;
}

interface TallyRow extends Item {
  likes?: number;
  movie?: Movie;
}

interface RoomDeckState {
  roomId: string;
  filters: Filters;
  swipedIds: Set<number>;
  /** Tally rows by movie id, for movies the caller hasn't swiped. */
  roommateLikes: Map<number, TallyRow>;
}

function tallyMovieId(row: TallyRow, round: number): number {
  return parseMediaKey(row.sk.slice(prefixes.roundTallies(round).length)).id;
}

/** Consistent reads, because the client reloads the deck straight after swiping or joining. */
async function loadDeckState(userId: string): Promise<RoomDeckState> {
  const caller = await getItem<ProfileRow>(profile(userId), { consistent: true });
  if (!caller?.roomId) throw new NotFoundError("Room not found.");
  const room = await getItem<RoomRow>(roomMeta(caller.roomId), { consistent: true });
  if (!room) throw new NotFoundError("Room not found.");

  const pk = roomPk(caller.roomId);
  const [swipes, tallies] = await Promise.all([
    queryAll(pk, { skPrefix: prefixes.userRoundSwipes(room.round, userId), consistent: true }),
    queryAll<TallyRow>(pk, { skPrefix: prefixes.roundTallies(room.round), consistent: true }),
  ]);

  const swipedIds = new Set(swipes.map((row) => parseSwipeSk(row.sk).id));
  // The caller hasn't swiped these, so every like on the tally is someone else's.
  const roommateLikes = new Map<number, TallyRow>();
  for (const row of tallies) {
    const movieId = tallyMovieId(row, room.round);
    if ((row.likes ?? 0) > 0 && !swipedIds.has(movieId)) roommateLikes.set(movieId, row);
  }
  return {
    roomId: caller.roomId,
    filters: room.filters ?? emptyFilters(),
    swipedIds,
    roommateLikes,
  };
}

function hasPoster(movie: Movie): boolean {
  return movie.posterUrl !== null;
}

/** Most-liked first, since those are the fewest swipes away from a match. */
async function roommateCards(state: RoomDeckState): Promise<DeckCard[]> {
  const rows = [...state.roommateLikes.entries()].sort(
    ([, first], [, second]) => (second.likes ?? 0) - (first.likes ?? 0),
  );
  const snapshots = new Map(rows.flatMap(([id, row]) => (row.movie ? [[id, row.movie]] : [])));
  const missing = rows.map(([id]) => id).filter((id) => !snapshots.has(id));
  const hydrated = new Map((await hydrateMovies(missing)).map((movie) => [movie.id, movie]));
  return rows
    .flatMap(([id]) => snapshots.get(id) ?? hydrated.get(id) ?? [])
    .filter(hasPoster)
    .map((movie) => ({ movie, likedByRoommate: true }));
}

/**
 * Walks forward until a page yields something. An empty result with a nextPage
 * means the walk ran out, not the deck, so clients should keep going.
 */
async function discoverCards(
  state: RoomDeckState,
  source: DeckSource,
  startPage: number,
  alreadyDealt: ReadonlySet<number>,
): Promise<DeckPage> {
  for (let page = startPage; ; page += 1) {
    const { ids, totalPages } = await source(page);
    const candidates = ids.filter((id) => !state.swipedIds.has(id) && !alreadyDealt.has(id));
    const movies = await hydrateMovies([...new Set(candidates)]);
    const cards = movies
      .filter(hasPoster)
      .map((movie) => ({ movie, likedByRoommate: state.roommateLikes.has(movie.id) }))
      .sort((first, second) => Number(second.likedByRoommate) - Number(first.likedByRoommate));

    const nextPage = page < Math.min(totalPages, MAX_TMDB_PAGE) ? page + 1 : null;
    if (cards.length > 0 || nextPage === null || page - startPage >= MAX_WALK_FORWARD) {
      return { cards, nextPage };
    }
  }
}

export async function deck(
  { page }: FieldArguments["deck"],
  { userId }: ResolverContext,
): Promise<DeckPage> {
  if (!Number.isInteger(page) || page < 1) throw new ValidationError("Invalid page.");
  if (page > MAX_TMDB_PAGE) return { cards: [], nextPage: null };

  const state = await loadDeckState(userId);
  const head = page === 1 ? await roommateCards(state) : [];
  const dealt = new Set(head.map((card) => card.movie.id));
  const { cards, nextPage } = await discoverCards(
    state,
    await deckSource(state.roomId, state.filters),
    page,
    dealt,
  );
  return { cards: [...head, ...cards], nextPage };
}
