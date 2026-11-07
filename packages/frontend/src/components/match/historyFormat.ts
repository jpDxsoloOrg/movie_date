import type { Movie } from "../../services/api";

export const HISTORY_PAGE_SIZE = 20;

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function formatHistoryDate(isoDate: string): string {
  return dateFormat.format(new Date(isoDate));
}

export function movieLabel(movie: Movie): string {
  return movie.releaseYear ? `${movie.title} (${movie.releaseYear})` : movie.title;
}
