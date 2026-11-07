import { providerIdsForServices } from "./providers.js";
import type { Filters } from "./types.js";

export const WATCH_REGION = "US";
export const DECK_LANGUAGE = "en";

export function emptyFilters(): Filters {
  return { genreIds: [], cast: [], services: [] };
}

/** Jan 1 of the caller's current year, as YYYY-MM-DD. */
export function defaultReleaseDateGte(now: Date): string {
  return `${now.getFullYear()}-01-01`;
}

/** What pressing Search saves: an unpicked start date gets the default. */
export function withDefaultReleaseDate(filters: Filters, now: Date): Filters {
  return { ...filters, releaseDateGte: filters.releaseDateGte || defaultReleaseDateGte(now) };
}

/**
 * Query parameters for TMDB `discover/movie`, minus the API key. Every list is
 * pipe-joined because TMDB reads a comma as AND, and a movie is never on all of
 * a person's services at once.
 */
export function buildDiscoverQuery(filters: Filters, page: number): Record<string, string> {
  const query: Record<string, string> = {
    language: DECK_LANGUAGE,
    sort_by: "popularity.desc",
    include_adult: "false",
    page: String(page),
  };
  if (filters.genreIds.length > 0) query.with_genres = filters.genreIds.join("|");
  if (filters.cast.length > 0) {
    query.with_cast = filters.cast.map((person) => person.id).join("|");
  }
  const providerIds = providerIdsForServices(filters.services);
  if (providerIds.length > 0) {
    query.with_watch_providers = providerIds.join("|");
    query.watch_region = WATCH_REGION;
  }
  if (filters.releaseDateGte) query["primary_release_date.gte"] = filters.releaseDateGte;
  if (filters.releaseDateLte) query["primary_release_date.lte"] = filters.releaseDateLte;
  return query;
}
