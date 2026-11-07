import type { Genre } from "@movie-date/core";
import { getGenres } from "../lib/tmdb.js";

export function genres(): Promise<Genre[]> {
  return getGenres();
}
