import type { FieldArguments, Movie } from "@movie-date/core";
import { getMovie } from "../lib/tmdb.js";

export function movie({ id }: FieldArguments["movie"]): Promise<Movie> {
  return getMovie(id);
}
