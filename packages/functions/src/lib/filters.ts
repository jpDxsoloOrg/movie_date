import { isServiceKey, PROVIDERS, type Filters, type Person } from "@movie-date/core";
import { ValidationError } from "./errors.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** TMDB has 19 genres. Filters travel in every room read, so these must stay small. */
const MAX_GENRES = 20;
const MAX_CAST = 20;
const MAX_NAME_LENGTH = 200;
/** Other members' browsers load this, so it can't be left pointing just anywhere. */
const TMDB_IMAGE_PREFIX = "https://image.tmdb.org/t/p/";

function isTmdbId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function checkedDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError("Dates must be in YYYY-MM-DD format.");
  }
  return value;
}

function checkedPerson(person: Person): Person {
  if (!isTmdbId(person.id) || person.name.length > MAX_NAME_LENGTH) {
    throw new ValidationError("That actor isn't valid.");
  }
  const { id, name, profileUrl } = person;
  return { id, name, profileUrl: profileUrl?.startsWith(TMDB_IMAGE_PREFIX) ? profileUrl : null };
}

export function checkedFilters(filters: Filters): Filters {
  if (!filters.services.every(isServiceKey) || filters.services.length > PROVIDERS.length) {
    throw new ValidationError("Unknown streaming service.");
  }
  if (filters.genreIds.length > MAX_GENRES || !filters.genreIds.every(isTmdbId)) {
    throw new ValidationError("Those genres aren't valid.");
  }
  if (filters.cast.length > MAX_CAST) {
    throw new ValidationError(`Pick ${MAX_CAST} actors or fewer.`);
  }
  const releaseDateGte = checkedDate(filters.releaseDateGte);
  const releaseDateLte = checkedDate(filters.releaseDateLte);
  return {
    genreIds: filters.genreIds,
    cast: filters.cast.map(checkedPerson),
    services: filters.services,
    ...(releaseDateGte ? { releaseDateGte } : {}),
    ...(releaseDateLte ? { releaseDateLte } : {}),
  };
}
