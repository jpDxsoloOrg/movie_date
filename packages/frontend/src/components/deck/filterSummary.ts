import { findProvider } from "@movie-date/core";
import type { Genre, Room } from "../../services/api";

function yearOf(isoDate: string): string {
  return isoDate.slice(0, 4);
}

function dateRangeLabel(from: string | null | undefined, to: string | null | undefined): string | null {
  if (from && to) return yearOf(from) === yearOf(to) ? yearOf(from) : `${yearOf(from)} to ${yearOf(to)}`;
  if (from) return `From ${yearOf(from)}`;
  if (to) return `Up to ${yearOf(to)}`;
  return null;
}

function genreLabels(ids: readonly number[], genres: readonly Genre[] | undefined): string[] {
  if (!genres) return ids.length > 0 ? [ids.length === 1 ? "1 genre" : `${ids.length} genres`] : [];
  return ids.flatMap((id) => genres.find((genre) => genre.id === id)?.name ?? []);
}

/** The room's filters as short labels, for showing rather than editing. */
export function filterLabels(filters: Room["filters"], genres: readonly Genre[] | undefined): string[] {
  const labels = [
    ...genreLabels(filters.genreIds, genres),
    ...filters.services.map((service) => findProvider(service)?.label ?? service),
    ...filters.cast.map((person) => person.name),
    dateRangeLabel(filters.releaseDateGte, filters.releaseDateLte),
  ];
  return [...new Set(labels.filter((label): label is string => label !== null))];
}
