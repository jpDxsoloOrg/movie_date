import { resolveMediaType, type FieldArguments } from "@movie-date/core";
import { getTrailerKey } from "../lib/tmdb.js";
import { getShowTrailerKey } from "../lib/tmdbTv.js";

export async function trailer({ movieId, mediaType }: FieldArguments["trailer"]): Promise<string | null> {
  return resolveMediaType(mediaType) === "TV" ? getShowTrailerKey(movieId) : getTrailerKey(movieId);
}
