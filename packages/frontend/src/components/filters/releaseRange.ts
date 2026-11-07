import { defaultReleaseDateGte } from "@movie-date/core";
import type { FiltersInput } from "../../services/api";

export const MIN_DATE = "1900-01-01";
export const MAX_DATE = "2100-12-31";

const FIRST_YEAR = 1900;
const DECADES_SHOWN = 6;
const YEARS_AHEAD = 2;

export type ReleaseDates = Pick<FiltersInput, "releaseDateGte" | "releaseDateLte">;

export interface ReleasePick {
  id: string;
  label: string;
  dates: ReleaseDates;
  /** Decades join up into a range; the other picks replace whatever is there. */
  joins: boolean;
}

const startOfYear = (year: number): string => `${year}-01-01`;
const endOfYear = (year: number): string => `${year}-12-31`;
const yearOf = (isoDate: string): number => Number(isoDate.slice(0, 4));
const isYearStart = (isoDate: string): boolean => isoDate.endsWith("-01-01");
const isYearEnd = (isoDate: string): boolean => isoDate.endsWith("-12-31");

export function longDate(isoDate: string): string {
  // A bare date parses as UTC, which is the day before in the Americas.
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function releasePicks(now: Date): ReleasePick[] {
  const latestDecade = Math.floor(now.getFullYear() / 10) * 10;
  const decades = Array.from({ length: DECADES_SHOWN }, (_, index): ReleasePick => {
    const start = latestDecade - index * 10;
    return {
      id: `decade-${start}`,
      label: `${start}s`,
      dates: { releaseDateGte: startOfYear(start), releaseDateLte: endOfYear(start + 9) },
      joins: true,
    };
  });
  const oldestDecade = latestDecade - (DECADES_SHOWN - 1) * 10;
  return [
    { id: "this-year", label: "This year", dates: { releaseDateGte: null, releaseDateLte: null }, joins: false },
    ...decades,
    {
      id: "classics",
      label: `Before ${oldestDecade}`,
      dates: { releaseDateGte: MIN_DATE, releaseDateLte: endOfYear(oldestDecade - 1) },
      joins: true,
    },
    { id: "all-time", label: "All time", dates: { releaseDateGte: MIN_DATE, releaseDateLte: null }, joins: false },
  ];
}

/** Saving fills in Jan 1, so a saved room with no picks looks like this too. */
export function isDefaultRange(dates: ReleaseDates, now: Date): boolean {
  if (dates.releaseDateLte) return false;
  return !dates.releaseDateGte || dates.releaseDateGte === defaultReleaseDateGte(now);
}

function isJoinedSpan(dates: ReleaseDates, picks: readonly ReleasePick[]): boolean {
  const joining = picks.filter((pick) => pick.joins);
  return (
    joining.some((pick) => pick.dates.releaseDateGte === dates.releaseDateGte) &&
    joining.some((pick) => pick.dates.releaseDateLte === dates.releaseDateLte)
  );
}

export function isPickActive(pick: ReleasePick, dates: ReleaseDates, now: Date): boolean {
  if (pick.id === "this-year") return isDefaultRange(dates, now);
  const { releaseDateGte: start, releaseDateLte: end } = dates;
  if (!pick.joins) return start === pick.dates.releaseDateGte && !end;
  const { releaseDateGte: pickStart, releaseDateLte: pickEnd } = pick.dates;
  return Boolean(start && end && pickStart && pickEnd && start <= pickStart && end >= pickEnd);
}

/**
 * A second decade stretches the range out to it, the way a calendar picks a span.
 * Pressing inside a span narrows to that decade, and pressing a lone decade clears it.
 */
export function pressPick(pick: ReleasePick, dates: ReleaseDates, now: Date): ReleaseDates {
  if (!pick.joins) return pick.dates;
  const { releaseDateGte: pickStart, releaseDateLte: pickEnd } = pick.dates;
  const { releaseDateGte: start, releaseDateLte: end } = dates;
  if (start === pickStart && end === pickEnd) return { releaseDateGte: null, releaseDateLte: null };
  if (!start || !end || !pickStart || !pickEnd) return pick.dates;
  if (!isJoinedSpan(dates, releasePicks(now)) || isPickActive(pick, dates, now)) return pick.dates;
  return {
    releaseDateGte: pickStart < start ? pickStart : start,
    releaseDateLte: pickEnd > end ? pickEnd : end,
  };
}

/** What the active summary calls the range. Null when it's only the default. */
export function rangeLabel(dates: ReleaseDates, now: Date): string | null {
  if (isDefaultRange(dates, now)) return null;
  const { releaseDateGte: start, releaseDateLte: end } = dates;
  const exactPick = releasePicks(now).find(
    (pick) => pick.dates.releaseDateGte === start && (pick.dates.releaseDateLte ?? null) === (end ?? null),
  );
  if (exactPick) return exactPick.label;

  if (start && end) {
    if (!isYearStart(start) || !isYearEnd(end)) return `${longDate(start)} to ${longDate(end)}`;
    return yearOf(start) === yearOf(end) ? String(yearOf(start)) : `${yearOf(start)}–${yearOf(end)}`;
  }
  if (start) return `From ${isYearStart(start) ? yearOf(start) : longDate(start)}`;
  return end ? `Until ${isYearEnd(end) ? yearOf(end) : longDate(end)}` : null;
}

/** Newest first. A saved year outside the usual span stays in the list. */
export function yearChoices(now: Date, dates: ReleaseDates): number[] {
  const saved = [dates.releaseDateGte, dates.releaseDateLte].flatMap((date) => (date ? [yearOf(date)] : []));
  const latest = Math.max(now.getFullYear() + YEARS_AHEAD, ...saved);
  const earliest = Math.min(FIRST_YEAR, ...saved);
  return Array.from({ length: latest - earliest + 1 }, (_, index) => latest - index);
}

export const startYear = (dates: ReleaseDates): string =>
  dates.releaseDateGte ? String(yearOf(dates.releaseDateGte)) : "";

export const endYear = (dates: ReleaseDates): string =>
  dates.releaseDateLte ? String(yearOf(dates.releaseDateLte)) : "";

export const withStartYear = (year: string): ReleaseDates["releaseDateGte"] =>
  year ? startOfYear(Number(year)) : null;

export const withEndYear = (year: string): ReleaseDates["releaseDateLte"] =>
  year ? endOfYear(Number(year)) : null;

/** The year boxes can't show a mid-year date, so those open the exact fields. */
export function needsExactDates(dates: ReleaseDates): boolean {
  const { releaseDateGte: start, releaseDateLte: end } = dates;
  return Boolean((start && !isYearStart(start)) || (end && !isYearEnd(end)));
}

export function releaseDateError(dates: ReleaseDates, now: Date): string | null {
  const start = dates.releaseDateGte || defaultReleaseDateGte(now);
  return dates.releaseDateLte && dates.releaseDateLte < start
    ? `End date must be on or after ${longDate(start)}`
    : null;
}
