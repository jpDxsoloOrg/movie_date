import type { FiltersInput, Person, Room } from "../../services/api";

/** Back to Start searches from here, so an actor's older films are in reach too. */
export const CAST_SEARCH_START = "1970-01-01";

/** The person's own calendar date as YYYY-MM-DD. toISOString would give UTC's, a day out in the evening. */
export function localIsoDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The Movies form Back to Start opens after a match: the matched movie's top-billed
 * actors, released from 1970 to today. Genres and services stay as the room set them.
 * Actors already picked are replaced, because this search is about one movie's cast.
 * Nothing is saved until someone presses Apply.
 */
export function castSearchDraft(filters: Room["filters"], cast: readonly Person[], now: Date): FiltersInput {
  return {
    ...filters,
    cast: [...cast],
    releaseDateGte: CAST_SEARCH_START,
    releaseDateLte: localIsoDate(now),
  };
}
