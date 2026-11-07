import type { MediaType } from "./types.js";

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
