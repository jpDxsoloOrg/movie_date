import type { Match } from "../../services/api";
import { showYears, type MediaItem } from "../deck/movieFacts";

export const HISTORY_PAGE_SIZE = 20;

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function formatHistoryDate(isoDate: string): string {
  return dateFormat.format(new Date(isoDate));
}

type TitleItem = Pick<MediaItem, "movie" | "show">;

export function yearsLabel({ movie, show }: TitleItem): string {
  return String((show ? showYears(show) : movie.releaseYear) ?? "");
}

export function titleLabel(item: TitleItem): string {
  const years = yearsLabel(item);
  return years ? `${item.movie.title} (${years})` : item.movie.title;
}

/** The line printed on a match's ticket. */
export function matchStamp(match: Pick<Match, "matchedAt" | "round">): string {
  return `${formatHistoryDate(match.matchedAt)} · Round ${match.round}`;
}
