import {
  resolveMediaType,
  showAsMovie,
  type DeckCard,
  type DeckPage,
  type FieldArguments,
  type Filters,
  type MediaType,
  type Movie,
  type Show,
} from "@movie-date/core";
import { getItem, queryAll, type Item } from "../lib/db.js";
import { deckSource, type DeckSource } from "../lib/deckSource.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import { mediaRefOfSk, prefixes, profile, roomMeta, roomPk } from "../lib/keys.js";
import { filtersOf, inMode, roundOf } from "../lib/mediaMode.js";
import type { RoomMetaItem } from "../lib/rooms.js";
import { matchesShowFilters } from "../lib/showFilters.js";
import { hydrateMovies } from "../lib/tmdb.js";
import { hydrateShows } from "../lib/tmdbTv.js";
import { withDeckWalkPermit } from "../lib/walkLimits.js";

/** TMDB rejects anything past this even when total_pages reports more. */
const MAX_TMDB_PAGE = 500;
const MAX_WALK_FORWARD = 5;

/**
 * Season count isn't a `discover/tv` filter and an actor's credits can't be asked
 * about services, so those decks keep only some of each page and must walk further
 * for a useful hand. 15 pages is 300 shows, the most one call will look at.
 */
const SPARSE_WALK_FORWARD = 14;
const SPARSE_MIN_CARDS = 10;

/**
 * AppSync gives up at 30 seconds. No new page starts after the first limit and no
 * new show is fetched after the second, and one TMDB call can take 5 more seconds.
 * The first page of a slow TMDB outlasts the budget, which is what the second is for.
 */
const WALK_BUDGET_MS = 10_000;
const FETCH_BUDGET_MS = 20_000;

interface ProfileRow extends Item {
  roomId?: string;
}

interface TallyRow extends Item {
  likes?: number;
  movie?: Movie;
  show?: Show;
}

interface RoomDeckState {
  roomId: string;
  mediaType: MediaType;
  filters: Filters;
  swipedIds: Set<number>;
  /** Tally rows by title id, for titles the caller hasn't swiped. */
  roommateLikes: Map<number, TallyRow>;
}

/** What a card shows. */
interface Title {
  movie: Movie;
  show: Show | null;
}

interface Walk {
  /** Stop once this many cards are in hand. */
  minCards: number;
  maxForward: number;
  walkUntil: number;
  stopAt: number;
}

function isSparse(mediaType: MediaType, filters: Filters): boolean {
  return mediaType === "TV" && (Boolean(filters.commitment) || filters.cast.length > 0);
}

function walkFor(mediaType: MediaType, filters: Filters): Walk {
  if (mediaType === "MOVIE") {
    return {
      minCards: 1,
      maxForward: MAX_WALK_FORWARD,
      walkUntil: Number.POSITIVE_INFINITY,
      stopAt: Number.POSITIVE_INFINITY,
    };
  }
  const sparse = isSparse(mediaType, filters);
  const now = Date.now();
  return {
    minCards: sparse ? SPARSE_MIN_CARDS : 1,
    maxForward: sparse ? SPARSE_WALK_FORWARD : MAX_WALK_FORWARD,
    walkUntil: now + WALK_BUDGET_MS,
    stopAt: now + FETCH_BUDGET_MS,
  };
}

/** Consistent reads, because the client reloads the deck straight after swiping or joining. */
async function loadDeckState(userId: string, mediaType: MediaType): Promise<RoomDeckState> {
  const caller = await getItem<ProfileRow>(profile(userId), { consistent: true });
  if (!caller?.roomId) throw new NotFoundError("Room not found.");
  const room = await getItem<RoomMetaItem>(roomMeta(caller.roomId), { consistent: true });
  if (!room) throw new NotFoundError("Room not found.");

  const pk = roomPk(caller.roomId);
  const round = roundOf(room, mediaType);
  const [swipes, tallies] = await Promise.all([
    queryAll(pk, { skPrefix: prefixes.userRoundSwipes(round, userId), consistent: true }),
    queryAll<TallyRow>(pk, { skPrefix: prefixes.roundTallies(round), consistent: true }),
  ]);

  const swipedIds = new Set(swipes.filter(inMode(mediaType)).map((row) => mediaRefOfSk(row.sk).id));
  // The caller hasn't swiped these, so every like on the tally is someone else's.
  const roommateLikes = new Map<number, TallyRow>();
  for (const row of tallies.filter(inMode(mediaType))) {
    const { id } = mediaRefOfSk(row.sk);
    if ((row.likes ?? 0) > 0 && !swipedIds.has(id)) roommateLikes.set(id, row);
  }
  return {
    roomId: caller.roomId,
    mediaType,
    filters: filtersOf(room, mediaType),
    swipedIds,
    roommateLikes,
  };
}

function hasPoster({ movie }: Title): boolean {
  return movie.posterUrl !== null;
}

function showTitle(show: Show): Title {
  return { movie: showAsMovie(show), show };
}

async function hydrateTitles(
  ids: readonly number[],
  mediaType: MediaType,
  stopAt: number,
): Promise<Title[]> {
  if (mediaType === "TV") return (await hydrateShows(ids, stopAt)).map(showTitle);
  return (await hydrateMovies(ids)).map((movie) => ({ movie, show: null }));
}

function snapshotOf(row: TallyRow): Title | null {
  if (row.show) return showTitle(row.show);
  return row.movie ? { movie: row.movie, show: null } : null;
}

function toCard(mediaType: MediaType, title: Title, likedByRoommate: boolean): DeckCard {
  return { mediaType, ...title, likedByRoommate };
}

/** Most-liked first, since those are the fewest swipes away from a match. */
async function roommateCards(state: RoomDeckState, walk: Walk): Promise<DeckCard[]> {
  const rows = [...state.roommateLikes.entries()].sort(
    ([, first], [, second]) => (second.likes ?? 0) - (first.likes ?? 0),
  );
  const snapshots = new Map(
    rows.flatMap(([id, row]) => {
      const title = snapshotOf(row);
      return title ? [[id, title] as const] : [];
    }),
  );
  const missing = rows.map(([id]) => id).filter((id) => !snapshots.has(id));
  const hydrated = await hydrateTitles(missing, state.mediaType, walk.stopAt);
  const byId = new Map(hydrated.map((title) => [title.movie.id, title]));
  return rows
    .flatMap(([id]) => snapshots.get(id) ?? byId.get(id) ?? [])
    .filter(hasPoster)
    .map((title) => toCard(state.mediaType, title, true));
}

function roommateFirst(cards: DeckCard[]): DeckCard[] {
  return cards.sort((first, second) => Number(second.likedByRoommate) - Number(first.likedByRoommate));
}

/**
 * Walks forward until it has enough. An empty result with a nextPage means the
 * walk ran out, not the deck, so clients should keep going. A failure partway
 * through a walk hands over what it has and leaves that page for the next call.
 */
async function discoverCards(
  state: RoomDeckState,
  source: DeckSource,
  startPage: number,
  alreadyDealt: ReadonlySet<number>,
  walk: Walk,
): Promise<DeckPage> {
  const { filters, mediaType } = state;
  const dealt = new Set(alreadyDealt);
  const cards: DeckCard[] = [];
  for (let page = startPage; ; page += 1) {
    let totalPages: number;
    try {
      const sourcePage = await source(page);
      totalPages = sourcePage.totalPages;
      const candidates = sourcePage.ids.filter((id) => !state.swipedIds.has(id) && !dealt.has(id));
      const titles = await hydrateTitles([...new Set(candidates)], mediaType, walk.stopAt);
      for (const title of titles.filter(hasPoster)) {
        if (title.show && !matchesShowFilters(title.show, filters)) continue;
        dealt.add(title.movie.id);
        cards.push(toCard(mediaType, title, state.roommateLikes.has(title.movie.id)));
      }
    } catch (error) {
      if (cards.length === 0) throw error;
      return { cards: roommateFirst(cards), nextPage: page };
    }

    const nextPage = page < Math.min(totalPages, MAX_TMDB_PAGE) ? page + 1 : null;
    if (
      cards.length >= walk.minCards ||
      nextPage === null ||
      page - startPage >= walk.maxForward ||
      Date.now() >= walk.walkUntil
    ) {
      return { cards: roommateFirst(cards), nextPage };
    }
  }
}

async function dealPage(state: RoomDeckState, page: number): Promise<DeckPage> {
  const { mediaType } = state;
  const walk = walkFor(mediaType, state.filters);
  const head = page === 1 ? await roommateCards(state, walk) : [];
  const dealt = new Set(head.map((card) => card.movie.id));
  const source = await deckSource(state.roomId, state.filters, { mediaType, stopAt: walk.stopAt });
  const { cards, nextPage } = await discoverCards(state, source, page, dealt, walk);
  return { cards: [...head, ...cards], nextPage };
}

export async function deck(
  args: FieldArguments["deck"],
  { userId }: ResolverContext,
): Promise<DeckPage> {
  const { page } = args;
  if (!Number.isInteger(page) || page < 1) throw new ValidationError("Invalid page.");
  if (page > MAX_TMDB_PAGE) return { cards: [], nextPage: null };

  const mediaType = resolveMediaType(args.mediaType);
  const state = await loadDeckState(userId, mediaType);
  // One of these can cost 300 TMDB calls and most of the resolver's 30 seconds.
  return isSparse(mediaType, state.filters)
    ? withDeckWalkPermit(userId, () => dealPage(state, page))
    : dealPage(state, page);
}
