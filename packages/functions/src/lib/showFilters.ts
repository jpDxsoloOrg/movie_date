import {
  COMMITMENT_SEASONS,
  type CommitmentLevel,
  type Filters,
  type Show,
  type ShowStatusFilter,
} from "@movie-date/core";

/** TMDB's status names, and the numbers `discover/tv` takes for them. */
export const SHOW_STATUSES: Record<ShowStatusFilter, { names: string[]; discover: string }> = {
  RUNNING: { names: ["Returning Series", "In Production"], discover: "0|2" },
  FINISHED: { names: ["Ended", "Canceled"], discover: "3|4" },
};

/** News and Talk, which nobody starts together. Picking one brings it back. */
export const HIDDEN_GENRES: readonly number[] = [10763, 10767];

export function hiddenGenres(filters: Filters): number[] {
  return HIDDEN_GENRES.filter((id) => !filters.genreIds.includes(id));
}

export function matchesStatus(status: string | null, filter: ShowStatusFilter | null | undefined): boolean {
  return !filter || (status !== null && SHOW_STATUSES[filter].names.includes(status));
}

export function matchesCommitment(
  seasonCount: number | null,
  level: CommitmentLevel | null | undefined,
): boolean {
  if (!level) return true;
  if (seasonCount === null) return false;
  const { min, max } = COMMITMENT_SEASONS[level];
  return seasonCount >= min && (max === null || seasonCount <= max);
}

/** What TMDB can't filter for every source, so it's checked once a show has its details. */
export function matchesShowFilters(show: Show, filters: Filters): boolean {
  return (
    matchesStatus(show.status, filters.showStatus) &&
    matchesCommitment(show.seasonCount, filters.commitment)
  );
}

export function inFirstAirRange(firstAirDate: string | null, filters: Filters): boolean {
  const { firstAirDateGte, firstAirDateLte } = filters;
  if (!firstAirDateGte && !firstAirDateLte) return true;
  if (!firstAirDate) return false;
  if (firstAirDateGte && firstAirDate < firstAirDateGte) return false;
  return !firstAirDateLte || firstAirDate <= firstAirDateLte;
}
