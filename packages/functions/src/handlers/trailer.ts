import type { FieldArguments } from "@movie-date/core";
import { getTrailerKey } from "../lib/tmdb.js";

export function trailer({ movieId }: FieldArguments["trailer"]): Promise<string | null> {
  return getTrailerKey(movieId);
}
