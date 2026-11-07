import type { DeckCard, Movie, Show } from "../../services/api";

/**
 * A title with what it takes to look it up. Deck cards, matches and history entries
 * all fit, and `movie.id` only means anything alongside `mediaType`.
 */
export type MediaItem = Pick<DeckCard, "mediaType" | "movie" | "show">;

/** TMDB's words for a show that's stopped, and the ones it never gets another season from. */
const FINISHED_STATUSES = new Set(["Ended", "Canceled"]);
const STATUS_LABELS: Partial<Record<string, string>> = { "Returning Series": "Still Running" };

/** "170 min | 8.3/10", leaving out whichever half TMDB doesn't have. */
export function runtimeAndRating(movie: Movie): string {
  const facts: string[] = [];
  if (movie.runtime) facts.push(`${movie.runtime} min`);
  if (movie.voteAverage) facts.push(`${movie.voteAverage.toFixed(1)}/10`);
  return facts.join(" | ");
}

export function airingLabel(show: Show): string | null {
  return show.status ? (STATUS_LABELS[show.status] ?? show.status) : null;
}

/** "2019–2023", or "2019–present" for one still going, whose last air year is only its latest. */
export function showYears(show: Show): string | null {
  const { firstAirYear: first, lastAirYear: last, status } = show;
  if (!first) return last ? String(last) : null;
  if (status && !FINISHED_STATUSES.has(status)) return `${first}–present`;
  return last && last !== first ? `${first}–${last}` : String(first);
}

export function seasonsLabel(show: Show): string | null {
  if (!show.seasonCount) return null;
  return show.seasonCount === 1 ? "1 season" : `${show.seasonCount} seasons`;
}

/** "2019–2023 · 4 seasons · Ended", leaving out whatever TMDB doesn't have. */
export function showSummary(show: Show): string {
  return [showYears(show), seasonsLabel(show), airingLabel(show)].filter(Boolean).join(" · ");
}

/** A show can air on several; two is what fits on a card. */
export function networksLabel(show: Show): string | null {
  return show.networks.length > 0 ? show.networks.slice(0, 2).join(", ") : null;
}

/** "HBO · 8.4/10". */
export function networkAndRating(show: Show): string {
  const rating = show.voteAverage ? `${show.voteAverage.toFixed(1)}/10` : null;
  return [networksLabel(show), rating].filter(Boolean).join(" · ");
}
