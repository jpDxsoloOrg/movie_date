import { resolveMediaType, type FieldArguments, type Genre } from "@movie-date/core";
import { getGenres } from "../lib/tmdb.js";
import { getTvGenres } from "../lib/tmdbTv.js";

export async function genres({ mediaType }: FieldArguments["genres"]): Promise<Genre[]> {
  return resolveMediaType(mediaType) === "TV" ? getTvGenres() : getGenres();
}
