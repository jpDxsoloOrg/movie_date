import type { FieldArguments, Person } from "@movie-date/core";
import { searchPeople as searchTmdbPeople } from "../lib/tmdb.js";

export async function searchPeople({
  query,
}: FieldArguments["searchPeople"]): Promise<Person[]> {
  const trimmed = query.trim();
  return trimmed === "" ? [] : searchTmdbPeople(trimmed);
}
