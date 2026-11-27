import type { FieldArguments, Person } from "@movie-date/core";
import { getTopCast } from "../lib/tmdb.js";

export function movieCast({ movieId }: FieldArguments["movieCast"]): Promise<Person[]> {
  return getTopCast(movieId);
}
