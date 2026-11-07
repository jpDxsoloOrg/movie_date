import type { CommitmentLevel, MediaType, Movie, Show } from "./types.js";

/**
 * TMDB numbers movies and shows separately, so 550 can be both. Anything that
 * stores or compares a title across types uses this key rather than the bare id.
 */
export type MediaKey = `movie:${number}` | `tv:${number}`;

export interface MediaRef {
  mediaType: MediaType;
  id: number;
}

const MEDIA_KEY_PATTERN = /^(?:(movie|tv):)?(\d+)$/;

export const DEFAULT_MEDIA_TYPE: MediaType = "MOVIE";

/** Don't rely on the schema default: a client can send an explicit null, which skips it. */
export function resolveMediaType(mediaType: MediaType | null | undefined): MediaType {
  return mediaType ?? DEFAULT_MEDIA_TYPE;
}

export function mediaKey(mediaType: MediaType, id: number): MediaKey {
  return mediaType === "TV" ? `tv:${id}` : `movie:${id}`;
}

export function movieKey(id: number): MediaKey {
  return mediaKey("MOVIE", id);
}

/**
 * A bare number is read as a movie: swipe history is kept across rounds, so rows
 * written before keys carried a type stay in the table and must still parse.
 */
export function parseMediaKey(key: string): MediaRef {
  const parts = MEDIA_KEY_PATTERN.exec(key);
  if (!parts) throw new Error(`Not a media key: ${key}`);
  return { mediaType: parts[1] === "tv" ? "TV" : "MOVIE", id: Number(parts[2]) };
}

/**
 * The card face of a show. Screens read `movie` in both modes and only reach for
 * `show` for what a movie doesn't have, so the id here is still a TV id.
 */
export function showAsMovie(show: Show): Movie {
  return {
    id: show.id,
    title: show.title,
    overview: show.overview,
    releaseYear: show.firstAirYear,
    runtime: show.episodeRuntime,
    voteAverage: show.voteAverage,
    posterUrl: show.posterUrl,
    backdropUrl: show.backdropUrl,
    genres: show.genres,
  };
}

/** Inclusive. A null `max` has no upper limit. */
export const COMMITMENT_SEASONS: Record<CommitmentLevel, { min: number; max: number | null }> = {
  SHORT_AND_SWEET: { min: 1, max: 2 },
  A_FEW_SEASONS: { min: 3, max: 5 },
  LONG_HAUL: { min: 6, max: null },
};
