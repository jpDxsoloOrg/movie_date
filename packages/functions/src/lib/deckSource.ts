import {
  ANY_SERVICE,
  DECK_LANGUAGE,
  PLEX_SERVICE,
  providerIdsForServices,
  type Filters,
} from "@movie-date/core";
import { loadLibraryIndex, matchingMovies, type LibraryMovie } from "./plexIndex.js";
import { isPlexAvailable } from "./rooms.js";
import { discoverMovies } from "./tmdb.js";

/** Matches TMDB's, so a mixed page draws evenly from both. */
const PLEX_PAGE_SIZE = 20;

export interface SourcePage {
  ids: number[];
  totalPages: number;
  /** Everything the source holds across its pages. Null when TMDB gave no count. */
  totalResults: number | null;
}

export type DeckSource = (page: number) => Promise<SourcePage>;

async function tmdbPage(filters: Filters, page: number): Promise<SourcePage> {
  const { results, totalPages, totalResults } = await discoverMovies(filters, page);
  const usable = results.filter(
    (result) => result.originalLanguage === DECK_LANGUAGE && result.hasPoster,
  );
  return { ids: usable.map((result) => result.id), totalPages, totalResults };
}

/** Sliced before swipes are excluded, as TMDB is, so swiping can't shift later pages. */
function plexPage(movies: readonly LibraryMovie[], page: number): SourcePage {
  const start = (page - 1) * PLEX_PAGE_SIZE;
  return {
    ids: movies.slice(start, start + PLEX_PAGE_SIZE).map((movie) => movie.id),
    totalPages: Math.ceil(movies.length / PLEX_PAGE_SIZE),
    totalResults: movies.length,
  };
}

function interleave(first: readonly number[], second: readonly number[]): number[] {
  const longest = Math.max(first.length, second.length);
  return Array.from({ length: longest }, (_, index) => [first[index], second[index]])
    .flat()
    .filter((id) => id !== undefined);
}

/**
 * The plex key only narrows the deck when it can: a room whose linked member left,
 * or an index that isn't there yet, deals as if the key weren't set. `any` beats
 * plex as it beats every other service.
 */
export async function deckSource(roomId: string | null, filters: Filters): Promise<DeckSource> {
  const fromTmdb: DeckSource = (page) => tmdbPage(filters, page);
  if (!filters.services.includes(PLEX_SERVICE) || filters.services.includes(ANY_SERVICE)) {
    return fromTmdb;
  }
  if (!roomId || !(await isPlexAvailable(roomId))) return fromTmdb;
  const index = await loadLibraryIndex();
  if (!index) return fromTmdb;

  const movies = matchingMovies(index, filters);
  if (providerIdsForServices(filters.services).length === 0) {
    return async (page) => plexPage(movies, page);
  }
  // Against every Plex match, not just this page's, or a title could come round twice.
  const plexIds = new Set(movies.map((movie) => movie.id));
  return async (page) => {
    const streaming = await fromTmdb(page);
    const library = plexPage(movies, page);
    return {
      ids: interleave(library.ids, streaming.ids.filter((id) => !plexIds.has(id))),
      totalPages: Math.max(library.totalPages, streaming.totalPages),
      // TMDB can't say how many of its matches are also on Plex, so overlaps count twice.
      totalResults:
        streaming.totalResults === null ? null : streaming.totalResults + movies.length,
    };
  };
}
