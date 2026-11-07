import {
  ANY_SERVICE,
  DECK_LANGUAGE,
  DEFAULT_MEDIA_TYPE,
  PLEX_SERVICE,
  providerIdsForServices,
  type Filters,
  type MediaType,
} from "@movie-date/core";
import {
  loadLibraryIndex,
  loadShowIndex,
  matchingMovies,
  matchingShows,
} from "./plexIndex.js";
import { isPlexAvailable } from "./rooms.js";
import { hiddenGenres, inFirstAirRange } from "./showFilters.js";
import { discoverMovies, type DiscoverPage } from "./tmdb.js";
import { discoverShows, getActorShows, hydrateShowRecords, type ActorShow } from "./tmdbTv.js";

/** Matches TMDB's, so a mixed page draws evenly from both. */
const PAGE_SIZE = 20;

export interface SourcePage {
  ids: number[];
  totalPages: number;
  /** Everything the source holds across its pages. Null when no count is available. */
  totalResults: number | null;
}

export type DeckSource = (page: number) => Promise<SourcePage>;

export interface DeckSourceOptions {
  mediaType?: MediaType;
  /** No show details are fetched after this, for a caller racing the resolver timeout. */
  stopAt?: number;
}

function toSourcePage({ results, totalPages, totalResults }: DiscoverPage): SourcePage {
  const usable = results.filter(
    (result) => result.originalLanguage === DECK_LANGUAGE && result.hasPoster,
  );
  return { ids: usable.map((result) => result.id), totalPages, totalResults };
}

function mergeActorShows(lists: readonly ActorShow[][]): ActorShow[] {
  const byId = new Map<number, ActorShow>();
  for (const show of lists.flat()) {
    const current = byId.get(show.id);
    if (!current || show.episodeCount > current.episodeCount) byId.set(show.id, show);
  }
  return [...byId.values()];
}

function creditMatches(show: ActorShow, filters: Filters): boolean {
  const { genreIds } = filters;
  const hidden = hiddenGenres(filters);
  return (
    show.originalLanguage === DECK_LANGUAGE &&
    show.hasPoster &&
    (genreIds.length === 0 || genreIds.some((id) => show.genreIds.includes(id))) &&
    !hidden.some((id) => show.genreIds.includes(id)) &&
    inFirstAirRange(show.firstAirDate, filters)
  );
}

/** Real roles ahead of one-episode guest spots, then the better known. */
async function actorCandidates(filters: Filters): Promise<ActorShow[]> {
  const credits = await Promise.all(filters.cast.map((person) => getActorShows(person.id)));
  return mergeActorShows(credits)
    .filter((show) => creditMatches(show, filters))
    .sort(
      (first, second) =>
        second.episodeCount - first.episodeCount ||
        second.popularity - first.popularity ||
        first.id - second.id,
    );
}

/**
 * Takes the place of `discover/tv`, which ignores `with_cast`. A credit carries
 * genres and dates, so those narrow the list up front. Services need each show's
 * details, so this page's are checked, and the count of them can't be known.
 */
function actorSource(filters: Filters, stopAt: number | undefined): DeckSource {
  const wanted = new Set(providerIdsForServices(filters.services));
  let candidates: Promise<ActorShow[]> | undefined;
  return async (page) => {
    candidates ??= actorCandidates(filters);
    const shows = await candidates;
    const ids = shows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((show) => show.id);
    const onServices =
      wanted.size === 0
        ? ids
        : (await hydrateShowRecords(ids, stopAt))
            .filter((record) => record.providerIds.some((id) => wanted.has(id)))
            .map((record) => record.show.id);
    return {
      ids: onServices,
      totalPages: Math.ceil(shows.length / PAGE_SIZE),
      totalResults: wanted.size === 0 && !filters.showStatus ? shows.length : null,
    };
  };
}

function tmdbSource(filters: Filters, options: DeckSourceOptions): DeckSource {
  if (options.mediaType !== "TV") {
    return async (page) => toSourcePage(await discoverMovies(filters, page));
  }
  if (filters.cast.length > 0) return actorSource(filters, options.stopAt);
  return async (page) => toSourcePage(await discoverShows(filters, page));
}

/** Sliced before swipes are excluded, as TMDB is, so swiping can't shift later pages. */
function plexPage(titles: readonly { id: number }[], page: number): SourcePage {
  const start = (page - 1) * PAGE_SIZE;
  return {
    ids: titles.slice(start, start + PAGE_SIZE).map((title) => title.id),
    totalPages: Math.ceil(titles.length / PAGE_SIZE),
    totalResults: titles.length,
  };
}

function interleave(first: readonly number[], second: readonly number[]): number[] {
  const longest = Math.max(first.length, second.length);
  return Array.from({ length: longest }, (_, index) => [first[index], second[index]])
    .flat()
    .filter((id) => id !== undefined);
}

/** Null when the mode has no index yet. */
async function plexTitles(
  filters: Filters,
  mediaType: MediaType,
): Promise<readonly { id: number }[] | null> {
  if (mediaType === "TV") {
    const index = await loadShowIndex();
    return index && matchingShows(index, filters);
  }
  const index = await loadLibraryIndex();
  return index && matchingMovies(index, filters);
}

/**
 * The plex key only narrows the deck when it can: a room whose linked member left,
 * or an index that isn't there yet, deals as if the key weren't set. `any` beats
 * plex as it beats every other service.
 */
export async function deckSource(
  roomId: string | null,
  filters: Filters,
  options: DeckSourceOptions = {},
): Promise<DeckSource> {
  const fromTmdb = tmdbSource(filters, options);
  if (!filters.services.includes(PLEX_SERVICE) || filters.services.includes(ANY_SERVICE)) {
    return fromTmdb;
  }
  if (!roomId || !(await isPlexAvailable(roomId))) return fromTmdb;
  const titles = await plexTitles(filters, options.mediaType ?? DEFAULT_MEDIA_TYPE);
  if (!titles) return fromTmdb;

  if (providerIdsForServices(filters.services).length === 0) {
    return async (page) => plexPage(titles, page);
  }
  // Against every Plex match, not just this page's, or a title could come round twice.
  const plexIds = new Set(titles.map((title) => title.id));
  return async (page) => {
    const streaming = await fromTmdb(page);
    const library = plexPage(titles, page);
    return {
      ids: interleave(library.ids, streaming.ids.filter((id) => !plexIds.has(id))),
      totalPages: Math.max(library.totalPages, streaming.totalPages),
      // TMDB can't say how many of its matches are also on Plex, so overlaps count twice.
      totalResults:
        streaming.totalResults === null ? null : streaming.totalResults + titles.length,
    };
  };
}
